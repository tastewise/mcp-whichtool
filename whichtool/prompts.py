"""Terminal questions. Each one refuses a pipe, which cannot answer it."""

import getpass
import sys

DIM = "\x1b[2m"
BOLD = "\x1b[1m"
RESET = "\x1b[0m"


class NotATerminal(Exception):
    """A command that asks questions; a pipe cannot answer them."""


def require_terminal() -> None:
    if not sys.stdin.isatty():
        raise NotATerminal("this command asks questions — run it in a terminal.")


def ask_secret(question: str) -> str:
    """Read without echoing. A secret typed here must not survive in the scrollback."""
    require_terminal()
    return getpass.getpass(f"  {question}\n  › ").strip()


def ask_text(question: str, default: str = "") -> str:
    require_terminal()
    shown = f"  {question}" + (f" {DIM}[{default}]{RESET}" if default else "")
    return input(f"{shown}\n  › ").strip() or default


def ask_yes_no(question: str, default: bool = True) -> bool:
    require_terminal()
    suffix = "[Y/n]" if default else "[y/N]"
    answer = input(f"  {question} {DIM}{suffix}{RESET} ").strip().lower()
    return default if not answer else answer.startswith("y")
