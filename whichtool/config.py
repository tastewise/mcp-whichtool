"""The settings the core reads: the routing eval.

Each spec is a frozen dataclass a host application builds from its own configuration. The parsers below
read the TOML tables the console uses, so a host keeps that shape without writing them again.
"""

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class RoutingSpec:
    """The routing eval: the server it asks for tools, what it costs, and where results land.

    `server` is the MCP endpoint whose tools/list the eval offers the model; empty, the tools come from
    the source alone. `descriptions` is the folder under `cwd` whose Python declares the tools; a
    description written there wins over the listed one, so an edit is measured before it ships.
    """

    cwd: Path
    fixture: Path
    results: Path
    server: str = ""
    # Sent as a bearer token to `server`, for one that sits behind a gateway.
    server_token: str = ""
    # What the model is told before the prompt, as a client would tell it. Empty: nothing.
    system: str = ""
    descriptions: str = "src"
    # The model the advice asks; the eval names its own.
    model: str = "claude-opus-5-5"
    default_usd_per_call: float = 0.014
    anthropic_key: str = ""
    openai_key: str = ""
    # Empty: the SDK's own endpoint.
    anthropic_base: str = ""
    openai_base: str = "https://api.openai.com/v1"
    concurrency: int = 4
    prices: dict[str, dict[str, float]] = field(default_factory=dict)



def read_env_value(path: Path, key: str) -> str | None:
    """One key out of a .env file."""
    if not path.exists():
        return None
    for line in path.read_text(errors="replace").splitlines():
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def secret(name: str, env_file: Path) -> str:
    """A secret the console owns: exported if you meant to, else its own .env."""
    return os.environ.get(name, "") or (read_env_value(env_file, name) or "")


def merge(base: dict, overlay: dict) -> dict:
    """Deep-merge an overlay over a base, table by table."""
    merged = dict(base)
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def resolved(raw: str) -> Path:
    return Path(raw).expanduser().resolve()


def routing_spec(raw: dict, env_file: Path) -> RoutingSpec:
    cwd = resolved(str(raw.get("cwd", ".")))
    return RoutingSpec(
        cwd=cwd,
        fixture=cwd / Path(str(raw.get("fixture", "routing_cases.json"))).expanduser(),
        results=Path(str(raw.get("results", "~/.whichtool/results"))).expanduser(),
        server=str(raw.get("server", "")),
        server_token=secret(str(raw.get("server_token_env", "MCP_SERVER_TOKEN")), env_file),
        system=str(raw.get("system", "")),
        descriptions=str(raw.get("descriptions", "src")),
        model=str(raw.get("model", "claude-opus-5-5")),
        default_usd_per_call=float(raw.get("default_usd_per_call", 0.014)),
        prices={name: {k: float(v) for k, v in table.items()} for name, table in raw.get("prices", {}).items()},
        anthropic_key=secret("ANTHROPIC_API_KEY", env_file),
        openai_key=secret("OPENAI_API_KEY", env_file),
        anthropic_base=str(raw.get("anthropic_base", "")),
        openai_base=str(raw.get("openai_base", "https://api.openai.com/v1")),
        concurrency=int(raw.get("concurrency", 4)),
    )
