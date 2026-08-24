"""What "best" is allowed to mean, and what it must never be allowed to mean.

The partial credit is the dangerous part. It exists because every incomplete design
delivers exactly zero, and a search cannot climb a flat surface. Left uncapped it stops
being a hint and becomes the goal: a population once settled at a score that was 89% ore
asleep in conveyors, against a twentieth of that actually delivered. It had stopped
building lines and started hoarding.

So the cap is not a detail, it is the whole safety property, and it is pinned here.
"""

from __future__ import annotations

import pytest

from forge.objective import (
    STUCK_CAP,
    STUCK_WORTH,
    Measurement,
    compact,
    density,
    get,
    rate_at_most,
    throughput,
)


def measured(delivered: int, blocks: int, stuck: int = 0, ticks: int = 1800) -> Measurement:
    return Measurement(delivered=delivered, blocks=blocks, stuck=stuck, ticks=ticks)


# The cap ----------------------------------------------------------------------------


def test_hoarding_stops_paying_at_the_cap():
    score = throughput()
    at_the_cap = score(measured(0, 10, stuck=STUCK_CAP))

    assert score(measured(0, 10, stuck=STUCK_CAP * 100)) == at_the_cap
    assert score(measured(0, 10, stuck=10 ** 9)) == at_the_cap


def test_all_the_hoarding_in_the_world_is_worth_three_deliveries():
    """The ceiling in units of the thing actually being asked for."""
    assert STUCK_CAP * STUCK_WORTH == pytest.approx(3.0)


def test_a_design_that_delivers_enough_beats_any_hoarder_of_equal_size():
    score = throughput()
    hoarder = measured(0, 20, stuck=10 ** 6)
    worker = measured(4, 20, stuck=0)

    assert score(worker) > score(hoarder)


def test_building_something_that_barely_works_beats_building_nothing():
    """The other half of the same knob, and the two pull against each other.

    Uncapped, the block cost made emptiness optimal: three delivered across seventy
    blocks scored below the empty rectangle, and an early generation is exactly where a
    search cannot afford to be told that the answer is to stop. Capped against delivery
    alone it swung the other way, because a design that delivers nothing then pays
    nothing for its blocks. The ceiling has to sit on what was earned.
    """
    score = throughput(block_cost=0.05)

    assert score(measured(3, 70)) > score(measured(0, 0))
    assert score(measured(3, 70)) > 0


@pytest.mark.parametrize("objective", [compact(), density()], ids=["compact", "density"])
def test_delivering_nothing_cannot_win_however_small(objective):
    """A gate, not a penalty. The empty rectangle is very small and very useless."""
    assert objective(measured(0, 0, stuck=10 ** 6)) < 0
    assert objective(measured(0, 1)) < objective(measured(20, 60))


# Ordering under each objective --------------------------------------------------------


def test_throughput_prefers_more_delivered():
    score = throughput()
    assert score(measured(50, 20)) > score(measured(49, 20))


def test_throughput_breaks_ties_towards_the_tidier_design():
    score = throughput()
    assert score(measured(50, 20)) > score(measured(50, 21))


def test_the_sprawl_penalty_never_outweighs_real_delivery():
    """It is there to break ties, not to shape the answer."""
    score = throughput()
    sprawling_and_productive = measured(300, 140)
    tidy_and_idle = measured(1, 3)

    assert score(sprawling_and_productive) > score(tidy_and_idle)


def test_compact_gate_is_a_rate_not_a_single_delivery():
    """One item over 1800 ticks is 0.03/s. It must not pass a 0.5/s gate."""
    score = compact(min_rate=0.5)

    assert score(measured(1, 3)) < 0
    assert score(measured(20, 12)) == pytest.approx(988.0)
    assert score(measured(60, 90)) == pytest.approx(910.0)


def test_compact_prefers_the_smaller_of_two_that_clear_the_gate():
    score = compact(min_rate=0.5)
    assert score(measured(20, 12)) > score(measured(60, 90))


def test_below_the_gate_compact_ranks_by_how_close_it_got():
    """A cliff gives the search nothing to climb. A slope gives it a direction."""
    score = compact(min_rate=1.0)
    nearly = score(measured(29, 5))
    far = score(measured(2, 5))

    assert nearly > far
    assert nearly < score(measured(30, 5))


def test_density_rewards_output_per_block():
    score = density()
    assert score(measured(100, 10)) > score(measured(100, 50))
    assert score(measured(100, 10)) == pytest.approx(1000.0)


def test_a_budget_is_a_ceiling_and_not_a_penalty():
    score = rate_at_most(blocks=20)

    assert score(measured(500, 21)) < 0
    assert score(measured(1, 20)) > score(measured(500, 21))


def test_going_further_over_budget_is_ranked_worse():
    score = rate_at_most(blocks=20)
    assert score(measured(500, 21)) > score(measured(500, 80))


# The registry -------------------------------------------------------------------------


def test_every_named_objective_can_be_built_and_called():
    for name in ("throughput", "compact", "density"):
        assert isinstance(get(name)(measured(10, 10)), float)
    assert isinstance(get("budget", blocks=30)(measured(10, 10)), float)


def test_an_unknown_objective_says_what_it_knows():
    with pytest.raises(KeyError, match="budget"):
        get("cheapest")


def test_per_second_scales_with_the_time_it_was_given():
    assert measured(60, 0, ticks=3600).per_second == pytest.approx(1.0)
    assert measured(60, 0, ticks=1800).per_second == pytest.approx(2.0)
