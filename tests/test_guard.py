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


async def test_in_a_codespace_its_forwarded_address_drives_the_console(monkeypatch) -> None:
    monkeypatch.setenv("CODESPACE_NAME", "shiny-space-xyz")
    monkeypatch.setenv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", "app.github.dev")
    forwarded = f"shiny-space-xyz-{PORT}.app.github.dev"
    async with client(forwarded) as http:
        read = await http.get("/act")
        changed = await http.post("/act", headers={HEADER: "1", "origin": f"https://{forwarded}"})
    # Only that address: another Codespace's, or another port's, stays refused.
    async with client(f"other-space-{PORT}.app.github.dev") as http:
        other = await http.get("/act")
    async with client("shiny-space-xyz-9999.app.github.dev") as http:
        wrong_port = await http.get("/act")

    assert (read.status_code, changed.text) == (200, "done")
    assert other.status_code == wrong_port.status_code == 403


async def test_outside_a_codespace_a_forwarded_looking_address_is_refused(monkeypatch) -> None:
    monkeypatch.delenv("CODESPACE_NAME", raising=False)
    monkeypatch.delenv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", raising=False)
    async with client(f"shiny-space-xyz-{PORT}.app.github.dev") as http:
        answer = await http.get("/act")

    assert answer.status_code == 403
