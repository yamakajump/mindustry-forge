"""How a design is written down, and what it flattens to.

The rotation table is first because it is the one that bites: the natural order to type
is right, left, up, down, and Mindustry does not use it. Getting it wrong prints a column
carrying material upwards as a column pointing sideways, so the best design a run found
reads as nonsense and the search looks broken when it is not.
"""

from __future__ import annotations

import random

import pytest

from forge.layout import (
    CARRIERS,
    ROTATION,
    Design,
    Layout,
    Line,
    Machine,
    cross_designs,
    empty,
    mutate_design,
    random_design,
)

PALETTE = ("air", "conveyor", "mechanical-drill", "junction", "router")


def rotations_of(line: Line) -> list[int]:
    return [rotation for _, _, rotation in line.tiles()]


def points_of(line: Line) -> list[tuple[int, int]]:
    return [(x, y) for x, y, _ in line.tiles()]


# The table itself ------------------------------------------------------------------


def test_rotation_table_is_not_the_obvious_order():
    """Right, up, left, down. Not right, left, up, down."""
    assert ROTATION[(1, 0)] == 0
    assert ROTATION[(0, 1)] == 1
    assert ROTATION[(-1, 0)] == 2
    assert ROTATION[(0, -1)] == 3


# Lines -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    "line,expected",
    [
        (Line(0, 0, 3, 0, "conveyor", True), 0),
        (Line(0, 0, 0, 3, "conveyor", True), 1),
        (Line(3, 0, 0, 0, "conveyor", True), 2),
        (Line(0, 3, 0, 0, "conveyor", False), 3),
    ],
    ids=["right", "up", "left", "down"],
)
def test_a_straight_line_faces_the_way_it_travels(line: Line, expected: int):
    assert rotations_of(line) == [expected] * 4


def test_an_elbow_turns_where_it_turns_and_nowhere_else():
    """Along x to the corner, then up. The last tile keeps the direction it arrived by."""
    line = Line(0, 0, 3, 2, "conveyor", horizontal_first=True)

    assert points_of(line) == [(0, 0), (1, 0), (2, 0), (3, 0), (3, 1), (3, 2)]
    assert rotations_of(line) == [0, 0, 0, 1, 1, 1]


def test_the_elbow_is_the_only_choice_a_line_has():
    """Same endpoints, other elbow: same tiles counted, different route."""
    across = Line(0, 0, 3, 2, "conveyor", horizontal_first=True)
    up_first = Line(0, 0, 3, 2, "conveyor", horizontal_first=False)

    assert points_of(up_first) == [(0, 0), (0, 1), (0, 2), (1, 2), (2, 2), (3, 2)]
    assert len(points_of(across)) == len(points_of(up_first))
    assert points_of(across) != points_of(up_first)


def test_a_line_going_nowhere_is_one_tile():
    """Degenerate but reachable: mutation can nudge both ends onto the same square."""
    assert points_of(Line(2, 2, 2, 2, "conveyor", True)) == [(2, 2)]
    assert rotations_of(Line(2, 2, 2, 2, "conveyor", True)) == [0]


def test_a_line_visits_every_tile_once():
    line = Line(1, 1, 6, 5, "conveyor", horizontal_first=True)
    points = points_of(line)

    assert len(points) == len(set(points))
    assert points[0] == (1, 1)
    assert points[-1] == (6, 5)


# Flattening to a grid ---------------------------------------------------------------


def test_a_line_breaks_around_a_machine_rather_than_swallowing_it():
    """The engine would refuse the carrier anyway, and what stood is what gets charged."""
    design = Design(
        5, 5, PALETTE,
        machines=[Machine(2, 0, "mechanical-drill")],
        lines=[Line(0, 0, 4, 0, "conveyor", True)],
    )
    grid = design.to_layout()
    row = [grid.palette[grid.blocks[index]] for index in range(5)]

    assert row == ["conveyor", "conveyor", "mechanical-drill", "conveyor", "conveyor"]


def test_a_later_line_may_overwrite_an_earlier_one():
    """Carriers are interchangeable, so crossing lines are a redraw, not a refusal."""
    design = Design(
        5, 5, PALETTE,
        lines=[
            Line(0, 0, 4, 0, "conveyor", True),
            Line(2, 0, 2, 0, "junction", True),
        ],
    )
    grid = design.to_layout()

    assert grid.palette[grid.blocks[2]] == "junction"


def test_parts_outside_the_rectangle_are_dropped_not_wrapped():
    design = Design(
        4, 4, PALETTE,
        machines=[Machine(9, 9, "mechanical-drill")],
        lines=[Line(-3, 1, 1, 1, "conveyor", True)],
    )
    grid = design.to_layout()

    assert all(0 <= index < 16 for index, _ in enumerate(grid.blocks))
    assert grid.palette[grid.blocks[1 * 4 + 0]] == "conveyor"
    assert grid.used() == 2


def test_blocks_outside_the_palette_are_ignored():
    """Crossover mixes designs, and a palette is per specification."""
    design = Design(
        4, 4, PALETTE,
        machines=[Machine(1, 1, "thorium-reactor")],
        lines=[Line(0, 0, 2, 0, "titanium-conveyor", True)],
    )

    assert design.used() == 0


# The grid itself --------------------------------------------------------------------


def test_a_layout_must_match_its_own_size():
    with pytest.raises(ValueError, match="wants 9 cells"):
        Layout(3, 3, PALETTE, [0] * 8, [0] * 9)


def test_used_counts_everything_that_is_not_air():
    grid = empty(3, 3, PALETTE)
    grid.blocks[0] = PALETTE.index("conveyor")
    grid.blocks[4] = PALETTE.index("mechanical-drill")

    assert grid.used() == 2
    assert len(list(grid.cells())) == 2


def test_render_draws_arrows_for_carriers_and_initials_for_machines():
    """Top row first, so what is printed matches how the game is looked at."""
    design = Design(
        3, 2, PALETTE,
        machines=[Machine(0, 1, "mechanical-drill")],
        lines=[Line(0, 0, 2, 0, "conveyor", True)],
    )

    assert design.render().splitlines() == ["M..", ">>>"]


def test_a_copy_does_not_share_its_parts_with_the_original():
    design = random_design(8, 8, PALETTE, random.Random(0))
    clone = design.copy()
    clone.machines.append(Machine(0, 0, "mechanical-drill"))

    assert len(clone.machines) == len(design.machines) + 1


def test_a_copy_carries_no_measurement():
    """A survivor that kept its old delivery would be scored for work it did not redo."""
    design = random_design(8, 8, PALETTE, random.Random(0))
    design.delivered, design.blocks_standing, design.stuck = 42, 7, 3

    assert design.copy().delivered is None
    assert design.copy().blocks_standing == 0
    assert design.copy().stuck == 0


# Variation --------------------------------------------------------------------------


def test_breeding_stays_bounded_over_many_generations():
    """Taking every part from both parents doubles a design until it is a solid block."""
    rng = random.Random(1)
    population = [random_design(12, 12, PALETTE, rng) for _ in range(6)]

    for _ in range(40):
        population = [
            mutate_design(cross_designs(rng.choice(population), rng.choice(population), rng), rng)
            for _ in range(6)
        ]

    assert all(len(d.machines) <= 12 and len(d.lines) <= 12 for d in population)


def test_mutation_keeps_every_part_inside_the_rectangle():
    rng = random.Random(2)
    design = random_design(10, 10, PALETTE, rng)

    for _ in range(200):
        design = mutate_design(design, rng)

    assert all(0 <= m.x < 10 and 0 <= m.y < 10 for m in design.machines)
    assert all(
        0 <= value < 10
        for line in design.lines
        for value in (line.x0, line.y0, line.x1, line.y1)
    )


def test_a_design_only_ever_holds_blocks_from_its_palette():
    rng = random.Random(3)
    design = random_design(10, 10, PALETTE, rng)

    for _ in range(50):
        design = mutate_design(design, rng)

    assert {m.block for m in design.machines} <= set(PALETTE)
    assert {line.block for line in design.lines} <= set(PALETTE) | CARRIERS
