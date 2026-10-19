"""Which code a console runs, so that one older than the code on disk can be told apart.

A running console loads its Python once, at start, but reads its static files on every
request. Pull new code under it and it serves the new page from its old Python — the
page then reads fields the old code never sends.
"""

import hashlib
from pathlib import Path

PACKAGE = Path(__file__).resolve().parent


def of(root: Path = PACKAGE) -> str:
    """A digest of the Python under `root`. Static files are left out: they never go stale."""
    digest = hashlib.sha256()
    for path in sorted(root.rglob("*.py")):
        if "__pycache__" in path.parts:
            continue
        digest.update(str(path.relative_to(root)).encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()[:16]


# What this process loaded, taken once as it starts.
RUNNING = of()
