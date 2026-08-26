"""The format the game reads, checked by writing one and reading it back.

Taken from `Schematics.write` and `TypeIO` in Mindustry v159.7 rather than from a wiki.
A format written blind and never read back is a format that is wrong in a way only a
player discovers, at the moment they paste it.
"""

from __future__ import annotations

import base64

import pytest

from bench import schematic


def test_a_written_schematic_reads_back_the_same():
    tiles = [(0, 0, "conveyor", 0), (1, 0, "conveyor", 1), (2, 0, "router", 0)]
    parsed = schematic.read(schematic.write(tiles, name="essai"))

    assert parsed["tags"]["name"] == "essai"
    assert sorted(parsed["tiles"]) == sorted(tiles)


def test_the_box_is_tightened_onto_the_build():
    """Otherwise a player pastes a mostly empty rectangle with a factory in one corner."""
    parsed = schematic.read(schematic.write([(30, 30, "conveyor", 0)]))
    assert (parsed["width"], parsed["height"]) == (1, 1)
    assert parsed["tiles"] == [(0, 0, "conveyor", 0)]


def test_a_wide_block_is_measured_by_what_it_covers():
    """A 1x7 schematic holding a 2x2 drill is not a shape.

    The size comes from the registry the game printed, not from a table kept here. There
    was a table here, listing eight blocks by hand, and it called everything else one tile
    wide.
    """
    assert schematic.size_of("mechanical-drill") == 2
    parsed = schematic.read(schematic.write([(5, 5, "mechanical-drill", 0)]))
    assert (parsed["width"], parsed["height"]) == (2, 2)


def test_rotation_survives_the_round_trip():
    """One wrong rotation turns a working belt into a wall, without changing a block."""
    tiles = [(x, 0, "conveyor", x % 4) for x in range(4)]
    parsed = schematic.read(schematic.write(tiles))
    assert sorted(parsed["tiles"]) == sorted(tiles)


def test_an_empty_design_is_refused_rather_than_written():
    """An empty schematic pastes as nothing and reads, in a listing, as a result."""
    with pytest.raises(ValueError):
        schematic.write([])


def test_base64_is_what_the_clipboard_carries():
    text = schematic.to_base64([(0, 0, "conveyor", 0)], name="x")
    assert schematic.from_base64(text)["tags"]["name"] == "x"
    assert base64.b64decode(text)[:4] == b"msch"


def test_something_that_is_not_a_schematic_is_refused_by_name():
    with pytest.raises(ValueError, match="not a schematic"):
        schematic.read(b"nope" + b"\x01")


def test_a_newer_format_is_refused_rather_than_misread():
    with pytest.raises(ValueError, match="newer"):
        schematic.read(b"msch" + bytes([schematic.VERSION + 1]))
