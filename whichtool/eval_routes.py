"""The eval's routes, in the shape the console's page reads: the run, its live progress, its report.

- `GET /api/routing`: what a run would take and cost, and whether one is going.
- `POST /api/routing/run`, `/stop`: one run at a time, in the background.
- `GET /api/tasks/routing-eval/output`: the run's log as server-sent events. A line starting with
  `ROUTING_EVENT ` carries a JSON event, `start` or one `case` as its draws complete; the page builds
  its live view from them.
- `GET /api/routing/runs/{id}`: one run, whole, as its report reads it.
- `POST /api/routing/runs/{id}/suggest`: why a failed case failed, and a description that would fix it.
- `POST /api/routing/try`: prompts routed without being saved as cases.

A run's id is its results file's name without `.json`. While a run goes, the routing editor refuses
to change its inputs (`running`, handed to `routing_editor.install`).
"""

import asyncio
import json
import time
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field
from pathlib import Path

import httpx
from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse

from . import routing, routing_advice, routing_eval
from .config import RoutingSpec
from .models import ModelError, provider_of

TASK = "routing-eval"
# What the page reads as "stopped on request", as a terminated process would say it.
STOPPED = -15
LOG_CAP = 2000
HEARTBEAT = 2.0


class Log:
    """A run's lines: kept for whoever opens the stream late, pushed to whoever listens now."""

    def __init__(self) -> None:
        self.lines: list[str] = []
        self.listeners: set[asyncio.Queue[str]] = set()

    def clear(self) -> None:
        self.lines.clear()

    def push(self, line: str) -> None:
        self.lines.append(line)
        del self.lines[:-LOG_CAP]
        for queue in self.listeners:
            queue.put_nowait(line)


@dataclass
class Run:
    model: str
    started_at: float
    task: asyncio.Task | None = None
    exit_code: int | None = None
    result_path: str = ""
    log: Log = field(default_factory=Log)

    @property
    def running(self) -> bool:
        return self.task is not None and not self.task.done()


def run_file(spec: RoutingSpec, run_id: str) -> Path:
    """A run id names a file in the results folder, and nothing outside it."""
    name = run_id if run_id.endswith(".json") else f"{run_id}.json"
    if "/" in name or "\\" in name or name.startswith("."):
        raise HTTPException(404, "no such run")
    return spec.results / name


def run_case(outcome: routing.Outcome) -> dict:
    return {"id": outcome.id, "prompt": outcome.prompt, "expect": outcome.expect, "hits": outcome.hits,
            "passed": outcome.passed, "picks": list(outcome.picks),
            "votes": [{"tool": tool, "count": n} for tool, n in outcome.votes()]}


def detail(spec: RoutingSpec, where: Path) -> dict:
    found = routing.read(where)
    if found is None:
        raise HTTPException(404, "no such run, or it is not written yet")
    cases = [run_case(outcome) for outcome in found.outcomes]
    try:
        written = json.loads(where.read_text())
        drafts = written.get("drafts") or {}
    except (ValueError, OSError):
        written, drafts = {}, {}
    return {"id": where.stem, "provider": found.provider, "model": found.model, "samples": found.samples,
            "usage": found.usage, "total": found.total, "passed": found.passed,
            "result_mtime": where.stat().st_mtime, "cost": routing.cost(spec, found.model, found.usage),
            "cases": cases, "drafts": drafts, "proposed": bool(written.get("proposed")), "misroutes": [c for c in cases if not c["passed"]],
            "weak": [c for c in cases if c["passed"] and c["hits"] < found.samples]}


def install(app: FastAPI, spec: Callable[[], RoutingSpec], client: Callable[[], httpx.AsyncClient],
            ai_lock: asyncio.Lock) -> Callable[[], bool]:
    """Returns `running`, for the routing editor."""
    state: dict[str, Run] = {}
    idle = Log()
    # Held from the one-run check until the run is stored: two clicks never start two runs.
    starting = asyncio.Lock()

    def current() -> Run | None:
        return state.get("run")

    def running() -> bool:
        run = current()
        return bool(run and run.running)

    def keys_missing(settings: RoutingSpec, model: str) -> str:
        provider = provider_of(model)
        held = settings.anthropic_key if provider == "anthropic" else settings.openai_key
        return "" if held else f"No API key for {provider}: add one under API keys, at the top of the page"

    @app.get("/api/routing")
    def routing_state(filter: str = "", model: str = "") -> dict:
        try:
            settings = spec()
        except HTTPException:
            return {"available": False}
        chosen = model or settings.model
        run = current()
        return {"available": True, "model": settings.model, "models": sorted({settings.model, *settings.prices}),
                "total": len(routing.cases(settings)),
                "selected": len(routing.selects(settings, filter)), "per_call": routing.per_call(settings, chosen),
                "running": running(), "exit_code": run.exit_code if run else None,
                "started_at": run.started_at if run else 0, "result": None}

    def proposals(raw: object) -> tuple[routing.Case, ...]:
        """Tests under review, sent whole: each an id, a prompt and the tool it expects, ids unique."""
        if not isinstance(raw, list) or not raw or len(raw) > 500:
            raise ValueError("proposed must be a list of 1 to 500 tests")
        found, ids = [], set()
        for row in raw:
            fields = {key: row.get(key) if isinstance(row, dict) else None for key in ("id", "prompt", "expect")}
            if not all(isinstance(value, str) and value.strip() for value in fields.values()):
                raise ValueError("Each proposed test needs an id, a prompt and the tool it expects")
            if fields["id"].strip() in ids:
                raise ValueError(f"Two proposed tests share the id {fields['id'].strip()}")
            ids.add(fields["id"].strip())
            found.append(routing.Case(**{key: str(value).strip() for key, value in fields.items()}))
        return tuple(found)

    @app.post("/api/routing/run")
    async def start(payload: dict = Body(...)) -> dict:
        async with starting:
            return await begin(payload)

    async def begin(payload: dict) -> dict:
        settings = spec()
        if running():
            raise HTTPException(409, "A run is already going: stop it or wait for it to finish")
        draws = payload.get("draws", 3)
        if not isinstance(draws, int) or not 1 <= draws <= 20:
            raise HTTPException(400, "draws must be between 1 and 20")
        model = str(payload.get("model") or settings.model)
        filter = str(payload.get("filter", ""))
        ids = payload.get("cases")
        if ids is not None and not (isinstance(ids, list) and all(isinstance(i, str) for i in ids)):
            raise HTTPException(400, "cases must be a list of case ids")
        drafts = payload.get("descriptions") or {}
        if not (isinstance(drafts, dict) and all(isinstance(k, str) and isinstance(v, str) for k, v in drafts.items())):
            raise HTTPException(400, "descriptions must map tool names to descriptions")
        if blank := sorted(name for name, text in drafts.items() if not text.strip()):
            raise HTTPException(400, f"A draft description is empty: {', '.join(blank)}")
        proposed = payload.get("proposed")
        try:
            chosen = (proposals(proposed) if proposed is not None
                      else routing_eval.chosen_cases(settings, filter, ids))
        except ValueError as error:
            raise HTTPException(400, str(error)) from error
        if not chosen:
            raise HTTPException(400, "No test matches: tick at least one")
        if problem := keys_missing(settings, model):
            raise HTTPException(409, problem)
        try:
            offered = await routing_eval.catalogue(settings, client())
        except ValueError as error:
            raise HTTPException(409, str(error)) from error
        unknown = sorted(set(drafts) - {tool.name for tool in offered})
        if unknown:
            raise HTTPException(400, f"No such tool on the server: {', '.join(unknown)}")
        if proposed is not None and (strays := sorted({case.expect for case in chosen} - {t.name for t in offered})):
            raise HTTPException(400, f"A proposed test expects a tool the server does not offer: {', '.join(strays)}")
        started = time.time()
        where = routing.result_path(settings, started, model)
        run = Run(model=model, started_at=started, result_path=str(where))
        run_id = where.stem

        def event(kind: str, completed: int, case: dict | None = None) -> None:
            body = {"type": kind, "run_id": run_id, "total": len(chosen), "completed": completed, "samples": draws}
            run.log.push("ROUTING_EVENT " + json.dumps(body | ({"case": case} if case else {})))

        def on_case(case: dict, completed: int, total: int) -> None:
            event("case", completed, case)
            mark = "passed" if case["passed"] else "FAILED"
            run.log.push(f"{case['id']}: {mark} {case['hits']}/{draws} (expected {case['expect']})")

        async def go() -> None:
            run.log.push(f"{model}: {len(chosen)} cases × {draws} draws against {len(offered)} tools")
            if proposed is not None:
                run.log.push("Proposed tests, not in the library yet")
            if drafts:
                run.log.push(f"Draft descriptions, the source untouched: {', '.join(sorted(drafts))}")
            event("start", 0)
            try:
                async with routing_eval.models_for(settings, client()) as clients:
                    _, found = await routing_eval.run(settings, clients, offered, model=model, draws=draws,
                                                      ids=[case.id for case in chosen], where=where, on_case=on_case,
                                                      drafts=drafts, proposed=chosen if proposed is not None else None)
            except asyncio.CancelledError:
                run.exit_code = STOPPED
                run.log.push("Stopped on request.")
                raise
            except (ModelError, ValueError, OSError) as error:
                run.exit_code = 1
                run.log.push(f"The run failed: {error}")
                return
            run.log.push(f"{found.passed}/{found.total} passed · results in {where}")
            run.exit_code = 0

        run.task = asyncio.create_task(go())
        state["run"] = run
        return {"ok": True, "result_path": str(where)}

    @app.post("/api/routing/stop")
    def stop() -> dict:
        run = current()
        if run and run.running and run.task is not None:
            run.task.cancel()
        return {"running": False, "exit_code": STOPPED if run else None}

    @app.get("/api/tasks/{name}/output")
    async def output(name: str, request: Request) -> StreamingResponse:
        if name != TASK:
            raise HTTPException(404, "no such task")
        run = current()
        log = run.log if run else idle
        queue: asyncio.Queue[str] = asyncio.Queue()
        log.listeners.add(queue)

        def frame(payload: dict) -> str:
            return f"data: {json.dumps(payload)}\n\n"

        async def events() -> AsyncIterator[str]:
            try:
                for line in list(log.lines):
                    yield frame({"type": "log", "task": TASK, "line": line})
                while not await request.is_disconnected():
                    try:
                        line = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT)
                    except TimeoutError:
                        yield frame({"type": "ping"})
                        # A run started after this stream opened logs elsewhere: the page reopens.
                        if current() not in (run, None):
                            return
                        continue
                    yield frame({"type": "log", "task": TASK, "line": line})
            finally:
                log.listeners.discard(queue)

        return StreamingResponse(events(), media_type="text/event-stream",
                                 headers={"cache-control": "no-cache", "x-accel-buffering": "no"})

    @app.get("/api/routing/runs/{run_id}")
    def run_detail(run_id: str) -> dict:
        settings = spec()
        return detail(settings, run_file(settings, run_id))

    @app.post("/api/routing/runs/{run_id}/suggest")
    async def suggest(run_id: str, payload: dict = Body(...)) -> dict:
        """Why one failed case of a run failed, and a description that would route it."""
        settings = spec()
        found = routing.read(run_file(settings, run_id))
        if found is None:
            raise HTTPException(404, "no such run")
        wanted = str(payload.get("case_id", ""))
        outcome = next((o for o in found.outcomes if o.id == wanted), None)
        if outcome is None:
            raise HTTPException(404, "that case is not in this run")
        if outcome.passed:
            raise HTTPException(400, "This case passed: there is nothing to fix")
        involved = {outcome.expect} | {tool for tool, _ in outcome.votes()}
        related = [o.as_dict() for o in found.outcomes if o.passed and o.expect in involved][:10]
        if ai_lock.locked():
            raise HTTPException(409, "An AI request is already running")
        async with ai_lock:
            try:
                proposal = await routing_advice.suggest(settings, {
                    "case": outcome.as_dict(), "related_cases": related, "model": settings.model})
            except asyncio.TimeoutError as error:
                raise HTTPException(504, "AI suggestion timed out") from error
            except (RuntimeError, OSError, ValueError) as error:
                raise HTTPException(502, str(error)) from error
        source = routing_eval.declared(settings).get(proposal["tool"])
        return proposal | {"cost": routing.cost(settings, proposal["model"], proposal.get("usage", {})),
                           "source_revision": source["revision"] if source else None}

    @app.post("/api/routing/try")
    async def try_cases(payload: dict = Body(...)) -> dict:
        """Prompts routed before they are cases: what each draw picked, and whether that is the tool wanted."""
        settings = spec()
        rows = payload.get("cases")
        if not isinstance(rows, list) or not rows or not all(isinstance(r, dict) and r.get("prompt") for r in rows):
            raise HTTPException(400, "Give at least one prompt to try")
        draws = payload.get("draws", 1)
        if not isinstance(draws, int) or not 1 <= draws <= 20:
            raise HTTPException(400, "draws must be between 1 and 20")
        model = str(payload.get("model") or settings.model)
        if problem := keys_missing(settings, model):
            raise HTTPException(409, problem)
        try:
            offered = await routing_eval.catalogue(settings, client())
            async with routing_eval.models_for(settings, client()) as clients:
                tried = await routing_eval.try_prompts(clients, offered, model=model, draws=draws, system=settings.system,
                                                       prompts=[str(r["prompt"]) for r in rows],
                                                       concurrency=settings.concurrency)
        except ValueError as error:
            raise HTTPException(409, str(error)) from error
        except ModelError as error:
            raise HTTPException(502, str(error)) from error
        results = []
        for row, result in zip(rows, tried["results"]):
            expect = str(row.get("expect", ""))
            hits = result["picks"].count(expect)
            results.append({"id": str(row.get("id", "")), "expect": expect, "picks": result["picks"],
                            "passed": bool(expect) and hits >= routing_eval.threshold(draws), "model": model})
        return {"model": model, "results": results, "cost": routing.cost(settings, model, tried["usage"])}

    return running
