"""A server's tools, as its tools/list answers."""

import json
import re
from dataclasses import asdict, dataclass

import httpx

from . import CLI

_SSE_DATA = re.compile(r"^data: (?P<payload>.*)$", re.MULTILINE)
_LIST = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}
_INITIALIZE = {"jsonrpc": "2.0", "id": 0, "method": "initialize", "params": {
    "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": f"{CLI} tools", "version": "0.1"}}}
_INITIALIZED = {"jsonrpc": "2.0", "method": "notifications/initialized"}


@dataclass(frozen=True)
class Param:
    name: str
    type: str
    required: bool
    description: str


@dataclass(frozen=True)
class Tool:
    name: str
    title: str
    description: str
    params: tuple[Param, ...]

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


def parse_payload(raw: str) -> dict[str, object]:
    """The MCP endpoint answers as an SSE frame, or as plain JSON when it feels like it."""
    match = _SSE_DATA.search(raw)
    body = match.group("payload") if match else raw
    parsed = json.loads(body)
    return parsed if isinstance(parsed, dict) else {}


def _type_of(schema: dict[str, object]) -> str:
    declared = schema.get("type")
    if isinstance(declared, str):
        return declared
    options = schema.get("anyOf")
    if isinstance(options, list):
        names = [str(o.get("type")) for o in options if isinstance(o, dict) and o.get("type")]
        concrete = [n for n in names if n != "null"]
        return " | ".join(concrete or names) or "any"
    return "any"


def _params(schema: dict[str, object]) -> tuple[Param, ...]:
    properties = schema.get("properties")
    if not isinstance(properties, dict):
        return ()
    required = schema.get("required")
    required_names = set(required) if isinstance(required, list) else set()
    return tuple(
        Param(
            name=str(name),
            type=_type_of(spec) if isinstance(spec, dict) else "any",
            required=name in required_names,
            description=str(spec.get("description", "")) if isinstance(spec, dict) else "",
        )
        for name, spec in properties.items()
    )


def to_tools(payload: dict[str, object]) -> list[Tool]:
    result = payload.get("result")
    listed = result.get("tools") if isinstance(result, dict) else None
    if not isinstance(listed, list):
        return []
    tools = []
    for entry in listed:
        if not isinstance(entry, dict):
            continue
        schema = entry.get("inputSchema")
        tools.append(
            Tool(
                name=str(entry.get("name", "")),
                title=str(entry.get("title") or entry.get("name", "")),
                description=str(entry.get("description", "")),
                params=_params(schema) if isinstance(schema, dict) else (),
            )
        )
    return tools


async def listed(url: str, client: httpx.AsyncClient, bearer: str = "") -> dict[str, object]:
    """tools/list as the server answered it, schemas included.

    The handshake comes first, as any client makes it: a stateful server refuses tools/list outside
    the session that initialize opened, and a stateless one answers initialize all the same."""
    headers = {"accept": "application/json, text/event-stream"}
    if bearer:
        headers["authorization"] = f"Bearer {bearer}"
    session, opened = await _call(client, url, _INITIALIZE, headers)
    if session:
        headers["mcp-session-id"] = session
    result = opened.get("result")
    version = result.get("protocolVersion") if isinstance(result, dict) else None
    headers["mcp-protocol-version"] = str(version or _INITIALIZE["params"]["protocolVersion"])
    await client.post(url, json=_INITIALIZED, headers=headers, timeout=10)
    return (await _call(client, url, _LIST, headers))[1]


async def _call(client: httpx.AsyncClient, url: str, message: dict, headers: dict) -> tuple[str, dict[str, object]]:
    """One JSON-RPC request: the session id the server gave, and its answer.

    An SSE answer is read up to the message that answers this request, then the stream is dropped:
    some servers keep it open for seconds after, and waiting for them to close it is waiting for nothing."""
    async with client.stream("POST", url, json=message, headers=headers, timeout=20) as response:
        if not response.is_success:
            # A redirect too: it answers somewhere else, which is an address to fix, not a body to parse.
            await response.aread()
            raise httpx.HTTPStatusError(f"{response.status_code} {response.reason_phrase}", request=response.request,
                                        response=response)
        session = response.headers.get("mcp-session-id", "")
        if "text/event-stream" not in response.headers.get("content-type", ""):
            return session, parse_payload((await response.aread()).decode())
        async for line in response.aiter_lines():
            if not line.startswith("data:"):
                continue
            payload = json.loads(line[5:].strip() or "{}")
            if isinstance(payload, dict) and payload.get("id") == message["id"]:
                return session, payload
    raise ValueError("the server closed the stream without answering")


def unlisted(url: str, error: Exception) -> str:
    """Why a server's tools could not be read, in words a person can act on."""
    if isinstance(error, httpx.HTTPStatusError):
        code = error.response.status_code
        status = f"{code} {error.response.reason_phrase}".strip()
        if code in (401, 403):
            return f"The server refused to list its tools without an access token ({status})."
        if 300 <= code < 400:
            where = error.response.headers.get("location", "")
            return f"This address redirects elsewhere ({status}){f': try {where}' if where else ''}."
        if code in (404, 405):
            return f"No MCP server answers at this address ({status}). Check the path: it often ends in /mcp."
        return f"The server answered with an error ({status})."
    if isinstance(error, httpx.TimeoutException):
        return "The server took too long to answer."
    if isinstance(error, (httpx.ConnectError, httpx.UnsupportedProtocol, httpx.InvalidURL)):
        return f"Could not reach {url}. Is the server running, and is the address right?"
    if isinstance(error, httpx.HTTPError):
        return f"Could not talk to the server: {error}"
    return "Something answers at this address, but not as an MCP server."


async def list_tools(url: str, client: httpx.AsyncClient, bearer: str = "") -> list[Tool]:
    return to_tools(await listed(url, client, bearer))
