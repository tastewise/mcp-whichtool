import json
import time

import httpx
import pytest

from tests.fakes import mcp_server
from whichtool.tools import list_tools, parse_payload, to_tools

LISTING = {
    "jsonrpc": "2.0",
    "id": 1,
    "result": {
        "tools": [
            {
                "name": "list_categories",
                "title": "Categories",
                "description": "The categories the catalogue is filed under, ranked for a query.",
                "inputSchema": {
                    "type": "object",
                    "required": ["region", "query"],
                    "properties": {
                        "region": {"type": "string", "description": "Two-letter region code."},
                        "query": {"type": "string", "description": "The user's request."},
                        "filters": {
                            "anyOf": [{"type": "object"}, {"type": "null"}],
                            "description": "Optional hard filters.",
                        },
                    },
                },
            },
            {
                "name": "submit_order",
                "description": "Submits an order.",
                "inputSchema": {"type": "object", "properties": {}},
            },
        ]
    },
}


def test_an_sse_frame_is_unwrapped() -> None:
    raw = "event: message\ndata: " + json.dumps(LISTING) + "\n\n"

    assert parse_payload(raw)["id"] == 1


def test_plain_json_is_read_too() -> None:
    assert parse_payload(json.dumps(LISTING))["id"] == 1


def test_tools_carry_their_title_and_description() -> None:
    tools = to_tools(LISTING)

    assert [t.name for t in tools] == ["list_categories", "submit_order"]
    assert tools[0].title == "Categories"
    assert tools[0].description.startswith("The categories")
    # No title: the name stands in.
    assert tools[1].title == "submit_order"


def test_parameters_keep_their_type_requiredness_and_help() -> None:
    params = {p.name: p for p in to_tools(LISTING)[0].params}

    assert params["region"].required is True
    assert params["region"].type == "string"
    assert params["region"].description == "Two-letter region code."
    assert params["filters"].required is False
    assert params["filters"].type == "object"


def test_a_tool_without_properties_has_no_parameters() -> None:
    assert to_tools(LISTING)[1].params == ()


def test_an_unexpected_payload_yields_no_tools_rather_than_an_error() -> None:
    assert to_tools({"error": {"code": -32600}}) == []
    assert to_tools({"result": {}}) == []


async def test_list_tools_reads_a_real_sse_response() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if json.loads(request.content)["method"] != "tools/list":
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 0, "result": {}})
        return httpx.Response(
            200,
            text="event: message\ndata: " + json.dumps(LISTING) + "\n\n",
            headers={"content-type": "text/event-stream"},
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        tools = await list_tools("http://x/mcp/v2", client)

    assert len(tools) == 2
    assert tools[0].params[0].name == "region"


async def test_a_refusing_server_raises_rather_than_reporting_no_tools() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(httpx.HTTPStatusError):
            await list_tools("http://x/mcp/v2", client)


async def test_a_server_that_keeps_its_stream_open_is_read_as_soon_as_it_answers() -> None:
    async with mcp_server.serve(linger=30) as url, httpx.AsyncClient() as http:
        started = time.monotonic()
        found = await list_tools(url, http)

    assert [tool.name for tool in found] == ["rank_brands", "list_categories", "rank_retailers"]
    assert time.monotonic() - started < 5
