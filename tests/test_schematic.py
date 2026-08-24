"""The format the game reads, checked against what it was meant to say.

A serialiser nobody reads back is a serialiser that is wrong in a way only a player
finds, three weeks later, holding a schematic that pastes as rubble. So every test here
either round-trips through the reader or pins an exact byte, and the byte-level ones
exist because a round-trip agrees happily with itself while both halves are wrong.
"""

from __future__ import annotations

import base64
import struct
import zlib

import pytest

from forge.layout import Design, Line, Machine, empty
from forge.schematic import (
    HEADER,
    VERSION,
    from_base64,
    pack_point,
    read,
    to_base64,
    unpack_point,
    write,
)

PALETTE = ("air", "conveyor", "mechanical-drill", "junction", "router")


def a_line() -> Design:
    return Design(
        8, 8, PALETTE,
        machines=[Machine(1, 1, "mechanical-drill")],
        lines=[Line(1, 2, 4, 2, "conveyor", True)],
    )


# The header, byte for byte ------------------------------------------------------------


def test_a_schematic_announces_itself_the_way_the_game_expects():
    payload = write(a_line())

    assert payload[:4] == b"msch"
    assert payload[4] == VERSION == 1


def test_everything_after_the_header_is_deflate_compressed():
    payload = write(a_line())

    assert zlib.decompress(payload[5:])


def test_the_pasteable_string_starts_the_way_every_shared_schematic_does():
    """`bXNjaA` is `msch` plus a version byte, which is what a player sees on every one.

    Only that much is pinned. The next character encodes the deflate header, so asserting
    further would fail the day the compression level changes without anything being wrong.
    """
    assert to_base64(a_line()).startswith("bXNjaA")
    assert base64.b64decode(to_base64(a_line()))[:5] == HEADER + bytes([VERSION])


def test_the_first_fields_are_the_two_dimensions_as_shorts():
    body = zlib.decompress(write(a_line())[5:])

    assert struct.unpack(">hh", body[:4]) == (4, 2)


# Positions -----------------------------------------------------------------------------


@pytest.mark.parametrize("point", [(0, 0), (1, 0), (0, 1), (13, 7), (255, 255), (4095, 17)])
def test_a_position_survives_being_packed(point):
    assert unpack_point(pack_point(*point)) == point


def test_the_upper_half_is_x_and_the_lower_half_is_y():
    """Swapping them produces a schematic that pastes transposed, and loads fine."""
    assert pack_point(3, 0) == 3 << 16
    assert pack_point(0, 3) == 3


# Round trip ------------------------------------------------------------------------------


def test_every_block_comes_back_where_it_was_put():
    design = a_line()
    expected = {(x, y, block, rotation) for x, y, block, rotation in design.cells()}

    back = from_base64(to_base64(design))
    # The design sits at (1, 1) in an 8x8 area and the schematic is cropped onto it, so
    # what comes back is the same shape moved to the origin.
    moved = {(x + 1, y + 1, block, rotation) for x, y, block, rotation in back["tiles"]}

    assert moved == expected


def test_rotations_survive_the_trip():
    """A conveyor that comes back facing elsewhere is a line that delivers nothing."""
    design = Design(6, 6, PALETTE, lines=[Line(0, 0, 0, 3, "conveyor", True)])

    back = from_base64(to_base64(design))

    assert {rotation for _, _, _, rotation in back["tiles"]} == {1}


def test_the_name_and_description_travel_with_it():
    back = from_base64(to_base64(a_line(), name="copper line", description="21 in 30s"))

    assert back["tags"]["name"] == "copper line"
    assert back["tags"]["description"] == "21 in 30s"


def test_a_schematic_with_no_description_carries_only_a_name():
    assert set(from_base64(to_base64(a_line()))["tags"]) == {"name"}


def test_the_palette_holds_each_block_once():
    back = from_base64(to_base64(a_line()))

    assert sorted(back["palette"]) == ["conveyor", "mechanical-drill"]


def test_air_is_not_a_block_and_never_reaches_the_palette():
    back = from_base64(to_base64(a_line()))

    assert "air" not in back["palette"]
    assert len(back["tiles"]) == a_line().used()


# Cropping ---------------------------------------------------------------------------------


def test_a_design_in_the_corner_of_a_big_area_crops_to_itself():
    """Otherwise a player pastes a mostly empty rectangle with a factory in one corner."""
    design = Design(40, 40, PALETTE, machines=[Machine(30, 30, "mechanical-drill")])

    back = from_base64(to_base64(design))

    assert (back["width"], back["height"]) == (1, 1)
    assert back["tiles"] == [(0, 0, "mechanical-drill", 0)]


def test_cropping_keeps_the_shape_rather_than_squeezing_it():
    design = Design(20, 20, PALETTE,
                    machines=[Machine(5, 5, "router"), Machine(9, 7, "router")])

    back = from_base64(to_base64(design))

    assert (back["width"], back["height"]) == (5, 3)
    assert sorted(t[:2] for t in back["tiles"]) == [(0, 0), (4, 2)]


# What it refuses ------------------------------------------------------------------------------


def test_an_empty_design_is_refused_rather_than_written():
    """An empty schematic pastes as nothing and reads, in a catalogue, as a result."""
    with pytest.raises(ValueError, match="nothing to write"):
        write(empty(10, 10, PALETTE))


def test_a_header_that_is_not_a_schematic_is_refused():
    with pytest.raises(ValueError, match="not a schematic"):
        read(b"nope" + bytes([VERSION]) + zlib.compress(b""))


def test_a_future_version_is_refused_rather_than_guessed_at():
    with pytest.raises(ValueError, match="newer"):
        read(HEADER + bytes([VERSION + 9]) + zlib.compress(b""))


def test_a_truncated_schematic_says_so():
    payload = write(a_line())
    body = zlib.decompress(payload[5:])
    cut = HEADER + bytes([VERSION]) + zlib.compress(body[:-4])

    with pytest.raises(ValueError, match="ends in the middle"):
        read(cut)


def test_text_java_would_encode_differently_is_refused():
    """Modified UTF-8 parts company with UTF-8 at NUL and outside the basic plane."""
    with pytest.raises(ValueError, match="encodes differently"):
        to_base64(a_line(), name="bad\x00name")


def test_a_layout_may_be_written_directly_and_not_only_a_design():
    grid = empty(4, 4, PALETTE)
    grid.blocks[5] = PALETTE.index("router")

    assert from_base64(base64.b64encode(write(grid)).decode())["tiles"] == [
        (0, 0, "router", 0)
    ]
