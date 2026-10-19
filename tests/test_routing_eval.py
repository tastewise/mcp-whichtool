import json
from dataclasses import replace
from itertools import count
from pathlib import Path

import httpx
import pytest

from tests.fakes import llm_server, mcp_server
from whichtool import routing, routing_eval
from whichtool.config import RoutingSpec
from whichtool.models import ModelError

CASES = [
    {"id": "brands-canonical", "prompt": "rank_brands in snacks", "expect": "rank_brands"},
    {"id": "categories-canonical", "prompt": "list_categories tracked", "expect": "list_categories"},
    # Names the wrong tool: a model that follows the prompt misroutes it.
    {"id": "retailers-oblique", "prompt": "which rank_brands sell where?", "expect": "rank_retailers"},
]


def spec(tmp_path: Path, **over: object) -> RoutingSpec:
    fixture = tmp_path / "cases.json"
    fixture.write_text(json.dumps(CASES))
    return replace(RoutingSpec(cwd=tmp_path, fixture=fixture, results=tmp_path / "results"), **over)


def source(tmp_path: Path, text: str) -> None:
    (tmp_path / "src").mkdir(exist_ok=True)
    (tmp_path / "src" / "tools.py").write_text(text)


async def test_the_catalogue_is_what_the_server_lists_inside_its_session(tmp_path: Path) -> None:
    async with mcp_server.serve() as url, httpx.AsyncClient() as http:
        found = await routing_eval.catalogue(spec(tmp_path, server=url), http)

    assert [t.name for t in found] == ["rank_brands", "list_categories", "rank_retailers"]
    assert found[0].input_schema["required"] == ["category"]


async def test_a_description_edited_in_the_source_wins_over_the_listed_one(tmp_path: Path) -> None:
    source(tmp_path, '@mcp.tool(name="rank_brands", description="Edited: rank brands, never retailers.")\n'
                     "def rank_brands(): ...\n")
    async with mcp_server.serve() as url, httpx.AsyncClient() as http:
        found = await routing_eval.catalogue(spec(tmp_path, server=url), http)

    assert found[0].description == "Edited: rank brands, never retailers."
    assert found[1].description == "List the categories a market tracks."


async def test_a_server_behind_a_gateway_gets_its_token(tmp_path: Path) -> None:
    async with mcp_server.serve(token="t0k") as url, httpx.AsyncClient() as http:
        with pytest.raises(ValueError, match="without an access token \\(401"):
            await routing_eval.catalogue(spec(tmp_path, server=url), http)
        found = await routing_eval.catalogue(spec(tmp_path, server=url, server_token="t0k"), http)

    assert len(found) == 3


async def test_without_a_server_the_source_alone_is_the_catalogue(tmp_path: Path) -> None:
    source(tmp_path, 'TOOLS = [{"tool_name": "rank_brands", "description": "Rank brands."}]\n')
    async with httpx.AsyncClient() as http:
        found = await routing_eval.catalogue(spec(tmp_path), http)

    assert [(t.name, t.description) for t in found] == [("rank_brands", "Rank brands.")]


async def test_no_server_and_no_source_is_said_not_run_empty(tmp_path: Path) -> None:
    async with httpx.AsyncClient() as http:
        with pytest.raises(ValueError, match="no tools to offer"):
            await routing_eval.catalogue(spec(tmp_path), http)


async def run(tmp_path: Path, fake: llm_server.Fake, url: str, **kwargs: object):
    settings = spec(tmp_path, server=url, anthropic_key="sk-ant-test", anthropic_base=fake.base)
    async with httpx.AsyncClient() as http, routing_eval.models_for(settings, http) as models:
        offered = await routing_eval.catalogue(settings, http)
        return settings, await routing_eval.run(settings, models, offered, model="claude-opus-5-5", **kwargs)


async def test_a_run_scores_every_case_and_writes_a_result_the_console_reads(tmp_path: Path) -> None:
    seen: list[tuple[int, int]] = []
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        settings, (where, result) = await run(tmp_path, fake, url, draws=3,
                                              progress=lambda done, total: seen.append((done, total)))

    assert where.parent == settings.results
    assert routing.latest_for(settings, "claude-opus-5-5") == where
    assert (result.provider, result.model, result.samples) == ("anthropic", "claude-opus-5-5", 3)
    assert (result.total, result.passed) == (3, 2)
    assert [o.id for o in result.misroutes] == ["retailers-oblique"]
    assert result.misroutes[0].votes() == [("rank_brands", 3)]
    assert result.usage["calls"] == 9 and len(fake.seen) == 9
    assert result.usage["cache_read_input_tokens"] == 9 * 900
    assert seen[-1] == (9, 9)


async def test_two_models_in_the_same_second_keep_their_own_results(tmp_path: Path) -> None:
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        settings = spec(tmp_path, server=url, anthropic_key="sk-ant-test", anthropic_base=fake.base,
                        openai_key="sk-test", openai_base=f"{fake.base}/v1")
        async with httpx.AsyncClient() as http, routing_eval.models_for(settings, http) as models:
            offered = await routing_eval.catalogue(settings, http)
            first, _ = await routing_eval.run(settings, models, offered, model="claude-opus-5-5", draws=1)
            second, _ = await routing_eval.run(settings, models, offered, model="gpt-6-sol", draws=1)

    assert first != second
    assert routing.latest_for(settings, "claude-opus-5-5") == first


async def test_a_filter_runs_only_the_cases_it_names(tmp_path: Path) -> None:
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        _, (_, result) = await run(tmp_path, fake, url, draws=1, filter="brands or categories")

    assert [o.id for o in result.outcomes] == ["brands-canonical", "categories-canonical"]


async def test_a_case_passes_on_a_strict_majority_and_is_weak_below_a_sweep(tmp_path: Path) -> None:
    draws = count()

    def wavering(path: str, body: dict) -> tuple[int, dict]:
        """Every third answer strays to list_categories."""
        tool = "list_categories" if next(draws) % 3 == 2 else llm_server.mentioned(path, body)
        block = {"type": "tool_use", "id": "t", "name": tool, "input": {}}
        return 200, llm_server.anthropic_message([block], "tool_use")

    async with llm_server.serve(brain=wavering) as fake, mcp_server.serve() as url:
        _, (_, result) = await run(tmp_path, fake, url, draws=3, filter="brands-canonical")

    assert result.outcomes[0].hits == 2 and result.outcomes[0].passed
    assert [o.id for o in result.weak] == ["brands-canonical"]


async def test_a_case_expecting_a_tool_the_server_lacks_is_named_in_the_result(tmp_path: Path) -> None:
    listed = [t for t in mcp_server.TOOLS if t["name"] != "rank_retailers"]
    async with llm_server.serve() as fake, mcp_server.serve(listed) as url:
        _, (where, _) = await run(tmp_path, fake, url, draws=1)

    assert json.loads(where.read_text())["unknown"] == ["rank_retailers"]


async def test_a_provider_error_stops_the_run_and_leaves_no_result(tmp_path: Path) -> None:
    overloaded = (400, {"type": "error", "error": {"type": "invalid_request_error", "message": "bad model"}})
    async with llm_server.serve(brain=lambda path, body: overloaded) as fake, mcp_server.serve() as url:
        with pytest.raises(ModelError, match="bad model"):
            await run(tmp_path, fake, url, draws=2)

    assert not (tmp_path / "results").exists()


async def test_a_filter_matching_nothing_spends_nothing(tmp_path: Path) -> None:
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        with pytest.raises(ValueError, match="no case matches"):
            await run(tmp_path, fake, url, draws=1, filter="nothing-like-this")

    assert fake.seen == []


async def test_prompts_outside_the_catalog_can_be_tried(tmp_path: Path) -> None:
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        settings = spec(tmp_path, server=url, openai_key="sk-test", openai_base=f"{fake.base}/v1")
        async with httpx.AsyncClient() as http, routing_eval.models_for(settings, http) as models:
            offered = await routing_eval.catalogue(settings, http)
            tried = await routing_eval.try_prompts(models, offered, model="gpt-6-sol",
                                                   prompts=["rank_retailers near me", "hello"], draws=2)

    assert [r["picks"] for r in tried["results"]] == [["rank_retailers", "rank_retailers"], [None, None]]
    assert tried["results"][1]["said"] == "Which one do you mean?"
    assert tried["usage"]["calls"] == 4


async def test_a_draft_description_is_offered_in_place_of_the_source_s_and_written_nowhere(tmp_path: Path) -> None:
    source(tmp_path, '@mcp.tool(name="rank_retailers", description="Rank retailers by the brands they carry.")\n'
                     "def rank_retailers(): ...\n")
    before = (tmp_path / "src" / "tools.py").read_text()
    draft = "Rank retailers: where a brand is sold. Use for which rank_brands sell where."
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        settings = spec(tmp_path, server=url, anthropic_key="sk-ant-test", anthropic_base=fake.base)
        async with httpx.AsyncClient() as http, routing_eval.models_for(settings, http) as models:
            offered = await routing_eval.catalogue(settings, http)
            where, _ = await routing_eval.run(settings, models, offered, model="claude-opus-5-5", draws=1,
                                              ids=["retailers-oblique"], drafts={"rank_retailers": draft})
            with pytest.raises(ValueError, match="does not offer: rank_everything"):
                await routing_eval.run(settings, models, offered, model="claude-opus-5-5", draws=1,
                                       drafts={"rank_everything": "x"})

    sent = {tool["name"]: tool["description"] for tool in fake.seen[0]["body"]["tools"]}
    assert sent["rank_retailers"] == draft and sent["rank_brands"] == "Rank brands in a category by share."
    assert json.loads(where.read_text())["drafts"] == {"rank_retailers": draft}
    assert (tmp_path / "src" / "tools.py").read_text() == before
