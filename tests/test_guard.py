import httpx
import pytest
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route

from whichtool.guard import DEV_PORT, HEADER, Guard

PORT = 8790


async def acted(_request) -> PlainTextResponse:
    return PlainTextResponse("done")


def client(host: str = f"127.0.0.1:{PORT}") -> httpx.AsyncClient:
    app = Starlette(routes=[Route("/act", acted, methods=["GET", "POST"])])
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=Guard(app, port=PORT)), base_url=f"http://{host}")


async def test_reading_needs_no_header() -> None:
    async with client() as http:
        answer = await http.get("/act")

    assert answer.status_code == 200


async def test_a_change_without_the_header_is_refused() -> None:
    async with client() as http:
        answer = await http.post("/act")

    assert answer.status_code == 403
    assert HEADER in answer.json()["detail"]


async def test_a_change_with_the_header_gets_through() -> None:
    async with client() as http:
        answer = await http.post("/act", headers={HEADER: "1"})

    assert answer.text == "done"


async def test_a_foreign_origin_is_refused_even_with_the_header() -> None:
    async with client() as http:
        answer = await http.post("/act", headers={HEADER: "1", "origin": "https://evil.example"})

    assert answer.status_code == 403
    assert "evil.example" in answer.json()["detail"]


@pytest.mark.parametrize("origin", [f"http://localhost:{PORT}", f"http://127.0.0.1:{DEV_PORT}"])
async def test_the_console_s_own_origins_get_through(origin: str) -> None:
    async with client() as http:
        answer = await http.post("/act", headers={HEADER: "1", "origin": origin})

    assert answer.status_code == 200


@pytest.mark.parametrize("method", ["GET", "POST"])
async def test_a_rebound_domain_is_refused_before_any_route(method: str) -> None:
    async with client(host="attacker.example") as http:
        answer = await http.request(method, "/act", headers={HEADER: "1"})

    assert answer.status_code == 403
    assert "127.0.0.1" in answer.json()["detail"]
