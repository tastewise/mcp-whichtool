"""`whichtool`: the routing eval from a terminal, and the web console behind `serve`.

Exit codes are for scripts and CI: 0 when every case passed, 1 when one misrouted, 2 when the
eval could not run at all.
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

import httpx

from . import CLI, prompts, routing, routing_advice, routing_eval, scan, settings
from .config import RoutingSpec
from .models import ModelError
from .routing_changes import Sources, validate_cases

OK, MISROUTED, FAILED = 0, 1, 2


def _style(code: str, text: str) -> str:
    return f"{code}{text}{prompts.RESET}" if sys.stdout.isatty() else text


def bold(text: str) -> str:
    return _style(prompts.BOLD, text)


def dim(text: str) -> str:
    return _style(prompts.DIM, text)


def fail(message: str) -> int:
    print(f"{CLI}: {message}", file=sys.stderr)
    return FAILED


def _routing(project: settings.Settings) -> RoutingSpec:
    if project.routing is None:
        raise ValueError(f"no [routing] table in {project.file}")
    return project.routing


def _dollars(value: float | None) -> str:
    return "price unknown" if value is None else f"${value:,.2f}" if value >= 0.01 else f"${value:.4f}"


def show(spec: RoutingSpec, where: Path, result: routing.Result) -> None:
    spent = routing.cost(spec, result.model, result.usage)
    score = f"{result.passed}/{result.total} passed"
    print(f"\n{bold(result.model)}  {score}  ·  {result.samples} draws  ·  {_dollars(spent)}  ·  {dim(str(where))}")
    for outcome in result.misroutes:
        got = ", ".join(f"{tool} ×{n}" for tool, n in outcome.votes()) or "no tool"
        print(f"  ✗ {outcome.id}  expected {outcome.expect}, got {got}")
        print(dim(f"      {outcome.prompt!r}"))
    for outcome in result.weak:
        others = ", ".join(f"{tool} ×{n}" for tool, n in outcome.votes())
        print(f"  ~ {outcome.id}  {outcome.hits}/{result.samples}  {dim(others)}")
    if not result.misroutes and not result.weak:
        print("  every case, every draw")
    unknown = json.loads(where.read_text()).get("unknown", [])
    if unknown:
        print(f"  ! cases expect tools the server does not offer: {', '.join(unknown)}")


def init(args: argparse.Namespace) -> int:
    target = Path(args.dir).resolve() / settings.FILE
    if target.exists() and not args.force:
        return fail(f"{target} exists: pass --force to replace it")
    interactive = sys.stdin.isatty() and not args.server
    server = args.server or (prompts.ask_text("The MCP server's URL", "http://127.0.0.1:8000/mcp")
                             if interactive else "")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(settings.starter(server, args.model))
    fixture = target.parent / "routing_cases.json"
    if not fixture.exists():
        fixture.write_text("[]\n")
    print(f"wrote {target}")
    if interactive:
        _ask_keys(target.parent / settings.ENV)
    print(dim(f"add {settings.ENV} and {settings.STATE}/ to .gitignore; then `{CLI} tools`"))
    return OK


def _ask_keys(env: Path) -> None:
    found = {
        "ANTHROPIC_API_KEY": prompts.ask_secret("Anthropic API key (Enter to skip)"),
        "OPENAI_API_KEY": prompts.ask_secret("OpenAI API key (Enter to skip)"),
    }
    if any(found.values()):
        settings.write_env(env, found)
        print(f"keys written to {env}, readable by you only")


def _shown(scanned: scan.Scanned) -> None:
    for tool in scanned.tools:
        first = tool.description.strip().splitlines()[0] if tool.description.strip() else "(no description)"
        where = dim(f"  {tool.path}") if tool.path else ""
        left_out = dim("  (declared, not listed by the server: not offered)") if scanned.server and not tool.listed else ""
        print(f"{bold(tool.name)}{where}{left_out}\n  {first[:110]}")
    origin = f"from {scanned.server}" if scanned.server else f"declared under {scanned.root}"
    print(dim(f"\n{len(scanned.offered)} tools {origin}"))
    if not scanned.server:
        print(dim("no server URL: the models see these descriptions without the arguments; --server offers both"))


def scan_(args: argparse.Namespace) -> int:
    folder, server = args.dir, args.server or ""
    if folder.startswith(("http://", "https://")) and not server:
        folder, server = ".", folder
    root = Path(folder).expanduser().resolve()
    if (root / settings.FILE).exists() and not server:
        print(dim(f"{root / settings.FILE} exists: the tools it offers"))
        return asyncio.run(_tools(_routing(settings.load(root / settings.FILE))))

    async def found() -> scan.Scanned:
        async with httpx.AsyncClient() as http:
            return await scan.scan(root, server, http)

    scanned = asyncio.run(found())
    _shown(scanned)
    target = root / settings.FILE
    if target.exists():
        # Scanned by URL from inside a project: its file is kept as it is.
        print(dim(f"{target} exists: kept as it is"))
        return OK
    if not args.yes:
        if not sys.stdin.isatty():
            print(dim(f"pass --yes to write {target}"))
            return OK
        if not prompts.ask_yes_no(f"Write {target}?"):
            return OK
    scan.write(scanned, args.model)
    print(f"wrote {target} and {scan.FIXTURE}")
    print(dim(f"add {settings.ENV} and {settings.STATE}/ to .gitignore; then `{CLI} keys`, and `{CLI} generate` "
              f"for test cases or `{CLI} serve` to write them in the browser"))
    return OK


async def _generate(spec: RoutingSpec, wanted: list[str]) -> int:
    async with httpx.AsyncClient() as http:
        names = [tool.name for tool in await routing_eval.catalogue(spec, http)]
    unknown = [name for name in wanted if name not in names]
    if unknown:
        return fail(f"not a tool the server offers: {', '.join(unknown)}")
    sources = Sources(spec, names)
    current = sources.catalog()
    cases, spent = list(current["cases"]), 0.0
    try:
        for tool in wanted or names:
            print(f"  {tool} …", end="", flush=True)
            proposed = await routing_advice.suggest(spec, {"action": "generate", "tool": tool, "scenario": "",
                                                           "existing": cases, "model": spec.model})
            spent += routing.cost(spec, proposed["model"], proposed.get("usage", {})) or 0.0
            fresh = []
            for case in proposed["cases"]:
                try:
                    validate_cases([*cases, *fresh, case], set(names))
                except ValueError:
                    continue  # a duplicate, or an id the case list refuses: the others still land
                fresh.append(case)
            cases += fresh
            print(f"\r  {tool}  {len(fresh)} cases")
    finally:
        # What the model already wrote, and was paid for, is kept even when a later tool fails.
        if len(cases) > len(current["cases"]):
            sources.save_cases(current["revision"], cases)
    print(f"{len(cases) - len(current['cases'])} cases added to {spec.fixture}  ·  {_dollars(spent)}")
    print(dim(f"read them over, then `{CLI} eval`"))
    return OK


def generate(args: argparse.Namespace) -> int:
    spec = _routing(settings.load(_file(args)))
    if not args.yes:
        if not sys.stdin.isatty():
            return fail("not a terminal: pass --yes to spend without being asked")
        if not prompts.ask_yes_no(f"Ask {spec.model} to write test cases for {', '.join(args.tool) or 'every tool'}?"):
            return OK
    return asyncio.run(_generate(spec, args.tool or []))


def keys(args: argparse.Namespace) -> int:
    project = settings.load(_file(args))
    _ask_keys(project.env_file)
    return OK


def _file(args: argparse.Namespace) -> Path | None:
    return Path(args.config).resolve() if args.config else None


async def _tools(spec: RoutingSpec) -> int:
    async with httpx.AsyncClient() as http:
        offered = await routing_eval.catalogue(spec, http)
    source = routing_eval.declared(spec)
    for tool in offered:
        first = tool.description.strip().splitlines()[0] if tool.description.strip() else "(no description)"
        mark = dim(" (from source)") if tool.name in source else ""
        print(f"{bold(tool.name)}{mark}\n  {first[:110]}")
    print(dim(f"\n{len(offered)} tools" + (f" from {spec.server}" if spec.server else " from the source")))
    return OK


def tools(args: argparse.Namespace) -> int:
    return asyncio.run(_tools(_routing(settings.load(_file(args)))))


def _estimate(spec: RoutingSpec, models: list[str], calls: int) -> str:
    parts = []
    for model in models:
        each = routing.per_call(spec, model)
        parts.append(f"{model} {_dollars(None if each is None else each * calls)}")
    return ", ".join(parts)


async def _eval(spec: RoutingSpec, models: list[str], draws: int, filter: str) -> int:
    worst = OK
    async with httpx.AsyncClient() as http:
        offered = await routing_eval.catalogue(spec, http)
        async with routing_eval.models_for(spec, http) as clients:
            for model in models:
                def progress(done: int, total: int, model: str = model) -> None:
                    if sys.stderr.isatty():
                        print(f"\r  {model}  {done}/{total}", end="", file=sys.stderr, flush=True)

                where, result = await routing_eval.run(spec, clients, offered, model=model, draws=draws,
                                                       filter=filter, progress=progress)
                if sys.stderr.isatty():
                    print("\r\033[K", end="", file=sys.stderr)
                show(spec, where, result)
                if result.misroutes:
                    worst = MISROUTED
    return worst


def eval_(args: argparse.Namespace) -> int:
    spec = _routing(settings.load(_file(args)))
    models = args.model or [spec.model]
    chosen = routing.selects(spec, args.filter)
    if not chosen:
        return fail("no case matches that filter" if args.filter else f"no cases in {spec.fixture}")
    calls = len(chosen) * args.draws
    print(f"{len(chosen)} cases × {args.draws} draws = {calls} calls per model  ·  "
          f"estimate: {_estimate(spec, models, calls)}")
    if not args.yes:
        if not sys.stdin.isatty():
            return fail("not a terminal: pass --yes to spend without being asked")
        if not prompts.ask_yes_no("Run it?"):
            return OK
    return asyncio.run(_eval(spec, models, args.draws, args.filter))


def results(args: argparse.Namespace) -> int:
    spec = _routing(settings.load(_file(args)))
    runs = sorted(spec.results.glob("*.json")) if spec.results.exists() else []
    newest: dict[str, Path] = {}
    for run in runs:
        found = routing.read(run)
        if found and (not args.model or found.model in args.model):
            newest[found.model] = run
    if not newest:
        return fail(f"no results yet in {spec.results}: run `{CLI} eval`")
    worst = OK
    for model, where in sorted(newest.items()):
        found = routing.read(where)
        assert found is not None
        show(spec, where, found)
        worst = MISROUTED if found.misroutes else worst
    return worst


async def _try(spec: RoutingSpec, model: str, asked: list[str], draws: int) -> int:
    async with httpx.AsyncClient() as http:
        offered = await routing_eval.catalogue(spec, http)
        async with routing_eval.models_for(spec, http) as clients:
            tried = await routing_eval.try_prompts(clients, offered, model=model, prompts=asked, draws=draws,
                                                   system=spec.system, concurrency=spec.concurrency)
    for row in tried["results"]:
        picks = ", ".join(pick or "no tool" for pick in row["picks"])
        print(f"{bold(picks)}  {dim(repr(row['prompt']))}")
        if row["said"]:
            print(dim(f"  said: {row['said'][:200]}"))
    print(dim(f"{_dollars(routing.cost(spec, model, tried['usage']))}"))
    return OK


def try_(args: argparse.Namespace) -> int:
    spec = _routing(settings.load(_file(args)))
    return asyncio.run(_try(spec, args.model or spec.model, args.prompt, args.draws))


def serve(args: argparse.Namespace) -> int:
    from . import app

    try:
        project = settings.load(_file(args))
    except settings.NoProject:
        # The page finds a project's tools and writes its file: nothing to set up first.
        project = None
    return app.serve(project, port=args.port, open_browser=not args.no_browser, start=Path.cwd())


def parser() -> argparse.ArgumentParser:
    top = argparse.ArgumentParser(prog=CLI, description="Check that models pick the right tool on your MCP server.")
    top.add_argument("--config", help=f"the project file (default: the nearest {settings.FILE})")
    commands = top.add_subparsers(dest="command", required=True)

    start = commands.add_parser("init", help=f"write a {settings.FILE} and an empty case list")
    start.add_argument("dir", nargs="?", default=".")
    start.add_argument("--server", help="the MCP server's URL")
    start.add_argument("--model", default="claude-opus-5-5")
    start.add_argument("--force", action="store_true")
    start.set_defaults(run=init)

    look = commands.add_parser("scan", help=f"find a project's tools, from its source or its server, and write a {settings.FILE}")
    look.add_argument("dir", nargs="?", default=".", help="the project's folder, or the server's URL")
    look.add_argument("--server", help="the MCP server's URL, for the arguments and for servers in other languages")
    look.add_argument("--model", default="claude-opus-5-5")
    look.add_argument("-y", "--yes", action="store_true", help="write the project file without asking")
    look.set_defaults(run=scan_)

    commands.add_parser("keys", help="set the API keys in the project's .env").set_defaults(run=keys)
    commands.add_parser("tools", help="the tools the models are offered").set_defaults(run=tools)

    run = commands.add_parser("eval", help="route every case through each model")
    run.add_argument("-m", "--model", action="append", help="repeat for several models (default: [routing] model)")
    run.add_argument("-n", "--draws", type=int, default=3, help="draws per case (default 3)")
    run.add_argument("-k", "--filter", default="", help="case ids containing this; `a or b` for several")
    run.add_argument("-y", "--yes", action="store_true", help="spend without asking")
    run.set_defaults(run=eval_)

    write = commands.add_parser("generate", help="ask the model for test cases, added to the case list")
    write.add_argument("-t", "--tool", action="append", help="repeat for several tools (default: every tool)")
    write.add_argument("-y", "--yes", action="store_true", help="spend without asking")
    write.set_defaults(run=generate)

    shown = commands.add_parser("results", help="the newest run of each model")
    shown.add_argument("-m", "--model", action="append")
    shown.set_defaults(run=results)

    ad_hoc = commands.add_parser("try", help="route prompts that are in no case yet")
    ad_hoc.add_argument("prompt", nargs="+")
    ad_hoc.add_argument("-m", "--model")
    ad_hoc.add_argument("-n", "--draws", type=int, default=1)
    ad_hoc.set_defaults(run=try_)

    web = commands.add_parser("serve", help="the web console, on 127.0.0.1")
    web.add_argument("--port", type=int, default=8790)
    web.add_argument("--no-browser", action="store_true")
    web.set_defaults(run=serve)

    return top


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        return args.run(args)
    except (settings.NoProject, ValueError, OSError, RuntimeError, ModelError, prompts.NotATerminal) as error:
        return fail(str(error))
    except KeyboardInterrupt:
        return fail("interrupted")


if __name__ == "__main__":
    sys.exit(main())
