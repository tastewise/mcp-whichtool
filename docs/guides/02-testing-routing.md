# Testing routing

Does the model pick the right tool for a request? This guide is about measuring it: which tests
to write, how many times to ask, and how to read what comes back.

## The theory

### No single check catches everything

Anthropic describes evaluation as layers of Swiss cheese: "no single evaluation layer catches every
issue. With multiple methods combined, failures that slip through one layer are caught by another"
([Anthropic, 2026](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)).

![The Swiss cheese of quality: automated evals, manual transcript review, production monitoring](https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fb77b8dbb7c2e57f063fbc8a087a853d5809b74b0-4584x2580.png&w=1920&q=75)

*Source: [Anthropic, Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).*

Routing tests are the automated layer: run before a change ships, and again in CI. Reading why a
test failed is the transcript layer. Watching real traffic is a layer of its own, outside this
tool.

### Start small, from real failures

"20-50 simple tasks drawn from real failures is a great start"
([Anthropic, 2026](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)). The
best first tests are the requests users actually sent that went to the wrong tool, and the
requests two of your tools could both answer.

Tests come in two kinds. **Capability** tests target what the model struggles with: "they should
start at a low pass rate". **Regression** tests "should have a nearly 100% pass rate" and "protect
against backsliding" (same source). A test that failed, then passed once a description was fixed,
becomes a regression test: keep it.

### One run is not enough

The same request does not always reach the same tool. Two ways of counting several trials tell
opposite stories: pass@k "measures the likelihood that an agent gets at least one correct
solution in k attempts", pass^k "measures the probability that all k trials succeed". The second
"especially matters for customer-facing agents where users expect reliable behavior every time"
([Anthropic, 2026](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)).

![pass@k rises towards 100 % as trials grow, pass^k falls towards 0 %](https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F3ddac5be07a0773922ec9df06afec55922f8194a-4584x2580.png&w=1920&q=75)

*Source: [Anthropic, Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).*

### Read the failures

A failed test is not always the model's fault: the transcript shows "whether the agent made a
genuine mistake or whether your graders rejected a valid solution"
([Anthropic, 2026](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)). For
routing, the usual culprit is a test that expects one tool where two are defensible: fix the
test, or make the two tools' descriptions say which one owns the request.

## In whichtool

### Writing tests

A test is a request a user could type and the tool that should handle it. **Let AI write them**
proposes requests for each of your tools, worded the way users would; you edit or remove the
ones that do not fit, run them, and keep what ran. **Write your own** takes one by hand. Tests
live in your project's case file, beside `whichtool.toml`.

### Draws

Each test is asked several times. **1 · first look** asks once: cheap, for a quick read.
**3 · majority** asks three times and passes when at least two draws pick the right tool. That
sits between pass@k and pass^k: a test that passes 2 to 1 is one that flips, and its draws are
worth reading. The run button gives the cost before you press it: tests × draws × the price of a
call.

### Reading a run

The report shows, per test, the tool each draw picked. A failed test names the neighbour that
won, which is where to look: at that tool's description and the expected one's. From there,
[Naming and describing tools](01-naming-and-describing-tools.md) covers the fix and how to try it
before it ships.

### In CI

**Export** packs the tests for your server's repository: the cases, a project file that reads the
repository's own source, and a GitHub Actions workflow that runs them on every pull request. A
description that breaks a test then shows in review, before it ships.

## Sources

- Anthropic, [*Demystifying evals for AI agents*](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), 2026.
