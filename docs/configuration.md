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
| `anthropic_base` | the SDK's | Another Anthropic endpoint, such as a proxy. |
| `openai_base` | `https://api.openai.com/v1` | Another OpenAI-compatible endpoint. |
| `default_usd_per_call` | `0.014` | The estimate for a priced model before its first run. |
| `prices.<model>` | current Claude 5.5 models | `input`, `output`, `cache_write`, `cache_read`, in dollars per million tokens. Add OpenAI models here to see their cost. |

Keys: `ANTHROPIC_API_KEY` for models whose name starts with `claude-`, `OPENAI_API_KEY`
for the others.

```toml
[routing]
server = "http://127.0.0.1:8000/mcp"
model = "claude-opus-5-5"

[routing.prices.gpt-6-sol]   # your provider's current prices
input = 2.5
output = 10.0
cache_write = 0.0
cache_read = 0.25
```
