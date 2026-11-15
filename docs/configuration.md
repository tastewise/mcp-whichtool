# Configuration

mcp-whichtool reads `whichtool.toml`, the nearest one from the current folder up (or
the file given with `--config`). Relative paths are relative to that file. Keys are never
read from it: each key comes from the environment first, then from the `.env` file beside
it, which `whichtool keys` writes.

What the console writes for itself, its runs and the editor's state, goes in
`.whichtool/` beside the file. Add it and `.env` to your `.gitignore`.

## `[routing]`

The eval. Every key is optional.

| Key | Default | What it is |
| --- | --- | --- |
| `server` | `""` | The MCP endpoint (Streamable HTTP) whose `tools/list` the models are offered. Empty: the tools come from the source alone. |
| `server_token_env` | `MCP_SERVER_TOKEN` | The name of the variable holding a bearer token, for a server behind a gateway. |
| `fixture` | `routing_cases.json` | The cases: a JSON list of `{"id", "prompt", "expect"}`. |
| `model` | `claude-opus-5-5` | The eval's default model, and the one that writes suggestions and cases. |
| `system` | `""` | A system prompt given before each case, as a client would give its own. |
| `cwd` | the file's folder | The server's project, where descriptions are saved. |
| `descriptions` | `src` | The folder under `cwd` whose Python, TypeScript or JavaScript declares the tools. A description found there wins over the listed one. |
| `results` | `.whichtool/results` | Where runs are written. |
| `concurrency` | `4` | Model calls in flight at once. |
| `neighbours` | `[]` | Other servers' tools offered alongside yours, by the name of a set that ships with whichtool, such as `["web-search"]`. See [Neighbours](#neighbours). |
| `anthropic_base` | the SDK's | Another Anthropic endpoint, such as a proxy. |
| `openai_base` | `https://api.openai.com/v1` | Another OpenAI-compatible endpoint. |
| `default_usd_per_call` | none | A flat estimate per call for a priced model before its first run. Unset: the model's own prices, on the tokens of another model's run, or of a typical call. |
| `prices.<model>` | current Claude 5.5 and GPT-6 models | `input`, `output`, `cache_write`, `cache_read`, in dollars per million tokens. Add any other model here to see its cost, or override a shipped price. |

Keys: `ANTHROPIC_API_KEY` for models whose name starts with `claude-`, `OPENAI_API_KEY`
for the others.

```toml
[routing]
server = "http://127.0.0.1:8000/mcp"
model = "claude-opus-5-5"

[routing.prices.gpt-5-mini]   # your provider's current prices
input = 0.25
output = 2.0
cache_write = 0.0
cache_read = 0.025
```

## Neighbours

In Claude, ChatGPT or Copilot the model never sees your server alone: the user's other
connectors and the host's own tools are on the same list. A broad neighbour, such as a
tool that searches the web, can take a request before your server's tools are weighed.

A neighbour set is a snapshot of such tools, in the shape of a `tools/list` result, that
ships with whichtool: a run with one needs no other server and no other key. `whichtool
tools` lists the sets that ship. Today: `web-search`, one broad web search tool.

```toml
[routing]
neighbours = ["web-search"]
```

`whichtool eval` and `whichtool try` take `--neighbour SET` (repeatable) in place of the
project file's list, and `--no-neighbours` for your tools alone. A case a neighbour wins
fails like any other misroute, and says so:

```
  ✗ genres-cookbooks  expected list_genres, got web_search (neighbour: web-search) ×3
      'Do you sell cookbooks?'
  ! 1 of the failed cases went to a neighbour (web-search): they never reached your server
```

A neighbour's description cannot change, so the analysis of such a case sees it, and
proposes a description of yours that wins the request back. A neighbour tool named like
one of yours is refused: a real host would tell the two apart, and a run cannot.
