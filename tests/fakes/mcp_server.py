"""A real MCP server over Streamable HTTP, stateful the way most are: tools/list outside a session is refused.

It answers as an SSE frame, as servers built on the official SDKs do, and checks the bearer token
when it is given one.
"""

import asyncio
import contextlib
import json
from collections.abc import AsyncIterator

from tests.fakes.sockets import listening

TOOLS = [
    {"name": "rank_brands", "description": "Rank brands in a category by share.",
     "inputSchema": {"type": "object", "properties": {"category": {"type": "string"}}, "required": ["category"]}},
    {"name": "list_categories", "description": "List the categories a market tracks.",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "rank_retailers", "description": "Rank retailers by the brands they carry.",
     "inputSchema": {"type": "object", "properties": {"brand": {"type": "string"}}}},
]


@contextlib.asynccontextmanager
async def serve(tools: list[dict] | None = None, token: str = "", linger: float = 0.0) -> AsyncIterator[str]:
    """`linger`: an SSE answer's stream stays open that long after the answer, as some hosted servers keep it."""
    listed = TOOLS if tools is None else tools
    sessions: set[str] = set()

    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        head = await reader.readuntil(b"\r\n\r\n")
        lines = head.decode().split("\r\n")
        headers = {name.strip().lower(): value.strip()
                   for name, _, value in (line.partition(":") for line in lines[1:] if ":" in line)}
        raw = await reader.readexactly(int(headers.get("content-length", "0")))
        message = json.loads(raw)
        status, extra, payload = 200, "", None
        if token and headers.get("authorization") != f"Bearer {token}":
            status = 401
        elif message.get("method") == "initialize":
            session = f"s{len(sessions) + 1}"
            sessions.add(session)
            extra = f"Mcp-Session-Id: {session}\r\n"
            payload = {"jsonrpc": "2.0", "id": message["id"], "result": {
                "protocolVersion": "2025-06-18", "capabilities": {"tools": {}},
                "serverInfo": {"name": "acme", "version": "1"}}}
        elif headers.get("mcp-session-id") not in sessions:
            status = 400
        elif message.get("method") == "notifications/initialized":
            status = 202
        elif message.get("method") == "tools/list":
            payload = {"jsonrpc": "2.0", "id": message["id"], "result": {"tools": listed}}
        body = f"event: message\ndata: {json.dumps(payload)}\n\n".encode() if payload else b""
        kind = "text/event-stream" if payload else "application/json"
        if payload and linger:
            # No length: the stream ends when the server closes it, which it takes its time to do.
            writer.write(f"HTTP/1.1 {status} X\r\nContent-Type: {kind}\r\n{extra}Connection: close\r\n\r\n".encode() + body)
            await writer.drain()
            with contextlib.suppress(TimeoutError, ConnectionError):
                await asyncio.wait_for(reader.read(1), timeout=linger)
            writer.close()
            return
        writer.write(f"HTTP/1.1 {status} X\r\nContent-Type: {kind}\r\n{extra}"
                     f"Content-Length: {len(body)}\r\nConnection: close\r\n\r\n".encode() + body)
        await writer.drain()
        writer.close()

    async with listening(handle) as server:
        yield f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}/mcp"
