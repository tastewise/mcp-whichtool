"""A project whichtool has never seen: the tools its source declares or its server lists.

`scan` only reads; `write` puts down the project file and the empty case list a first run needs.
The source read is Python's `@tool` declarations and TypeScript's or JavaScript's `registerTool`,
`tool` and tool objects; a server in another language is reached by its URL.
Without a URL the models are offered the descriptions alone, since only a server knows the arguments.
"""

import base64
import binascii
import io
import json
import os
import re
import secrets
import shutil
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path, PurePosixPath

import httpx

from . import CLI, settings, tools
from .config import RoutingSpec, secret
from .routing_changes import declaring, descriptions, skipped

FIXTURE = "routing_cases.json"
# Where the files people drop in the page are kept, one folder per drop, with the project made from them.
UPLOADS = Path.home() / ".whichtool" / "uploads"
# The bookshop demo, inside the package once installed, beside it in a checkout; and where it is opened from.
DEMO = next((place for place in (Path(__file__).parent / "demo", Path(__file__).parent.parent / "demo")
             if (place / FIXTURE).is_file()), Path(__file__).parent / "demo")
DEMO_HOME = Path.home() / ".whichtool" / "demo"
# A server's source, not its dependencies: past this, the drop is refused rather than half read.
MAX_BYTES = 10 * 1024 * 1024
MAX_FILES = 2000


@dataclass(frozen=True)
class Found:
    name: str
    title: str
    description: str
    # Where the source declares it, relative to the project; empty when only the server knows it.
    path: str
    # In the server's tools/list, so offered to the models. A tool declared and not listed is not offered.
    listed: bool
    params: tuple[str, ...]


@dataclass(frozen=True)
class Scanned:
    root: Path
    server: str
    # The folder under root whose Python declares the tools; empty when the source declares none.
    descriptions: str
    tools: tuple[Found, ...]

    @property
    def offered(self) -> tuple[Found, ...]:
        return tuple(tool for tool in self.tools if tool.listed or not self.server)

    def as_dict(self) -> dict:
        return {"root": str(self.root), "server": self.server, "descriptions": self.descriptions,
                "tools": [asdict(tool) for tool in self.tools], "offered": len(self.offered),
                "project": str(self.root / settings.FILE), "exists": (self.root / settings.FILE).exists()}


def declared_under(root: Path) -> dict[str, dict]:
    spec = RoutingSpec(cwd=root, fixture=root / FIXTURE, results=root, descriptions=".")
    return descriptions(spec, loose=True)


def _folder(root: Path, paths: list[Path]) -> str:
    """The narrowest folder that holds every declaring file, so the eval reads no more than it needs."""
    if not paths:
        return ""
    return Path(os.path.commonpath([path.parent for path in paths])).relative_to(root).as_posix()


async def scan(root: Path, server: str, http: httpx.AsyncClient) -> Scanned:
    root = root.expanduser().resolve()
    if not root.is_dir():
        raise ValueError(f"{root} is not a folder")
    source = declared_under(root)
    listed: list[tools.Tool] = []
    if server:
        try:
            listed = await tools.list_tools(server, http, secret("MCP_SERVER_TOKEN", root / settings.ENV))
        except (httpx.HTTPError, ValueError) as error:
            raise ValueError(tools.unlisted(server, error)) from error
    names = {tool.name for tool in listed}
    found = [Found(name=tool.name, title=source.get(tool.name, {}).get("title") or tool.title,
                   description=source.get(tool.name, {}).get("description") or tool.description,
                   path=str(source[tool.name]["path"].relative_to(root)) if tool.name in source else "",
                   listed=True, params=tuple(param.name for param in tool.params))
             for tool in listed]
    found += [Found(name=name, title=entry["title"], description=entry["description"],
                    path=str(entry["path"].relative_to(root)), listed=False, params=())
              for name, entry in source.items() if name not in names]
    if not found:
        raise ValueError(f"no tools found: no Python, TypeScript or JavaScript under {root} declares one"
                         + (f", and {server} lists none" if server else
                            "; for a server in another language, give its URL"))
    return Scanned(root=root, server=server, descriptions=_folder(root, [entry["path"] for entry in source.values()]),
                   tools=tuple(found))


def write(scanned: Scanned, model: str) -> Path:
    """The project file for what was scanned, and an empty case list beside it. An existing file is kept."""
    target = scanned.root / settings.FILE
    if target.exists():
        raise ValueError(f"{target} exists already: `{CLI} tools` lists what it offers")
    target.write_text(settings.starter(scanned.server, model, scanned.descriptions))
    fixture = scanned.root / FIXTURE
    if not fixture.exists():
        fixture.write_text("[]\n")
    return target


def _kept(path: str) -> PurePosixPath | None:
    """A dropped file's path, if it is a source we read and stays inside the folder it lands in."""
    posix = path.replace("\\", "/")
    parts = PurePosixPath(posix).parts
    # "/x", "//x" and "C:/x" are absolute somewhere: never a path inside the drop.
    if (not parts or posix.startswith("/") or re.match(r"[A-Za-z]:", parts[0])
            or any(part in ("", ".", "..") or part.startswith("/") for part in parts)):
        return None
    kept = PurePosixPath(*parts)
    return kept if declaring(Path(kept.name)) and not skipped(parts[:-1]) else None


def _sources(files: list[dict]) -> dict[PurePosixPath, bytes]:
    """The source files a drop holds, `.zip` archives opened, refused past the size a server's source has."""
    found: dict[PurePosixPath, bytes] = {}
    total = 0

    def fits(size: int) -> None:
        if total + size > MAX_BYTES or len(found) >= MAX_FILES:
            raise ValueError(f"Too much to read: a server's source is under {MAX_BYTES // 2**20} MB "
                             f"and {MAX_FILES} files. Leave out its dependencies.")

    def add(path: str, data: bytes) -> None:
        nonlocal total
        kept = _kept(path)
        if kept is None:
            return
        fits(len(data))
        total += len(data)
        found[kept] = data

    for entry in files:
        path = str(entry.get("path", ""))
        if "base64" in entry:
            try:
                data = base64.b64decode(str(entry["base64"]), validate=True)
            except (binascii.Error, ValueError) as error:
                raise ValueError(f"{path} did not arrive whole") from error
            if not path.lower().endswith(".zip"):
                add(path, data)
                continue
            try:
                archive = zipfile.ZipFile(io.BytesIO(data))
            except zipfile.BadZipFile as error:
                raise ValueError(f"{path} is not a zip archive") from error
            for info in archive.infolist():
                if not info.is_dir() and _kept(info.filename) is not None:
                    fits(info.file_size)  # before inflating it: an archive can say little and hold a lot
                    try:
                        data = archive.read(info)
                    except (zipfile.BadZipFile, zipfile.LargeZipFile, OSError) as error:
                        raise ValueError(f"{path} is damaged: {info.filename} could not be read") from error
                    add(info.filename, data)
        else:
            add(path, str(entry.get("content", "")).encode())
    if not found:
        raise ValueError("No Python, TypeScript or JavaScript in what you dropped")
    return found


def project_for(server: str, uploads: Path = UPLOADS) -> Path | None:
    """The project already made from this server's URL alone, if any: scanning it again reopens it, tests and all.

    Of several (made before this rule), the one with the most tests, then the newest."""
    found = []
    for root in uploads.iterdir() if uploads.is_dir() else ():
        try:
            held = settings.load(root / settings.FILE)
        except (ValueError, OSError):
            continue
        if held.routing is None or held.routing.server != server or any(root.joinpath(n).is_file()
                                                                         for n in os.listdir(root) if declaring(Path(n))):
            continue
        try:
            cases = len(json.loads(held.routing.fixture.read_text()))
        except (ValueError, OSError):
            continue  # a project whose cases cannot be read is not one to reopen silently
        found.append((cases, (root / settings.FILE).stat().st_mtime, root))
    return max(found)[2] if found else None


def unpack(files: list[dict], name: str, uploads: Path = UPLOADS, *, required: bool = True) -> Path:
    """The dropped sources written to a folder of their own, named after `name`. Not `required`: a server
    scanned by its URL alone, whose folder holds only the project made from it.

    Drops never made into a project (no project file) are removed first: a drop is kept as long as
    the tests made from it are."""
    found = _sources(files) if files or required else {}
    uploads.mkdir(parents=True, exist_ok=True)
    for old in uploads.iterdir():
        if old.is_dir() and not (old / settings.FILE).exists():
            shutil.rmtree(old, ignore_errors=True)
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "upload"
    root = uploads / f"{slug}-{secrets.token_hex(3)}"
    root.mkdir()
    for path, data in found.items():
        target = root.joinpath(*path.parts)
        if not target.resolve().is_relative_to(root.resolve()):
            raise ValueError(f"{path} would land outside its folder")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    return root


def uploaded(root: Path, uploads: Path = UPLOADS) -> bool:
    return root.resolve().is_relative_to(uploads.resolve())


def demo(home: Path = DEMO_HOME) -> Path:
    """The demo's project: its source and its thirteen cases, copied once, so what is edited there stays."""
    if not (home / settings.FILE).exists():
        home.mkdir(parents=True, exist_ok=True)
        for name in ("server.py", FIXTURE):
            shutil.copyfile(DEMO / name, home / name)
        (home / settings.FILE).write_text(settings.starter("", "claude-haiku-5-5", "."))
    return home
