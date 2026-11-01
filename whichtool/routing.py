"""The tool-routing eval, run from here."""

import json
import time
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path

from whichtool.config import RoutingSpec


@dataclass(frozen=True)
class Case:
    id: str
    prompt: str
    expect: str

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


def cases(spec: RoutingSpec) -> tuple[Case, ...]:
    if not spec.fixture.exists():
        return ()
    try:
        found = json.loads(spec.fixture.read_text())
    except (ValueError, OSError):
        return ()
    if not isinstance(found, list):
        return ()
    return tuple(
        Case(id=str(c["id"]), prompt=str(c["prompt"]), expect=str(c["expect"]))
        for c in found
        if isinstance(c, dict) and {"id", "prompt", "expect"} <= set(c)
    )


def selects(spec: RoutingSpec, filter: str) -> tuple[Case, ...]:
    """The cases a filter names, by substring of the id. `or` joins several, so a filter naming
    two cases runs, and is billed as, both."""
    wanted = filter.strip()
    if not wanted:
        return cases(spec)
    terms = [term for term in (part.strip() for part in wanted.split(" or ")) if term]
    return tuple(case for case in cases(spec) if any(term in case.id for term in terms))


def result_path(spec: RoutingSpec, when: float, model: str = "") -> Path:
    """Named by time, then model: two models run in the same second must not share a file."""
    stamp = time.strftime("%Y-%m-%dT%H-%M-%S", time.localtime(when))
    slug = "".join(c if c.isalnum() or c in "-." else "-" for c in model)
    return spec.results / (f"{stamp}-{slug}.json" if slug else f"{stamp}.json")


_PRICED = {
    "input_tokens": "input",
    "output_tokens": "output",
    "cache_creation_input_tokens": "cache_write",
    "cache_read_input_tokens": "cache_read",
}


@dataclass(frozen=True)
class Outcome:
    id: str
    prompt: str
    expect: str
    picks: tuple[str | None, ...]
    hits: int
    passed: bool

    def votes(self) -> list[tuple[str, int]]:
        counted = Counter(pick for pick in self.picks if pick)
        return counted.most_common()

    def as_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "prompt": self.prompt,
            "expect": self.expect,
            "hits": self.hits,
            "passed": self.passed,
            "votes": [{"tool": tool, "count": n} for tool, n in self.votes()],
        }


@dataclass(frozen=True)
class Result:
    provider: str
    model: str
    samples: int
    usage: dict[str, int]
    outcomes: tuple[Outcome, ...]

    @property
    def misroutes(self) -> list[Outcome]:
        return [o for o in self.outcomes if not o.passed]

    @property
    def weak(self) -> list[Outcome]:
        return [o for o in self.outcomes if o.passed and o.hits < self.samples]

    @property
    def total(self) -> int:
        return len(self.outcomes)

    @property
    def passed(self) -> int:
        return self.total - len(self.misroutes)

    def as_dict(self) -> dict[str, object]:
        return {
            "provider": self.provider,
            "model": self.model,
            "samples": self.samples,
            "usage": self.usage,
            "total": self.total,
            "passed": self.passed,
            "misroutes": [o.as_dict() for o in self.misroutes],
            "weak": [o.as_dict() for o in self.weak],
        }


def _int(value: object, default: int = 0) -> int:
    """A value that will not coerce to int reads as the default, never raises."""
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def read(path: Path) -> Result | None:
    """A result that is absent, truncated or from a run that died is simply nothing."""
    if not path.exists():
        return None
    try:
        found = json.loads(path.read_text())
    except (ValueError, OSError):
        return None
    if not isinstance(found, dict) or "cases" not in found:
        return None
    found_cases = found.get("cases")
    if not isinstance(found_cases, list):
        return None
    usage_raw = found.get("usage")
    return Result(
        provider=str(found.get("provider", "")),
        model=str(found.get("model", "")),
        samples=_int(found.get("samples", 0)),
        usage={k: _int(v) for k, v in usage_raw.items()} if isinstance(usage_raw, dict) else {},
        outcomes=tuple(
            Outcome(
                id=str(c.get("id", "")),
                prompt=str(c.get("prompt", "")),
                expect=str(c.get("expect", "")),
                picks=tuple(c.get("picks", [])),
                hits=_int(c.get("hits", 0)),
                passed=bool(c.get("passed", False)),
            )
            for c in found_cases
            if isinstance(c, dict)
        ),
    )


def latest_for(spec: RoutingSpec, model: str) -> Path | None:
    """The newest run's file for one model — the newest run overall may be a different model."""
    if not spec.results.exists():
        return None
    for run in sorted(spec.results.glob("*.json"), reverse=True):
        found = read(run)
        if found and found.model == model:
            return run
    return None


def _priced_total(
    prices: dict[str, float] | None, usage: dict[str, int], mapping: dict[str, str]
) -> float | None:
    if not prices or not all(key in prices for key in mapping.values()):
        return None
    total = sum(usage.get(counter, 0) * prices[key] / 1_000_000 for counter, key in mapping.items())
    return round(total, 6)


_MARGINAL = {k: v for k, v in _PRICED.items() if k != "cache_creation_input_tokens"}


def cost(spec: RoutingSpec, model: str, usage: dict[str, int]) -> float | None:
    """The true total spend of a run, cache write included — None when a price is missing."""
    return _priced_total(spec.prices.get(model), usage, _PRICED)


# A call before any run: a few tools and a short prompt in, one tool call out.
_TYPICAL_CALL = {"calls": 1, "input_tokens": 2000, "output_tokens": 150}


def _newest_usage(spec: RoutingSpec, model: str | None) -> dict[str, int] | None:
    """The token counts of the newest run with calls, of `model`, or of any model when None."""
    if not spec.results.exists():
        return None
    for run in sorted(spec.results.glob("*.json"), reverse=True):
        found = read(run)
        if found and found.usage.get("calls") and (model is None or found.model == model):
            return found.usage
    return None


def per_call(spec: RoutingSpec, model: str) -> float | None:
    """The marginal cost of one call: the cache write is a one-off, never amortized into this.

    Priced at `model`'s own rates, on the tokens of its newest run; before it has one, on another
    model's (the tools and prompts are the same), then on a typical call.
    """
    if model not in spec.prices:
        return None
    own = _newest_usage(spec, model)
    if own is None and spec.default_usd_per_call is not None:
        return spec.default_usd_per_call
    usage = own or _newest_usage(spec, None) or _TYPICAL_CALL
    marginal = _priced_total(spec.prices.get(model), usage, _MARGINAL)
    if marginal is None:
        return spec.default_usd_per_call
    return round(marginal / usage["calls"], 6)
