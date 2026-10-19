"""The one way the fakes listen: a socket on loopback that lets go of its connections when it closes.

From Python 3.12.1 on, `Server.wait_closed` waits for every connection to end. A client that opened one
and never sent a request (a call cancelled between connect and send) would keep a fake's shutdown, and
so the test, waiting forever. Closing what is still open gives each handler its end of stream.
"""

import asyncio
import contextlib
from collections.abc import AsyncIterator, Awaitable, Callable

Handler = Callable[[asyncio.StreamReader, asyncio.StreamWriter], Awaitable[None]]


@contextlib.asynccontextmanager
async def listening(handle: Handler) -> AsyncIterator[asyncio.Server]:
    held: set[asyncio.StreamWriter] = set()

    async def tracked(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        held.add(writer)
        try:
            await handle(reader, writer)
        finally:
            held.discard(writer)

    server = await asyncio.start_server(tracked, "127.0.0.1", 0)
    try:
        yield server
    finally:
        server.close()
        for writer in list(held):
            writer.close()
        await server.wait_closed()
