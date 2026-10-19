"""What a model proposes about the routing: a better description, new cases.

Two requests, each a JSON answer under a schema:

- a misroute (`case`, with its votes): which description to change, and to what — or to change none;
- `generate`: new cases that should reach one tool.

The model sees the whole catalogue: a description is only good or bad against its neighbours.
One request runs at a time — the routes hold a lock for that — so the one in flight is a single
slot that `stop` cancels, and cancelling it closes the connection the provider bills on.
"""

import asyncio

import httpx

from .config import RoutingSpec
from .models import ModelError, Tool
from .routing_eval import catalogue, models_for

TIMEOUT = 180
# Tests written per tool: the canonical ask, an oblique one, one on a neighbour's subject, one in
# shorthand, and two more ways of saying it. The user picks another count, up to the maximum.
RECOMMENDED_CASES = 6
MAX_CASES = 15
# The kinds of wording the tests cover, in the order a smaller count keeps them.
KINDS = ("the canonical ask", "an oblique one that never names the tool",
         "one that mentions a neighbouring tool's subject but still needs this one", "one with a typo or shorthand")

SYSTEM = (
    "You review the tool descriptions of an MCP server. A model reads these descriptions, and nothing "
    "else about the tools, to choose which one to call for a user's request. Descriptions are routing "
    "instructions: they say what the tool is for, what it is not for, and which neighbouring tool to use "
    "instead.\n\n"
    "What is true and what is suspect: a test case's expected tool is its author's decision, so the request "
    "must reach that tool; never argue the test is wrong. A tool's parameters show what it can actually do. "
    "The descriptions are what you are reviewing: they may be vague, misleading, or claim another tool's job, "
    "and a misroute means at least one of them is.\n\n"
    "You change as little as fixes the problem and keep the author's voice and terms. A new description may "
    "claim what the tool's parameters support; never claim more than that."
)

DIAGNOSE = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string", "enum": ["change", "no change"]},
        "tool": {"type": "string"},
        "diagnosis": {"type": "string"},
        "suggested_description": {"type": "string"},
        "rationale": {"type": "string"},
        "risks": {"type": "string"},
    },
    "required": ["verdict", "tool", "diagnosis", "suggested_description", "rationale", "risks"],
    "additionalProperties": False,
}

# Writing tests is not reviewing descriptions: its own instructions, the ones the user reads before asking.
WRITE_SYSTEM = (
    "You write test requests for an MCP server's tool routing. A model will read the server's tool "
    "descriptions and choose one tool for each request; a test checks it chose the expected tool.\n\n"
    "Write what real users type: their words, their context, their shortcuts, not the tool's name or the "
    "description's own terms. Each request must need the expected tool, and no other, to be answered well. "
    "Cover different ways of asking, including ones close to a neighbouring tool's subject, so the tests "
    "show where the descriptions are ambiguous."
)

GENERATE = {
    "type": "object",
    "properties": {
        "cases": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"id": {"type": "string"}, "prompt": {"type": "string"}},
                "required": ["id", "prompt"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["cases"],
    "additionalProperties": False,
}


def _parameters(tool: Tool) -> str:
    properties = tool.input_schema.get("properties")
    if properties is None:
        return "unknown (no server listed them)"
    if not isinstance(properties, dict) or not properties:
        return "none"
    required = tool.input_schema.get("required")
    needed = set(required) if isinstance(required, list) else set()
    return ", ".join(f"{name} ({spec.get('type', 'any') if isinstance(spec, dict) else 'any'}"
                     f"{', required' if name in needed else ''})" for name, spec in properties.items())


def _listing(offered: list[Tool]) -> str:
    """Each tool as the model sees it, with its parameters: the evidence of what it can do."""
    return "\n\n".join(f"## {tool.name}\n{tool.description}\nParameters: {_parameters(tool)}" for tool in offered)


def _diagnose_prompt(offered: list[Tool], case: dict, related: list) -> str:
    votes = ", ".join(f"{v['tool']} ×{v['count']}" for v in case.get("votes", []) if isinstance(v, dict)) or "none"
    others = "\n".join(f"- {c.get('prompt', '')} → {c.get('expect', '')}" for c in related if isinstance(c, dict))
    return (
        f"The server's tools:\n\n{_listing(offered)}\n\n"
        f"A user asked:\n\n{case.get('prompt', '')}\n\n"
        f"Its test says it must reach `{case.get('expect', '')}`. The model's picks were: {votes}.\n\n"
        + (f"Other requests that must keep routing as they do:\n{others}\n\n" if others else "")
        + "Say why the model went where it went, then fix the description that sent it there: the expected "
        "tool's, if it fails to claim this request though its parameters support it, or the winning tool's, if "
        "it claims a job that belongs to the expected one. Name that tool and give its full new description, "
        "keeping the other requests routed as they are. Answer `no change` only when no description is at "
        "fault because the request itself names no clear need; then name the expected tool and leave "
        "suggested_description empty."
    )


def _generate_prompt(offered: list[Tool], tool: str, scenario: str, existing: list, count: int) -> str:
    taken = "\n".join(f"- {c.get('id', '')}: {c.get('prompt', '')}" for c in existing if isinstance(c, dict))
    kinds = ", ".join(KINDS[:count])
    return (
        f"The server's tools:\n\n{_listing(offered)}\n\n"
        f"Write {count} request{'s' if count > 1 else ''} a real user could type that should reach `{tool}`"
        + (f", in this situation: {scenario}" if scenario.strip() else "")
        + f". Vary the wording: {kinds}. Word them the way a user would, not in the description's own terms. "
        "Each id is short kebab-case, unique, and absent from the cases below.\n\n"
        f"Cases that exist already:\n{taken or '(none)'}"
    )


def cases_wanted(raw: object) -> int:
    """How many tests to write for one tool: the recommendation unless the user asked for another count."""
    if raw is None or raw == "":
        return RECOMMENDED_CASES
    if not isinstance(raw, int) or isinstance(raw, bool) or not 1 <= raw <= MAX_CASES:
        raise ValueError(f"Ask for between 1 and {MAX_CASES} tests per tool")
    return raw


async def writing_prompt(spec: RoutingSpec, tool: str, scenario: str, existing: list, count: int) -> dict:
    """What the model is sent to write tests for one tool, word for word, for the user to read first."""
    async with httpx.AsyncClient() as http:
        offered = await catalogue(spec, http)
    return {"system": WRITE_SYSTEM, "prompt": _generate_prompt(offered, tool, scenario, existing, count)}


async def _answer(spec: RoutingSpec, request: dict) -> dict:
    model = str(request.get("model") or spec.model)
    async with httpx.AsyncClient() as http:
        offered = await catalogue(spec, http)
        async with models_for(spec, http) as models:
            action = request.get("action")
            if action == "generate":
                tool = str(request.get("tool", ""))
                existing = request.get("existing") if isinstance(request.get("existing"), list) else []
                count = cases_wanted(request.get("count"))
                found, usage = await models.ask(model, WRITE_SYSTEM, _generate_prompt(
                    offered, tool, str(request.get("scenario", "")), existing, count), GENERATE)
                cases = [{"id": str(c.get("id", "")), "prompt": str(c.get("prompt", "")), "expect": tool}
                         for c in found.get("cases", []) if isinstance(c, dict)][:count]
                return {"cases": cases, "model": model, "usage": usage}
            case = request.get("case")
            if not isinstance(case, dict):
                raise ValueError("a suggestion needs the case it is about")
            related = request.get("related_cases") if isinstance(request.get("related_cases"), list) else []
            found, usage = await models.ask(model, SYSTEM, _diagnose_prompt(offered, case, related), DIAGNOSE)
    known = {tool.name: tool.description for tool in offered}
    tool = str(found.get("tool", ""))
    if tool not in known:
        raise ModelError(f"The AI named a tool the server does not offer: {tool or '(none)'}")
    if found["verdict"] == "change" and not str(found.get("suggested_description", "")).strip():
        raise ModelError("The suggestion process returned a change with no description.")
    # The original is the catalogue's, never the model's copy of it: a misquote would be applied as an edit.
    return found | {"original_description": known[tool], "model": model, "usage": usage}


_running: asyncio.Task | None = None
_stopped = False


def stop() -> bool:
    """Cancel the request in flight, if there is one. Nothing to stop is not an error."""
    global _stopped
    task = _running
    if task is None or task.done():
        return False
    _stopped = True
    task.cancel()
    return True


async def suggest(spec: RoutingSpec, request: dict) -> dict:
    """Raises RuntimeError with a message fit to show, or asyncio.TimeoutError."""
    global _running, _stopped
    task = asyncio.ensure_future(_answer(spec, request))
    _running, _stopped = task, False
    try:
        return await asyncio.wait_for(asyncio.shield(task), timeout=TIMEOUT)
    except asyncio.CancelledError:
        if _stopped and task.cancelled():
            raise RuntimeError("Stopped before the model answered.") from None
        raise
    except asyncio.TimeoutError:
        task.cancel()
        raise
    except ModelError as error:
        raise RuntimeError(str(error)) from error
    finally:
        if not task.done():
            task.cancel()
        _running = None
