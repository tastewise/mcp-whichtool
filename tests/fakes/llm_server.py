"""A real HTTP server speaking Anthropic's Messages route and OpenAI's Chat Completions route.

Not a mock of our client: the Anthropic SDK and our httpx stack talk to a socket, so the bodies,
headers and status codes are exercised as the providers exercise them.

It routes the way a well-behaved model would on a clear prompt: it calls the first offered tool
whose name the prompt mentions, and answers in words when none is. A request for a JSON answer
gets the next one queued in `answers`.
"""

import asyncio
import contextlib
import json
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field

from tests.fakes.sockets import listening

USAGE = {"input_tokens": 1000, "output_tokens": 40, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 900}
OPENAI_USAGE = {"prompt_tokens": 1000, "completion_tokens": 40, "prompt_tokens_details": {"cached_tokens": 600}}


@dataclass
class Fake:
    base: str
    seen: list[dict] = field(default_factory=list)


def _prompt(body: dict) -> str:
    content = body["messages"][-1]["content"]
    return content if isinstance(content, str) else " ".join(b.get("text", "") for b in content)


def _names(path: str, body: dict) -> list[str]:
    tools = body.get("tools") or []
    return [t["name"] if path.endswith("/messages") else t["function"]["name"] for t in tools]


def mentioned(path: str, body: dict) -> str | None:
    prompt = _prompt(body)
    return next((name for name in _names(path, body) if name in prompt), None)


def anthropic_message(blocks: list[dict], stop: str = "end_turn") -> dict:
    return {"id": "msg_1", "type": "message", "role": "assistant", "model": "claude", "content": blocks,
            "stop_reason": stop, "stop_sequence": None, "usage": USAGE}


def openai_message(message: dict) -> dict:
    return {"id": "chatcmpl-1", "object": "chat.completion", "model": "gpt", "usage": OPENAI_USAGE,
            "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant"} | message}]}


def answer(path: str, body: dict, queued: list) -> tuple[int, dict]:
    anthropic = path.endswith("/messages")
    structured = "output_config" in body or "response_format" in body
    if structured:
        reply = queued.pop(0) if len(queued) > 1 else queued[0]
        if isinstance(reply, tuple):
            return reply
        text = json.dumps(reply)
        if anthropic:
            return 200, anthropic_message([{"type": "thinking", "thinking": "", "signature": "s"},
                                           {"type": "text", "text": text}])
        return 200, openai_message({"content": text})
    tool = mentioned(path, body)
    if anthropic:
        blocks = [{"type": "tool_use", "id": "toolu_1", "name": tool, "input": {}}] if tool else \
            [{"type": "text", "text": "Which one do you mean?"}]
        return 200, anthropic_message(blocks, "tool_use" if tool else "end_turn")
    if tool:
        return 200, openai_message({"content": None, "tool_calls": [
            {"id": "call_1", "type": "function", "function": {"name": tool, "arguments": "{}"}}]})
    return 200, openai_message({"content": "Which one do you mean?"})


@contextlib.asynccontextmanager
async def serve(answers: list | None = None, *, delay: float = 0.0,
                brain: Callable[[str, dict], tuple[int, dict]] | None = None) -> AsyncIterator[Fake]:
    """`answers` are the JSON answers in order, the last one repeated; a (status, body) tuple is an
    error. `brain` replaces the routing rule. `delay` holds each answer back, as a slow model does,
    unless the client hangs up first."""
    queued = list(answers or [{}])
    fake = Fake(base="")

    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            head = await reader.readuntil(b"\r\n\r\n")
        except (asyncio.IncompleteReadError, ConnectionError):
            writer.close()
            return
        lines = head.decode().split("\r\n")
        headers = {name.strip().lower(): value.strip()
                   for name, _, value in (line.partition(":") for line in lines[1:] if ":" in line)}
        raw = await reader.readexactly(int(headers.get("content-length", "0")))
        path = lines[0].split(" ")[1]
        body = json.loads(raw) if raw else {}
        fake.seen.append({"path": path, "headers": headers, "body": body})
        if delay:
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(reader.read(1), timeout=delay)
                fake.seen[-1]["hung_up"] = True
                writer.close()
                return
        status, payload = brain(path, body) if brain else answer(path, body, queued)
        data = json.dumps(payload).encode()
        writer.write(f"HTTP/1.1 {status} X\r\nContent-Type: application/json\r\n"
                     f"Content-Length: {len(data)}\r\nConnection: close\r\n\r\n".encode() + data)
        await writer.drain()
        writer.close()

    async with listening(handle) as server:
        fake.base = f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}"
        yield fake
