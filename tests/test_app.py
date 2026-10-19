"""The web console as its page drives it: guarded, against real model and MCP servers."""

import asyncio
import json
import socket
import subprocess
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
import uvicorn

from tests.fakes import llm_server, mcp_server
from whichtool import app as console
from whichtool import settings

PORT = 8790
CASES = [
    {"id": "brands-canonical", "prompt": "rank_brands in snacks", "expect": "rank_brands"},
    {"id": "retailers-oblique", "prompt": "which rank_brands sell where?", "expect": "rank_retailers"},
]
SOURCE = ('from server import mcp\n\n'
          '@mcp.tool(name="rank_brands", description="Rank brands in a category by share.")\n'
          'def rank_brands(category: str): ...\n\n'
          '@mcp.tool(name="list_categories", description="List the categories a market tracks.")\n'
          'def list_categories(): ...\n\n'
          '@mcp.tool(name="rank_retailers", description="Rank retailers by the brands they carry.")\n'
          'def rank_retailers(brand: str = ""): ...\n')


def project(root: Path, server: str, anthropic_base: str) -> settings.Settings:
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=root, check=True)
    (root / "src").mkdir()
    (root / "src" / "tools.py").write_text(SOURCE)
    (root / "routing_cases.json").write_text(json.dumps(CASES, indent=2) + "\n")
    (root / settings.FILE).write_text(f'[routing]\nserver = "{server}"\nanthropic_base = "{anthropic_base}"\n')
    (root / settings.ENV).write_text("ANTHROPIC_API_KEY=sk-ant-test\n")
    subprocess.run(["git", "add", "."], cwd=root, check=True)
    subprocess.run(["git", "-c", "user.name=T", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false",
                    "commit", "-qm", "initial"], cwd=root, check=True)
    return settings.load(root / settings.FILE)


@asynccontextmanager
async def browser(loaded: settings.Settings, *, header: bool = True):
    app = console.create(loaded)
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=console.Guard(app, PORT))
        headers = {"x-whichtool": "1"} if header else {}
        async with httpx.AsyncClient(transport=transport, base_url=f"http://127.0.0.1:{PORT}",
                                     headers=headers, timeout=30) as client:
            yield client


async def finished(client: httpx.AsyncClient) -> dict:
    for _ in range(200):
        state = (await client.get("/api/routing")).json()
        if not state["running"]:
            return state
        await asyncio.sleep(0.02)
    raise AssertionError("the run never finished")


def run_id(started: httpx.Response) -> str:
    return Path(started.json()["result_path"]).stem


async def test_the_page_is_served_on_its_routes_and_never_cached(tmp_path: Path) -> None:
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        async with browser(project(tmp_path, url, fake.base)) as client:
            home, routing = await client.get("/"), await client.get("/routing")
            guides, guide = await client.get("/docs"), await client.get("/docs/testing-routing")
            asset = next((console.STATIC / "assets").glob("*.js")).name
            script = await client.get(f"/static/assets/{asset}")

    assert home.status_code == routing.status_code == guides.status_code == guide.status_code == 200
    # The guides are the page's, not the API's generated docs.
    assert guides.text == guide.text == home.text
    assert '<div id="root">' in home.text and "/static/assets/" in home.text
    assert script.status_code == 200 and script.headers["cache-control"] == "no-cache"


async def test_a_page_without_the_console_s_header_cannot_start_a_run(tmp_path: Path) -> None:
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        async with browser(project(tmp_path, url, fake.base), header=False) as client:
            refused = await client.post("/api/routing/run", json={"draws": 1, "filter": "", "model": ""})

    assert refused.status_code == 403
    assert fake.seen == []


async def test_the_state_says_what_a_run_would_take(tmp_path: Path) -> None:
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        async with browser(project(tmp_path, url, fake.base)) as client:
            state = (await client.get("/api/routing", params={"filter": "brands", "model": "claude-opus-5-5"})).json()

    assert state["available"] and state["total"] == 2 and state["selected"] == 1
    assert state["model"] == "claude-opus-5-5" and state["per_call"] is not None and state["running"] is False


async def test_a_run_goes_in_the_background_and_its_report_is_read_by_its_id(tmp_path: Path) -> None:
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        async with browser(project(tmp_path, url, fake.base)) as client:
            started = await client.post("/api/routing/run", json={"draws": 3, "filter": "", "model": ""})
            state = await finished(client)
            listed = await client.get("/api/routing/history")
            detail = (await client.get(f"/api/routing/runs/{run_id(started)}")).json()

    assert started.status_code == 200 and state["exit_code"] == 0
    # No list of past runs: a run is read by the id its start returned.
    assert listed.status_code in (404, 405)
    assert (detail["total"], detail["passed"]) == (2, 1)
    failed = next(case for case in detail["cases"] if not case["passed"])
    assert failed["id"] == "retailers-oblique" and failed["votes"] == [{"tool": "rank_brands", "count": 3}]
    assert detail["samples"] == 3 and detail["misroutes"] == [failed] and detail["cost"] is not None


async def test_a_replay_runs_exactly_its_case_on_the_model_it_names(tmp_path: Path) -> None:
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        loaded = project(tmp_path, url, fake.base)
        cases = CASES + [{"id": "retailers-oblique-2", "prompt": "rank_retailers for oat milk", "expect": "rank_retailers"}]
        (tmp_path / "routing_cases.json").write_text(json.dumps(cases))
        async with browser(loaded) as client:
            started = await client.post("/api/routing/run", json={
                "draws": 2, "filter": "", "cases": ["retailers-oblique"], "model": "claude-haiku-5-5"})
            await finished(client)
            detail = (await client.get(f"/api/routing/runs/{run_id(started)}")).json()

    # A substring filter would have taken retailers-oblique-2 as well, and billed it.
    assert [case["id"] for case in detail["cases"]] == ["retailers-oblique"]
    assert detail["model"] == "claude-haiku-5-5" and {s["body"]["model"] for s in fake.seen} == {"claude-haiku-5-5"}


async def test_a_run_without_a_key_for_its_provider_is_refused_before_spending(tmp_path: Path) -> None:
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        async with browser(project(tmp_path, url, fake.base)) as client:
            refused = await client.post("/api/routing/run", json={"draws": 1, "filter": "", "model": "gpt-6-sol"})

    assert refused.status_code == 409 and "openai" in refused.json()["detail"]
    assert fake.seen == []


async def test_a_failed_case_is_analysed_fixed_by_hand_and_replayed_on_the_new_description(tmp_path: Path) -> None:
    proposal = {"verdict": "change", "tool": "rank_retailers", "diagnosis": "Nothing says where.",
                "suggested_description": "Rank retailers: where a brand is sold.", "rationale": "r", "risks": "k"}
    async with llm_server.serve([proposal]) as fake, mcp_server.serve() as url:
        async with browser(project(tmp_path, url, fake.base)) as client:
            first = run_id(await client.post("/api/routing/run", json={"draws": 1, "filter": "", "model": ""}))
            await finished(client)
            advice = (await client.post(f"/api/routing/runs/{first}/suggest", json={"case_id": "retailers-oblique"})).json()
            passed = await client.post(f"/api/routing/runs/{first}/suggest", json={"case_id": "brands-canonical"})
            source = next(t for t in (await client.get("/api/routing/descriptions")).json()["tools"] if t["name"] == "rank_retailers")
            applied = await client.post("/api/routing/descriptions/apply", json={
                "tool": "rank_retailers", "revision": source["revision"], "original_description": source["description"],
                "suggested_description": "Rank retailers: where a brand is sold. Use for which rank_brands sell where."})
            await client.post("/api/routing/run", json={"draws": 1, "filter": "", "cases": ["retailers-oblique"], "model": ""})
            await finished(client)

    assert advice["verdict"] == "change" and advice["diagnosis"] == "Nothing says where."
    assert advice["source_revision"] == source["revision"] and advice["cost"] is not None
    assert passed.status_code == 400
    assert applied.status_code == 200 and applied.json()["path"] == "src/tools.py"
    # The replay offered the edited description, read from the source, without the server reloading.
    offered = {tool["name"]: tool["description"] for tool in fake.seen[-1]["body"]["tools"]}
    assert offered["rank_retailers"].startswith("Rank retailers: where a brand is sold.")


async def test_a_draft_is_replayed_on_its_case_then_saved_only_when_asked(tmp_path: Path) -> None:
    draft = "Rank retailers: where a brand is sold. Use for which rank_brands sell where."
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        async with browser(project(tmp_path, url, fake.base)) as client:
            started = await client.post("/api/routing/run", json={
                "draws": 1, "filter": "", "cases": ["retailers-oblique"], "model": "",
                "descriptions": {"rank_retailers": draft}})
            await finished(client)
            detail = (await client.get(f"/api/routing/runs/{run_id(started)}")).json()
            unknown = await client.post("/api/routing/run", json={
                "draws": 1, "filter": "", "model": "", "descriptions": {"rank_everything": "x"}})
            untouched = (tmp_path / "src" / "tools.py").read_text()
            source = next(t for t in (await client.get("/api/routing/descriptions")).json()["tools"] if t["name"] == "rank_retailers")
            saved = await client.post("/api/routing/descriptions/apply", json={
                "tool": "rank_retailers", "revision": source["revision"],
                "original_description": source["description"], "suggested_description": draft})

    assert detail["drafts"] == {"rank_retailers": draft}
    assert {t["name"]: t["description"] for t in fake.seen[-1]["body"]["tools"]}["rank_retailers"] == draft
    assert unknown.status_code == 400
    assert draft not in untouched
    assert saved.status_code == 200 and saved.json()["path"] == "src/tools.py"
    assert draft in (tmp_path / "src" / "tools.py").read_text()


async def test_prompts_are_tried_without_being_saved(tmp_path: Path) -> None:
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        async with browser(project(tmp_path, url, fake.base)) as client:
            tried = (await client.post("/api/routing/try", json={"model": "", "draws": 1, "cases": [
                {"id": "a", "prompt": "list_categories please", "expect": "list_categories"},
                {"id": "b", "prompt": "hello", "expect": "rank_brands"}]})).json()

    assert [(r["id"], r["passed"]) for r in tried["results"]] == [("a", True), ("b", False)]
    assert tried["results"][1]["picks"] == [None]


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


async def test_the_run_streams_its_progress_as_the_page_reads_it(tmp_path: Path) -> None:
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        port = free_port()
        server = uvicorn.Server(uvicorn.Config(console.guarded(project(tmp_path, url, fake.base), port),
                                               host="127.0.0.1", port=port, log_level="warning"))
        serving = asyncio.create_task(server.serve())
        while not server.started:
            await asyncio.sleep(0.02)
        base = f"http://127.0.0.1:{port}"
        events: list[dict] = []
        try:
            async with httpx.AsyncClient(base_url=base, headers={"x-whichtool": "1"}, timeout=10) as client:
                await client.post("/api/routing/run", json={"draws": 1, "filter": "", "model": ""})
                async with client.stream("GET", "/api/tasks/routing-eval/output") as stream:
                    async for line in stream.aiter_lines():
                        if line.startswith("data: "):
                            event = json.loads(line[6:])
                            if event["type"] == "log" and event["line"].startswith("ROUTING_EVENT "):
                                events.append(json.loads(event["line"][len("ROUTING_EVENT "):]))
                            if event["type"] == "log" and "passed · results in" in event["line"]:
                                break
        finally:
            server.should_exit = True
            await serving

    assert events[0]["type"] == "start" and events[0]["total"] == 2
    cases = [event for event in events if event["type"] == "case"]
    assert sorted(event["case"]["id"] for event in cases) == ["brands-canonical", "retailers-oblique"]
    assert cases[-1]["completed"] == 2 and cases[0]["run_id"] == events[0]["run_id"]


async def test_two_runs_asked_at_once_start_one(tmp_path: Path) -> None:
    async with llm_server.serve(delay=0.3) as fake, mcp_server.serve() as url:
        async with browser(project(tmp_path, url, fake.base)) as client:
            body = {"draws": 1, "filter": "", "model": ""}
            first, second = await asyncio.gather(client.post("/api/routing/run", json=body),
                                                 client.post("/api/routing/run", json=body))
            await client.post("/api/routing/stop", json={})

    assert sorted([first.status_code, second.status_code]) == [200, 409]


async def test_a_run_refuses_unknown_cases_and_empty_drafts_before_spending(tmp_path: Path) -> None:
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        async with browser(project(tmp_path, url, fake.base)) as client:
            gone = await client.post("/api/routing/run", json={
                "draws": 1, "filter": "", "model": "", "cases": ["brands-canonical", "renamed-since"]})
            blank = await client.post("/api/routing/run", json={
                "draws": 1, "filter": "", "model": "", "descriptions": {"rank_brands": "  "}})
            state = (await client.get("/api/routing")).json()

    assert gone.status_code == 400 and "renamed-since" in gone.json()["detail"]
    assert blank.status_code == 400 and "rank_brands" in blank.json()["detail"]
    assert fake.seen == []
    # The model the project names, and every priced one, can be picked whatever the page's own list says.
    assert "claude-opus-5-5" in state["models"]


async def test_a_key_the_page_sends_is_used_for_its_run_and_never_kept(tmp_path: Path, monkeypatch) -> None:
    for name in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        loaded = project(tmp_path, url, fake.base)
        (tmp_path / settings.ENV).write_text("")
        async with browser(settings.load(loaded.file)) as client:
            assert (await client.get("/api/keys")).json() == {"anthropic": False, "openai": False}
            run = {"draws": 1, "filter": "brands", "model": "claude-opus-5-5"}
            assert (await client.post("/api/routing/run", json=run)).status_code == 409

            started = await client.post("/api/routing/run", json=run, headers={"x-anthropic-key": "sk-ant-xxxxxxxxxxxxpage"})
            assert started.status_code == 200, started.text
            await finished(client)
            # Asked again without it: the page's key was for that request and the run it started, nothing after.
            assert (await client.post("/api/routing/run", json=run)).status_code == 409
            assert (await client.get("/api/keys")).json() == {"anthropic": False, "openai": False}
            spaced = await client.get("/api/keys", headers={"x-openai-key": "sk proj"})

    assert spaced.status_code == 400
    assert {seen["headers"].get("x-api-key") for seen in fake.seen} == {"sk-ant-xxxxxxxxxxxxpage"}
    assert "sk-ant-xxxxxxxxxxxxpage" not in "".join(p.read_text() for p in tmp_path.rglob("*") if p.is_file()
                                                     and ".git" not in p.parts)


async def test_tests_under_review_run_without_being_saved(tmp_path: Path) -> None:
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        loaded = project(tmp_path, url, fake.base)
        before = loaded.routing.fixture.read_text()
        async with browser(loaded) as client:
            proposed = [{"id": "new-brands", "prompt": "rank_brands for crisps", "expect": "rank_brands"},
                        {"id": "new-retail", "prompt": "where do they sell?", "expect": "rank_retailers"}]
            started = await client.post("/api/routing/run", json={"draws": 1, "filter": "", "model": "claude-opus-5-5",
                                                                   "proposed": proposed})
            assert started.status_code == 200, started.text
            await finished(client)
            detail = (await client.get(f"/api/routing/runs/{run_id(started)}")).json()
            stray = await client.post("/api/routing/run", json={"draws": 1, "filter": "", "proposed": [
                {"id": "x", "prompt": "anything", "expect": "no_such_tool"}]})
            twice = await client.post("/api/routing/run", json={"draws": 1, "filter": "", "proposed": proposed[:1] * 2})

    assert detail["proposed"] is True and [c["id"] for c in detail["cases"]] == ["new-brands", "new-retail"]
    assert [c["passed"] for c in detail["cases"]] == [True, False]
    assert loaded.routing.fixture.read_text() == before
    assert stray.status_code == 400 and "no_such_tool" in stray.json()["detail"]
    assert twice.status_code == 400 and "share the id" in twice.json()["detail"]
