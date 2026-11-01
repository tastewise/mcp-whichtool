"""What the console writes for the user: the cases file and tool descriptions in the server's source.

Plain files, no git: the project is the user's, and so is what they commit.
"""

import asyncio
import json
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI

from tests.fakes import llm_server
from whichtool import routing_editor
from whichtool.config import RoutingSpec
from whichtool.routing_changes import Sources, descriptions


def setup_project(tmp_path: Path) -> RoutingSpec:
    """A server's source and its cases, in a folder that is not a git repository."""
    root = tmp_path / "project"
    path = root / "src/tools"
    path.mkdir(parents=True)
    (path / "specs.py").write_text('TOOLS = [{"tool_name": "retail", "title": "Retail", "description": "Before"}]\n')
    fixture = root / "cases.json"
    fixture.write_text(json.dumps([{"id": "case-a", "prompt": "Retail?", "expect": "retail"}], indent=2) + "\n")
    return RoutingSpec(cwd=root, fixture=fixture, results=tmp_path / "results", descriptions="src/tools")


def editor_app(spec: RoutingSpec) -> FastAPI:
    """The routing editor's routes on an app of their own, the way a host installs them."""
    app = FastAPI()
    routing_editor.install(app, lambda: spec, lambda: False, asyncio.Lock())
    return app


async def call(app: FastAPI, method: str, path: str, **kwargs) -> httpx.Response:
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://127.0.0.1") as client:
        return await client.request(method, path, timeout=30, **kwargs)


def test_saving_cases_refuses_a_file_that_changed_since_it_was_read(tmp_path: Path) -> None:
    spec = setup_project(tmp_path)
    sources = Sources(spec)
    initial = sources.catalog()
    rows = initial["cases"] + [{"id": "case-b", "prompt": "Another?", "expect": "retail"}]
    assert sources.save_cases(initial["revision"], rows)["cases"] == rows
    with pytest.raises(ValueError, match="changed since"):
        sources.save_cases(initial["revision"], rows)
    # An edit made in an editor after the console read the file is never overwritten.
    read = sources.catalog()["revision"]
    spec.fixture.write_text(spec.fixture.read_text() + " ")
    with pytest.raises(ValueError, match="changed since"):
        sources.save_cases(read, rows)


def test_duplicate_cases_and_unknown_tools_are_rejected(tmp_path: Path) -> None:
    spec = setup_project(tmp_path)
    sources = Sources(spec)
    catalog = sources.catalog()
    before = spec.fixture.read_text()
    for rows in ([*catalog["cases"], *catalog["cases"]], [{"id": "x", "prompt": "X", "expect": "missing"}], []):
        with pytest.raises(ValueError):
            sources.save_cases(catalog["revision"], rows)
    assert spec.fixture.read_text() == before


def test_saving_a_description_keeps_the_python_valid_and_needs_the_version_read(tmp_path: Path) -> None:
    spec = setup_project(tmp_path)
    tool = descriptions(spec)["retail"]
    proposed = 'A "quoted" description.\nA second line.'
    saved = Sources(spec).apply_description("retail", tool["revision"], "Before", proposed)
    assert saved["path"] == "src/tools/specs.py" and saved["tool"] == "retail"
    assert descriptions(spec)["retail"]["description"] == proposed
    assert saved["revision"] == descriptions(spec)["retail"]["revision"]
    with pytest.raises(ValueError, match="changed"):
        Sources(spec).apply_description("retail", tool["revision"], "Before", "Again")


def test_the_editable_descriptions_say_where_they_live(tmp_path: Path) -> None:
    spec = setup_project(tmp_path)

    found = Sources(spec).sources()["tools"]

    assert [(t["name"], t["description"], t["path"]) for t in found] == [("retail", "Before", "src/tools/specs.py")]


async def test_stopping_an_ai_request_hangs_up_the_call_it_is_paying_for(tmp_path: Path) -> None:
    from dataclasses import replace

    async with llm_server.serve(delay=30) as model:
        spec = replace(setup_project(tmp_path), anthropic_key="sk-ant-test", anthropic_base=model.base)
        app = editor_app(spec)

        assert (await call(app, "POST", "/api/routing/ai/stop", json={})).json() == {"stopped": False}

        catalog = (await call(app, "GET", "/api/routing/catalog")).json()
        asking = asyncio.create_task(call(app, "POST", "/api/routing/catalog/generate",
                                          json={"tool": "retail", "scenario": ""}))
        for _ in range(100):
            await asyncio.sleep(0.05)
            if model.seen:
                break
        assert model.seen, "the model was never asked"
        assert (await call(app, "POST", "/api/routing/ai/stop", json={})).json() == {"stopped": True}
        answer = await asking
        assert answer.status_code == 502
        assert "Stopped before the model answered" in answer.json()["detail"]
        # The open request is what bills: stopping closes it, it does not merely stop waiting.
        for _ in range(100):
            if model.seen[-1].get("hung_up"):
                break
            await asyncio.sleep(0.05)
        assert model.seen[-1].get("hung_up")
        # The lock is free again: the next request is not turned away by the one we killed.
        assert (await call(app, "GET", "/api/routing/catalog")).json()["cases"] == catalog["cases"]




async def test_the_editor_saves_cases_and_descriptions_with_revision_guards(tmp_path: Path) -> None:
    spec = setup_project(tmp_path)
    app = editor_app(spec)
    catalog = (await call(app, "GET", "/api/routing/catalog")).json()
    rows = catalog["cases"] + [{"id": "case-new", "prompt": "New scenario?", "expect": "retail"}]
    saved = await call(app, "PUT", "/api/routing/catalog", json={"revision": catalog["revision"], "cases": rows})
    assert saved.status_code == 200 and saved.json()["cases"] == rows
    stale = await call(app, "PUT", "/api/routing/catalog", json={"revision": catalog["revision"], "cases": rows})
    assert stale.status_code == 409
    tool = catalog["tools"][0]
    applied = await call(app, "POST", "/api/routing/descriptions/apply", json={
        "tool": "retail", "revision": tool["revision"], "original_description": "Before",
        "suggested_description": "Use for retail questions only.",
    })
    assert applied.status_code == 200 and applied.json()["path"] == "src/tools/specs.py"
    assert "Use for retail questions only." in (spec.cwd / "src/tools/specs.py").read_text()
    # Nothing about publishing is left to ask for.
    assert (await call(app, "GET", "/api/routing/changes")).status_code == 404


async def test_tests_are_written_by_the_model_the_user_picks_with_its_provider_s_key(tmp_path: Path) -> None:
    from dataclasses import replace

    written = {"cases": [{"id": "retail-share", "prompt": "Who leads retail?"}]}
    async with llm_server.serve([written]) as model:
        spec = replace(setup_project(tmp_path), anthropic_key="sk-ant-test", anthropic_base=model.base)
        app = editor_app(spec)
        no_key = await call(app, "POST", "/api/routing/catalog/generate",
                            json={"tool": "retail", "scenario": "", "model": "gpt-6-sol"})
        assert no_key.status_code == 409 and "openai" in no_key.json()["detail"]

        app = editor_app(replace(spec, openai_key="sk-xxxxxxxxxxxxtail", openai_base=f"{model.base}/v1"))
        answer = await call(app, "POST", "/api/routing/catalog/generate",
                            json={"tool": "retail", "scenario": "", "model": "gpt-6-sol"})

    assert answer.status_code == 200, answer.text
    assert answer.json()["model"] == "gpt-6-sol"
    assert [seen["path"] for seen in model.seen] == ["/v1/chat/completions"]
    assert model.seen[0]["body"]["model"] == "gpt-6-sol"


async def test_the_user_reads_the_writing_prompt_and_picks_how_many_tests_per_tool(tmp_path: Path) -> None:
    from dataclasses import replace

    written = {"cases": [{"id": f"retail-{n}", "prompt": f"Retail question {n}?"} for n in range(3)]}
    async with llm_server.serve([written]) as model:
        app = editor_app(replace(setup_project(tmp_path), anthropic_key="sk-ant-test", anthropic_base=model.base))
        shown = (await call(app, "POST", "/api/routing/catalog/generate/prompt", json={"tool": "retail"})).json()
        assert shown["recommended"] == 6 and shown["max"] == 15
        assert "Write 6 requests" in shown["prompt"] and "## retail" in shown["prompt"]
        assert shown["system"].startswith("You write test requests")

        two = await call(app, "POST", "/api/routing/catalog/generate", json={"tool": "retail", "scenario": "", "count": 2})
        too_many = await call(app, "POST", "/api/routing/catalog/generate", json={"tool": "retail", "scenario": "", "count": 16})

    # What the model was sent is what the user read, with their count; it is held to that count.
    assert "Write 2 requests" in model.seen[0]["body"]["messages"][-1]["content"]
    assert model.seen[0]["body"]["system"] == shown["system"]
    assert [case["id"] for case in two.json()["cases"]] == ["retail-0", "retail-1"]
    assert too_many.status_code == 400 and "between 1 and 15" in too_many.json()["detail"]


async def test_the_tests_export_as_a_kit_for_the_server_s_own_repository(tmp_path: Path) -> None:
    import io
    import zipfile
    from dataclasses import replace

    from whichtool import settings

    spec = replace(setup_project(tmp_path), server="https://tools.example.com/mcp", model="gpt-6-sol",
                   openai_key="sk-xxxxxxxxxxxxtail")
    answer = await call(editor_app(spec), "GET", "/api/routing/export")

    assert answer.status_code == 200 and answer.headers["content-type"] == "application/zip"
    assert answer.headers["content-disposition"] == 'attachment; filename="routing-tests-project.zip"'
    archive = zipfile.ZipFile(io.BytesIO(answer.content))
    assert sorted(archive.namelist()) == [".github/workflows/tool-routing.yml", "ROUTING-TESTS.md",
                                          "routing_cases.json", "whichtool.toml"]
    assert json.loads(archive.read("routing_cases.json")) == json.loads(spec.fixture.read_text())
    # The project file reads the repository's own source, and loads as one.
    (tmp_path / "kit").mkdir()
    archive.extractall(tmp_path / "kit")
    loaded = settings.load(tmp_path / "kit" / settings.FILE)
    assert loaded.routing is not None and loaded.routing.descriptions == "." and loaded.routing.model == "gpt-6-sol"
    assert loaded.routing.server == "https://tools.example.com/mcp"
    # The workflow asks for the model's provider key, from the repository's secrets; no key is in the kit.
    workflow = archive.read(".github/workflows/tool-routing.yml").decode()
    assert "OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}" in workflow and "whichtool eval --yes" in workflow
    # It installs the release that exported it, not main.
    from importlib.metadata import version
    assert f"git+https://github.com/tastewise/mcp-whichtool@v{version('mcp-whichtool')} whichtool eval" in workflow
    assert all(b"sk-" not in archive.read(name) for name in archive.namelist())


async def test_the_kit_holds_the_tests_ticked_for_export(tmp_path: Path) -> None:
    import io
    import zipfile

    spec = setup_project(tmp_path)
    spec.fixture.write_text(json.dumps([{"id": f"case-{n}", "prompt": f"Retail {n}?", "expect": "retail"} for n in "abc"]))
    app = editor_app(spec)
    picked = await call(app, "GET", "/api/routing/export?cases=case-a&cases=case-c")
    unknown = await call(app, "GET", "/api/routing/export?cases=nope")

    cases = json.loads(zipfile.ZipFile(io.BytesIO(picked.content)).read("routing_cases.json"))
    assert [case["id"] for case in cases] == ["case-a", "case-c"]
    assert "2 tests" in zipfile.ZipFile(io.BytesIO(picked.content)).read("ROUTING-TESTS.md").decode()
    assert unknown.status_code == 409 and "nope" in unknown.json()["detail"]


async def test_the_tests_export_alone_as_json(tmp_path: Path) -> None:
    spec = setup_project(tmp_path)
    tests = [{"id": f"case-{n}", "prompt": f"Retail {n}?", "expect": "retail"} for n in "abc"]
    spec.fixture.write_text(json.dumps(tests))
    app = editor_app(spec)
    every = await call(app, "GET", "/api/routing/export?format=json")
    picked = await call(app, "GET", "/api/routing/export?format=json&cases=case-c&cases=case-a")
    unknown = await call(app, "GET", "/api/routing/export?format=yaml")

    assert every.headers["content-type"] == "application/json"
    assert every.headers["content-disposition"] == f'attachment; filename="routing-tests-{spec.cwd.name}.json"'
    # As the case file holds them: the same objects, in the library's order.
    assert every.json() == tests
    assert [case["id"] for case in picked.json()] == ["case-a", "case-c"]
    assert unknown.status_code == 422 and "yaml" in unknown.json()["detail"]
