# Naming and describing tools

A model picks a tool from what the server lists for it: the tool's name, its description and
its arguments. Nothing else. This guide is about writing those well, then checking that they
work.

## What the model reads

An MCP server answers `tools/list` with its tools. Each one carries a `name` ("unique identifier
for the tool"), an optional `title` for display, a `description` ("human-readable description of
functionality") and an `inputSchema` for its arguments
([MCP, *Tools*](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)). The host
puts every server's tools in front of the model; when a request comes in, the model chooses one
from those words alone.

So the name and the description are a prompt. They are read on every request, next to every other
tool's, and they decide where the request goes.

## Naming a tool

### What the protocol asks

The specification's rules for a tool name
([MCP, *Tool Names*](https://modelcontextprotocol.io/specification/2025-11-25/server/tools#tool-names)):

- between 1 and 128 characters, and case-sensitive;
- only ASCII letters, digits, underscore (`_`), hyphen (`-`) and dot (`.`): no spaces, commas or
  other special characters;
- unique within a server.

`getUser`, `DATA_EXPORT_v2` and `admin.tools.list` are all valid. The protocol does not choose a
style for you; a model reads whichever you pick.

### Names that tell neighbours apart

The name is the first thing that separates two tools. Anthropic recommends namespacing:
"Namespacing (grouping related tools under common prefixes) can help delineate boundaries between
lots of tools", for instance by service (`asana_search`, `jira_search`) or by resource
(`asana_projects_search`, `asana_users_search`)
([Anthropic, 2025](https://www.anthropic.com/engineering/writing-tools-for-agents)).

In practice:

- **Pick one scheme and keep it.** `verb_object` in `snake_case` (`search_books`, `get_book`,
  `track_order`) reads well; whatever you choose, every tool follows it.
- **Say the action and the object.** `get_book` and `check_stock` say what they do; `book` or
  `helper` make the model guess.
- **Prefix once the catalogue grows.** With many tools, or tools from several domains, a prefix by
  domain then by resource keeps families together: `orders_track`, `orders_cancel`,
  `catalogue_search`.
- **Make neighbours differ in the name.** Two tools that answer close requests should not share
  their verb and object: `search_books` and `recommend_books` already say which one finds and
  which one suggests.

The same article adds a caution: "Effects vary by LLM and we encourage you to choose a naming
scheme according to your own evaluations." A naming scheme is a hypothesis; the tests below
decide.

## Describing a tool

### Write it for a new hire

"When writing tool descriptions and specs, think of how you would describe your tool to a new hire
on your team." Consider the context you bring implicitly, "and make it explicit"
([Anthropic, 2025](https://www.anthropic.com/engineering/writing-tools-for-agents)).

A description that routes well says:

1. **What the tool does**, in one sentence, with the words a user would use.
2. **When to use it**: the requests it is for, with an example or two.
3. **When not to**: the neighbouring tool that answers the close request instead, by its name.
4. **What it needs**: arguments whose names leave no doubt. "Instead of a parameter named `user`,
   try a parameter named `user_id`" (same source).

### An example

The demo's bookshop server ships with descriptions that are vague on purpose. Its search tool
reads:

```text
search_books: Search the catalogue.
```

"Something cosy for a rainy weekend?" could go to it, or to `recommend_books`. A description that
routes:

```text
search_books: Find books in the catalogue by title, author or subject words
("books about sourdough", "what has Ursula K. Le Guin written?"). For suggestions
based on a book or a mood the reader liked, use recommend_books instead.
```

The second one names the requests it takes, and hands the close one to its neighbour.

### Fewer, distinct tools

"More tools don't always lead to better outcomes", and "too many tools or overlapping tools can
also distract agents from pursuing efficient strategies". The advice is to build "a few thoughtful
tools targeting specific high-impact workflows", and to "make sure each tool you build has a
clear, distinct purpose" ([Anthropic, 2025](https://www.anthropic.com/engineering/writing-tools-for-agents)).
When two descriptions cannot be told apart, merging the tools is often the better fix.

## Measure, don't guess

Descriptions are worth testing because they move results: "even small refinements to tool
descriptions can yield dramatic improvements", and Claude Sonnet 3.5 "achieved state-of-the-art
performance on the SWE-bench Verified evaluation", "after we made precise refinements to tool
descriptions" ([Anthropic, 2025](https://www.anthropic.com/engineering/writing-tools-for-agents)).
The same article compares, on a held-out test set, its internal Slack tools as written by people
and as optimised by Claude:

![Held-out test set performance of internal Slack tools, human-written and Claude-optimized](https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F6e810aee67f3f3c955832fb7bf9033ffb0102000-1920x1080.png&w=1920&q=75)

*Source: [Anthropic, Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents).*

Note the held-out set: Anthropic "relied on held-out test sets to ensure we did not overfit to our
'training' evaluations". When you tune descriptions against your tests, keep a few tests aside
that you never tune on, and check them at the end.

## In whichtool

- **Scan** reads your tools as the model will: from your source (Python, TypeScript or
  JavaScript) or from your running server's `tools/list`, with each name and description.
- **Tests** are requests a user could type and the tool each should reach. Write the close calls
  first: the requests two of your tools could both answer.
- **A run** shows, per test, the tool each draw picked. A wrong pick names the neighbour that won.
- **On a failed test**, **Ask AI** says why it failed and proposes a description; or **Edit the
  description** yourself. **Try it on this case** replays that test with the draft, **Run all
  tests with it** checks it moved nothing else, and **Save to source** writes it into your code.
  Nothing is written before.

See [Testing routing](02-testing-routing.md) for how many tests to write and how to read a run.

## Sources

- Model Context Protocol, [*Tools*](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), specification 2025-11-25.
- Anthropic, [*Writing effective tools for AI agents — with agents*](https://www.anthropic.com/engineering/writing-tools-for-agents), 2025.
