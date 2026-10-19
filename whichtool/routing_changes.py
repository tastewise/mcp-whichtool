import ast
import hashlib
import json
import os
import re
import tempfile
from pathlib import Path

from whichtool import ts_source
from whichtool.config import RoutingSpec


def revision(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(handle, "w") as stream:
            stream.write(text)
        if path.exists():
            os.chmod(temporary, path.stat().st_mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _tool_decorators(module: ast.AST) -> list[tuple[ast.Call, ast.AST]]:
    """Every `@x.tool(...)` call, with the function it registers."""
    found = []
    for node in ast.walk(module):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for decorator in node.decorator_list:
                target = decorator.func if isinstance(decorator, ast.Call) else None
                named = getattr(target, "attr", getattr(target, "id", None))
                if named == "tool":
                    found.append((decorator, node))
    return found


def in_source(source: str, *, loose: bool = False) -> dict[str, dict]:
    """What one module declares: tool name -> title, description, and the description node.

    Loose also finds decorated tools named after their function, and ones with no
    description= at all: those carry no node, only the call a description goes into.
    """
    module = ast.parse(source)
    found: dict[str, dict] = {}
    claimed: set[int] = set()

    def add(name: str, entry: dict) -> None:
        if name in found:
            raise ValueError(f"Ambiguous description source for {name}")
        found[name] = entry

    if loose:
        for call, function in _tool_decorators(module):
            fields = {kw.arg: kw.value for kw in call.keywords}
            name = fields.get("name")
            if name is not None and not (isinstance(name, ast.Constant) and isinstance(name.value, str)):
                continue
            description, title = fields.get("description"), fields.get("title")
            tool = name.value if name is not None else function.name
            title = title.value if isinstance(title, ast.Constant) and isinstance(title.value, str) else tool
            claimed.add(id(call))
            if description is None:
                add(tool, {"name": tool, "title": title, "description": ast.get_docstring(function) or "",
                           "node": None, "call": call})
            elif isinstance(description, ast.Constant) and isinstance(description.value, str):
                add(tool, {"name": tool, "title": title, "description": description.value, "node": description})
    for node in ast.walk(module):
        if id(node) in claimed:
            continue
        if isinstance(node, ast.Dict):
            fields = {key.value: value for key, value in zip(node.keys, node.values)
                      if isinstance(key, ast.Constant) and isinstance(key.value, str)}
        elif isinstance(node, ast.Call):
            fields = {kw.arg: kw.value for kw in node.keywords}
        else:
            continue
        name = fields.get("tool_name", fields.get("name"))
        description = fields.get("description")
        title = fields.get("title")
        if not (isinstance(name, ast.Constant) and isinstance(name.value, str)
                and isinstance(description, ast.Constant) and isinstance(description.value, str)):
            continue
        add(name.value, {"name": name.value, "title": title.value if isinstance(title, ast.Constant) else name.value,
                         "description": description.value, "node": description})
    return found


# Not the project's own declarations: its tests, environments, dependencies and builds.
SKIPPED = frozenset({"tests", "node_modules", "site-packages", "__pycache__", "venv", "build", "dist"})


def skipped(parts: tuple[str, ...]) -> bool:
    return any(part in SKIPPED or part.startswith(".") for part in parts)


def _files(top: Path) -> list[Path]:
    """The files under `top`, in a stable order, without descending into the folders `skipped` names."""
    found = []
    for folder, children, files in os.walk(top):
        children[:] = sorted(child for child in children if not skipped((child,)))
        found += [Path(folder) / name for name in sorted(files)]
    return found


def declaring(path: Path) -> bool:
    """A file whose tools we read: Python, TypeScript or JavaScript, not a type declaration."""
    return path.suffix.lower() == ".py" or ts_source.supported(path.name)


def descriptions(spec: RoutingSpec, *, loose: bool = False) -> dict[str, dict]:
    """Every tool the source under `descriptions` declares, by name. A TypeScript or JavaScript one carries
    `span`, where its description sits, in place of the Python AST node."""
    found = {}
    for path in _files(spec.cwd / spec.descriptions):
        if not declaring(path):
            continue
        try:
            source = path.read_text()
            # Cheap gate before parsing: every shape we read names a tool or a description.
            if "tool" not in source.lower() and "description" not in source.lower():
                continue
            declared = (in_source(source, loose=loose) if path.suffix.lower() == ".py"
                        else ts_source.in_source(source, path.suffix, loose=loose))
        except (SyntaxError, UnicodeDecodeError, OSError):
            # A script the server never imports, in another Python or encoding, or one we may not read: no tool of ours.
            continue
        for name, tool in declared.items():
            if name in found:
                raise ValueError(f"Ambiguous description source for {name}")
            found[name] = tool | {"path": path, "revision": revision(source)}
    return found


def _offset(lines: list[bytes], line: int, column: int) -> int:
    return sum(map(len, lines[:line - 1])) + column


def _rewritten(source: str, tool: dict, text: str) -> str:
    """The module with this tool's description literal replaced, or a description= added."""
    raw = source.encode()
    lines = raw.splitlines(keepends=True)
    literal = json.dumps(text, ensure_ascii=False).encode()
    node = tool["node"]
    if node is not None:
        start = _offset(lines, node.lineno, node.col_offset)
        end = _offset(lines, node.end_lineno, node.end_col_offset)
        return (raw[:start] + literal + raw[end:]).decode()
    call = tool["call"]
    close = _offset(lines, call.end_lineno, call.end_col_offset) - 1
    arguments = [*call.args, *call.keywords]
    if not arguments:
        return (raw[:close] + b"description=" + literal + raw[close:]).decode()
    last = arguments[-1]
    after = _offset(lines, last.end_lineno, last.end_col_offset)
    between = raw[after:close]
    if b"\n" not in between:
        # One line: the keyword joins it, before any trailing comma.
        return (raw[:after] + b", description=" + literal + raw[after:]).decode()
    # Exploded call: one more line at the last argument's indent, trailing comma kept.
    indent = b" " * last.col_offset
    comma = between.index(b",") + 1 if between.lstrip().startswith(b",") else 0
    head = raw[:after] + (between[:comma] if comma else b",")
    return (head + b"\n" + indent + b"description=" + literal + b"," + between[comma:] + raw[close:]).decode()


def case_identity(case: dict) -> tuple:
    return tuple(str(case.get(key, "")).strip() for key in ("id", "prompt", "expect"))


def validate_cases(rows: list, tool_names: set[str], kept: set[tuple] = frozenset()) -> list[dict]:
    """`kept`: cases saved before, as `case_identity` reads them; unchanged, their tool need not be on offer."""
    if not isinstance(rows, list) or not rows:
        raise ValueError("The catalog must contain at least one test case")
    ids, prompts, validated = set(), set(), []
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Invalid test case")
        item = {key: row.get(key) for key in ("id", "prompt", "expect")}
        if not all(isinstance(value, str) and value.strip() for value in item.values()):
            raise ValueError("ID, prompt and expected tool are required")
        item = {key: value.strip() for key, value in item.items()}
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,99}", item["id"]):
            raise ValueError("IDs must use lowercase letters, digits and hyphens (max 100 characters)")
        if item["id"] in ids or item["prompt"].casefold() in prompts:
            raise ValueError("Duplicate case ID or prompt")
        if item["expect"] not in tool_names and case_identity(item) not in kept:
            raise ValueError(f"Unknown tool: {item['expect']}")
        ids.add(item["id"])
        prompts.add(item["prompt"].casefold())
        validated.append(item)
    return validated


class Sources:
    """The files the console writes for the user: the cases, and tool descriptions in the server's source.

    Plain writes, no git: the project is the user's, and so is what they commit. A write is refused when the
    file changed since it was read, so an edit made elsewhere is never overwritten.
    """

    def __init__(self, spec: RoutingSpec, offered: list[str] | None = None) -> None:
        self.spec = spec
        # The tools the eval offers, by name, which a case may expect. None: the ones the source declares.
        self.offered = offered

    def tools(self) -> list[dict]:
        if self.offered is None:
            return [{k: v for k, v in item.items() if k not in ("path", "node", "span")}
                    for item in descriptions(self.spec).values()]
        try:
            source = descriptions(self.spec, loose=True) if (self.spec.cwd / self.spec.descriptions).is_dir() else {}
        except ValueError:
            source = {}
        return [{"name": name, "title": source[name]["title"], "description": source[name]["description"],
                 "revision": source[name]["revision"]} if name in source else {"name": name, "title": name}
                for name in self.offered]

    def write(self, path: Path, expected: str, updated: str, *, create: bool = False) -> None:
        """`expected` is the revision the caller read; `create` lets a missing file be written as new."""
        if not path.exists() and not create:
            raise ValueError(f"{path.name} does not exist")
        current = path.read_text() if path.exists() else ""
        if revision(current) != expected:
            raise ValueError("This file changed since you opened it. Reload before saving.")
        if updated != current:
            atomic_write(path, updated)

    def catalog(self) -> dict:
        source = self.spec.fixture.read_text()
        return {"revision": revision(source), "cases": json.loads(source), "tools": self.tools()}

    def save_cases(self, expected: str, rows: list) -> dict:
        # A case saved before keeps its tool, offered or not: a server that dropped a tool must not block every
        # other edit. New and changed cases must expect a tool on offer.
        try:
            stored = json.loads(self.spec.fixture.read_text())
        except (ValueError, OSError):
            stored = []
        kept = {case_identity(case) for case in stored if isinstance(case, dict)}
        rows = validate_cases(rows, {tool["name"] for tool in self.tools()}, kept)
        self.write(self.spec.fixture, expected, json.dumps(rows, indent=2, ensure_ascii=False) + "\n")
        return self.catalog()

    def apply_description(self, name: str, expected: str, original: str, proposed: str) -> dict:
        """Write one tool's description into the source it is declared in; where, and the file's new revision."""
        tool = descriptions(self.spec, loose=True).get(name)
        if tool is None or not self._editable(tool):
            raise ValueError("No editable source description for this tool")
        if tool["revision"] != expected or tool["description"] != original:
            raise ValueError("The source description changed. Read it again before saving.")
        if not isinstance(proposed, str) or not proposed.strip():
            raise ValueError("The description cannot be empty")
        path = tool["path"]
        if "span" in tool:
            updated = ts_source.rewritten(path.read_text(), path.suffix, tool["span"], proposed.strip())
        else:
            updated = _rewritten(path.read_text(), tool, proposed.strip())
            ast.parse(updated)
        self.write(path, expected, updated)
        return {"tool": name, "path": self._shown(path), "revision": revision(updated)}

    def sources(self) -> dict:
        """Every tool whose description the console can rewrite, and where it lives."""
        return {"tools": [{"name": name, "title": tool["title"], "description": tool["description"],
                           "revision": tool["revision"], "declared": tool.get("node", tool.get("span")) is not None,
                           "path": self._shown(tool["path"])}
                          for name, tool in sorted(descriptions(self.spec, loose=True).items()) if self._editable(tool)]}

    @staticmethod
    def _editable(tool: dict) -> bool:
        """A Python tool takes a description= even without one; a TypeScript one needs a literal to replace."""
        return tool.get("span") is not None if "span" in tool else True

    def _shown(self, path: Path) -> str:
        try:
            return str(path.resolve().relative_to(self.spec.cwd.resolve()))
        except ValueError:
            return str(path)
