from dataclasses import replace
from pathlib import Path

import pytest

from tests.fakes import llm_server, mcp_server
from whichtool import routing_advice
from whichtool.config import RoutingSpec

CASE = {"id": "retailers-oblique", "prompt": "which brands sell where?", "expect": "rank_retailers",
        "picks": ["rank_brands"], "hits": 0, "passed": False, "votes": [{"tool": "rank_brands", "count": 1}]}


def spec(tmp_path: Path, fake: llm_server.Fake, url: str) -> RoutingSpec:
    fixture = tmp_path / "cases.json"
    fixture.write_text("[]")
    return replace(RoutingSpec(cwd=tmp_path, fixture=fixture, results=tmp_path / "results"),
                   server=url, anthropic_key="sk-ant-test", anthropic_base=fake.base)


async def test_a_misroute_gets_a_new_description_quoted_against_the_server_s_own(tmp_path: Path) -> None:
    proposal = {"verdict": "change", "tool": "rank_retailers", "diagnosis": "Nothing says where.",
                "suggested_description": "Rank retailers: where a brand is sold.", "rationale": "r", "risks": "none"}
    async with llm_server.serve([proposal]) as fake, mcp_server.serve() as url:
        found = await routing_advice.suggest(spec(tmp_path, fake, url),
                                             {"case": CASE, "related_cases": [], "model": "claude-opus-5-5"})

    assert found["suggested_description"] == "Rank retailers: where a brand is sold."
    # The original is the server's text, not the model's copy of it.
    assert found["original_description"] == "Rank retailers by the brands they carry."
    assert found["model"] == "claude-opus-5-5" and found["usage"]["output_tokens"] == 40
    asked = fake.seen[0]["body"]["messages"][0]["content"]
    assert "which brands sell where?" in asked and "rank_brands ×1" in asked
    assert "## list_categories" in asked, "a description is judged against its neighbours"


async def test_a_proposal_for_a_tool_the_server_lacks_is_refused(tmp_path: Path) -> None:
    proposal = {"verdict": "change", "tool": "rank_everything", "diagnosis": "d",
                "suggested_description": "x", "rationale": "r", "risks": "k"}
    async with llm_server.serve([proposal]) as fake, mcp_server.serve() as url:
        with pytest.raises(RuntimeError, match="does not offer: rank_everything"):
            await routing_advice.suggest(spec(tmp_path, fake, url), {"case": CASE})


async def test_a_change_with_no_description_is_refused_and_a_keep_is_not(tmp_path: Path) -> None:
    change = {"verdict": "change", "tool": "rank_retailers", "diagnosis": "d",
              "suggested_description": " ", "rationale": "r", "risks": "k"}
    async with llm_server.serve([change, change | {"verdict": "no change"}]) as fake, mcp_server.serve() as url:
        settings = spec(tmp_path, fake, url)
        with pytest.raises(RuntimeError, match="no description"):
            await routing_advice.suggest(settings, {"case": CASE})
        kept = await routing_advice.suggest(settings, {"case": CASE})

    assert kept["verdict"] == "no change"


async def test_generated_cases_all_expect_the_tool_they_were_asked_for(tmp_path: Path) -> None:
    proposed = {"cases": [{"id": "brands-typo", "prompt": "top brnads in snacks"},
                          {"id": "brands-oblique", "prompt": "who leads snacks?"}]}
    async with llm_server.serve([proposed]) as fake, mcp_server.serve() as url:
        found = await routing_advice.suggest(spec(tmp_path, fake, url), {
            "action": "generate", "tool": "rank_brands", "scenario": "a buyer",
            "existing": [{"id": "brands-canonical", "prompt": "rank brands", "expect": "rank_brands"}]})

    assert [c["expect"] for c in found["cases"]] == ["rank_brands", "rank_brands"]
    asked = fake.seen[0]["body"]["messages"][0]["content"]
    assert "brands-canonical" in asked and "a buyer" in asked


async def test_the_analysis_sees_each_tool_s_parameters_and_holds_the_test_as_right(tmp_path: Path) -> None:
    proposal = {"verdict": "change", "tool": "rank_retailers", "diagnosis": "d",
                "suggested_description": "Rank retailers by the brands they carry.", "rationale": "r", "risks": "k"}
    async with llm_server.serve([proposal]) as fake, mcp_server.serve() as url:
        await routing_advice.suggest(spec(tmp_path, fake, url), {"case": CASE})

    body = fake.seen[0]["body"]
    asked = body["messages"][0]["content"]
    # What a tool can do is in its parameters, not only in the description under review.
    assert "Parameters: category (string, required)" in asked and "Parameters: brand (string)" in asked
    assert "Its test says it must reach `rank_retailers`" in asked
    assert "never argue the test is wrong" in body["system"]


async def test_without_a_server_the_parameters_are_unknown_not_none(tmp_path: Path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "tools.py").write_text('@mcp.tool(name="rank_retailers", description="Rank retailers.")\n'
                                               "def rank_retailers(brand: str): ...\n")
    proposal = {"verdict": "change", "tool": "rank_retailers", "diagnosis": "d",
                "suggested_description": "Rank retailers by brand.", "rationale": "r", "risks": "k"}
    async with llm_server.serve([proposal]) as fake:
        settings = replace(spec(tmp_path, fake, ""), server="")
        await routing_advice.suggest(settings, {"case": CASE})

    asked = fake.seen[0]["body"]["messages"][0]["content"]
    assert "Parameters: unknown (no server listed them)" in asked and "Parameters: none" not in asked
