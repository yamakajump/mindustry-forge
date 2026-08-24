"""The question being asked, and the two ways of asking one that cannot be answered."""

from __future__ import annotations

import pytest

from forge.spec import CATALOGUE, COPPER_LINE, SILICON, Port, Side, Spec, get


def test_a_specification_with_no_output_is_refused():
    """Nothing to count means nothing to rank, so the search would be measuring noise."""
    with pytest.raises(ValueError, match="asks for nothing"):
        Spec(name="void", palette=("air", "conveyor"))


def test_a_palette_without_an_empty_tile_is_refused():
    with pytest.raises(ValueError, match="no empty tile"):
        Spec(name="solid", palette=("conveyor",), outputs=(Port("copper", Side.TOP),))


@pytest.mark.parametrize("side", list(Side))
def test_every_edge_runs_the_length_of_the_side_it_is_on(side: Side):
    tiles = side.tiles(10, 6)
    expected = 6 if side in (Side.LEFT, Side.RIGHT) else 10

    assert len(tiles) == expected
    assert len(set(tiles)) == len(tiles)
    assert all(0 <= x < 10 and 0 <= y < 6 for x, y in tiles)


@pytest.mark.parametrize(
    "side,expected",
    [(Side.LEFT, (1, 0)), (Side.RIGHT, (-1, 0)), (Side.BOTTOM, (0, 1)), (Side.TOP, (0, -1))],
)
def test_inward_points_into_the_rectangle(side: Side, expected: tuple[int, int]):
    assert side.inward() == expected


def test_a_port_sits_where_its_offset_says():
    assert Port("copper", Side.TOP, offset=0.0).tile(13, 13) == (0, 12)
    assert Port("copper", Side.TOP, offset=0.5).tile(13, 13) == (6, 12)
    assert Port("copper", Side.TOP, offset=1.0).tile(13, 13) == (12, 12)


def test_an_offset_past_the_end_is_clamped_rather_than_wrapped():
    assert Port("copper", Side.LEFT, offset=9.0).tile(8, 8) == (0, 7)
    assert Port("copper", Side.LEFT, offset=-4.0).tile(8, 8) == (0, 0)


def test_two_ports_on_one_side_do_not_land_on_the_same_tile():
    """Silicon feeds coal and sand down the same edge, and they have to be told apart."""
    coal, sand = SILICON.inputs

    assert coal.tile(SILICON.width, SILICON.height) != sand.tile(SILICON.width, SILICON.height)


def test_the_target_is_the_first_output():
    assert COPPER_LINE.target == "copper"
    assert SILICON.target == "silicon"


def test_every_catalogued_specification_can_build_what_it_asks_for():
    """A palette that cannot make the target makes the question unanswerable."""
    for spec in CATALOGUE.values():
        assert spec.outputs
        assert "air" in spec.palette
        assert spec.area() == spec.width * spec.height
        assert spec.ticks > 0


def test_every_port_of_every_specification_lands_inside_its_rectangle():
    for spec in CATALOGUE.values():
        for port in spec.inputs + spec.outputs:
            x, y = port.tile(spec.width, spec.height)
            assert 0 <= x < spec.width and 0 <= y < spec.height


def test_an_unknown_specification_says_what_it_knows():
    with pytest.raises(KeyError, match="copper-line"):
        get("titanium-line")


def test_a_specification_cannot_be_edited_after_it_is_stated():
    """The question must not drift under a run that is already measuring against it."""
    with pytest.raises(Exception):
        COPPER_LINE.width = 40
