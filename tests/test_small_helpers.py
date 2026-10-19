"""fingerprint: which code a running console loaded."""

from pathlib import Path

from whichtool import fingerprint


def test_the_fingerprint_moves_with_the_python_and_only_the_python(tmp_path: Path) -> None:
    (tmp_path / "a.py").write_text("x = 1\n")
    (tmp_path / "page.html").write_text("<p>one</p>")
    before = fingerprint.of(tmp_path)

    (tmp_path / "page.html").write_text("<p>two</p>")
    assert fingerprint.of(tmp_path) == before

    (tmp_path / "a.py").write_text("x = 2\n")
    assert fingerprint.of(tmp_path) != before
    assert len(fingerprint.RUNNING) == 16
