"""How much moves, and what stops more from moving.

Every other Mindustry calculator answers a different question: how many machines for a
clean ratio. That is arithmetic about a factory nobody has built. These are about the one
in front of you.
"""

from __future__ import annotations

import pytest

from analyser import flow, graph
from analyser.blocks import catalogue
from analyser.flow import Rates


@pytest.fixture(scope="module")
def known():
    return catalogue()


def feed(item: str, rate: float) -> Rates:
    made = Rates()
    made.add(item, rate)
    return made


def test_a_belt_carries_what_it_is_given(known):
    made = graph.build([(x, 0, "conveyor", 0) for x in range(4)], known)
    out = flow.solve(made, {0: feed("copper", 3.0)}, known)

    assert out.settled
    assert out.delivered.of("copper") == pytest.approx(3.0)


def test_a_belt_caps_at_its_own_speed(known):
    """The commonest bottleneck in the game and the one players most often miss."""
    made = graph.build([(x, 0, "conveyor", 0) for x in range(3)], known)
    out = flow.solve(made, {0: feed("copper", 40.0)}, known)

    assert out.delivered.of("copper") == pytest.approx(6.5), "a belt moves 6.5 a second"


def test_a_titanium_belt_carries_more(known):
    """And the difference comes from the game, not from a number typed here."""
    made = graph.build([(x, 0, "titanium-conveyor", 0) for x in range(3)], known)
    out = flow.solve(made, {0: feed("copper", 40.0)}, known)

    assert out.delivered.of("copper") == pytest.approx(10.0)


def test_a_press_turns_coal_into_graphite_at_its_own_pace(known):
    """Fed twice what it can use, it still makes one graphite every ninety ticks."""
    made = graph.build([
        (0, 0, "conveyor", 0),
        (1, 0, "graphite-press", 0),
        (3, 0, "conveyor", 0),
    ], known)
    out = flow.solve(made, {0: feed("coal", 40.0)}, known)

    assert out.fed[1] == pytest.approx(1.0), "it is fully fed"
    assert out.delivered.of("graphite") == pytest.approx(60 / 90)
    assert out.delivered.of("coal") == 0.0, "the coal became graphite, it did not pass through"


def test_a_starved_press_is_named_rather_than_averaged(known):
    """"You produce 61% of what you could" is not actionable.

    "The second press is fed 61% of the time" is, and it is the whole reason this reports a
    block rather than a percentage.
    """
    made = graph.build([
        (0, 0, "conveyor", 0),
        (1, 0, "graphite-press", 0),
        (3, 0, "conveyor", 0),
    ], known)
    # A press wants 1.333 coal a second. Give it a third of that.
    out = flow.solve(made, {0: feed("coal", (2 * 60 / 90) / 3)}, known)

    assert out.fed[1] == pytest.approx(1 / 3, rel=1e-3)
    culprit, share = out.bottleneck(made)
    assert made.nodes[culprit].name == "graphite-press"
    assert share == pytest.approx(1 / 3, rel=1e-3)


def test_a_layout_running_flat_out_has_no_bottleneck(known):
    made = graph.build([
        (0, 0, "conveyor", 0),
        (1, 0, "graphite-press", 0),
    ], known)
    out = flow.solve(made, {0: feed("coal", 40.0)}, known)
    assert out.bottleneck(made) is None


def test_a_smelter_runs_at_the_pace_of_its_scarcest_ingredient(known):
    """One coal and two sand a craft. Plenty of coal and no sand makes no silicon."""
    made = graph.build([
        (0, 0, "conveyor", 0),
        (1, 0, "silicon-smelter", 0),
    ], known)
    out = flow.solve(made, {0: feed("coal", 40.0)}, known)

    assert out.fed[1] == pytest.approx(0.0)
    assert out.delivered.of("silicon") == pytest.approx(0.0)


def test_a_belt_ending_in_the_air_still_counts_as_delivered(known):
    """A schematic torn out of a base ends at its own edge, because the rest was not copied.

    Scoring that as nothing delivered would rate every shared schematic at zero, which is
    every schematic this tool exists to look at.
    """
    made = graph.build([(x, 0, "conveyor", 0) for x in range(3)], known)
    out = flow.solve(made, {0: feed("copper", 2.0)}, known)
    assert out.delivered.of("copper") == pytest.approx(2.0)


def test_a_loop_settles_instead_of_running_forever(known):
    """A router pointed back into its own line makes a loop out of an ordinary belt.

    A single forward pass is only right on a graph without one, so the solver iterates, and
    a layout that has not settled is reported as unsettled rather than quietly rounded off.
    """
    made = graph.build([
        (0, 0, "conveyor", 0),
        (1, 0, "router", 0),
        (2, 0, "conveyor", 2),
    ], known)
    out = flow.solve(made, {0: feed("copper", 3.0)}, known)
    assert out.rounds <= flow.ROUNDS
