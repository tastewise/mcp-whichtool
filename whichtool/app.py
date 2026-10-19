"""The web console: one FastAPI app with the eval and editor routes, and its page.

It listens on loopback only and behind `guard`, so no other page open in the browser can drive it.
Tables missing from the project file turn their routes into a 404 that says which table to add.

The home page finds a project: `POST /api/project/upload` reads the files dropped in the page (kept in
a folder of their own) or a server's tools, without writing, and `POST /api/project` writes the project
file for them and opens it, in place of the one open, if any. Started outside any project, the console
opens on that page with none.

API keys typed in the page stay in the browser: it sends them with each request (`x-anthropic-key`,
`x-openai-key`), they are used for that request and what it starts, and never written or logged. A key
in the environment or the project's `.env` is used when the page sends none.
"""

import asyncio
import contextvars
import os
import threading
import webbrowser
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import replace
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from fastapi import Body, FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import eval_routes, fingerprint, routing_editor, routing_eval, scan, settings
from .config import RoutingSpec
from .guard import Guard
from .routing_changes import Sources
from .settings import Settings

# The React page, built by `npm run build` in web/ (see web/README.md).
STATIC = Path(__file__).resolve().parent / "static"
HOST = "127.0.0.1"
# The keys the page sent with the request being served, by provider. A run started by it keeps them:
# its task copies this context when it is created.
SENT: contextvars.ContextVar[dict[str, str]] = contextvars.ContextVar("sent_keys", default={})
HEADERS = {"anthropic": "x-anthropic-key", "openai": "x-openai-key"}


class KeysSent:
    """Sets `SENT` from the request's key headers for the app below it (plain ASGI: a stream passes through)."""

    def __init__(self, app) -> None:  # type: ignore[no-untyped-def]
        self.app = app

    async def __call__(self, scope, receive, send) -> None:  # type: ignore[no-untyped-def]
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = {name.decode().lower(): value.decode(errors="replace") for name, value in scope["headers"]}
        sent = {provider: headers.get(header, "").strip() for provider, header in HEADERS.items()}
        if any(len(key) > 500 or any(c.isspace() for c in key) for key in sent.values()):
            response = JSONResponse({"detail": "That is not an API key: no spaces, under 500 characters"}, status_code=400)
            return await response(scope, receive, send)
        token = SENT.set({provider: key for provider, key in sent.items() if key})
        try:
            await self.app(scope, receive, send)
        finally:
            SENT.reset(token)


class Fresh(StaticFiles):
    """Revalidated on every load: a console updated under an open tab must not serve last week's script."""

    async def get_response(self, path: str, scope):  # type: ignore[no-untyped-def]
        response = await super().get_response(path, scope)
        response.headers["cache-control"] = "no-cache"
        return response


def create(project: Settings | None, start: Path | None = None, uploads: Path = scan.UPLOADS,
           demo: Path = scan.DEMO_HOME) -> FastAPI:
    """`project` None: none was found, and the page offers to make one, starting from `start`.
    `uploads`: where dropped files are kept; `demo`: where the demo is opened from."""
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with httpx.AsyncClient() as client:
            app.state.client = client
            yield

    # No generated API docs: /docs is the page's guides.
    app = FastAPI(lifespan=lifespan, title="whichtool", docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(KeysSent)

    opened: list[Settings] = [project] if project else []
    folder = (start or Path.cwd()).resolve()

    def routing_spec() -> RoutingSpec:
        if not opened:
            raise HTTPException(404, f"no {settings.FILE} yet: scan a project first")
        if opened[0].routing is None:
            raise HTTPException(404, f"no [routing] table in {opened[0].file}")
        sent = SENT.get()
        held = opened[0].routing
        return replace(held, anthropic_key=sent.get("anthropic") or held.anthropic_key,
                       openai_key=sent.get("openai") or held.openai_key)

    @app.get("/api/keys")
    def keys() -> dict:
        """Which providers have a key on this machine (environment or project `.env`), never the key itself."""
        held = opened[0].routing if opened and opened[0].routing else None
        return {provider: bool(getattr(held, f"{provider}_key") if held else os.environ.get(f"{provider.upper()}_API_KEY"))
                for provider in HEADERS}

    def client() -> httpx.AsyncClient:
        return app.state.client

    @app.get("/api/project")
    def about() -> dict:
        if not opened:
            return {"configured": False, "folder": str(folder), "fingerprint": fingerprint.RUNNING}
        current = opened[0]
        return {"configured": True, "folder": str(current.root), "file": str(current.file), "name": current.root.name,
                "uploaded": scan.uploaded(current.root, uploads), "demo": current.root == demo.resolve(),
                "server": current.routing.server if current.routing else "",
                "routing": current.routing is not None, "fingerprint": fingerprint.RUNNING}

    def server_of(payload: dict) -> str:
        server = payload.get("server", "")
        if not isinstance(server, str) or (server.strip() and not server.strip().startswith(("http://", "https://"))):
            raise HTTPException(400, "The server's URL starts with http:// or https://")
        return server.strip()

    async def scanned(payload: dict) -> scan.Scanned:
        where, server = payload.get("folder", ""), server_of(payload)
        if not isinstance(where, str) or not where.strip():
            raise HTTPException(400, "Give the project's folder, and its server's URL if it has one")
        try:
            return await scan.scan(Path(where.strip()), server, client())
        except (ValueError, OSError) as error:
            # An unreadable file or folder says so, as a bad URL does.
            raise HTTPException(422, str(error)) from error

    # The last scan of each folder and server: opening what was just scanned does not ask the server again.
    seen: dict[tuple[Path, str], scan.Scanned] = {}

    def shown(found: scan.Scanned) -> dict:
        seen[(found.root, found.server)] = found
        return found.as_dict() | {"uploaded": scan.uploaded(found.root, uploads)}

    @app.post("/api/project/upload")
    async def dropped(payload: dict = Body(...)) -> dict:
        files, name, server = payload.get("files"), payload.get("name", ""), server_of(payload)
        if not isinstance(files, list) or not all(isinstance(entry, dict) for entry in files) or not isinstance(name, str):
            raise HTTPException(400, "Drop the server's files, or a .zip of them")
        try:
            # A URL alone is a drop with nothing in it: the project made from it needs a folder all the same,
            # and the one made from it before, tests and all, when there is one.
            root = (not files and server and scan.project_for(server, uploads)) or \
                scan.unpack(files, name or urlsplit(server).hostname or "", uploads, required=not server)
            return shown(await scan.scan(root, server, client()))
        except (ValueError, OSError) as error:
            raise HTTPException(422, str(error)) from error

    ai_lock = asyncio.Lock()
    running = eval_routes.install(app, routing_spec, client, ai_lock)
    routing_editor.install(app, routing_spec, running, ai_lock)

    def tests_of(names: list[str]) -> dict | None:
        """The open project's tests, for the page to open on; None leaves it to read them itself."""
        try:
            return Sources(routing_spec(), names).catalog()
        except (ValueError, OSError, HTTPException):
            # No [routing] table, or no cases file yet: the page reads what there is on its own.
            return None

    def switching() -> None:
        if running() or ai_lock.locked():
            raise HTTPException(409, "Wait for the evaluation or the AI to finish before switching projects")

    @app.post("/api/project/demo")
    async def open_demo() -> dict:
        switching()
        before = list(opened)
        try:
            opened[:] = [settings.load(scan.demo(demo) / settings.FILE)]
            names = [tool.name for tool in await routing_eval.catalogue(routing_spec(), client())]
        except (ValueError, OSError) as error:
            # A failed switch is no switch: the project open before stays open.
            opened[:] = before
            raise HTTPException(409, str(error)) from error
        return about() | {"catalog": tests_of(names)}

    @app.post("/api/project")
    async def adopt(payload: dict = Body(...)) -> dict:
        switching()
        where = Path(str(payload.get("folder", ""))).expanduser().resolve()
        if (where / settings.FILE).is_file():
            # A project file already there is the user's: opened as it is, never rewritten, and with no
            # scan first, so a project whose server is down still opens.
            try:
                opened[:] = [settings.load(where / settings.FILE)]
            except (ValueError, OSError) as error:
                raise HTTPException(409, str(error)) from error
            found = seen.get((where, str(payload.get("server", "")).strip()))
            return about() | {"catalog": tests_of([tool.name for tool in found.offered]) if found else None}
        found = seen.get((where, str(payload.get("server", "")).strip())) or await scanned(payload)
        try:
            scan.write(found, str(payload.get("model") or "claude-opus-5-5"))
            opened[:] = [settings.load(found.root / settings.FILE)]
        except (ValueError, OSError) as error:
            raise HTTPException(409, str(error)) from error
        # The page opens on the tests at once: the tools are the ones the scan just read.
        return about() | {"catalog": tests_of([tool.name for tool in found.offered])}

    # The page's own routes: each one loads the same app, which reads the path.
    @app.get("/")
    @app.get("/routing")
    @app.get("/docs")
    @app.get("/docs/{guide}")
    def page(guide: str = "") -> FileResponse:
        return FileResponse(STATIC / "index.html", headers={"cache-control": "no-cache"})

    app.mount("/static", Fresh(directory=STATIC), name="static")
    return app


def guarded(project: Settings | None, port: int, start: Path | None = None) -> Guard:
    return Guard(create(project, start), port)


def serve(project: Settings | None, *, port: int, open_browser: bool = True, start: Path | None = None) -> int:
    import uvicorn

    url = f"http://{HOST}:{port}/"
    print(f"whichtool on {url}  ·  {project.file if project else 'no project yet: the page finds one'}")
    if open_browser:
        # Once uvicorn listens: a browser opened first shows a refused connection.
        threading.Timer(0.8, webbrowser.open, (url,)).start()
    uvicorn.run(guarded(project, port, start), host=HOST, port=port, log_level="warning")
    return 0
