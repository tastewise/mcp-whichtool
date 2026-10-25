"""The models the eval asks, behind one surface: Claude through Anthropic's SDK, the rest through OpenAI's API.

Two questions only. `route`: here are the server's tools and a user's prompt, which tool do you call?
`ask`: answer this as JSON matching this schema. Usage comes back in Anthropic's counters whichever
provider answered, so `routing.cost` prices both the same way.

Nothing here retries a refusal on another model: the eval measures the model it names, and an
answer from a fallback would be scored as that model's.
"""

import json
import re
from dataclasses import dataclass, field

import anthropic
import httpx

# An OpenAI key quoted back in an error, masked but for its tail: not even the tail leaves.
KEY = re.compile(r"sk-[A-Za-z0-9*_\-]+")
COUNTERS = ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")
# Room for adaptive thinking before the tool call; the answer itself is short.
MAX_TOKENS = 16000


class ModelError(Exception):
    """A provider refused or failed. The message is safe to show: no key survives in it."""


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    input_schema: dict = field(default_factory=lambda: {"type": "object", "properties": {}})


@dataclass(frozen=True)
class Reply:
    # The first tool the model called, or None when it answered in words.
    tool: str | None
    usage: dict[str, int]
    text: str = ""


def provider_of(model: str) -> str:
    return "anthropic" if model.startswith("claude-") else "openai"


def _usage(raw: object) -> dict[str, int]:
    found = {name: getattr(raw, name, 0) for name in COUNTERS}
    return {name: int(value or 0) for name, value in found.items()}


def _openai_usage(raw: object, prefix: str = "prompt", out: str = "completion") -> dict[str, int]:
    """Chat Completions counts `prompt_tokens`, Responses `input_tokens`: the same counters under two names."""
    usage = raw if isinstance(raw, dict) else {}
    details = usage.get(f"{prefix}_tokens_details")
    cached = int((details or {}).get("cached_tokens") or 0) if isinstance(details, dict) else 0
    return {
        "input_tokens": int(usage.get(f"{prefix}_tokens") or 0) - cached,
        "output_tokens": int(usage.get(f"{out}_tokens") or 0),
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": cached,
    }


def _safe(text: str) -> str:
    return KEY.sub("sk-…", text)[:300]


class Models:
    """The clients, the keys, and where each provider answers. One per run; close it after."""

    def __init__(self, *, anthropic_key: str = "", openai_key: str = "", anthropic_base: str = "",
                 openai_base: str = "https://api.openai.com/v1", http: httpx.AsyncClient | None = None,
                 timeout: float = 120.0, max_retries: int = 2) -> None:
        self._openai_key = openai_key
        self._openai_base = openai_base.rstrip("/")
        self._timeout = timeout
        self._owned = http is None
        self._http = http or httpx.AsyncClient()
        self._claude = anthropic.AsyncAnthropic(
            api_key=anthropic_key or None, base_url=anthropic_base or None,
            timeout=timeout, max_retries=max_retries,
        ) if anthropic_key else None

    async def close(self) -> None:
        if self._claude is not None:
            await self._claude.close()
        if self._owned:
            await self._http.aclose()

    async def __aenter__(self) -> "Models":
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()

    def _anthropic(self) -> anthropic.AsyncAnthropic:
        if self._claude is None:
            raise ModelError("no Anthropic key: set ANTHROPIC_API_KEY")
        return self._claude

    async def _messages(self, **body: object) -> object:
        try:
            return await self._anthropic().messages.create(**body)
        except anthropic.APIStatusError as error:
            raise ModelError(f"Anthropic answered {error.status_code}: {_safe(str(error.message))}") from error
        except anthropic.APIConnectionError as error:
            raise ModelError(f"Anthropic could not be reached: {_safe(str(error))}") from error

    async def _openai(self, route: str, body: dict) -> dict:
        if not self._openai_key:
            raise ModelError("no OpenAI key: set OPENAI_API_KEY")
        try:
            response = await self._http.post(f"{self._openai_base}/{route}", json=body, timeout=self._timeout,
                                             headers={"Authorization": f"Bearer {self._openai_key}"})
        except httpx.HTTPError as error:
            raise ModelError(f"OpenAI could not be reached: {_safe(str(error) or type(error).__name__)}") from error
        if response.status_code >= 400:
            try:
                error = response.json().get("error", {})
                detail = error.get("message", "") if isinstance(error, dict) else str(error)
            except (ValueError, AttributeError):
                detail = response.text
            raise ModelError(f"OpenAI answered {response.status_code}: {_safe(str(detail))}")
        try:
            payload = response.json()
        except ValueError as error:
            raise ModelError("OpenAI answered something other than JSON") from error
        if not isinstance(payload, dict):
            raise ModelError("OpenAI answered something other than JSON")
        return payload

    async def _chat(self, body: dict) -> dict:
        payload = await self._openai("chat/completions", body)
        try:
            message = payload["choices"][0]["message"]
        except (ValueError, KeyError, IndexError, TypeError) as error:
            raise ModelError("OpenAI answered without a message") from error
        return {"message": message, "usage": _openai_usage(payload.get("usage"))}

    async def route(self, model: str, tools: list[Tool], prompt: str, system: str = "") -> Reply:
        """One draw: the model sees the tools as a client would offer them, and is free not to call one."""
        if provider_of(model) == "anthropic":
            offered: list[dict] = [{"name": t.name, "description": t.description, "input_schema": t.input_schema}
                                   for t in tools]
            body: dict = {"model": model, "max_tokens": MAX_TOKENS, "tools": offered,
                          "messages": [{"role": "user", "content": prompt}]}
            # Tools render first, then the system prompt: the breakpoint goes on whichever is last, so
            # every case and every draw of a run reads the catalogue from the cache.
            if system:
                body["system"] = [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
            elif offered:
                offered[-1] = offered[-1] | {"cache_control": {"type": "ephemeral"}}
            response = await self._messages(**body)
            blocks = getattr(response, "content", [])
            picked = next((b.name for b in blocks if b.type == "tool_use"), None)
            text = " ".join(b.text for b in blocks if b.type == "text")
            return Reply(tool=picked, usage=_usage(getattr(response, "usage", None)), text=text)
        # The Responses route, not Chat Completions: there, a reasoning model is refused function tools
        # unless its reasoning is turned off, and the eval measures the model as a client runs it.
        body = {"model": model, "max_output_tokens": MAX_TOKENS, "input": [{"role": "user", "content": prompt}],
                "tools": [{"type": "function", "name": t.name, "description": t.description,
                           "parameters": t.input_schema} for t in tools]}
        if system:
            body["instructions"] = system
        payload = await self._openai("responses", body)
        items = [i for i in payload.get("output") or [] if isinstance(i, dict)]
        picked = next((i.get("name") for i in items if i.get("type") == "function_call"), None)
        text = " ".join(str(part.get("text") or "") for i in items if i.get("type") == "message"
                        for part in i.get("content") or [] if isinstance(part, dict) and part.get("type") == "output_text")
        return Reply(tool=picked, usage=_openai_usage(payload.get("usage"), "input", "output"), text=text)

    async def ask(self, model: str, system: str, prompt: str, schema: dict) -> tuple[dict, dict[str, int]]:
        """A JSON answer that matches `schema`, constrained by the provider rather than parsed out of prose."""
        if provider_of(model) == "anthropic":
            response = await self._messages(
                model=model, max_tokens=MAX_TOKENS, system=system,
                messages=[{"role": "user", "content": prompt}],
                output_config={"format": {"type": "json_schema", "schema": schema}},
            )
            if getattr(response, "stop_reason", "") == "refusal":
                raise ModelError("the model declined to answer")
            text = next((b.text for b in getattr(response, "content", []) if b.type == "text"), "")
            usage = _usage(getattr(response, "usage", None))
        else:
            answer = await self._chat({
                "model": model, "max_completion_tokens": MAX_TOKENS,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                "response_format": {"type": "json_schema",
                                    "json_schema": {"name": "answer", "strict": True, "schema": schema}},
            })
            text, usage = str(answer["message"].get("content") or ""), answer["usage"]
        try:
            found = json.loads(text)
        except ValueError as error:
            raise ModelError("the model answered something other than JSON") from error
        if not isinstance(found, dict):
            raise ModelError("the model answered JSON that is not an object")
        return found, usage
