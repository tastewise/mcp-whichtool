"""Tools declared in TypeScript and JavaScript: read the way the source spells them, rewritten in place."""

import json
from pathlib import Path

import pytest

from whichtool import ts_source
from whichtool.config import RoutingSpec
from whichtool.routing_changes import Sources, descriptions, revision

SERVER = '''import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
const server = new McpServer({ name: "acme", version: "1" });

server.registerTool("rank_brands", {
  title: "Brands",
  description: "Rank brands " +
    'in a category, by \\'share\\'.',
  inputSchema: { category: z.string() },
}, async () => ok());

server.tool("list_categories", `The categories a market tracks.`, {}, async () => ok());
server.tool("rank_retailers", { brand: z.string() }, async () => ok());
server.tool("track_order", DESCRIPTION, { order: z.string() }, async () => ok());
server.tool("find_stores", `Stores near ${city}.`, {}, async () => ok());

const listed = [{ name: "list_claims", description: "Claims on packs.", inputSchema: { type: "object" } }];
const pkg = { name: "acme-server", description: "Not a tool: no tool keys." };
'''


def test_the_shapes_a_server_declares_tools_with() -> None:
    found = ts_source.in_source(SERVER, ".ts")

    assert {name: (t["title"], t["description"]) for name, t in found.items()} == {
        "rank_brands": ("Brands", "Rank brands in a category, by 'share'."),
        "list_categories": ("list_categories", "The categories a market tracks."),
        "list_claims": ("list_claims", "Claims on packs."),
    }


def test_loose_also_keeps_tools_whose_description_cannot_be_read() -> None:
    found = ts_source.in_source(SERVER, ".ts", loose=True)

    # No description, a variable, a template with a substitution: there, with nothing to rewrite.
    for name in ("rank_retailers", "track_order", "find_stores"):
        assert found[name]["description"] == "" and found[name]["span"] is None
    assert "acme-server" not in found


def test_javascript_and_jsx_read_the_same() -> None:
    source = 'server.tool("ping", "Check the server answers.", async () => <b>pong</b>);\n'
    assert ts_source.in_source(source, ".jsx")["ping"]["description"] == "Check the server answers."
    assert ts_source.supported("server.mjs") and not ts_source.supported("types.d.ts")


def test_a_rewrite_replaces_exactly_the_description_and_still_parses() -> None:
    found = ts_source.in_source(SERVER, ".ts")["rank_brands"]
    updated = ts_source.rewritten(SERVER, ".ts", found["span"], 'Rank brands by "share" — one category.')

    again = ts_source.in_source(updated, ".ts")
    assert again["rank_brands"]["description"] == 'Rank brands by "share" — one category.'
    assert again["rank_brands"]["title"] == "Brands"
    start, end = found["span"]  # bytes, and this source is ASCII: the same as characters
    assert updated == SERVER[:start] + json.dumps('Rank brands by "share" — one category.', ensure_ascii=False) + SERVER[end:]


def project(root: Path) -> RoutingSpec:
    (root / "src").mkdir()
    (root / "src" / "server.ts").write_text(SERVER)
    (root / "src" / "types.d.ts").write_text('declare const x = { name: "ghost", description: "d", inputSchema: {} };\n')
    (root / "node_modules" / "sdk").mkdir(parents=True)
    (root / "node_modules" / "sdk" / "index.js").write_text('server.tool("theirs", "Not ours.", {}, f);\n')
    (root / "cases.json").write_text("[]\n")
    return RoutingSpec(cwd=root, fixture=root / "cases.json", results=root / "results", descriptions="src")


def test_the_source_walk_reads_typescript_beside_python(tmp_path: Path) -> None:
    spec = project(tmp_path)
    (tmp_path / "src" / "more.py").write_text('@mcp.tool()\ndef plan_meals():\n    """Plan the week."""\n')

    assert sorted(descriptions(spec, loose=True)) == [
        "find_stores", "list_categories", "list_claims", "plan_meals", "rank_brands", "rank_retailers", "track_order"]


def test_save_to_source_writes_a_typescript_description(tmp_path: Path) -> None:
    spec = project(tmp_path)
    sources = Sources(spec)
    editable = {tool["name"] for tool in sources.sources()["tools"]}
    # A description we cannot read is one we cannot replace.
    assert "track_order" not in editable and "rank_brands" in editable

    file = tmp_path / "src" / "server.ts"
    saved = sources.apply_description("list_categories", revision(file.read_text()),
                                      "The categories a market tracks.", "Every category a market tracks.")

    assert saved["path"] == "src/server.ts"
    assert descriptions(spec)["list_categories"]["description"] == "Every category a market tracks."
    with pytest.raises(ValueError, match="No editable"):
        sources.apply_description("track_order", revision(file.read_text()), "", "Where an order is.")
