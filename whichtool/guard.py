"""Only the console's own pages may drive it.

The console listens on a fixed loopback port, so any page open in the same browser
can aim a request at it. A form can post without a preflight, and a JSON body is not
needed to start, stop or run anything: several routes act on their path alone. Two
checks close that, for every route at once:

- The Host must be a loopback name. A page that rebinds its own domain to 127.0.0.1
  still sends its domain as the Host, so it is refused before any route runs.
- A request that changes something must carry HEADER. A foreign page can only add
  a custom header after a CORS preflight, and the console answers none — so the
  browser never sends it. When an Origin is sent, it must be one of the console's.

The console's own UI, the Vite dev server proxying it, and the CLI all send HEADER.

In a GitHub Codespace the browser reaches the console through the address Codespaces forwards its port
to: that one name, read from the Codespace's own variables, is accepted besides loopback, and nowhere
else. A forwarded port is private to its Codespace's owner unless they share it.
"""

import os
from urllib.parse import urlsplit

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

HEADER = "x-whichtool"
LOOPBACK = {"127.0.0.1", "localhost", "::1"}
SAFE = {"GET", "HEAD", "OPTIONS"}
DEV_PORT = 5174


def _hostname(value: str) -> str:
    return (urlsplit(f"//{value}").hostname or "").lower()


def forwarded_host(port: int) -> str:
    """In a GitHub Codespace, the name it forwards `port` to (`<codespace>-<port>.<domain>`); empty elsewhere."""
    name = os.environ.get("CODESPACE_NAME", "")
    domain = os.environ.get("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", "")
    return f"{name}-{port}.{domain}".lower() if name and domain else ""


def allowed_origins(port: int) -> set[str]:
    local = {f"http://{host}:{p}" for host in ("127.0.0.1", "localhost") for p in (port, DEV_PORT)}
    forwarded = forwarded_host(port)
    return local | ({f"https://{forwarded}"} if forwarded else set())


def refusal(request: Request, port: int) -> str:
    """Why this request may not reach a route; empty when it may."""
    host = _hostname(request.headers.get("host", ""))
    if host not in LOOPBACK and not (host and host == forwarded_host(port)):
        return "the console answers only on 127.0.0.1 or localhost"
    if request.method in SAFE:
        return ""
    origin = request.headers.get("origin")
    if origin is not None and origin not in allowed_origins(port):
        return f"requests from {origin} may not drive the console"
    if request.headers.get(HEADER) != "1":
        return f"a request that changes something must carry {HEADER}: 1"
    return ""


class Guard:
    """Plain ASGI, deliberately: Starlette's BaseHTTPMiddleware wraps every response body,
    and cancelling the console's event streams through that wrapper at shutdown prints a
    traceback per stream. This only looks at the request, then hands the call on."""

    def __init__(self, app: ASGIApp, port: int) -> None:
        self.app = app
        self.port = port

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and (reason := refusal(Request(scope), self.port)):
            await JSONResponse({"detail": reason}, status_code=403)(scope, receive, send)
            return
        await self.app(scope, receive, send)
