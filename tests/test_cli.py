"""The CLI as people run it: a real process, a project file on disk, real servers on sockets."""

import asyncio
import json
import os
import sys
from pathlib import Path

from tests.fakes import llm_server, mcp_server
from whichtool import settings

CASES = [
    {"id": "brands-canonical", "prompt": "rank_brands in snacks", "expect": "rank_brands"},
    {"id": "retailers-oblique", "prompt": "which rank_brands sell where?", "expect": "rank_retailers"},
]


async def cli(root: Path, *args: str, stdin: str | None = None) -> tuple[int, str, str]:
    env = {k: v for k, v in os.environ.items() if not k.endswith("_API_KEY")}
    process = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "whichtool.cli", *args, cwd=root, env=env | {"ANTHROPIC_API_KEY": "sk-ant-test"},
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    out, err = await process.communicate(stdin.encode() if stdin is not None else b"")
    return process.returncode or 0, out.decode(), err.decode()


def project(root: Path, server: str, anthropic_base: str, cases: list = CASES) -> None:
    (root / settings.FILE).write_text(
        f'[routing]\nserver = "{server}"\nanthropic_base = "{anthropic_base}"\nmodel = "claude-opus-5-5"\n'
        'fixture = "cases/routing.json"\n')
    (root / "cases").mkdir()
    (root / "cases" / "routing.json").write_text(json.dumps(cases))


async def test_init_writes_a_project_without_asking_when_told_the_server(tmp_path: Path) -> None:
    code, out, _ = await cli(tmp_path, "init", "--server", "http://127.0.0.1:9/mcp")

    assert code == 0
    loaded = settings.load(tmp_path / settings.FILE)
    assert loaded.routing is not None and loaded.routing.server == "http://127.0.0.1:9/mcp"
    assert loaded.routing.fixture == tmp_path / "routing_cases.json"
    assert json.loads((tmp_path / "routing_cases.json").read_text()) == []
    again, _, err = await cli(tmp_path, "init", "--server", "x")
    assert again == 2 and "--force" in err


async def test_tools_lists_what_the_server_offers(tmp_path: Path) -> None:
    async with mcp_server.serve() as url:
        project(tmp_path, url, "http://127.0.0.1:9")
        code, out, _ = await cli(tmp_path, "tools")

    assert code == 0
    assert "rank_brands" in out and "3 tools from" in out


async def test_eval_refuses_to_spend_from_a_pipe_unless_told_to(tmp_path: Path) -> None:
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        project(tmp_path, url, fake.base)
        code, out, err = await cli(tmp_path, "eval")

    assert code == 2 and "--yes" in err
    assert "2 cases × 3 draws = 6 calls" in out
    assert fake.seen == []


async def test_eval_scores_the_cases_and_exits_one_on_a_misroute(tmp_path: Path) -> None:
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        project(tmp_path, url, fake.base)
        code, out, err = await cli(tmp_path, "eval", "--yes", "-n", "1")

    assert code == 1, err
    assert "1/2 passed" in out
    assert "✗ retailers-oblique  expected rank_retailers, got rank_brands ×1" in out
    assert len(fake.seen) == 2
    # The project file's folder holds the results, wherever the command ran from.
    assert list((tmp_path / settings.STATE / "results").glob("*.json"))


async def test_a_filter_that_passes_exits_zero_and_results_reads_it_back(tmp_path: Path) -> None:
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        project(tmp_path, url, fake.base)
        code, out, _ = await cli(tmp_path, "eval", "--yes", "-n", "2", "-k", "brands-canonical")
        shown, again, _ = await cli(tmp_path / "cases", "results")

    assert code == 0 and "1/1 passed" in out and "every case, every draw" in out
    assert shown == 0 and "claude-opus-5-5" in again


async def test_try_routes_a_prompt_that_is_in_no_case(tmp_path: Path) -> None:
    async with llm_server.serve() as fake, mcp_server.serve() as url:
        project(tmp_path, url, fake.base)
        code, out, _ = await cli(tmp_path, "try", "list_categories please", "hello")

    assert code == 0
    assert "list_categories" in out and "no tool" in out and "said: Which one do you mean?" in out


async def test_outside_a_project_the_cli_says_how_to_start(tmp_path: Path) -> None:
    code, _, err = await cli(tmp_path, "tools")

    assert code == 2 and "whichtool init" in err


async def test_an_unreachable_server_is_an_error_not_an_empty_eval(tmp_path: Path) -> None:
    project(tmp_path, "http://127.0.0.1:9/mcp", "http://127.0.0.1:9")
    code, _, err = await cli(tmp_path, "eval", "--yes")

    assert code == 2 and "Could not reach http://127.0.0.1:9/mcp" in err


def test_keys_land_in_the_env_file_readable_by_its_owner_only(tmp_path: Path) -> None:
    env = tmp_path / ".env"
    env.write_text("OTHER=1\nOPENAI_API_KEY=old\n")

    settings.write_env(env, {"OPENAI_API_KEY": "sk-new", "ANTHROPIC_API_KEY": ""})

    assert env.read_text() == "OTHER=1\nOPENAI_API_KEY=sk-new\n"
    assert env.stat().st_mode & 0o777 == 0o600


def test_prices_for_current_claude_and_openai_models_ship_and_the_project_can_override_them(tmp_path: Path) -> None:
    (tmp_path / settings.FILE).write_text('[routing]\n[routing.prices.claude-opus-5-5]\ninput = 1\noutput = 2\n'
                                          'cache_write = 3\ncache_read = 4\n')

    loaded = settings.load(tmp_path / settings.FILE)

    assert loaded.routing is not None
    assert loaded.routing.prices["claude-opus-5-5"]["input"] == 1.0
    assert loaded.routing.prices["claude-haiku-5-5"]["input"] == 0.10
    assert loaded.routing.prices["gpt-6-sol"] == {"input": 2.0, "output": 10.0, "cache_write": 2.5, "cache_read": 0.20}
