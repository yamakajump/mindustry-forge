"""What "the best design" means, since it means several incompatible things.

The fastest design and the smallest one are almost never the same. A design that fills a
belt might sprawl across sixty tiles; a design that fits in eight might deliver a third as
much. Neither is wrong, and which you want depends on why you are asking.

So the objective is a parameter, not a constant. Every one of them takes the same
measurement, taken by the game, and turns it into one number to rank on.

Two rules hold for all of them:

- **Nothing that fails to produce can win.** A design that delivers zero scores at or
  below zero, however elegant, however cheap.
- **A hint may never pay better than the goal.** Partial credit for work in progress is
  what lets a search climb out of the flat zero every incomplete design shares. Left
  uncapped it becomes the thing being optimised: measured on an earlier version of this
  search, a population settled at a mean score of which 89% was ore sitting in belts going
  nowhere, against a twentieth of that actually delivered. It had stopped building lines
  and started hoarding.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable


@dataclass
class Measurement:
    """What the game reported about one candidate."""

    #: Units of the target item that left through the output port.
    delivered: int
    #: Blocks the engine accepted. What was asked for and refused is not charged.
    blocks: int
    #: Items sitting inside the design, going nowhere. Evidence of being close.
    stuck: int = 0
    #: Ticks it was given, so rates can be compared across specifications.
    ticks: int = 1800

    @property
    def per_second(self) -> float:
        return self.delivered / max(1e-9, self.ticks / 60.0)


#: How much stuck material the partial credit will look at, and no more.
STUCK_CAP = 60

#: What a unit of stuck material is worth against a unit delivered.
STUCK_WORTH = 0.05


def _hint(measurement: Measurement) -> float:
    """Partial credit for a design that is close, bounded so it can never be a strategy."""
    return STUCK_WORTH * min(measurement.stuck, STUCK_CAP)


def throughput(block_cost: float = 0.05) -> Callable[[Measurement], float]:
    """As much as possible, with a light penalty for sprawl.

    The default objective. The penalty is there to break ties rather than to shape the
    answer: without any, two designs that deliver the same are equal and the population
    drifts towards whichever sprawling one was found first and never tidies it. Read it
    against what a delivery is currently worth: at 0.05 a block costs more than it earns
    while deliveries are in single figures, and nothing at all once they reach hundreds.
    """

    def score(m: Measurement) -> float:
        return m.delivered + _hint(m) - block_cost * m.blocks

    return score


def compact(min_rate: float = 0.5) -> Callable[[Measurement], float]:
    """The smallest thing that still works, where working means a rate you name.

    Delivery is a gate, not a goal. Below `min_rate` units per second a design does not
    count, and it is ranked by how far below so the search can still climb towards the
    gate rather than facing a cliff. Above it, fewer blocks wins outright.

    The gate is an absolute rate rather than a fraction of the best seen, because an
    objective here is a function of one measurement and knows nothing about the rest of
    the population. Naming the rate is therefore part of asking the question: "the
    smallest design" is not a well-posed request until you say the smallest that does
    what.

    An earlier version of this used `min_rate` as a ceiling on the rate instead, which
    reads almost the same and is not: everything that delivered a single unit passed, and
    the ranking became "the smallest design that delivers at least one thing", which is a
    drill with nowhere to send its ore.
    """

    def score(m: Measurement) -> float:
        if m.per_second < min_rate:
            # Ordered by shortfall, so a design that nearly makes the gate outranks one
            # that does not, and both stay below anything that clears it.
            return _hint(m) - 1000.0 * (1.0 + min_rate - m.per_second)
        return 1000.0 - m.blocks

    return score


def density() -> Callable[[Measurement], float]:
    """The most output per block. What you want when the space is what is scarce."""

    def score(m: Measurement) -> float:
        if m.delivered <= 0:
            return _hint(m) - 1000.0
        return m.delivered / max(1, m.blocks) * 100.0

    return score


def rate_at_most(blocks: int) -> Callable[[Measurement], float]:
    """As much as possible, inside a budget.

    A hard ceiling rather than a penalty, because a budget is usually a real constraint:
    the space is that big and no bigger. Over it, nothing counts.
    """

    def score(m: Measurement) -> float:
        if m.blocks > blocks:
            return -1000.0 + (blocks - m.blocks)
        return m.delivered + _hint(m)

    return score


OBJECTIVES: dict[str, Callable[..., Callable[[Measurement], float]]] = {
    "throughput": throughput,
    "compact": compact,
    "density": density,
    "budget": rate_at_most,
}


def get(name: str, **options) -> Callable[[Measurement], float]:
    if name not in OBJECTIVES:
        raise KeyError(f"unknown objective {name!r}, known: {sorted(OBJECTIVES)}")
    return OBJECTIVES[name](**options)
