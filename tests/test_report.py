"""The product, end to end: a schematic string in, an answer a player can act on out."""

from __future__ import annotations

import pytest

from analyser import report, schematic
from analyser.blocks import catalogue


def paste(tiles, name="essai") -> str:
    """Write tiles as the string the game puts on the clipboard, then hand it back."""
    return schematic.to_base64(tiles, name=name)


@pytest.fixture(scope="module")
def known():
    return catalogue()


def test_a_working_line_reports_what_it_makes(known):
    tiles = [(x, 0, "conveyor", 0) for x in range(4)] + [(4, 0, "graphite-press", 0)]
    out = report.analyse(paste(tiles, "ligne"), supply={"coal": 4.0}, source=known)

    assert out.produced["graphite"] == pytest.approx(60 / 90)
    assert out.per_minute()["graphite"] == pytest.approx(40.0)
    assert out.name == "ligne"


def test_a_stranded_belt_is_not_fed_and_does_not_count_as_output(known):
    """The first real schematic this ran on reported 240 coal a minute out of one stranded
    conveyor, which would have made a broken layout look like the best in the catalogue."""
    tiles = [(x, 0, "conveyor", 0) for x in range(3)] + [(9, 9, "conveyor", 0)]
    out = report.analyse(paste(tiles), supply={"coal": 4.0}, source=known)

    assert out.idle == {"conveyor": 1}
    assert out.produced.get("coal", 0.0) == pytest.approx(4.0), (
        "only the connected line carries anything")


def test_a_stranded_machine_is_waste_and_not_the_bottleneck(known):
    """A press nothing feeds is a press somebody forgot to connect.

    Naming it as the bottleneck drowned out the machine actually limiting the line.
    """
    tiles = [(x, 0, "conveyor", 0) for x in range(4)]
    tiles += [(4, 0, "graphite-press", 0), (4, 6, "graphite-press", 0)]
    out = report.analyse(paste(tiles), supply={"coal": 4.0}, source=known)

    assert out.idle == {"graphite-press": 1}
    assert out.bottleneck is None, "the connected press runs flat out"


def test_a_starved_machine_is_named(known):
    tiles = [(x, 0, "conveyor", 0) for x in range(4)] + [(4, 0, "graphite-press", 0)]
    out = report.analyse(paste(tiles), supply={"coal": 0.4}, source=known)

    assert out.bottleneck is not None
    name, share = out.bottleneck
    assert name == "graphite-press"
    assert 0.2 < share < 0.4


def test_oversupply_is_reported_rather_than_swallowed(known):
    """A player paying for three times the coal a press can eat wants to know."""
    tiles = [(x, 0, "conveyor", 0) for x in range(4)] + [(4, 0, "graphite-press", 0)]
    out = report.analyse(paste(tiles), supply={"coal": 4.0}, source=known)

    # A press eats 1.333 coal a second, so 2.667 of the four back up.
    assert out.surplus["coal"] == pytest.approx(4.0 - 2 * 60 / 90, rel=1e-3)


def test_the_cost_of_building_it_is_counted(known):
    out = report.analyse(paste([(x, 0, "conveyor", 0) for x in range(4)]), source=known)
    assert out.cost == {"copper": 4}, "a conveyor costs one copper"


def test_a_smelter_declares_its_power_draw(known):
    """A layout reported without it promises a throughput the game will not deliver."""
    out = report.analyse(paste([(0, 0, "silicon-smelter", 0)]), source=known)
    assert out.power == pytest.approx(30.0)


def test_the_report_reads_as_a_person_would_want_it(known):
    tiles = [(x, 0, "conveyor", 0) for x in range(4)]
    tiles += [(4, 0, "graphite-press", 0), (9, 9, "conveyor", 0)]
    text = str(report.analyse(paste(tiles, "ma ligne"), supply={"coal": 4.0}, source=known))

    assert "ma ligne" in text
    assert "40.0 graphite / min" in text
    assert "gaspille" in text and "conveyor x1" in text


def test_a_string_with_line_breaks_in_it_still_works(known):
    """A schematic pasted out of a Discord message arrives wrapped, and a player who has
    to strip the newlines themselves will not bother."""
    tiles = [(x, 0, "conveyor", 0) for x in range(3)]
    text = paste(tiles)
    wrapped = "\n".join(text[i:i + 40] for i in range(0, len(text), 40))

    out = report.analyse("".join(wrapped.split()), supply={"copper": 1.0}, source=known)
    assert out.produced["copper"] == pytest.approx(1.0)
