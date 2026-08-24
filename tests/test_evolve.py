"""The population, and the one bookkeeping mistake that has been made twice.

An elite survivor is carried into the next generation without being re-measured, so its
measurement has to travel with it. `copy()` deliberately does not carry one, because a
child must never inherit its parent's delivery. That puts the burden on `advance`, and it
has been got wrong once per field added: copy the delivery but not the block count and a
design charged for seventy blocks comes back free, outranking every honest candidate
behind it.

So this does not test "delivered survives". It tests that the survivor's score is
unchanged, which is the property that actually matters and the one that catches the next
field somebody adds.
"""

from __future__ import annotations

import random

import pytest

from forge.evolve import Population, measurement_of, standing
from forge.objective import Measurement, throughput
from forge.spec import COPPER_LINE


def populated(size: int = 8, elite: int = 2, seed: int = 0) -> Population:
    population = Population(
        spec=COPPER_LINE,
        score=throughput(),
        size=size,
        elite=elite,
        rng=random.Random(seed),
    )
    population.seed()
    return population


def measure_all(population: Population, deliveries: list[int]) -> None:
    """Stand in for the bench: write a plausible measurement onto every member."""
    for member, delivered in zip(population.members, deliveries):
        member.delivered = delivered
        member.blocks_standing = 10 + delivered
        member.stuck = delivered // 2


# The bookkeeping ----------------------------------------------------------------------


def test_an_elite_survivor_keeps_its_whole_score_not_part_of_it():
    population = populated(size=8, elite=1)
    measure_all(population, [0, 3, 40, 7, 1, 0, 2, 5])

    best = population.best()
    expected = population.fitness(best)
    population.advance()

    survivor = population.members[0]
    assert survivor.delivered == best.delivered
    assert survivor.blocks_standing == best.blocks_standing
    assert survivor.stuck == best.stuck
    assert population.fitness(survivor) == pytest.approx(expected)


def test_a_survivor_is_a_copy_and_not_the_original_object():
    """Mutating a child must never reach back into the generation it came from."""
    population = populated(size=6, elite=1)
    measure_all(population, [0, 0, 30, 0, 0, 0])
    best = population.best()

    population.advance()

    assert population.members[0] is not best


def test_every_field_of_the_measurement_is_carried():
    """Guards the next field somebody adds to a candidate."""
    population = populated(size=6, elite=1)
    measure_all(population, [0, 0, 30, 0, 0, 0])
    best = population.best()
    before = measurement_of(best, population.spec)

    population.advance()

    assert measurement_of(population.members[0], population.spec) == before


def test_children_arrive_unmeasured():
    """A child that inherited a delivery would be paid for work it never did."""
    population = populated(size=8, elite=2)
    measure_all(population, [1, 2, 3, 4, 5, 6, 7, 8])

    population.advance()

    assert all(child.delivered is None for child in population.members[2:])


# The generation ----------------------------------------------------------------------


def test_the_population_holds_its_size_across_generations():
    population = populated(size=12, elite=3)
    for _ in range(5):
        measure_all(population, list(range(12)))
        population.advance()

    assert len(population.members) == 12
    assert population.generation == 5


def test_seeding_produces_a_full_population_of_the_right_shape():
    population = populated(size=10)
    assert len(population.members) == 10
    assert all(m.width == COPPER_LINE.width for m in population.members)
    assert all(m.palette == COPPER_LINE.palette for m in population.members)


def test_an_unmeasured_candidate_never_wins_a_tournament():
    """Until the bench has spoken a design is worth nothing, not worth zero."""
    population = populated(size=6, elite=1)
    measure_all(population, [0, 0, 0, 0, 0, 0])
    population.members[3].delivered = None

    assert population.fitness(population.members[3]) == float("-inf")
    assert population.best() is not population.members[3]


def test_best_is_none_before_anything_has_been_measured():
    population = populated(size=6)
    assert population.best() is None


def test_the_report_prints_stuck_beside_the_score():
    """A generation scoring high without delivering has found another way to be paid."""
    population = populated(size=6, elite=1)
    measure_all(population, [0, 0, 30, 0, 0, 0])

    report = population.report()

    assert report["best_delivered"] == 30
    assert report["working"] == 1
    assert report["most_stuck"] == 15
    assert set(report) >= {"generation", "best_score", "mean_score", "size"}


def test_both_genomes_can_run_a_generation():
    """The cell genome is kept because the part genome is only interesting next to it."""
    for genome in ("parts", "cells"):
        population = Population(
            spec=COPPER_LINE, score=throughput(), size=6, elite=1,
            genome=genome, rng=random.Random(7),
        )
        population.seed()
        measure_all(population, [0, 1, 2, 3, 4, 5])
        population.advance()

        assert len(population.members) == 6


def test_a_run_is_reproducible_from_its_seed():
    """Two runs of the same seed have to agree, or no measurement can be compared."""
    def run() -> list[str]:
        population = populated(size=8, elite=2, seed=42)
        for _ in range(3):
            measure_all(population, list(range(8)))
            population.advance()
        return [m.render() for m in population.members]

    assert run() == run()


def test_the_report_prints_the_blocks_that_stood_not_the_blocks_asked_for():
    """The figure scored and the figure published have to be the same figure.

    A design whose blocks were partly refused asks for more than it stands. Scoring the
    accepted count and printing the requested one advertises a seventeen block schematic
    that holds twelve, which is a lie in exactly the column a reader chooses on.
    """
    population = populated(size=4, elite=1)
    measure_all(population, [0, 0, 30, 0])
    best = population.best()
    best.blocks_standing = 12

    report = population.report()

    assert report["best_blocks"] == 12
    assert best.used() != 12


def test_a_candidate_the_bench_never_charged_falls_back_to_what_it_asked_for():
    """Before the engine has spoken, the requested count is the only figure there is."""
    population = populated(size=4, elite=1)
    measure_all(population, [0, 0, 30, 0])
    best = population.best()
    best.blocks_standing = 0

    assert standing(best) == best.used()
