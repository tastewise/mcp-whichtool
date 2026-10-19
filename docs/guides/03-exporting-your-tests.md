# Exporting your tests

Your tests are worth most where your server's code changes: in its repository, run on every pull
request. **Export**, at the top of the test library, takes them there in one of two forms. It
exports the tests ticked in the library, or every test when none is.

| | Kit for your CI (`.zip`) | Tests only (`.json`) |
| --- | --- | --- |
| **What it holds** | the tests, a project file, a GitHub Actions workflow, a short README | the tests, nothing else |
| **Who runs them** | whichtool, in your CI | your own code |
| **What you write** | nothing: unzip, add a secret, push | the loop that asks the model and checks its pick |
| **Choose it when** | you want a check on every pull request now | you already have an eval harness, or another CI |

## The kit for your CI

### What is in it

| File | What it is |
| --- | --- |
| `routing_cases.json` | the tests |
| `whichtool.toml` | where the tools come from (the repository's own source, or your server's URL) and the model that runs the tests |
| `.github/workflows/tool-routing.yml` | the workflow that runs them |
| `ROUTING-TESTS.md` | these steps, for whoever finds the files |

### Setting it up

1. Unzip the kit at the root of your server's repository.
2. Add your model provider's key as a repository secret, `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
   (Settings → Secrets and variables → Actions). The workflow file names the one it needs.
3. Commit and push.

From then on, every pull request runs each test with three draws and a majority, as
[Testing routing](02-testing-routing.md#draws) describes. A misrouted test fails the check, so a
description that breaks routing shows in review, before it ships. The workflow can also be run by
hand from the Actions tab.

### What it costs

Each pull request pays for tests × 3 draws × the price of one call, on your provider account. With
the tools read from the repository's source, no server needs to run in CI. With a URL in
`whichtool.toml`, the workflow must be able to reach it.

### Running them on your machine

The same tests run locally with the same command the workflow uses:

```sh
uvx --from git+https://github.com/tastewise/mcp-whichtool whichtool eval
```

`whichtool serve` opens them in the browser, to add tests or fix a description that loses.

## The tests alone, as JSON

### The format

The file is named after your project, `routing-tests-<project>.json`: for the demo,
`routing-tests-demo.json`. It holds a list of tests, as whichtool keeps them, each with three
fields:

```json
[
  { "id": "search-topic", "prompt": "Find me books about sourdough baking", "expect": "search_books" },
  { "id": "stock-pickup", "prompt": "Can I pick up Piranesi in Lyon today?", "expect": "check_stock" }
]
```

| Field | What it is |
| --- | --- |
| `id` | a stable name for the test, unique in the file |
| `prompt` | the request, as a user would type it |
| `expect` | the name of the tool that should handle it, as your server lists it |

### Running them in your own code

A routing test is three steps: give the model every tool your server lists, send it the request,
and check which tool it calls. Ask more than once, since the same request does not always reach
the same tool. In Python, with the Anthropic SDK:

```python
import json
import sys
from collections import Counter

import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY

# Your server's tools/list, as the model takes them: name, description, arguments.
tools = [{"name": t["name"], "description": t["description"], "input_schema": t["inputSchema"]}
         for t in listed_tools]

def pick(prompt: str) -> str | None:
    reply = client.messages.create(model="claude-opus-5-5", max_tokens=1024, tools=tools,
                                   messages=[{"role": "user", "content": prompt}])
    return next((block.name for block in reply.content if block.type == "tool_use"), None)

failed = 0
for test in json.load(open("routing-tests-demo.json")):  # the file Export saved
    picks = Counter(pick(test["prompt"]) for _ in range(3))
    passed = picks[test["expect"]] >= 2  # the majority of three draws
    failed += not passed
    print("✓" if passed else "✗", test["id"], dict(picks))

sys.exit(1 if failed else 0)  # a misrouted test fails the job, as in the kit
```

Three things to keep as whichtool does them:

- **Offer every tool**, not only the expected one: routing is a choice between neighbours.
- **Do not force a tool** (`tool_choice`): a model that answers without calling one missed the
  test.
- **Keep these tests out of your unit tests.** Each one calls a paid model, and its answer can
  vary between runs: give them a job of their own, on pull requests, as the kit does.

## Sources

- Anthropic, [*Tool use with Claude*](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview).
