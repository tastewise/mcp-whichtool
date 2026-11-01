"""A project whichtool has never seen: its tools found in its source or on its server, then adopted."""

import base64
import io
import json
import zipfile
from pathlib import Path

import httpx
import pytest

from tests.fakes import llm_server, mcp_server
from tests.test_app import PORT, browser
from tests.test_cli import cli
from whichtool import app as console
from whichtool import scan, settings

# The way most Python servers declare tools: the function's name, and its docstring as the description.
TOOLS = ('from server import mcp\n\n'
         '@mcp.tool()\n'
         'def rank_brands(category: str):\n'
         '    """Rank brands in a category by share."""\n\n'
         '@mcp.tool(title="Categories")\n'
         'def list_categories():\n'
         '    """List the categories a market tracks."""\n')


def a_project(root: Path) -> Path:
    root.mkdir(exist_ok=True)
    (root / "src" / "acme").mkdir(parents=True)
    (root / "src" / "acme" / "tools.py").write_text(TOOLS)
    # Not the project's own tools: a dependency, its tests, and a script that does not parse.
    (root / ".venv" / "lib").mkdir(parents=True)
    (root / ".venv" / "lib" / "vendored.py").write_text('@x.tool()\ndef rank_brands():\n    """Theirs."""\n')
    (root / "tests").mkdir()
    (root / "tests" / "test_tools.py").write_text('@x.tool()\ndef rank_retailers():\n    """A double."""\n')
    (root / "scripts").mkdir()
    (root / "scripts" / "old.py").write_text('print "a tool for python 2"\n')
    return root


async def scanned(root: Path, server: str = "") -> scan.Scanned:
    async with httpx.AsyncClient() as http:
        return await scan.scan(root, server, http)


async def test_a_folder_s_tools_are_read_from_its_source_alone(tmp_path: Path) -> None:
    found = await scanned(a_project(tmp_path))

    assert [(t.name, t.title, t.description, t.path) for t in found.tools] == [
        ("rank_brands", "rank_brands", "Rank brands in a category by share.", "src/acme/tools.py"),
        ("list_categories", "Categories", "List the categories a market tracks.", "src/acme/tools.py"),
    ]
    # Without a server every declared tool is offered, and no argument is known.
    assert len(found.offered) == 2 and all(t.params == () for t in found.tools)
    assert found.descriptions == "src/acme"


async def test_a_server_gives_the_arguments_and_decides_what_is_offered(tmp_path: Path) -> None:
    a_project(tmp_path)
    (tmp_path / "src" / "acme" / "more.py").write_text('@mcp.tool()\ndef retired():\n    """Gone."""\n')
    async with mcp_server.serve() as url:
        found = await scanned(tmp_path, url)

    by_name = {t.name: t for t in found.tools}
    assert by_name["rank_brands"].params == ("category",) and by_name["rank_brands"].listed
    # The source's description wins, as the eval offers it; a tool only the source has is not offered.
    assert by_name["rank_brands"].description == "Rank brands in a category by share."
    assert not by_name["retired"].listed and by_name["retired"] not in found.offered
    assert by_name["rank_retailers"].path == ""


async def test_nothing_found_says_how_else_to_find_it(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="give its URL"):
        await scanned(tmp_path)
    with pytest.raises(ValueError, match="not a folder"):
        await scanned(tmp_path / "missing")


async def test_the_project_file_written_reads_back_and_is_never_overwritten(tmp_path: Path) -> None:
    found = await scanned(a_project(tmp_path))
    target = scan.write(found, "claude-opus-5-5")

    loaded = settings.load(target)
    assert loaded.routing is not None
    assert loaded.routing.server == "" and loaded.routing.descriptions == "src/acme"
    assert json.loads((tmp_path / scan.FIXTURE).read_text()) == []
    with pytest.raises(ValueError, match="exists already"):
        scan.write(found, "claude-opus-5-5")


async def test_scan_from_a_pipe_lists_and_writes_only_when_told(tmp_path: Path) -> None:
    a_project(tmp_path)
    code, out, _ = await cli(tmp_path, "scan")
    assert code == 0 and "rank_brands  src/acme/tools.py" in out and "--yes" in out
    assert not (tmp_path / settings.FILE).exists()

    code, out, err = await cli(tmp_path, "scan", "--yes")
    assert code == 0, err
    assert (tmp_path / settings.FILE).exists()
    code, out, _ = await cli(tmp_path, "tools")
    assert code == 0 and "2 tools from the source" in out


async def test_scan_of_a_url_reads_the_server(tmp_path: Path) -> None:
    async with mcp_server.serve() as url:
        code, out, err = await cli(tmp_path, "scan", url, "--yes")

    assert code == 0, err
    assert f"3 tools from {url}" in out
    loaded = settings.load(tmp_path / settings.FILE)
    assert loaded.routing is not None and loaded.routing.server == url


async def test_generate_adds_the_model_s_cases_and_keeps_the_ones_there(tmp_path: Path) -> None:
    a_project(tmp_path)
    written = [{"id": "brands-oblique", "prompt": "who leads snacks?"},
               {"id": "Not An Id", "prompt": "refused"},
               {"id": "brands-oblique", "prompt": "a duplicate"}]
    async with llm_server.serve([{"cases": written}]) as fake:
        await cli(tmp_path, "scan", "--yes")
        file = tmp_path / settings.FILE
        file.write_text(file.read_text() + f'anthropic_base = "{fake.base}"\n')
        code, out, err = await cli(tmp_path, "generate", "--yes", "-t", "rank_brands")

    assert code == 0, err
    assert json.loads((tmp_path / scan.FIXTURE).read_text()) == [
        {"id": "brands-oblique", "prompt": "who leads snacks?", "expect": "rank_brands"}]
    assert "1 cases added" in out
    code, _, err = await cli(tmp_path, "generate", "--yes", "-t", "nope")
    assert code == 2 and "nope" in err


async def test_the_console_opened_outside_a_project_finds_one_and_opens_it(tmp_path: Path) -> None:
    a_project(tmp_path)
    async with browser(None) as page:
        about = (await page.get("/api/project")).json()
        assert about["configured"] is False
        assert (await page.get("/api/routing")).json()["available"] is False

        opened = await page.post("/api/project", json={"folder": str(tmp_path), "server": ""})
        assert opened.status_code == 200 and opened.json()["configured"] is True
        # The tests come back with it, so the page needs no second trip to the server.
        assert opened.json()["catalog"]["cases"] == [] and len(opened.json()["catalog"]["tools"]) == 2
        # The library takes cases for docstring tools, which only the eval's own list knows.
        catalog = (await page.get("/api/routing/catalog")).json()
        assert [t["name"] for t in catalog["tools"]] == ["rank_brands", "list_categories"]
        saved = await page.put("/api/routing/catalog", json={"revision": catalog["revision"], "cases": [
            {"id": "brands", "prompt": "rank_brands in snacks", "expect": "rank_brands"}]})
        assert saved.status_code == 200, saved.text


async def test_the_home_page_switches_to_another_project(tmp_path: Path) -> None:
    first, second = a_project(tmp_path / "first"), a_project(tmp_path / "second")
    (second / "src" / "acme" / "tools.py").write_text('@mcp.tool()\ndef track_order():\n    """Where an order is."""\n')
    async with browser(None) as page:
        await page.post("/api/project", json={"folder": str(first), "server": ""})
        switched = await page.post("/api/project", json={"folder": str(second), "server": ""})
        assert switched.status_code == 200
        assert switched.json()["folder"] == str(second.resolve())
        catalog = (await page.get("/api/routing/catalog")).json()

    assert [t["name"] for t in catalog["tools"]] == ["track_order"]


async def test_a_folder_with_its_own_project_file_is_opened_as_it_is(tmp_path: Path) -> None:
    a_project(tmp_path)
    own = '[routing]\nmodel = "claude-haiku-5-5"\ndescriptions = "src"\n'
    (tmp_path / settings.FILE).write_text(own)
    async with browser(None) as page:
        opened = await page.post("/api/project", json={"folder": str(tmp_path), "server": ""})

    assert opened.status_code == 200
    assert (tmp_path / settings.FILE).read_text() == own


TS_SERVER = 'server.registerTool("track_order", { description: "Where an order is.", inputSchema: {} }, f);\n'


def zipped(entries: dict[str, str]) -> str:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for path, text in entries.items():
            archive.writestr(path, text)
    return base64.b64encode(buffer.getvalue()).decode()


def test_a_drop_keeps_only_the_sources_inside_its_own_folder(tmp_path: Path) -> None:
    root = scan.unpack([
        {"path": "shop/src/server.ts", "content": TS_SERVER},
        {"path": "shop/README.md", "content": "not a source"},
        {"path": "shop/node_modules/sdk/index.js", "content": "theirs"},
        {"path": "../escape.py", "content": "x"},
        {"path": "/etc/absolute.py", "content": "x"},
        {"path": "tools.zip", "base64": zipped({"pkg/tools.py": TOOLS, "pkg/../../evil.py": "x", "notes.txt": "x"})},
    ], "My Shop!", tmp_path / "uploads")

    assert root.parent == tmp_path / "uploads" and root.name.startswith("my-shop-")
    assert sorted(p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()) == [
        "pkg/tools.py", "shop/src/server.ts"]


def test_a_drop_with_nothing_to_read_or_too_much_is_refused(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(ValueError, match="No Python, TypeScript or JavaScript"):
        scan.unpack([{"path": "README.md", "content": "hi"}], "x", tmp_path)
    with pytest.raises(ValueError, match="not a zip"):
        scan.unpack([{"path": "a.zip", "base64": base64.b64encode(b"nope").decode()}], "x", tmp_path)
    monkeypatch.setattr(scan, "MAX_BYTES", 100)
    with pytest.raises(ValueError, match="Too much"):
        scan.unpack([{"path": "a.zip", "base64": zipped({"big.py": "#" * 1000})}], "x", tmp_path)


def test_a_drop_never_opened_is_cleared_by_the_next_and_an_opened_one_is_kept(tmp_path: Path) -> None:
    first = scan.unpack([{"path": "a.py", "content": TOOLS}], "a", tmp_path)
    kept = scan.unpack([{"path": "b.py", "content": TOOLS}], "b", tmp_path)
    (kept / settings.FILE).write_text("[routing]\n")
    scan.unpack([{"path": "c.py", "content": TOOLS}], "c", tmp_path)

    assert not first.exists() and kept.exists()


async def test_files_dropped_in_the_page_become_a_project(tmp_path: Path) -> None:
    app = console.create(None, tmp_path, uploads=tmp_path / "uploads")
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=console.Guard(app, PORT))
        async with httpx.AsyncClient(transport=transport, base_url=f"http://127.0.0.1:{PORT}",
                                     headers={"x-whichtool": "1"}) as page:
            looked = await page.post("/api/project/upload", json={
                "name": "shop", "server": "", "files": [{"path": "shop/server.ts", "content": TS_SERVER}]})
            assert looked.status_code == 200, looked.text
            found = looked.json()
            assert found["uploaded"] is True and [t["name"] for t in found["tools"]] == ["track_order"]
            refused = await page.post("/api/project/upload", json={"name": "x", "server": "", "files": [
                {"path": "notes.txt", "content": ""}]})
            assert refused.status_code == 422

            opened = (await page.post("/api/project", json={"folder": found["root"], "server": ""})).json()
            async with mcp_server.serve() as url:
                by_url = await page.post("/api/project/upload", json={"name": "", "server": url, "files": []})
            assert by_url.status_code == 200, by_url.text
            assert len(by_url.json()["tools"]) == 3 and by_url.json()["uploaded"] is True

    assert opened["uploaded"] is True
    assert Path(found["root"], settings.FILE).exists()


async def test_the_demo_opens_with_its_tools_and_its_cases_and_keeps_what_was_changed(tmp_path: Path) -> None:
    app = console.create(None, tmp_path, uploads=tmp_path / "uploads", demo=tmp_path / "demo")
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=console.Guard(app, PORT))
        async with httpx.AsyncClient(transport=transport, base_url=f"http://127.0.0.1:{PORT}",
                                     headers={"x-whichtool": "1"}) as page:
            opened = (await page.post("/api/project/demo")).json()
            catalog = (await page.get("/api/routing/catalog")).json()
            assert opened["demo"] is True and opened["configured"] is True
            assert len(catalog["tools"]) == 7 and len(catalog["cases"]) == 13

            kept = catalog["cases"][:3]
            await page.put("/api/routing/catalog", json={"revision": catalog["revision"], "cases": kept})
            await page.post("/api/project/demo")
            assert len((await page.get("/api/routing/catalog")).json()["cases"]) == 3


async def test_a_server_that_cannot_be_read_says_why_in_a_sentence(tmp_path: Path) -> None:
    async with mcp_server.serve(token="t0k") as url:
        with pytest.raises(ValueError) as refused:
            await scanned(tmp_path, url)
    with pytest.raises(ValueError) as unreachable:
        await scanned(tmp_path, "http://127.0.0.1:9/mcp")

    assert str(refused.value) == "The server refused to list its tools without an access token (401 X)."
    assert str(unreachable.value) == "Could not reach http://127.0.0.1:9/mcp. Is the server running, and is the address right?"


async def test_scanning_the_same_url_again_reopens_its_project_and_its_tests(tmp_path: Path) -> None:
    app = console.create(None, tmp_path, uploads=tmp_path / "uploads")
    async with app.router.lifespan_context(app), mcp_server.serve() as url:
        transport = httpx.ASGITransport(app=console.Guard(app, PORT))
        async with httpx.AsyncClient(transport=transport, base_url=f"http://127.0.0.1:{PORT}",
                                     headers={"x-whichtool": "1"}) as page:
            first = (await page.post("/api/project/upload", json={"name": "", "server": url, "files": []})).json()
            await page.post("/api/project", json={"folder": first["root"], "server": url})
            catalog = (await page.get("/api/routing/catalog")).json()
            await page.put("/api/routing/catalog", json={"revision": catalog["revision"], "cases": [
                {"id": "brands", "prompt": "rank_brands in snacks", "expect": "rank_brands"}]})

            again = (await page.post("/api/project/upload", json={"name": "", "server": url, "files": []})).json()
            opened = (await page.post("/api/project", json={"folder": again["root"], "server": url})).json()

    assert again["root"] == first["root"] and again["exists"] is True
    assert [case["id"] for case in opened["catalog"]["cases"]] == ["brands"]
    assert len(list((tmp_path / "uploads").iterdir())) == 1


def test_a_drop_path_absolute_in_any_spelling_never_leaves_its_folder(tmp_path: Path) -> None:
    for path in ("//etc/evil.py", "/etc/evil.py", "C:/evil.py", "\\\\server\\share\\evil.py", "a/../../evil.py"):
        with pytest.raises(ValueError, match="No Python"):
            scan.unpack([{"path": path, "content": TOOLS}], "x", tmp_path / "uploads")
    with pytest.raises(ValueError, match="No Python"):
        scan.unpack([{"path": "tools.zip", "base64": zipped({"//etc/evil.py": TOOLS})}], "x", tmp_path / "uploads")
    assert not list(tmp_path.rglob("evil.py"))
    # A doubled slash inside the path is only a doubled slash: the file lands in its folder.
    root = scan.unpack([{"path": "a//b.py", "content": TOOLS}], "x", tmp_path / "uploads")
    assert (root / "a" / "b.py").is_file()


def test_a_damaged_archive_member_is_refused_in_words(tmp_path: Path) -> None:
    raw = bytearray(base64.b64decode(zipped({"pkg/tools.py": TOOLS * 3})))
    start = raw.index(b"pkg/tools.py") + len("pkg/tools.py")
    raw[start + 5] ^= 0xFF  # inside the stored data: the CRC no longer matches
    with pytest.raises(ValueError, match="damaged|not a zip"):
        scan.unpack([{"path": "tools.zip", "base64": base64.b64encode(bytes(raw)).decode()}], "x", tmp_path)


async def test_uppercase_extensions_are_read_like_any_other(tmp_path: Path) -> None:
    root = scan.unpack([{"path": "SERVER.TS", "content": TS_SERVER}, {"path": "TOOLS.PY", "content": TOOLS}], "x", tmp_path)
    found = await scanned(root)

    assert sorted(t.name for t in found.tools) == ["list_categories", "rank_brands", "track_order"]


async def test_a_description_the_code_computes_leaves_the_server_s_own(tmp_path: Path) -> None:
    (tmp_path / "server.ts").write_text('server.tool("rank_brands", DESCRIPTION, {}, f);\n')
    async with mcp_server.serve() as url:
        found = await scanned(tmp_path, url)

    assert {t.name: t.description for t in found.tools}["rank_brands"] == "Rank brands in a category by share."


async def test_a_project_file_opens_without_a_scan_even_when_its_server_is_down(tmp_path: Path) -> None:
    (tmp_path / settings.FILE).write_text('[routing]\nserver = "http://127.0.0.1:9/mcp"\n')
    (tmp_path / scan.FIXTURE).write_text("[]\n")
    bare = tmp_path / "bare"
    bare.mkdir()
    (bare / settings.FILE).write_text("# nothing to evaluate yet\n")
    async with browser(None) as page:
        opened = await page.post("/api/project", json={"folder": str(tmp_path), "server": ""})
        assert opened.status_code == 200 and opened.json()["configured"] is True
        # Its server down, cases are still saved, against the tools its source declares (none here: refused in words).
        catalog = (await page.get("/api/routing/catalog")).json()
        saved = await page.put("/api/routing/catalog", json={"revision": catalog["revision"], "cases": []})
        assert saved.status_code == 409 and "at least one" in saved.json()["detail"]
        # A project file with no [routing] table opens too, its tests left for the page to read.
        routingless = await page.post("/api/project", json={"folder": str(bare), "server": ""})

    assert routingless.status_code == 200 and routingless.json()["catalog"] is None


def test_a_saved_case_keeps_its_tool_when_the_server_stops_offering_it(tmp_path: Path) -> None:
    from whichtool.config import RoutingSpec
    from whichtool.routing_changes import Sources, revision

    fixture = tmp_path / "cases.json"
    fixture.write_text(json.dumps([{"id": "old", "prompt": "Retired?", "expect": "retired"}]))
    sources = Sources(RoutingSpec(cwd=tmp_path, fixture=fixture, results=tmp_path), ["rank_brands"])
    saved = sources.save_cases(revision(fixture.read_text()), [
        {"id": "old", "prompt": "Retired?", "expect": "retired"},
        {"id": "new", "prompt": "Rank brands", "expect": "rank_brands"}])

    assert [case["id"] for case in saved["cases"]] == ["old", "new"]
    with pytest.raises(ValueError, match="Unknown tool: retired"):
        sources.save_cases(saved["revision"], [{"id": "old", "prompt": "Retired, edited?", "expect": "retired"}])


async def test_scan_of_a_url_inside_a_project_reads_the_url_and_keeps_the_project(tmp_path: Path) -> None:
    own = '[routing]\nmodel = "claude-haiku-5-5"\n'
    (tmp_path / settings.FILE).write_text(own)
    async with mcp_server.serve() as url:
        code, out, _ = await cli(tmp_path, "scan", url, "--yes")

    assert code == 0 and f"3 tools from {url}" in out and "kept as it is" in out
    assert (tmp_path / settings.FILE).read_text() == own


def test_a_redirect_is_named_with_where_it_points() -> None:
    from whichtool import tools

    request = httpx.Request("POST", "http://a.example.com/mcp")
    response = httpx.Response(307, headers={"location": "https://b.example.com/mcp"}, request=request)
    error = httpx.HTTPStatusError("307", request=request, response=response)

    assert tools.unlisted("http://a.example.com/mcp", error) == \
        "This address redirects elsewhere (307 Temporary Redirect): try https://b.example.com/mcp."
