"""The search: a population of designs, ranked on what the game says they did.

Nothing in here knows what a conveyor is for, which way a drill faces, or that the two go
together. The rules of the game are the entire fitness function, so whatever survives is
the forge's own answer rather than a blueprint copied from someone who already knew one.

The approach is not new. [Reid et al. (2021)](https://arxiv.org/abs/2102.04871) benchmarked
simulated annealing, genetic programming and evolutionary reinforcement learning on exactly
this problem in Factorio, the "logistic transport belt problem", and found search beating
general-purpose learning on it. What is here is that idea, in Mindustry, scored by running
the game rather than by a model of it.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Callable

from forge.layout import (
    Design,
    Layout,
    cross,
    cross_designs,
    mutate,
    mutate_design,
    random_design,
    random_layout,
)
from forge.objective import Measurement
from forge.spec import Spec


def standing(candidate) -> int:
    """How big the design really is: what the engine accepted, not what it asked for.

    The two part company the moment a block lands on a tile something else already holds,
    and every refusal widens the gap. Kept in one place because scoring on one figure and
    publishing the other advertises a seventeen block schematic that stands twelve, which
    is a lie in exactly the column a reader is choosing on.
    """
    return candidate.blocks_standing or candidate.used()


def measurement_of(candidate, spec: Spec) -> Measurement:
    return Measurement(
        delivered=candidate.delivered or 0,
        blocks=standing(candidate),
        stuck=candidate.stuck,
        ticks=spec.ticks,
    )


@dataclass
class Population:
    """A generation of designs, and the rules for making the next one."""

    spec: Spec
    score: Callable[[Measurement], float]
    size: int = 48
    elite: int = 6
    tournament: int = 3
    #: "cells" writes a design one square at a time, "parts" writes it as machines and
    #: lines. Both are kept because the second is only interesting next to the first.
    genome: str = "parts"
    rng: random.Random = field(default_factory=random.Random)

    members: list = field(default_factory=list)
    generation: int = 0

    def fitness(self, candidate) -> float:
        if candidate.delivered is None:
            return float("-inf")
        return self.score(measurement_of(candidate, self.spec))

    def seed(self) -> list:
        make = random_design if self.genome == "parts" else random_layout
        self.members = [make(self.spec.width, self.spec.height, self.spec.palette, self.rng)
                        for _ in range(self.size)]
        return self.members

    def _pick(self, ranked: list):
        """A parent, by tournament.

        Tournament rather than fitness-proportionate, because early on almost every design
        delivers exactly nothing and a proportionate draw over a column of zeros is a
        uniform draw. A tournament still prefers the better of a few, whatever the scale.
        """
        contenders = self.rng.sample(ranked, min(self.tournament, len(ranked)))
        return max(contenders, key=self.fitness)

    def advance(self) -> list:
        ranked = sorted(self.members, key=self.fitness, reverse=True)

        survivors = []
        for original in ranked[:self.elite]:
            kept = original.copy()
            # The whole measurement travels, not part of it. Copying only the delivery
            # leaves a survivor billed for nothing, so a design charged for seventy blocks
            # comes back free and outranks the honest candidates behind it.
            kept.delivered = original.delivered
            kept.blocks_standing = original.blocks_standing
            kept.stuck = original.stuck
            kept.placed = original.placed
            survivors.append(kept)

        breed = cross_designs if self.genome == "parts" else cross
        change = mutate_design if self.genome == "parts" else mutate

        children = []
        while len(children) + len(survivors) < self.size:
            child = breed(self._pick(ranked), self._pick(ranked), self.rng)
            children.append(change(child, self.rng))

        self.members = survivors + children
        self.generation += 1
        return self.members

    def best(self):
        measured = [m for m in self.members if m.delivered is not None]
        return max(measured, key=self.fitness) if measured else None

    def report(self) -> dict:
        """One line of history, kept as data so a run can be read after it ends."""
        best = self.best()
        scores = [self.fitness(m) for m in self.members if m.delivered is not None]
        return {
            "generation": self.generation,
            "best_delivered": best.delivered if best else 0,
            "best_blocks": standing(best) if best else 0,
            "best_score": round(max(scores), 3) if scores else 0.0,
            "mean_score": round(sum(scores) / len(scores), 3) if scores else 0.0,
            "working": sum(1 for m in self.members if (m.delivered or 0) > 0),
            "size": len(self.members),
            # Printed beside the score on purpose. A generation whose score is high and
            # whose delivery is not has found a way to be paid for something other than
            # the objective, and that has happened here before.
            "most_stuck": max((m.stuck for m in self.members), default=0),
        }
