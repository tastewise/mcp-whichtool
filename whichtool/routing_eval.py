"""The routing eval itself: each case's prompt, offered the server's tools, drawn N times per model.

The catalogue is what the server lists, with one exception: a description declared in the source
wins over the listed one. That is the description being edited, and the eval measures it before
it ships, without waiting for the server to reload.

A case passes when a strict majority of its draws pick the expected tool. The run is written to
the results file `routing.read` reads, so the editor and the advice see it like any other.
"""

import asyncio
import json
import time
from collections import Counter
from collections.abc import Callable
from dataclasses import replace
from pathlib import Path

import httpx

from . import routing, tools
from .config import RoutingSpec
from .models import COUNTERS, ModelError, Models, Reply, Tool, provider_of
from .routing_changes import atomic_write, descriptions

NO_TOOLS = "no tools to offer: set the server's URL, or point descriptions at the source that declares them"


def models_for(spec: RoutingSpec, http: httpx.AsyncClient | None = None) -> Models:
    return Models(anthropic_key=spec.anthropic_key, openai_key=spec.openai_key, anthropic_base=spec.anthropic_base,
                  openai_base=spec.openai_base, http=http)


def declared(spec: RoutingSpec) -> dict[str, dict]:
    """The descriptions the source declares, or none: a server in another language has no source we read."""
    if not (spec.cwd / spec.descriptions).is_dir():
        return {}
    try:
        return descriptions(spec, loose=True)
    except (ValueError, SyntaxError, OSError, UnicodeDecodeError):
        return {}


async def catalogue(spec: RoutingSpec, http: httpx.AsyncClient) -> list[Tool]:
    """The tools a client would be offered, in the server's order, with the source's descriptions."""
    source = declared(spec)
    if not spec.server:
        # The source gives descriptions, not arguments: the schema says so rather than claiming none.
        found = [Tool(name=name, description=entry["description"], input_schema={"type": "object"})
                 for name, entry in source.items()]
    else:
        try:
            payload = await tools.listed(spec.server, http, spec.server_token)
        except (httpx.HTTPError, ValueError) as error:
            raise ValueError(tools.unlisted(spec.server, error)) from error
        result = payload.get("result")
        entries = result.get("tools") if isinstance(result, dict) else None
        found = []
        for entry in entries if isinstance(entries, list) else []:
            if not isinstance(entry, dict) or not entry.get("name"):
                continue
            name = str(entry["name"])
            schema = entry.get("inputSchema")
            found.append(Tool(
                name=name,
                # A description the source computes reads as "": the listed one stands.
                description=source.get(name, {}).get("description") or str(entry.get("description", "")),
                input_schema=schema if isinstance(schema, dict) else {"type": "object", "properties": {}},
            ))
    if not found:
        raise ValueError(NO_TOOLS)
    return found


def threshold(draws: int) -> int:
    return draws // 2 + 1


async def _draws(models: Models, model: str, offered: list[Tool], prompt: str, draws: int, system: str,
                 gate: asyncio.Semaphore, done: Callable[[], None]) -> list[Reply]:
    async def one() -> Reply:
        async with gate:
            reply = await models.route(model, offered, prompt, system)
        done()
        return reply

    try:
        async with asyncio.TaskGroup() as group:
            tasks = [group.create_task(one()) for _ in range(draws)]
    except* ModelError as failed:
        raise failed.exceptions[0] from None
    return [task.result() for task in tasks]


def _add(total: dict[str, int], replies: list[Reply]) -> None:
    for reply in replies:
        total["calls"] += 1
        for name in COUNTERS:
            total[name] += reply.usage.get(name, 0)


def scored(case: routing.Case, picks: list[str | None], draws: int) -> dict:
    """One case's line in a results file, votes winner first."""
    hits = picks.count(case.expect)
    votes = Counter(pick for pick in picks if pick).most_common()
    return {"id": case.id, "prompt": case.prompt, "expect": case.expect, "picks": picks, "hits": hits,
            "passed": hits >= threshold(draws), "votes": [{"tool": tool, "count": n} for tool, n in votes]}


def chosen_cases(spec: RoutingSpec, filter: str = "", ids: list[str] | None = None) -> tuple[routing.Case, ...]:
    """The cases a run takes: exactly these ids when given, else those the filter names."""
    if ids is None:
        return routing.selects(spec, filter)
    known = {case.id: case for case in routing.cases(spec)}
    # An id that is not a case any more is said, not skipped: the run must be the one asked for.
    missing = [id_ for id_ in dict.fromkeys(ids) if id_ not in known]
    if missing:
        raise ValueError(f"no such case: {', '.join(missing)}")
    return tuple(known[id_] for id_ in dict.fromkeys(ids))


async def run(spec: RoutingSpec, models: Models, offered: list[Tool], *, model: str, draws: int, filter: str = "",
              ids: list[str] | None = None, where: Path | None = None, drafts: dict[str, str] | None = None,
              progress: Callable[[int, int], None] | None = None,
              on_case: Callable[[dict, int, int], None] | None = None,
              proposed: tuple[routing.Case, ...] | None = None) -> tuple[Path, routing.Result]:
    """Run the selected cases against one model, write the results file, and return it read back.

    `ids` runs exactly those cases; `where` names the results file before the run starts, for a caller
    that tracks the run by it; `drafts` are descriptions offered in place of the catalogue's, by tool, to
    measure one before it is saved; `on_case` hears each case as its draws complete. `proposed` runs these
    cases in place of the library's: tests under review, not saved yet."""
    if draws < 1:
        raise ValueError("draws must be at least 1")
    chosen = proposed if proposed is not None else chosen_cases(spec, filter, ids)
    if not chosen:
        raise ValueError("no case matches that filter" if filter.strip() or ids else f"no cases in {spec.fixture}")
    drafts = dict(drafts or {})
    blank = sorted(name for name, text in drafts.items() if not text.strip())
    if blank:
        raise ValueError(f"a draft description is empty: {', '.join(blank)}")
    unknown_drafts = sorted(set(drafts) - {tool.name for tool in offered})
    if unknown_drafts:
        raise ValueError(f"a draft names a tool the server does not offer: {', '.join(unknown_drafts)}")
    offered = [replace(tool, description=drafts[tool.name]) if tool.name in drafts else tool for tool in offered]
    started = time.time()
    total = len(chosen) * draws
    finished = 0

    def done() -> None:
        nonlocal finished
        finished += 1
        if progress:
            progress(finished, total)

    gate = asyncio.Semaphore(max(1, spec.concurrency))
    completed = 0

    async def one(case: routing.Case) -> list[Reply]:
        nonlocal completed
        replies = await _draws(models, model, offered, case.prompt, draws, spec.system, gate, done)
        completed += 1
        if on_case:
            on_case(scored(case, [reply.tool for reply in replies], draws), completed, len(chosen))
        return replies

    try:
        async with asyncio.TaskGroup() as group:
            tasks = [group.create_task(one(case)) for case in chosen]
    except* ModelError as failed:
        raise failed.exceptions[0] from None
    usage = {"calls": 0} | {name: 0 for name in COUNTERS}
    cases = []
    for case, task in zip(chosen, tasks):
        replies = task.result()
        _add(usage, replies)
        cases.append(scored(case, [reply.tool for reply in replies], draws))
    names = {tool.name for tool in offered}
    where = where or routing.result_path(spec, started, model)
    where.parent.mkdir(parents=True, exist_ok=True)
    atomic_write(where, json.dumps({
        "provider": provider_of(model), "model": model, "samples": draws, "threshold": threshold(draws),
        "started": started, "seconds": round(time.time() - started, 1), "tools": sorted(names),
        # A case that expects a tool the server does not offer can never pass: said, not hidden.
        "unknown": sorted({case.expect for case in chosen} - names),
        # Descriptions this run offered in place of the source's: its results describe a draft.
        **({"drafts": drafts} if drafts else {}),
        # Tests under review, not in the library: a replay sends them again rather than naming them.
        **({"proposed": True} if proposed is not None else {}),
        "usage": usage, "cases": cases,
    }, indent=2) + "\n")
    found = routing.read(where)
    if found is None:
        raise OSError(f"the results file {where} could not be read back")
    return where, found


async def try_prompts(models: Models, offered: list[Tool], *, model: str, prompts: list[str], draws: int = 1,
                      system: str = "", concurrency: int = 4) -> dict:
    """Route prompts that are in no catalog yet: what each draw picked, and the tokens it cost."""
    gate = asyncio.Semaphore(max(1, concurrency))
    try:
        async with asyncio.TaskGroup() as group:
            tasks = [group.create_task(_draws(models, model, offered, prompt, draws, system, gate, lambda: None))
                     for prompt in prompts]
    except* ModelError as failed:
        raise failed.exceptions[0] from None
    usage = {"calls": 0} | {name: 0 for name in COUNTERS}
    results = []
    for prompt, task in zip(prompts, tasks):
        replies = task.result()
        _add(usage, replies)
        results.append({"prompt": prompt, "picks": [reply.tool for reply in replies],
                        "said": next((reply.text for reply in replies if reply.text and not reply.tool), "")})
    return {"model": model, "results": results, "usage": usage}
