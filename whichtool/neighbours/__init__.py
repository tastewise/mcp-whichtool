"""Neighbours: other servers' tools, offered alongside yours as a client would.

In Claude, ChatGPT or Copilot the model never sees one server alone: the user's other connectors and
the host's own tools are on the same list, and a broad one can take a request before yours is weighed.
A neighbour set is a snapshot of such tools, in the shape of a `tools/list` result, shipped here so a
run needs no other server and no other key.
"""

import json
from importlib import resources

from ..models import Tool


def _files() -> dict[str, object]:
    folder = resources.files(__package__)
    return {entry.name.removesuffix(".json"): entry for entry in folder.iterdir() if entry.name.endswith(".json")}


def available() -> list[str]:
    return sorted(_files())


def _read(name: str) -> dict:
    found = _files().get(name)
    if found is None:
        raise ValueError(f"no neighbour named {name}: {', '.join(available()) or 'none ship'}")
    return json.loads(found.read_text())  # type: ignore[attr-defined]


def about(name: str) -> str:
    return str(_read(name).get("about", ""))


def load(names: list[str] | tuple[str, ...]) -> list[tuple[str, Tool]]:
    """Each set's tools, in the order asked, with the set it came from."""
    found: list[tuple[str, Tool]] = []
    for name in dict.fromkeys(names):
        for entry in _read(name).get("tools", []):
            schema = entry.get("inputSchema")
            found.append((name, Tool(name=str(entry["name"]), description=str(entry.get("description", "")),
                                     input_schema=schema if isinstance(schema, dict) else {"type": "object"})))
    return found


def merged(offered: list[Tool], names: list[str] | tuple[str, ...]) -> tuple[list[Tool], dict[str, str]]:
    """The server's tools, then the neighbours', and which set each neighbour tool came from.

    A neighbour tool with the name of one of yours is refused: a real host would namespace the two, and a
    run that silently kept one would measure neither.
    """
    own = {tool.name for tool in offered}
    extra: list[Tool] = []
    origin: dict[str, str] = {}
    for name, tool in load(names):
        if tool.name in own:
            raise ValueError(f"the neighbour {name} offers {tool.name}, a name your server already uses")
        if tool.name in origin:
            continue
        extra.append(tool)
        origin[tool.name] = name
    return [*offered, *extra], origin
