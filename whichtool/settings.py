"""The project file the CLI and the web app read: `whichtool.toml`, keys in the `.env` beside it.

Relative paths are relative to the file, never to wherever the command was run from, and what the
console writes for itself (its runs) lands in `.whichtool/` beside it unless the
file says otherwise. Keys are never read from the TOML: the environment first, then the `.env`.
"""

import json
import tomllib
from dataclasses import dataclass
from pathlib import Path

from .config import RoutingSpec, routing_spec

FILE = "whichtool.toml"
ENV = ".env"
STATE = ".whichtool"

# Per million tokens, from Anthropic's price list (2026-10). A [routing.prices] table overrides or
# extends it; a model with no price shows tokens and no dollars rather than a guessed figure.
CLAUDE_PRICES = {
    "claude-opus-5-5": {"input": 4.0, "output": 20.0, "cache_write": 5.0, "cache_read": 0.20},
    "claude-sonnet-5-5": {"input": 2.0, "output": 10.0, "cache_write": 2.5, "cache_read": 0.20},
    "claude-haiku-5-5": {"input": 0.10, "output": 0.50, "cache_write": 0.125, "cache_read": 0.01},
}

STARTER = """\
# What whichtool evaluates. Keys go in .env beside this file, never here.

[routing]
# The MCP endpoint whose tools/list the models are offered. Empty: the source's tools, without their arguments.
server = {server}
# The cases: [{{"id": "...", "prompt": "...", "expect": "tool_name"}}, ...]
fixture = "routing_cases.json"
# The model the advice asks, and the eval's default.
model = {model}
# For a Python server: the repo, and the folder whose @tool declarations hold the descriptions.
# A description edited there is measured before the server reloads it.
# cwd = "."
{descriptions}
"""


def starter(server: str, model: str, descriptions: str = "") -> str:
    """The project file `init` and `scan` write. Values are quoted as JSON, which TOML reads the same."""
    folder = f"descriptions = {json.dumps(descriptions)}" if descriptions else '# descriptions = "src"'
    return STARTER.format(server=json.dumps(server), model=json.dumps(model), descriptions=folder)


class NoProject(Exception):
    """No whichtool.toml here or above."""


@dataclass(frozen=True)
class Settings:
    file: Path
    env_file: Path
    routing: RoutingSpec | None

    @property
    def root(self) -> Path:
        return self.file.parent


def find(start: Path | None = None) -> Path:
    """The nearest whichtool.toml, from `start` up, as git finds its repository."""
    here = (start or Path.cwd()).resolve()
    for folder in (here, *here.parents):
        if (folder / FILE).is_file():
            return folder / FILE
    raise NoProject(f"no {FILE} here or above: run `whichtool init`")


def _anchored(root: Path, raw: dict, keys: tuple[str, ...]) -> dict:
    found = dict(raw)
    for key in keys:
        if key in found and not Path(str(found[key])).expanduser().is_absolute():
            found[key] = str(root / str(found[key]))
    return found


def load(file: Path | None = None) -> Settings:
    path = (file or find()).resolve()
    try:
        raw = tomllib.loads(path.read_text())
    except tomllib.TOMLDecodeError as error:
        raise ValueError(f"{path} is not valid TOML: {error}") from error
    root, env = path.parent, path.parent / ENV
    routing = None
    if isinstance(raw.get("routing"), dict):
        table = _anchored(root, raw["routing"], ("cwd", "results", "fixture"))
        table.setdefault("cwd", str(root))
        table.setdefault("results", str(root / STATE / "results"))
        table["prices"] = CLAUDE_PRICES | table.get("prices", {})
        routing = routing_spec(table, env)
    return Settings(file=path, env_file=env, routing=routing)


def write_env(env: Path, values: dict[str, str]) -> None:
    """Set keys in the .env, keeping the others, readable by its owner only."""
    lines = env.read_text().splitlines() if env.exists() else []
    kept = [line for line in lines if line.split("=", 1)[0] not in values]
    kept += [f"{name}={value}" for name, value in values.items() if value]
    env.touch(mode=0o600)
    env.chmod(0o600)
    env.write_text("\n".join(kept) + "\n")
