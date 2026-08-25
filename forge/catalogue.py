"""The warehouse: designs that were measured, and what they were measured on.

A design is never more than a claim about the world it was measured in. Two designs
compared across different worlds, different seeds or different engine versions are not
being compared at all, they are two unrelated numbers printed in one column. So an entry
carries its conditions, and an entry whose conditions differ from the category it is
joining is refused rather than quietly ranked against it.

That refusal is the whole reason this file exists. Every schematic site in existence is a
pile of claims nobody checked; the only thing this one can offer that they cannot is that
every number in it was produced by the same bench, on the same world, from the same
engine. Lose that and there is no product left.

The file this produces is plain JSON, versioned in the repository. That is deliberate:
a submission is then a diff a human can read, the leaderboard is served as a static file
with nothing running behind it, and an entry can be withdrawn by deleting a few lines.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

from forge import objective as objectives
from forge.objective import Measurement

#: Bumped when the shape of the file changes in a way a reader has to know about.
FORMAT = 1


@dataclass(frozen=True)
class Conditions:
    """What a measurement was taken on. Two entries only rank against each other if these
    match exactly, because every one of them moves the answer."""

    map: str
    world_seed: int
    ticks: int
    keep_out: int
    engine: str

    @classmethod
    def of(cls, payload: dict) -> Conditions:
        return cls(
            map=payload["map"],
            world_seed=int(payload["world_seed"]),
            ticks=int(payload["ticks"]),
            keep_out=int(payload["keep_out"]),
            engine=payload["engine"],
        )

    def differences(self, other: Conditions) -> list[str]:
        return [
            f"{name}: {getattr(self, name)} against {getattr(other, name)}"
            for name in ("map", "world_seed", "ticks", "keep_out", "engine")
            if getattr(self, name) != getattr(other, name)
        ]


@dataclass
class Entry:
    """One design in the warehouse."""

    spec: str
    objective: str
    author: str
    #: The base64 string a player pastes. The deliverable, and the thing being ranked.
    schematic: str
    delivered: int
    blocks: int
    conditions: Conditions
    #: Where the design's lower left corner sits, as an offset from the output.
    #:
    #: Anchored on the output and not on the work area, because the work area is a choice
    #: this repository makes and the output is the thing being delivered into. A design
    #: stored against the area cannot be put back on a world whose base is elsewhere, and
    #: every world's base is elsewhere: measured once, a design anchored the wrong way
    #: delivered 264 items on the world it was found on and nothing at all on three others.
    origin: tuple[int, int] = (0, 0)
    stuck: int = 0
    name: str = ""
    notes: str = ""
    #: Options the objective was built with, for the ones that take any.
    options: dict = field(default_factory=dict)

    @property
    def category(self) -> tuple[str, str]:
        return self.spec, self.objective

    def measurement(self) -> Measurement:
        return Measurement(delivered=self.delivered, blocks=self.blocks,
                           stuck=self.stuck, ticks=self.conditions.ticks)

    def score(self) -> float:
        return objectives.get(self.objective, **self.options)(self.measurement())

    def per_second(self) -> float:
        return self.measurement().per_second

    def to_json(self) -> dict:
        payload = asdict(self)
        payload["conditions"] = asdict(self.conditions)
        payload["origin"] = list(self.origin)
        return payload

    @classmethod
    def of(cls, payload: dict) -> Entry:
        fields = dict(payload)
        fields["conditions"] = Conditions.of(fields["conditions"])
        fields["origin"] = tuple(fields.get("origin", (0, 0)))
        return cls(**fields)


def load(path: Path) -> list[Entry]:
    """Read the warehouse, or an empty one if it has never been written."""
    path = Path(path)
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("format") != FORMAT:
        raise ValueError(
            f"catalogue is format {payload.get('format')}, this reads {FORMAT}"
        )
    return [Entry.of(entry) for entry in payload["entries"]]


def save(path: Path, entries: list[Entry]) -> Path:
    """Write the warehouse, best of each category first.

    Sorted on disk rather than only in the viewer, so that a submission shows up in a diff
    as a line moving into position instead of a whole file reshuffling.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "format": FORMAT,
        "entries": [entry.to_json() for entry in in_order(entries)],
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return path


def in_order(entries: list[Entry]) -> list[Entry]:
    return sorted(entries, key=lambda e: (e.spec, e.objective, -e.score()))


def ranked(entries: list[Entry], spec: str, objective: str) -> list[Entry]:
    """One category, best first."""
    return sorted((e for e in entries if e.category == (spec, objective)),
                  key=lambda e: -e.score())


def leader(entries: list[Entry], spec: str, objective: str) -> Entry | None:
    found = ranked(entries, spec, objective)
    return found[0] if found else None


def categories(entries: list[Entry]) -> list[tuple[str, str]]:
    return sorted({entry.category for entry in entries})


def admit(entries: list[Entry], candidate: Entry) -> tuple[bool, str]:
    """Whether a submission may join, and why not when it may not.

    Deliberately not a judgement about quality. A design that works and is worse than the
    leader still belongs: a leaderboard with only one entry per category is a list, and
    nobody comes back to read a list. What is refused is what cannot be ranked honestly.
    """
    if not candidate.schematic:
        return False, "the entry carries no schematic, so there is nothing to paste"

    if candidate.delivered <= 0:
        return False, (
            f"this design delivered no {candidate.spec.split('-')[0]}, and a design that "
            f"delivers nothing cannot be ranked against ones that do"
        )

    try:
        objectives.get(candidate.objective, **candidate.options)
    except (KeyError, TypeError) as problem:
        return False, f"unknown objective {candidate.objective!r}: {problem}"

    siblings = [e for e in entries if e.category == candidate.category]
    if siblings:
        differences = siblings[0].conditions.differences(candidate.conditions)
        if differences:
            return False, (
                "measured on different conditions from the rest of this category, so the "
                "numbers are not comparable: " + "; ".join(differences)
            )

    if any(e.schematic == candidate.schematic for e in siblings):
        return False, "this exact schematic is already in the catalogue"

    return True, "accepted"


def place(entries: list[Entry], candidate: Entry) -> int:
    """Where a candidate would land in its category, counting from one."""
    better = sum(1 for e in ranked(entries, *candidate.category)
                 if e.score() > candidate.score())
    return better + 1
