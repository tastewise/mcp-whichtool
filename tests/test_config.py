from pathlib import Path

import pytest

from whichtool import config


def test_an_overlay_amends_a_table_without_replacing_it() -> None:
    base = {"services": {"mcp": {"port": 8080, "argv": ["a"]}}, "console": {"port": 8790}}

    merged = config.merge(base, {"services": {"mcp": {"port": 9090}}})

    assert merged == {"services": {"mcp": {"port": 9090, "argv": ["a"]}}, "console": {"port": 8790}}


def test_a_secret_exported_wins_over_the_env_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    env = tmp_path / ".env"
    env.write_text('OPENAI_API_KEY="from-file"\nOTHER=x\n')
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    assert config.secret("OPENAI_API_KEY", env) == "from-file"
    assert config.read_env_value(env, "MISSING") is None

    monkeypatch.setenv("OPENAI_API_KEY", "exported")
    assert config.secret("OPENAI_API_KEY", env) == "exported"


def test_the_routing_table_reads_its_keys_from_the_env_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    env = tmp_path / ".env"
    env.write_text("ANTHROPIC_API_KEY=sk-ant\n")

    spec = config.routing_spec({"cwd": str(tmp_path), "fixture": "cases.json",
                                "results": str(tmp_path / "runs"), "prices": {"m": {"input": 3}}}, env)

    assert spec.fixture == tmp_path / "cases.json"
    assert spec.server == "" and spec.server_token == ""
    assert spec.anthropic_key == "sk-ant"
    assert spec.openai_key == ""
    assert spec.prices == {"m": {"input": 3.0}}
