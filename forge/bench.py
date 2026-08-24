"""Running a design in the actual game and writing down what it did.

Every candidate is stamped into a real Mindustry world, given a few seconds, and scored on
what the engine says came out. No model of the game is used anywhere, because a model is
another thing that can be wrong and this one would be wrong in exactly the places the
search would learn to exploit.

Three things the bench has to get right, and each of them was got wrong first:

- **Score one named item.** Scoring "anything delivered" makes the answer sand, which
  covers most of the map and sits next to the base. The winning design was drills and no
  conveyor at all: correct, optimal, and silent on the question being asked.
- **Put the material out of reach, in the world and not on paper.** A drill touching the
  output delivers into it directly, because the engine pushes to any adjacent building, so
  with ore against the output no line is needed and none is found. Blanking that ore out of
  the *scoring* does not help: it stays on the map and a drill can still sit on it. It has
  to be scraped off, which is what `prepare` does.
- **Spare exactly the tiles the output stands on, no more.** Sparing a radius instead
  leaves the ring around it unbuildable, so the last tile of every line, the one that has
  to touch the output, is silently skipped and no design can deliver however right it is.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from forge.bridge import Bridge
from forge.spec import Spec


@dataclass
class Area:
    """Where the work happens, and what it is surrounded by."""

    x: int
    y: int
    width: int
    height: int
    #: The output, which is the map's own core: deliveries into it are what the engine
    #: counts, and it needs no placing.
    core: tuple[int, int]
    #: Tiles the core stands on, read off the map rather than assumed.
    spared: frozenset[tuple[int, int]]
    #: Tiles of the wanted material inside the area and out of reach of the core.
    material: int

    def contains(self, x: int, y: int) -> bool:
        return self.x <= x < self.x + self.width and self.y <= y < self.y + self.height

    def output_box(self) -> tuple[int, int, int, int] | None:
        """The rectangle the output occupies, or None if nothing is being spared.

        Needed because the work area has to cover the output and the output is full of
        the very item being counted: anything measuring the area has to be able to take
        it back out again.
        """
        if not self.spared:
            return None
        xs = [x for x, _ in self.spared]
        ys = [y for _, y in self.spared]
        return min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1


def footprint(spatial: np.ndarray, channels: list[str], core: tuple[int, int],
              reach: int = 4) -> frozenset[tuple[int, int]]:
    """Every friendly building within `reach` of the core, which on a fresh map is the core.

    Named for what it is rather than for what it is used for. On a map that already has
    buildings near the base it would spare those too, which is not what a caller reading
    "the core's footprint" would expect, and the bench runs on fresh maps precisely so
    that the two coincide.
    """
    plane = spatial[channels.index("block_ally")]
    cx, cy = core
    rows, columns = plane.shape
    return frozenset(
        (x, y)
        for y in range(max(0, cy - reach), min(rows, cy + reach + 1))
        for x in range(max(0, cx - reach), min(columns, cx + reach + 1))
        if plane[y, x] > 0
    )


def reachable(plane: np.ndarray, core: tuple[int, int], keep_out: int) -> np.ndarray:
    """The material plane with everything too close to the output blanked out.

    Only for ranking where the work area should go. Blanking a plane does not move a
    single tile of ore, and an earlier version of this bench relied on it as though it
    did: the ore stayed on the map, a drill could still sit on it, and one drill against
    the output delivered with no line at all. `prepare` is what makes the promise true.
    """
    if keep_out <= 0:
        return plane
    out = plane.copy()
    cx, cy = core
    rows, columns = out.shape
    ys, xs = np.ogrid[:rows, :columns]
    out[np.maximum(np.abs(xs - cx), np.abs(ys - cy)) <= keep_out] = 0
    return out


def prepare(bridge: Bridge, core: tuple[int, int], material: str | None,
            keep_out: int = 3) -> int:
    """Take the wanted material away from the output, once, before anything is measured.

    This is a property of the world rather than a rule of the scoring, which matters: an
    objective that had to know about it would be an objective that could forget, and every
    later objective would have to remember too. Done here, the map simply is what the
    bench says it is, and the count comes back so a run can say how much it moved.
    """
    if material is None or keep_out <= 0:
        return 0
    return int(bridge.clear_ore(core[0], core[1], keep_out, material).get("cleared", 0))


def choose_area(spatial: np.ndarray, channels: list[str], core: tuple[int, int],
                spec: Spec, material: str | None, keep_out: int = 3) -> Area:
    """Place the work area over the core, on as much usable material as possible.

    It has to cover the core, because a design is scored on what reaches it and nothing
    inside the area can deliver anywhere outside. Exhaustive over the placements that do,
    because it is cheap and because guessing an anchor once produced an area with a single
    tile of ore in it, which then correctly and uselessly reported that nothing worked.
    """
    spared = footprint(spatial, channels, core)

    if material is None or f"ore_{material}" not in channels:
        return Area(core[0] - spec.width // 2, core[1] - spec.height // 2,
                    spec.width, spec.height, core, spared, 0)

    plane = reachable(spatial[channels.index(f"ore_{material}")], core, keep_out)
    rows, columns = plane.shape
    cx, cy = core

    best, where = -1, (cx, cy)
    for y in range(max(0, cy - spec.height + 2), min(rows - spec.height, cy - 1) + 1):
        for x in range(max(0, cx - spec.width + 2), min(columns - spec.width, cx - 1) + 1):
            count = int((plane[y:y + spec.height, x:x + spec.width] > 0).sum())
            if count > best:
                best, where = count, (x, y)

    return Area(where[0], where[1], spec.width, spec.height, core, spared, max(0, best))


class Bench:
    """One prepared world, reused for every candidate of a run."""

    def __init__(self, bridge: Bridge, spec: Spec, area: Area) -> None:
        self.bridge = bridge
        self.spec = spec
        self.area = area

    def clear(self) -> None:
        """Empty the work area, sparing the output.

        Refusals are ordinary: a tile that was already empty refuses, and that is the
        expected answer rather than a fault.
        """
        for y in range(self.area.y, self.area.y + self.area.height):
            for x in range(self.area.x, self.area.x + self.area.width):
                if (x, y) in self.area.spared:
                    continue
                self.bridge.act({"type": "break", "x": x, "y": y})

    def supply(self) -> None:
        """Refill the input ports, so a design that needs feeding gets fed."""
        for port in self.spec.inputs:
            x, y = port.tile(self.area.width, self.area.height)
            self.bridge.give(self.area.x + x, self.area.y + y, port.item,
                             int(port.rate * self.spec.ticks / 60))

    def stamp(self, candidate) -> int:
        """Place a design, and report how many of its blocks the engine accepted.

        Producers first. One needs several clear tiles and a carrier laid on a tile it
        wanted makes it impossible, leaving a line fed by nothing.
        """
        cells = sorted(candidate.cells(), key=lambda cell: 0 if _produces(cell[2]) else 1)
        placed = 0
        for x, y, block, rotation in cells:
            tx, ty = self.area.x + x, self.area.y + y
            if (tx, ty) in self.area.spared:
                continue
            outcome = self.bridge.act({
                "type": "place", "block": block, "x": tx, "y": ty, "rotation": rotation,
            })["action"]
            placed += bool(outcome.get("applied"))
        return placed

    def delivered(self, observation: dict) -> int:
        return int(observation.get("produced", {}).get(self.spec.target, 0))

    def run(self, candidate) -> None:
        """Measure one candidate and write the result onto it."""
        self.clear()
        candidate.blocks_standing = self.stamp(candidate)
        self.supply()

        before = self.delivered(self.bridge.observe())
        after = self.delivered(self.bridge.step(repeat=self.spec.ticks))

        candidate.stuck = self.held(self.spec.target)
        candidate.delivered = max(0, after - before)

    def held(self, item: str) -> int:
        """Material sitting inside the design, going nowhere.

        A line one tile short of the output delivers exactly as much as an empty
        rectangle, so without this the search has a flat zero to climb and climbs nothing.

        The output's own stock is taken back out, and that subtraction is the whole
        measurement. The work area has to cover the output, the output is a core holding
        hundreds of the item being counted, and the raw figure is therefore dominated by
        stock no design ever touched: measured on a hand-built line standing six blocks,
        it read 210 held where thirty is the physical maximum. Every candidate collected
        the same large number, so the partial credit stopped distinguishing between them
        and became a constant, which is the one thing a gradient must never be.
        """
        inside = self.bridge.region(self.area.x, self.area.y,
                                    self.area.width, self.area.height)
        total = int(inside["held"].get(item, 0))

        box = self.area.output_box()
        if box is not None:
            output = self.bridge.region(*box)
            total -= int(output["held"].get(item, 0))

        return max(0, total)


def _produces(block: str) -> bool:
    from forge.layout import CARRIERS

    return block not in CARRIERS
