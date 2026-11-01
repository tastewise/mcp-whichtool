"""The demo as a newcomer runs it: the real server, built on the official MCP SDK, and its project."""

import asyncio
import json
import socket
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import replace
from pathlib import Path

import httpx

from whichtool import routing, routing_eval, settings
from whichtool.routing_changes import validate_cases

DEMO = Path(__file__).resolve().parent.parent / "demo"


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


@asynccontextmanager
async def demo_server() -> AsyncIterator[str]:
    port = free_port()
    process = await asyncio.create_subprocess_exec(sys.executable, str(DEMO / "server.py"), "--port", str(port),
                                                   stdout=asyncio.subprocess.DEVNULL,
                                                   stderr=asyncio.subprocess.DEVNULL)
    try:
        for _ in range(100):
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.1):
                    break
            except OSError:
                await asyncio.sleep(0.1)
        yield f"http://127.0.0.1:{port}/mcp"
    finally:
        process.terminate()
        await process.wait()


def test_the_demo_project_loads_and_every_case_names_a_tool_of_the_server() -> None:
    loaded = settings.load(DEMO / settings.FILE)

    assert loaded.routing is not None
    spec = loaded.routing
    declared = routing_eval.declared(spec)
    assert len(declared) == 7
    cases = json.loads(spec.fixture.read_text())
    assert validate_cases(cases, set(declared)) == cases
    assert len(routing.cases(spec)) == 13


async def test_the_real_server_lists_its_tools_through_the_handshake(tmp_path: Path) -> None:
    loaded = settings.load(DEMO / settings.FILE)
    assert loaded.routing is not None
    async with demo_server() as url, httpx.AsyncClient() as http:
        offered = await routing_eval.catalogue(replace(loaded.routing, server=url), http)

    names = [tool.name for tool in offered]
    assert sorted(names) == sorted(routing_eval.declared(loaded.routing))
    stock = next(tool for tool in offered if tool.name == "check_stock")
    assert stock.description == "Whether a book is available."
    assert stock.input_schema["required"] == ["title"]
