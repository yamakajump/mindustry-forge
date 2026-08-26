"""The endpoint the site will call.

The page and the command line go through the same function, so the two cannot drift into
disagreeing about what a schematic does, which is the failure mode this repository exists
to avoid.
"""

from __future__ import annotations

import base64

import pytest

from analyser import schematic, web


def paste(tiles, name="essai") -> str:
    return schematic.to_base64(tiles, name=name)


def test_a_pasted_string_and_a_dropped_file_are_the_same_thing():
    """Both paths meet in one parser rather than in two that drift apart."""
    tiles = [(x, 0, "conveyor", 0) for x in range(3)]
    text = paste(tiles)
    as_file = base64.b64encode(schematic.write(tiles, name="essai")).decode("ascii")

    assert web.analyse_payload({"schematic": text}) == \
           web.analyse_payload({"schematic": as_file})


def test_the_answer_carries_what_the_page_needs():
    tiles = [(x, 0, "conveyor", 0) for x in range(4)] + [(4, 0, "graphite-press", 0)]
    answer = web.analyse_payload({"schematic": paste(tiles), "supply": {"coal": 4}})

    assert answer["per_minute"]["graphite"] == pytest.approx(40.0)
    assert answer["name"] == "essai"
    assert answer["game_version"]
    assert isinstance(answer["lines"], list) and answer["lines"]


def test_whitespace_from_a_wrapped_paste_is_ignored():
    text = paste([(0, 0, "conveyor", 0)])
    wrapped = "\n  ".join(text[i:i + 30] for i in range(0, len(text), 30))
    assert web.analyse_payload({"schematic": wrapped})["blocks"] == 1


def test_an_empty_request_says_so_rather_than_crashing():
    with pytest.raises(ValueError, match="aucune schematique"):
        web.analyse_payload({})


def test_a_supply_that_is_not_a_number_is_dropped_rather_than_believed():
    """A form field is text, and text arrives wrong. Guessing a rate would report a
    throughput nobody asked for."""
    tiles = [(x, 0, "conveyor", 0) for x in range(3)]
    answer = web.analyse_payload({"schematic": paste(tiles),
                                  "supply": {"coal": "beaucoup", "sand": -3, "lead": "2"}})
    assert answer["produced"].get("lead") == pytest.approx(2.0)
    assert "coal" not in answer["produced"] and "sand" not in answer["produced"]


def test_something_that_is_not_a_schematic_is_refused_by_name():
    with pytest.raises(ValueError):
        web.analyse_payload({"schematic": base64.b64encode(b"pas une schematique").decode()})


def test_a_lone_block_carries_nothing_and_says_so():
    """A single conveyor is connected to nothing, so supplying it would invent a delivery.

    Worth pinning: feeding blocks that lead nowhere is exactly how the first version
    reported 240 coal a minute out of a stranded belt.
    """
    answer = web.analyse_payload({"schematic": paste([(0, 0, "conveyor", 0)]),
                                  "supply": {"coal": 4}})
    assert answer["produced"] == {}
    assert answer["idle"] == {"conveyor": 1}
