"""Tool declarations in TypeScript and JavaScript, read with tree-sitter.

The shapes MCP servers in those languages declare tools with:

- `server.registerTool("name", {title, description, inputSchema}, handler)`, the official SDK's;
- `server.tool("name", "description", schema, handler)`, its older form, the description optional;
- an object with a string `name` and `description` and another key a tool has (`inputSchema`,
  `parameters`, `execute`, `annotations`): a low-level `tools/list` handler, or FastMCP's `addTool`.

A description is read when it is a string, a template with no substitution, or a `+` of those.
Anything else (a variable, a call) is no description we can read or rewrite. `span` is where the
description sits, in bytes, so an edit replaces exactly it.
"""

import json
import re

import tree_sitter
import tree_sitter_typescript

TS = tree_sitter.Language(tree_sitter_typescript.language_typescript())
# TSX reads plain JavaScript too, JSX included.
TSX = tree_sitter.Language(tree_sitter_typescript.language_tsx())
GRAMMARS = {".ts": TS, ".mts": TS, ".cts": TS, ".tsx": TSX, ".js": TSX, ".jsx": TSX, ".mjs": TSX, ".cjs": TSX}
TOOL_KEYS = frozenset({"inputSchema", "parameters", "execute", "annotations"})
_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f", "v": "\v", "0": "\0", "\n": ""}


def supported(name: str) -> bool:
    lowered = name.lower()
    return not lowered.endswith(".d.ts") and any(lowered.endswith(suffix) for suffix in GRAMMARS)


def _unescaped(escape: str) -> str:
    body = escape[1:]
    if body in _ESCAPES:
        return _ESCAPES[body]
    if match := re.fullmatch(r"u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})", body):
        return chr(int(next(group for group in match.groups() if group), 16))
    return body


def text_of(node: tree_sitter.Node | None) -> str | None:
    """The string a literal expression spells, or None when it is computed."""
    if node is None:
        return None
    if node.type == "parenthesized_expression" and node.named_child_count == 1:
        return text_of(node.named_children[0])
    if node.type == "binary_expression" and node.child_by_field_name("operator").type == "+":
        left, right = text_of(node.child_by_field_name("left")), text_of(node.child_by_field_name("right"))
        return None if left is None or right is None else left + right
    if node.type not in ("string", "template_string"):
        return None
    parts = []
    for child in node.named_children:
        if child.type == "string_fragment":
            parts.append(child.text.decode())
        elif child.type == "escape_sequence":
            parts.append(_unescaped(child.text.decode()))
        else:
            return None  # a substitution: computed at run time
    return "".join(parts)


def _fields(node: tree_sitter.Node) -> dict[str, tree_sitter.Node]:
    found = {}
    for pair in node.named_children:
        if pair.type != "pair":
            continue
        key = pair.child_by_field_name("key")
        name = key.text.decode() if key.type == "property_identifier" else text_of(key)
        if name is not None:
            found[name] = pair.child_by_field_name("value")
    return found


def _walk(node: tree_sitter.Node):
    yield node
    for child in node.named_children:
        yield from _walk(child)


def in_source(source: str, suffix: str, *, loose: bool = False) -> dict[str, dict]:
    """What one file declares: tool name -> title, description and its span. Loose keeps tools with no description."""
    tree = tree_sitter.Parser(GRAMMARS[suffix.lower()]).parse(source.encode())
    found: dict[str, dict] = {}

    def add(name: str | None, title: str | None, description: tree_sitter.Node | None) -> None:
        if not name:
            return
        text = text_of(description)
        if text is None and not loose:
            return
        if name in found:
            raise ValueError(f"Ambiguous description source for {name}")
        span = (description.start_byte, description.end_byte) if text is not None else None
        found[name] = {"name": name, "title": title or name, "description": text or "", "span": span}

    claimed: set[tuple[int, int]] = set()
    for node in _walk(tree.root_node):
        if node.type == "call_expression":
            function, arguments = node.child_by_field_name("function"), node.child_by_field_name("arguments")
            method = function.child_by_field_name("property") if function.type == "member_expression" else None
            args = arguments.named_children if arguments is not None and arguments.type == "arguments" else []
            if method is None or method.text not in (b"registerTool", b"tool") or not args:
                continue
            name = text_of(args[0])
            config = args[1] if len(args) > 1 else None
            if method.text == b"registerTool" and config is not None and config.type == "object":
                claimed.add((config.start_byte, config.end_byte))
                fields = _fields(config)
                add(name, text_of(fields.get("title")), fields.get("description"))
            elif method.text == b"tool":
                add(name, None, config if config is not None and text_of(config) is not None else None)
        elif node.type == "object" and (node.start_byte, node.end_byte) not in claimed:
            fields = _fields(node)
            if "description" in fields and TOOL_KEYS & fields.keys():
                add(text_of(fields.get("name")), text_of(fields.get("title")), fields["description"])
    return found


def rewritten(source: str, suffix: str, span: tuple[int, int], text: str) -> str:
    """The file with the description at `span` replaced by `text`, as one string literal."""
    raw = source.encode()
    updated = (raw[:span[0]] + json.dumps(text, ensure_ascii=False).encode() + raw[span[1]:]).decode()
    if tree_sitter.Parser(GRAMMARS[suffix.lower()]).parse(updated.encode()).root_node.has_error:
        raise ValueError("The rewritten file would not parse")
    return updated
