"""Who hands items to whom.

Topology only. A wrong answer here and a wrong answer in the flow solver are very
different bugs, which is why they are separated and tested apart.
"""

from __future__ import annotations

import pytest

from analyser import graph
from analyser.blocks import catalogue


@pytest.fixture(scope="module")
def known():
    return catalogue()


def test_the_catalogue_came_from_the_game(known):
    """Every other calculator retyped these numbers from a wiki, and a retyped table drifts."""
    assert known.build == 159
    assert known.block("conveyor").rate == pytest.approx(6.5)
    assert known.block("titanium-conveyor").rate == pytest.approx(10.0)
    assert known.block("graphite-press").inputs == {"coal": 2}
    assert known.block("graphite-press").outputs == {"graphite": 1}


def test_a_press_states_its_rate_per_second(known):
    """Ninety ticks a craft, so two thirds of a graphite a second, and one and a third coal."""
    press = known.block("graphite-press")
    assert press.produces("graphite") == pytest.approx(60 / 90)
    assert press.consumes("coal") == pytest.approx(2 * 60 / 90)


def test_a_belt_hands_forward_and_refuses_from_the_front(known):
    """Belt facing right, something to its right pushing left, and nothing moves.

    Built without this rule, a graph reports a working loop between two belts pointing at
    each other, which is a factory nobody has ever built on purpose.
    """
    made = graph.build([(0, 0, "conveyor", 0), (1, 0, "conveyor", 2)], known)
    assert made.edges == [], "two belts facing each other carry nothing"

    line = graph.build([(0, 0, "conveyor", 0), (1, 0, "conveyor", 0)], known)
    assert line.edges == [(0, 1)]


def test_a_drill_offloads_to_whatever_touches_it(known):
    """Two belts beside a drill are both fed, which is how a real line is doubled up."""
    made = graph.build([
        (0, 0, "mechanical-drill", 0),
        (2, 0, "conveyor", 0),
        (2, 1, "conveyor", 0),
    ], known)
    assert sorted(made.edges) == [(0, 1), (0, 2)]


def test_a_two_wide_drill_covers_four_tiles(known):
    """Stored on its centre and offset, so a belt laid inside it would be laid in a drill."""
    made = graph.build([(4, 4, "mechanical-drill", 0)], known)
    assert set(made.nodes[0].footprint) == {(4, 4), (5, 4), (4, 5), (5, 5)}


def test_nothing_feeds_a_drill(known):
    """A belt into a drill is a wasted belt, and the report should say so."""
    made = graph.build([(0, 0, "conveyor", 0), (1, 0, "mechanical-drill", 0)], known)
    assert made.edges == []


def test_a_press_is_fed_and_hands_on(known):
    made = graph.build([
        (0, 0, "conveyor", 0),
        (1, 0, "graphite-press", 0),
        (3, 0, "conveyor", 0),
    ], known)
    assert (0, 1) in made.edges, "coal goes into the press"
    assert (1, 2) in made.edges, "graphite comes out of it"


def test_an_unknown_block_blocks_its_tile_rather_than_vanishing(known):
    """A schematic can hold a block from a mod. Refusing the whole thing would make the
    tool useless on exactly the creative builds worth looking at."""
    made = graph.build([(0, 0, "conveyor", 0), (1, 0, "something-from-a-mod", 0)], known)
    assert len(made.nodes) == 2
    assert made.edges == [], "and nothing flows into it"


def test_orphans_are_named(known):
    """The commonest thing wrong with a shared schematic, and no existing tool reports it."""
    made = graph.build([
        (0, 0, "mechanical-drill", 0),
        (2, 0, "conveyor", 0),
        (9, 9, "conveyor", 0),
    ], known)
    assert graph.orphans(made) == [2]
