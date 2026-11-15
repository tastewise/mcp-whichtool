"""Neighbour sets: other servers' tools, shipped as snapshots and offered beside the server's own."""

import pytest

from whichtool import neighbours
from whichtool.models import Tool

OWN = [Tool(name="rank_brands", description="Rank brands in a category by share.")]


def test_the_shipped_sets_are_listed_and_each_parses_into_tools() -> None:
    assert "web-search" in neighbours.available()
    for name in neighbours.available():
        loaded = neighbours.load([name])
        assert loaded and neighbours.about(name)
        for origin, tool in loaded:
            assert origin == name
            assert tool.name and tool.description.strip()
            assert tool.input_schema.get("type") == "object"


def test_a_set_that_does_not_ship_is_refused_naming_those_that_do() -> None:
    with pytest.raises(ValueError, match="no neighbour named nope: .*web-search"):
        neighbours.load(["nope"])


def test_neighbours_come_after_the_server_s_tools_and_say_where_they_came_from() -> None:
    offered, origin = neighbours.merged(OWN, ["web-search", "web-search"])

    assert [tool.name for tool in offered] == ["rank_brands", "web_search"]
    assert origin == {"web_search": "web-search"}


def test_no_neighbours_leaves_the_server_s_tools_as_they_are() -> None:
    assert neighbours.merged(OWN, []) == (OWN, {})


def test_a_neighbour_tool_named_like_one_of_yours_is_refused() -> None:
    clash = [Tool(name="web_search", description="Search this shop's catalogue.")]
    with pytest.raises(ValueError, match="web-search offers web_search, a name your server already uses"):
        neighbours.merged(clash, ["web-search"])
