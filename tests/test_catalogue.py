"""What the warehouse accepts, what it refuses, and the order it puts things in.

The refusals matter more than the acceptances. A leaderboard is worth reading only for as
long as every number in it was produced the same way, and the single thing that destroys
one is an entry measured somewhere else, ranked as though it were not.
"""

from __future__ import annotations

import json

import pytest

from forge.catalogue import (
    FORMAT,
    Conditions,
    Entry,
    admit,
    categories,
    in_order,
    leader,
    load,
    place,
    ranked,
    save,
)

HERE = Conditions(map="Ancient_Caldera", world_seed=16, ticks=1800, keep_out=3,
                  engine="v159.7")
ELSEWHERE = Conditions(map="Ancient_Caldera", world_seed=17, ticks=1800, keep_out=3,
                       engine="v159.7")


def entry(delivered: int = 20, blocks: int = 12, objective: str = "density",
          author: str = "mindustry-forge", schematic: str = "bXNjaAF4nAAA",
          conditions: Conditions = HERE, **rest) -> Entry:
    return Entry(spec="copper-line", objective=objective, author=author,
                 schematic=schematic, delivered=delivered, blocks=blocks,
                 conditions=conditions, **rest)


# Ranking -----------------------------------------------------------------------------


def test_the_best_of_a_category_comes_first():
    entries = [entry(delivered=20, blocks=40), entry(delivered=20, blocks=10,
                                                     schematic="b")]

    assert leader(entries, "copper-line", "density").blocks == 10


def test_a_category_is_a_specification_and_an_objective_together():
    entries = [entry(objective="density"), entry(objective="throughput", schematic="b")]

    assert categories(entries) == [("copper-line", "density"),
                                   ("copper-line", "throughput")]
    assert len(ranked(entries, "copper-line", "density")) == 1


def test_each_category_is_ranked_by_its_own_objective():
    """Smallest wins under compact; most delivered wins under throughput."""
    small = entry(delivered=20, blocks=6, objective="compact")
    big = entry(delivered=60, blocks=90, objective="compact", schematic="b")

    assert leader([small, big], "copper-line", "compact") is small

    small = entry(delivered=20, blocks=6, objective="throughput")
    big = entry(delivered=60, blocks=90, objective="throughput", schematic="b")

    assert leader([small, big], "copper-line", "throughput") is big


def test_an_objective_that_takes_a_setting_carries_it():
    tight = entry(delivered=50, blocks=25, objective="budget", options={"blocks": 20})

    assert tight.score() < 0


def test_an_empty_category_has_no_leader():
    assert leader([], "copper-line", "density") is None


def test_a_placing_counts_from_one():
    entries = [entry(delivered=30, blocks=10), entry(delivered=20, blocks=10,
                                                     schematic="b")]

    assert place(entries, entry(delivered=40, blocks=10, schematic="c")) == 1
    assert place(entries, entry(delivered=25, blocks=10, schematic="c")) == 2
    assert place(entries, entry(delivered=1, blocks=10, schematic="c")) == 3


# What it refuses -----------------------------------------------------------------------


def test_a_design_measured_on_another_world_is_refused():
    """The one that matters. Ranked anyway, the whole column becomes noise."""
    accepted, why = admit([entry()], entry(schematic="b", conditions=ELSEWHERE))

    assert not accepted
    assert "not comparable" in why
    assert "world_seed: 16 against 17" in why


def test_a_design_measured_on_another_engine_is_refused():
    older = Conditions(map="Ancient_Caldera", world_seed=16, ticks=1800, keep_out=3,
                       engine="v158.0")

    accepted, why = admit([entry()], entry(schematic="b", conditions=older))

    assert not accepted
    assert "engine: v159.7 against v158.0" in why


def test_a_design_given_more_time_is_refused():
    longer = Conditions(map="Ancient_Caldera", world_seed=16, ticks=3600, keep_out=3,
                        engine="v159.7")

    accepted, why = admit([entry()], entry(schematic="b", conditions=longer))

    assert not accepted
    assert "ticks" in why


def test_a_design_that_delivers_nothing_is_refused():
    accepted, why = admit([], entry(delivered=0))

    assert not accepted
    assert "delivers nothing" in why


def test_an_entry_with_no_schematic_is_refused():
    accepted, why = admit([], entry(schematic=""))

    assert not accepted
    assert "nothing to paste" in why


def test_the_same_schematic_twice_is_refused():
    existing = entry()

    accepted, why = admit([existing], entry(schematic=existing.schematic))

    assert not accepted
    assert "already in the catalogue" in why


def test_an_unknown_objective_is_refused():
    accepted, why = admit([], entry(objective="prettiest"))

    assert not accepted
    assert "unknown objective" in why


def test_the_first_entry_of_a_category_sets_its_conditions():
    """Nothing to compare against, so anything measurable is admitted."""
    accepted, why = admit([], entry(conditions=ELSEWHERE))

    assert accepted
    assert why == "accepted"


def test_a_worse_design_that_works_is_still_admitted():
    """A leaderboard with one entry per category is a list, and nobody rereads a list."""
    accepted, _ = admit([entry(delivered=100, blocks=5)],
                        entry(delivered=1, blocks=90, schematic="b"))

    assert accepted


def test_conditions_that_match_report_no_differences():
    assert HERE.differences(HERE) == []


# On disk ---------------------------------------------------------------------------------


def test_a_catalogue_survives_being_written_and_read(tmp_path):
    entries = [entry(delivered=20, blocks=8, notes="found overnight"),
               entry(delivered=9, blocks=4, objective="compact", schematic="b")]
    path = save(tmp_path / "catalogue.json", entries)

    back = load(path)

    assert len(back) == 2
    assert {e.schematic for e in back} == {"bXNjaAF4nAAA", "b"}
    assert back[0].conditions == HERE


def test_a_missing_catalogue_reads_as_an_empty_one(tmp_path):
    assert load(tmp_path / "nothing-here.json") == []


def test_the_file_says_which_format_it_is(tmp_path):
    path = save(tmp_path / "catalogue.json", [entry()])

    assert json.loads(path.read_text(encoding="utf-8"))["format"] == FORMAT


def test_a_catalogue_from_a_newer_format_is_refused_rather_than_guessed_at(tmp_path):
    path = tmp_path / "catalogue.json"
    path.write_text(json.dumps({"format": FORMAT + 5, "entries": []}), encoding="utf-8")

    with pytest.raises(ValueError, match="format"):
        load(path)


def test_entries_are_stored_best_first_so_a_submission_reads_as_one_move(tmp_path):
    entries = [entry(delivered=5, blocks=40, schematic="b"), entry(delivered=90, blocks=3)]

    assert [e.delivered for e in in_order(entries)] == [90, 5]
    assert [e.delivered for e in load(save(tmp_path / "c.json", entries))] == [90, 5]


def test_the_provenance_travels_with_every_entry(tmp_path):
    """An entry that has forgotten its world cannot be rechecked, ever."""
    stored = json.loads(save(tmp_path / "c.json", [entry()]).read_text(encoding="utf-8"))

    assert stored["entries"][0]["conditions"] == {
        "map": "Ancient_Caldera", "world_seed": 16, "ticks": 1800,
        "keep_out": 3, "engine": "v159.7",
    }


def test_an_entry_remembers_where_it_sat_relative_to_the_output(tmp_path):
    """A schematic cropped to its own corner has forgotten where it was standing.

    Without the offset an entry cannot be put back on the bench, so it can never be
    rechecked, and a catalogue that cannot recheck itself is a pile of claims.
    """
    stored = save(tmp_path / "c.json", [entry(origin=(-4, -7))])
    back = load(stored)

    assert back[0].origin == (-4, -7)


def test_an_older_entry_without_an_offset_still_reads(tmp_path):
    path = tmp_path / "c.json"
    payload = entry().to_json()
    payload.pop("origin")
    path.write_text(json.dumps({"format": FORMAT, "entries": [payload]}), encoding="utf-8")

    assert load(path)[0].origin == (0, 0)
