import pytest

from tests.fakes import llm_server
from whichtool.models import ModelError, Models, Tool, provider_of

TOOLS = [Tool("list_categories", "List the categories."), Tool("rank_brands", "Rank brands.")]


def claude(fake: llm_server.Fake) -> Models:
    return Models(anthropic_key="sk-ant-test", anthropic_base=fake.base, max_retries=0)


def gpt(fake: llm_server.Fake) -> Models:
    return Models(openai_key="sk-test", openai_base=f"{fake.base}/v1")


def test_a_claude_model_goes_to_anthropic_and_the_rest_to_openai() -> None:
    assert provider_of("claude-opus-5-5") == "anthropic"
    assert provider_of("gpt-6-sol") == "openai"


async def test_claude_is_offered_the_tools_and_its_first_call_is_the_pick() -> None:
    async with llm_server.serve() as fake, claude(fake) as models:
        reply = await models.route("claude-opus-5-5", TOOLS, "rank_brands for snacks please")

    assert reply.tool == "rank_brands"
    body = fake.seen[0]["body"]
    assert [t["name"] for t in body["tools"]] == ["list_categories", "rank_brands"]
    assert body["tools"][0]["input_schema"] == {"type": "object", "properties": {}}
    assert "tool_choice" not in body, "the model must be free not to call a tool"
    assert fake.seen[0]["headers"]["x-api-key"] == "sk-ant-test"
    assert reply.usage == llm_server.USAGE


async def test_the_catalogue_is_cached_behind_the_last_tool_or_the_system_prompt() -> None:
    async with llm_server.serve() as fake, claude(fake) as models:
        await models.route("claude-opus-5-5", TOOLS, "anything")
        await models.route("claude-opus-5-5", TOOLS, "anything", system="You are a shopping assistant.")

    bare, framed = fake.seen[0]["body"], fake.seen[1]["body"]
    assert bare["tools"][-1]["cache_control"] == {"type": "ephemeral"}
    assert "cache_control" not in framed["tools"][-1]
    assert framed["system"][0]["cache_control"] == {"type": "ephemeral"}


async def test_an_answer_in_words_is_no_pick() -> None:
    async with llm_server.serve() as fake, claude(fake) as models:
        reply = await models.route("claude-opus-5-5", TOOLS, "hello")

    assert reply.tool is None
    assert reply.text == "Which one do you mean?"


async def test_openai_picks_through_tool_calls_and_its_usage_reads_in_anthropic_counters() -> None:
    async with llm_server.serve() as fake, gpt(fake) as models:
        reply = await models.route("gpt-6-sol", TOOLS, "list_categories?", system="Be brief.")

    assert reply.tool == "list_categories"
    body = fake.seen[0]["body"]
    assert body["messages"][0] == {"role": "system", "content": "Be brief."}
    assert body["tools"][1]["function"]["name"] == "rank_brands"
    # 1000 prompt tokens of which 600 cached: billed apart, as Anthropic's counters keep them.
    assert reply.usage == {"input_tokens": 400, "output_tokens": 40,
                           "cache_creation_input_tokens": 0, "cache_read_input_tokens": 600}


async def test_a_refused_key_is_an_error_that_does_not_repeat_the_key() -> None:
    # Low entropy on purpose: a test string must not read as a leaked key to the history's secret scan.
    refusal = (401, {"error": {"message": "Incorrect API key provided: sk-xxxxxxxxxxxxtail"}})
    async with llm_server.serve(brain=lambda path, body: refusal) as fake, gpt(fake) as models:
        with pytest.raises(ModelError) as raised:
            await models.route("gpt-6-sol", TOOLS, "x")

    assert "401" in str(raised.value)
    assert "tail" not in str(raised.value)


async def test_an_anthropic_error_is_a_model_error() -> None:
    bad = (400, {"type": "error", "error": {"type": "invalid_request_error", "message": "unknown model"}})
    async with llm_server.serve(brain=lambda path, body: bad) as fake, claude(fake) as models:
        with pytest.raises(ModelError, match="400"):
            await models.route("claude-nope", TOOLS, "x")


async def test_without_a_key_nothing_is_sent() -> None:
    async with Models() as models:
        with pytest.raises(ModelError, match="ANTHROPIC_API_KEY"):
            await models.route("claude-opus-5-5", TOOLS, "x")
        with pytest.raises(ModelError, match="OPENAI_API_KEY"):
            await models.route("gpt-6-sol", TOOLS, "x")


SCHEMA = {"type": "object", "properties": {"verdict": {"type": "string"}}, "required": ["verdict"],
          "additionalProperties": False}


async def test_a_json_answer_from_claude_is_constrained_by_the_schema_and_read_past_its_thinking() -> None:
    async with llm_server.serve([{"verdict": "keep"}]) as fake, claude(fake) as models:
        found, usage = await models.ask("claude-opus-5-5", "Review.", "Is it fine?", SCHEMA)

    assert found == {"verdict": "keep"}
    assert fake.seen[0]["body"]["output_config"] == {"format": {"type": "json_schema", "schema": SCHEMA}}
    assert usage["output_tokens"] == 40


async def test_a_json_answer_from_openai_uses_a_strict_response_format() -> None:
    async with llm_server.serve([{"verdict": "change"}]) as fake, gpt(fake) as models:
        found, _ = await models.ask("gpt-6-sol", "Review.", "Is it fine?", SCHEMA)

    assert found == {"verdict": "change"}
    sent = fake.seen[0]["body"]["response_format"]
    assert sent["json_schema"]["strict"] is True and sent["json_schema"]["schema"] == SCHEMA
