import json
from pathlib import Path

from whichtool import routing
from whichtool.config import RoutingSpec

FIXTURE = [
    {"id": "ret-claims-canonical", "prompt": "front of pack?", "expect": "rank_claims"},
    {"id": "ret-rank-oblique", "prompt": "which retailers?", "expect": "rank_retailers"},
    {"id": "soc-categories-canonical", "prompt": "protein trend?", "expect": "list_categories"},
]


def spec(tmp_path: Path, **over) -> RoutingSpec:
    fixture = tmp_path / "routing_cases.json"
    fixture.write_text(json.dumps(FIXTURE))
    base = {
        "cwd": tmp_path,
        "fixture": fixture,
        "results": tmp_path / "results",
        "model": "claude-sonnet-5",
        "default_usd_per_call": 0.014,
        "prices": {},
    }
    return RoutingSpec(**(base | over))


def test_the_fixture_is_read_as_cases(tmp_path: Path) -> None:
    found = routing.cases(spec(tmp_path))

    assert len(found) == 3
    assert found[0].id == "ret-claims-canonical"
    assert found[0].expect == "rank_claims"


def test_a_filter_selects_by_substring_of_the_case_id(tmp_path: Path) -> None:
    assert len(routing.selects(spec(tmp_path), "ret")) == 2
    assert len(routing.selects(spec(tmp_path), "canonical")) == 2
    assert len(routing.selects(spec(tmp_path), "soc")) == 1


def test_no_filter_selects_everything(tmp_path: Path) -> None:
    assert len(routing.selects(spec(tmp_path), "")) == 3


def test_a_filter_matching_nothing_selects_nothing(tmp_path: Path) -> None:
    assert routing.selects(spec(tmp_path), "brief") == ()


def test_a_missing_or_broken_fixture_is_no_cases_not_a_crash(tmp_path: Path) -> None:
    assert routing.cases(spec(tmp_path, fixture=tmp_path / "absent.json")) == ()

    broken = tmp_path / "broken.json"
    broken.write_text("{not json")
    assert routing.cases(spec(tmp_path, fixture=broken)) == ()


def test_each_run_gets_its_own_result_file(tmp_path: Path) -> None:
    first = routing.result_path(spec(tmp_path), 1757000000.0)
    second = routing.result_path(spec(tmp_path), 1757000060.0)

    assert first != second
    assert first.parent == spec(tmp_path).results
    assert first.suffix == ".json"


PRICES = {"claude-sonnet-5": {"input": 3.0, "output": 15.0, "cache_write": 3.75, "cache_read": 0.30}}


def result_json(cases, **over):
    base = {
        "provider": "anthropic", "model": "claude-sonnet-5",
        "samples": 3, "threshold": 2,
        "usage": {"calls": 9, "input_tokens": 1_000_000, "output_tokens": 1_000_000,
                  "cache_creation_input_tokens": 1_000_000, "cache_read_input_tokens": 1_000_000},
        "cases": cases,
    }
    return base | over


def outcome(id_, expect, picks, threshold=2):
    hits = picks.count(expect)
    return {"id": id_, "prompt": f"prompt {id_}", "expect": expect,
            "picks": picks, "hits": hits, "passed": hits >= threshold}


def written(tmp_path: Path, payload) -> Path:
    where = tmp_path / "run.json"
    where.write_text(json.dumps(payload))
    return where


def test_a_misroute_is_read_with_its_votes_winner_first(tmp_path: Path) -> None:
    found = routing.read(written(tmp_path, result_json([
        outcome("ret-a", "rank_claims",
                ["rank_ingredients", "rank_ingredients", "rank_claims"]),
    ])))

    assert [o.id for o in found.misroutes] == ["ret-a"]
    assert found.misroutes[0].votes() == [("rank_ingredients", 2), ("rank_claims", 1)]


def test_a_pass_on_some_draws_but_not_all_is_weak(tmp_path: Path) -> None:
    found = routing.read(written(tmp_path, result_json([
        outcome("ret-b", "rank_retailers",
                ["rank_retailers", "rank_retailers", "rank_brands"]),
    ])))

    assert found.misroutes == []
    assert [o.id for o in found.weak] == ["ret-b"]


def test_a_clean_sweep_is_neither_misrouted_nor_weak(tmp_path: Path) -> None:
    found = routing.read(written(tmp_path, result_json([
        outcome("ret-c", "rank_claims", ["rank_claims"] * 3),
    ])))

    assert found.misroutes == [] and found.weak == []
    assert found.passed == 1 and found.total == 1


def test_a_draw_that_picked_nothing_is_not_counted_as_a_vote(tmp_path: Path) -> None:
    found = routing.read(written(tmp_path, result_json([
        outcome("ret-d", "rank_claims", [None, None, "rank_claims"]),
    ])))

    assert found.misroutes[0].votes() == [("rank_claims", 1)]


def test_a_missing_truncated_or_empty_result_is_nothing_not_an_error(tmp_path: Path) -> None:
    assert routing.read(tmp_path / "absent.json") is None

    truncated = tmp_path / "half.json"
    truncated.write_text('{"provider": "anthropic", "cas')
    assert routing.read(truncated) is None

    empty = tmp_path / "empty.json"
    empty.write_text("")
    assert routing.read(empty) is None


def test_a_case_missing_expect_is_read_with_it_blank(tmp_path: Path) -> None:
    found = routing.read(written(tmp_path, result_json([{"id": "x", "prompt": "p"}])))

    assert found.outcomes[0].expect == ""


def test_cases_that_is_not_a_list_is_nothing_not_an_error(tmp_path: Path) -> None:
    assert routing.read(written(tmp_path, result_json(None))) is None


def test_cost_applies_the_price_table_per_million_tokens(tmp_path: Path) -> None:
    where = spec(tmp_path, prices=PRICES)
    usage = {"calls": 9, "input_tokens": 1_000_000, "output_tokens": 1_000_000,
             "cache_creation_input_tokens": 1_000_000, "cache_read_input_tokens": 1_000_000}

    # One million of each, so the total is simply the four rates added up.
    assert routing.cost(where, "claude-sonnet-5", usage) == 3.0 + 15.0 + 3.75 + 0.30


def test_a_model_with_no_price_shows_tokens_and_no_dollars(tmp_path: Path) -> None:
    where = spec(tmp_path, prices=PRICES)

    assert routing.cost(where, "some-new-model", {"input_tokens": 1_000_000}) is None


def test_a_price_table_missing_a_key_is_no_price_not_a_wrong_number(tmp_path: Path) -> None:
    partial = {"claude-sonnet-5": {"input": 3.0, "output": 15.0, "cache_read": 0.30}}
    where = spec(tmp_path, prices=partial)
    usage = {"calls": 9, "input_tokens": 1_000_000, "output_tokens": 1_000_000,
             "cache_creation_input_tokens": 1_000_000, "cache_read_input_tokens": 1_000_000}

    assert routing.cost(where, "claude-sonnet-5", usage) is None


def test_the_per_call_estimate_falls_back_before_there_is_history(tmp_path: Path) -> None:
    where = spec(tmp_path, prices=PRICES)

    assert routing.per_call(where, "claude-sonnet-5") == 0.014


def test_a_model_absent_from_the_price_table_has_no_per_call_estimate(tmp_path: Path) -> None:
    where = spec(tmp_path, prices=PRICES)

    assert routing.per_call(where, "some-new-model") is None


def test_the_per_call_estimate_excludes_the_one_off_cache_write(tmp_path: Path) -> None:
    where = spec(tmp_path, prices=PRICES)
    where.results.mkdir(parents=True)
    (where.results / "2026-09-06T10-00-00.json").write_text(json.dumps(result_json([])))

    # 18.30 excludes the cache write (a one-off), not 22.05 (amortizing it per call).
    assert routing.per_call(where, "claude-sonnet-5") == round(18.30 / 9, 6)


def test_the_cache_write_is_excluded_even_when_the_cache_was_never_read(tmp_path: Path) -> None:
    where = spec(tmp_path, prices=PRICES)
    where.results.mkdir(parents=True)
    usage = result_json([])
    usage["usage"]["cache_read_input_tokens"] = 0
    (where.results / "2026-09-06T10-00-00.json").write_text(json.dumps(usage))

    # A run that never read the cache still yields a measured marginal cost, not the guess.
    assert routing.per_call(where, "claude-sonnet-5") == round(18.0 / 9, 6)


def test_the_per_call_estimate_is_scoped_to_the_requested_model(tmp_path: Path) -> None:
    both = PRICES | {"claude-haiku-5": {"input": 1.0, "output": 5.0,
                                         "cache_write": 1.25, "cache_read": 0.10}}
    where = spec(tmp_path, prices=both)
    where.results.mkdir(parents=True)
    (where.results / "2026-09-01T10-00-00.json").write_text(
        json.dumps(result_json([], model="claude-sonnet-5"))
    )
    (where.results / "2026-09-06T10-00-00.json").write_text(
        json.dumps(result_json([], model="claude-haiku-5"))
    )

    # The newest file overall is haiku's; sonnet's own history must still be found.
    assert routing.per_call(where, "claude-sonnet-5") == round(18.30 / 9, 6)


def test_a_null_or_unparseable_number_reads_as_zero_not_a_crash(tmp_path: Path) -> None:
    payload = result_json([
        {"id": "x", "prompt": "p", "expect": "e", "picks": [], "hits": "many", "passed": False},
    ])
    payload["samples"] = None
    payload["usage"] = {"calls": "many"}

    found = routing.read(written(tmp_path, payload))

    assert found.samples == 0
    assert found.outcomes[0].hits == 0
    assert found.usage == {"calls": 0}


def test_a_usage_that_is_not_a_dict_reads_as_empty(tmp_path: Path) -> None:
    found = routing.read(written(tmp_path, result_json([], usage=[])))

    assert found.usage == {}


def test_a_filter_naming_several_cases_selects_all_of_them(tmp_path: Path) -> None:
    """`or` joins several: a filter naming two cases runs both."""
    settings = spec(tmp_path)

    assert len(routing.selects(settings, "ret-claims-canonical or soc-categories-canonical")) == 2
    assert len(routing.selects(settings, "ret or soc")) == 3
    assert routing.selects(settings, "ret-claims-canonical or brief")[0].id == "ret-claims-canonical"
