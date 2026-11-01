# Contributing

Thanks for looking. Issues and pull requests are welcome: a misroute the tool explains badly, a
language `scan` does not read, a description it saves in the wrong place, a model it should know.

## Before you start

For anything larger than a fix, open an issue first and say what you have in mind: it saves you
writing a pull request that goes another way.

## Setting up

```sh
uv sync --all-groups
uv run pytest -q
uv run ruff check .
```

The web page lives in `web/` (React):

```sh
cd web
npm install
npm run dev     # http://127.0.0.1:5174, /api proxied to `whichtool serve` on 8790
npm run test
npm run build   # writes whichtool/static/, which is committed
```

A change to `web/` commits the rebuilt `whichtool/static/` with it: CI checks that the two match.

## The one rule

The core works for any MCP server. Nothing specific to one server, one organisation or one
deployment goes in `whichtool/`, its tests or its docs: no hostnames, real tool names, account ids
or secret paths, not even in a comment. Test data uses neutral names (`list_categories`, `Acme`,
`example.com`), and the demo is a bookshop.

## Tests

Tests run against real things: real HTTP servers stand in for Anthropic, OpenAI and MCP
(`tests/fakes/`), the CLI runs as a real process, and our own code is never mocked. A new behaviour
comes with a test that says it in its name.

Strings that look like keys keep a low entropy (`sk-xxxxxxxxxxxxtail`), or the secrets scan fails
the build.

## Pull requests

One change per pull request, with a [conventional](https://www.conventionalcommits.org/) title
(`fix: …`, `feat: …`, `docs: …`). Pull requests are squash-merged, so the title becomes the commit.

By contributing, you agree that your contribution is licensed under the [Apache License 2.0](LICENSE).
