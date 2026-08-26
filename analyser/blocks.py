"""What every block does, read from the game rather than from a wiki.

`bench/src/mindustryforge/DumpBlocks.java` runs inside Mindustry and prints its own block
registry to `data/blocks.json`. Nothing in this file is typed by hand, and that is the
whole point: every other Mindustry calculator on the web retyped these numbers, and a
retyped table drifts. The game ships a balance change, the tool goes on being confidently
wrong, and nothing anywhere notices.

The version the data came from travels with it, so an analysis can say which build it
speaks for instead of implying it speaks for all of them.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).parent / "data" / "blocks.json"

#: Mindustry counts rotations anticlockwise from east, and this is the direction each one
#: sends towards. Written once here because getting it wrong turns a working belt into a
#: broken one without changing a single block.
DIRECTIONS: tuple[tuple[int, int], ...] = ((1, 0), (0, 1), (-1, 0), (0, -1))

#: Ticks in a second. The game states craft times and drill times in ticks.
TICKS = 60.0


@dataclass(frozen=True)
class Block:
    """One kind of block, with only what moving items through it requires."""

    name: str
    size: int
    role: str
    #: Items a second for a carrier, at full compression.
    rate: float = 0.0
    #: Seconds one craft takes, for a crafter.
    craft_time: float = 0.0
    #: Items consumed per craft, by name.
    inputs: dict[str, int] = field(default_factory=dict)
    #: Items produced per craft, by name.
    outputs: dict[str, int] = field(default_factory=dict)
    #: Power drawn per second. A crafter starved of power does not craft, so a layout that
    #: ignores it reports a throughput the game will not deliver.
    power: float = 0.0
    #: Drill fields, kept as the game keeps them. A drill's rate depends on how many ore
    #: tiles it covers and how hard they are, so a single stored "speed" would be wrong for
    #: every square except the one it was measured on.
    tier: int = 0
    drill_time: float = 0.0
    hardness_multiplier: float = 0.0
    cost: dict[str, int] = field(default_factory=dict)
    item_capacity: int = 0

    @property
    def crafts_per_second(self) -> float:
        return TICKS / self.craft_time if self.craft_time else 0.0

    def produces(self, item: str) -> float:
        """Items a second of `item` this block makes when fully fed."""
        return self.outputs.get(item, 0) * self.crafts_per_second

    def consumes(self, item: str) -> float:
        """Items a second of `item` this block needs to run flat out."""
        return self.inputs.get(item, 0) * self.crafts_per_second


@dataclass(frozen=True)
class Item:
    name: str
    hardness: int
    #: The game's own notion of how precious an item is, which is what stops a layout that
    #: floods the core with sand from outscoring one that makes silicon.
    cost: float


@dataclass(frozen=True)
class Catalogue:
    """Every block and item of one pinned build of the game."""

    game_version: str
    build: int
    blocks: dict[str, Block]
    items: dict[str, Item]

    def block(self, name: str) -> Block:
        """The named block, or an inert one-tile placeholder.

        A schematic can hold a block from a mod this catalogue has never seen. Refusing the
        whole schematic over one unknown tile would make the tool useless on exactly the
        creative builds worth analysing, so an unknown block becomes a wall: it occupies
        its tile, carries nothing, and is reported as unknown rather than silently ignored.
        """
        found = self.blocks.get(name)
        if found is not None:
            return found
        return Block(name=name, size=1, role="unknown")

    def size_of(self, name: str) -> int:
        return self.block(name).size

    def worth(self, item: str) -> float:
        found = self.items.get(item)
        return found.cost if found else 1.0


def _block_from(name: str, raw: dict) -> Block:
    return Block(
        name=name,
        size=int(raw.get("size", 1)),
        role=str(raw.get("role", "")),
        rate=float(raw.get("items_per_second", 0.0)),
        craft_time=float(raw.get("craft_time", 0.0)),
        inputs={k: int(v) for k, v in (raw.get("input") or {}).items()},
        outputs={k: int(v) for k, v in (raw.get("output") or {}).items()},
        power=float(raw.get("power", 0.0)),
        tier=int(raw.get("tier", 0)),
        drill_time=float(raw.get("drill_time", 0.0)),
        hardness_multiplier=float(raw.get("hardness_multiplier", 0.0)),
        cost={k: int(v) for k, v in (raw.get("cost") or {}).items()},
        item_capacity=int(raw.get("item_capacity", 0)),
    )


def load(path: Path | str = DATA) -> Catalogue:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return Catalogue(
        game_version=str(raw.get("game_version", "unknown")),
        build=int(raw.get("build", 0)),
        blocks={name: _block_from(name, entry)
                for name, entry in raw.get("blocks", {}).items()},
        items={name: Item(name=name,
                          hardness=int(entry.get("hardness", 0)),
                          cost=float(entry.get("cost", 1.0)))
               for name, entry in raw.get("items", {}).items()},
    )


@lru_cache(maxsize=1)
def catalogue() -> Catalogue:
    """The shipped catalogue, parsed once."""
    return load()
