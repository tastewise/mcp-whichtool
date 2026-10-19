"""A project's tests as a kit for the server's own repository: unzip it at the root, add a key, push.

The kit holds the cases, a project file that reads the repository's own source, a GitHub Actions
workflow that routes every case on each pull request, and a README that says what to do with them.
Nothing in it is a key: the workflow reads them from the repository's secrets.
"""

import io
import json
import zipfile

from . import CLI, settings
from .config import RoutingSpec
from .models import provider_of
from .scan import FIXTURE

# Where the workflow installs the tool from, until it is on PyPI.
SOURCE = "git+https://github.com/tastewise/mcp-whichtool"
WORKFLOW = ".github/workflows/tool-routing.yml"
README = "ROUTING-TESTS.md"
SECRETS = {"anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY"}


def _project_file(spec: RoutingSpec) -> str:
    """The project file for the repository: its own source, wherever the copy the console read lived."""
    return settings.starter(spec.server, spec.model, ".")


def _workflow(spec: RoutingSpec) -> str:
    secret = SECRETS[provider_of(spec.model)]
    return f"""\
# Routes every routing test through {spec.model} on each pull request, and fails when one misroutes.
# Add the {secret} secret to the repository (Settings → Secrets and variables → Actions).
name: tool routing

on:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  routing:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
      - name: Route every test through the model
        env:
          {secret}: ${{{{ secrets.{secret} }}}}
        run: uvx --from {SOURCE} {CLI} eval --yes --draws 3
"""


def _readme(spec: RoutingSpec, count: int) -> str:
    secret = SECRETS[provider_of(spec.model)]
    server = (f"The tools are read from `{spec.server}`: the workflow must be able to reach it."
              if spec.server else "The tools are read from this repository's source, so no server needs to run.")
    return f"""\
# Routing tests

{count} test{"s" if count != 1 else ""}: each one is a request a user could type, and the tool that should handle it.
They check that a model, reading your tools' descriptions, picks the right tool.

## What is here

| File | What it is |
| --- | --- |
| `{FIXTURE}` | The tests |
| `{settings.FILE}` | Where the tools come from, and the model that runs the tests |
| `{WORKFLOW}` | Runs the tests on every pull request |

{server}

## To set it up

1. Unzip this at the root of your server's repository.
2. Add the `{secret}` secret to the repository: Settings → Secrets and variables → Actions.
3. Commit and push. The next pull request runs the tests; a misrouted test fails the check.

## To run them yourself

```sh
uvx --from {SOURCE} {CLI} eval
```

`{CLI} serve` opens them in the browser, to add tests or fix the descriptions that lose.
"""


def picked(spec: RoutingSpec, ids: list[str] | None = None) -> list[dict]:
    """The tests `ids` names, in the library's order, or every one."""
    cases = json.loads(spec.fixture.read_text())
    if ids:
        missing = sorted(set(ids) - {case.get("id") for case in cases if isinstance(case, dict)})
        if missing:
            raise ValueError(f"no such test: {', '.join(missing)}")
        wanted = set(ids)
        cases = [case for case in cases if isinstance(case, dict) and case.get("id") in wanted]
    return cases


def tests_json(spec: RoutingSpec, ids: list[str] | None = None) -> bytes:
    """The tests alone, as the case file holds them: for a harness of one's own."""
    return (json.dumps(picked(spec, ids), indent=2, ensure_ascii=False) + "\n").encode()


def kit(spec: RoutingSpec, ids: list[str] | None = None) -> bytes:
    """The zip the test library exports: the tests `ids` names, or every one."""
    cases = picked(spec, ids)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(FIXTURE, json.dumps(cases, indent=2, ensure_ascii=False) + "\n")
        archive.writestr(settings.FILE, _project_file(spec))
        archive.writestr(WORKFLOW, _workflow(spec))
        archive.writestr(README, _readme(spec, len(cases)))
    return buffer.getvalue()
