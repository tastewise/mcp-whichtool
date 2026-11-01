# CLAUDE.md — mcp-whichtool

A local tool to **evaluate tool routing** on an MCP server: does a model, given your prompt,
pick the tool you expected? It runs that eval against several models and helps you fix the tool
descriptions that lose.
Python package `whichtool`, Apache-2.0. User docs: `README.md`, `docs/configuration.md`.

## Commands

| What | Command |
| --- | --- |
| Install | `uv sync --all-groups` |
| Tests | `uv run pytest -q` |
| Lint | `uv run ruff check .` (rules pinned in `pyproject.toml`: `E4 E7 E9 F I`) |
| The CLI | `uv run whichtool --help` (`scan`, `init`, `keys`, `tools`, `generate`, `eval`, `results`, `try`, `serve`) |
| The demo server | `uv run python demo/server.py` (then `cd demo`) |
| The web page | `cd web && npm install`, then `npm run dev` (5174, `/api` proxied to `serve` on 8790), `npm run test`, `npm run build` |

CI (`.github/workflows/`) runs ruff and pytest on Python 3.11 and 3.13; typecheck, lint, vitest and
the build of `web/` (the committed `whichtool/static/` must be what the sources build); and a
secrets scan over the whole history on every push and PR.

## What it does

A case is a prompt and the tool it should route to (`routing.Case`, a JSON
fixture). The eval (`routing_eval`) gives each case to a model together with the server's tools,
draws it N times, and records which tool the model picked; a strict majority of draws passes. The
tools are the server's `tools/list`, except that a description declared in the source wins, so an
edit is measured before it ships. Claude goes through the Anthropic SDK, other models through
OpenAI's API (`models`); neither retries a refusal on another model, since the eval measures the
model it names. Results say, per case and per model, how often it chose right, what it chose
instead, and what the run cost. From a losing case, `routing_advice` says why it failed and
proposes a description (or the user writes one); a run can take that draft in place of the source's
(`drafts`), on the failed case then on every case, without writing anything; `routing_changes`
saves it into the server's source when asked. No git and no pull request: the project is the
user's, and so is what they commit.

## The one rule: nothing server-specific in the core

The core works for any MCP server. Nothing specific to one server, one organisation or one
deployment goes in `whichtool/`, its tests or its docs: no hostnames, tool names, account ids
or secret paths, not even in a comment or a test fixture. What varies between servers is passed in:

| Pattern | Examples |
| --- | --- |
| A spec field with a neutral default | `RoutingSpec.descriptions`, `RoutingSpec.system` |
| One constant | `whichtool.CLI`: the command named in hints, and the console's user agent (`whichtool`) |

Test data uses neutral names: tools `list_categories`, `rank_brands`, company `Acme`,
`example.com`, `someone@example.com`, branch `main`. The demo is a bookshop.

The maintainer's credit is not server-specific: Tastewise is named in `NOTICE`, the page's footer
(`MAINTAINER` in `web/src/components/_ui/Footer.tsx`) and the README, and nowhere in the core's logic.

## Tests

The tests run against real things: git repos and a bare remote, a fake `gh` on disk, real HTTP
servers for Anthropic, OpenAI and MCP (`tests/fakes/`), and the demo server itself. Our
own code is never mocked. Routes are modules with `install(app, …)` (`eval_routes`, `routing_editor`); tests build an app with that `install` and
call it over `httpx.ASGITransport`. The CLI is tested as a real process.

Test strings that look like keys must have low entropy (`sk-xxxxxxxxxxxxtail`), or the secrets
scan flags them. One PR per change, squash-merged.

## Layout

| Area | Modules |
| --- | --- |
| Config | `config` (specs and TOML parsers), `settings` (the project's `whichtool.toml` and `.env`) |
| CLI | `cli` (exit 0 all pass, 1 a misroute, 2 could not run) |
| Catalogue | `tools` (a server's tools, from `tools/list` and from its source), `ts_source` (tools declared in TypeScript or JavaScript), `scan` (a new project's tools, from a folder, dropped files or a URL, and the project file for them), `export` (the tests as a kit for the server's repository: cases, project file, CI workflow) |
| Models | `models` (route a prompt, or ask for JSON; Anthropic and OpenAI) |
| Offline eval | `routing`, `routing_eval`, `routing_advice`, `routing_changes` (writes cases and descriptions), `routing_editor` |
| Web console | `app` (one FastAPI app behind `guard`, loopback only), `eval_routes` (run, live progress over SSE, a run's report by its id, analysis, try), `static/` (the built page) |
| Web page | `web/` (React): the scan (the home page, which opens or switches the project), the routing page (tests written by AI and reviewed, tried as a run of the proposals with its report and logs, a failed case's analysis, hand edits tried as drafts on that case then on every case, Save to source), the test library (which tests to export) |
| Web and terminal plumbing | `guard`, `fingerprint`, `prompts` |
| Demo | `demo/` (a bookshop server on the official MCP SDK, thirteen cases, its project file) |

## Open points

- **Editing descriptions reads Python, TypeScript and JavaScript.** `routing_changes` rewrites a
  description where the source spells it as a literal (`ast` for Python, tree-sitter in `ts_source`
  for the others). The eval itself needs only `tools/list`; other languages' edits stay a suggestion to copy.
