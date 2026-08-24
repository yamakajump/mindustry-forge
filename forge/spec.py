"""What you are asking the forge to build.

A problem here is three statements and nothing more:

- **what arrives**, and where it arrives from,
- **what has to leave**, and where it has to go,
- **what "best" means**, because the smallest design and the fastest design are almost
  never the same one.

Everything else is the search's business. Nothing in a specification says which blocks to
use, how to arrange them, or which way a conveyor should face. That is the whole point: a
specification that hinted at the answer would get the answer it hinted at.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Side(Enum):
    """Which edge of the work area an interface sits on.

    Interfaces live on the edges because a design has to connect to something outside
    itself to be worth anything, and because pinning them makes two designs comparable: if
    the input could appear anywhere, half the search would go into moving it somewhere
    convenient rather than into building.
    """

    LEFT = "left"
    RIGHT = "right"
    TOP = "top"
    BOTTOM = "bottom"

    def tiles(self, width: int, height: int) -> list[tuple[int, int]]:
        """Every tile of this edge, in work-area coordinates."""
        if self is Side.LEFT:
            return [(0, y) for y in range(height)]
        if self is Side.RIGHT:
            return [(width - 1, y) for y in range(height)]
        if self is Side.BOTTOM:
            return [(x, 0) for x in range(width)]
        return [(x, height - 1) for x in range(width)]

    def inward(self) -> tuple[int, int]:
        """The direction pointing into the work area from this edge."""
        return {
            Side.LEFT: (1, 0), Side.RIGHT: (-1, 0),
            Side.BOTTOM: (0, 1), Side.TOP: (0, -1),
        }[self]


@dataclass(frozen=True)
class Port:
    """An item crossing the boundary of the work area.

    An input port hands items in at whatever rate the design can take them, standing in
    for a belt from somewhere else. An output port takes anything it is given and counts
    it, standing in for the rest of the factory.
    """

    item: str
    side: Side
    #: How far along the edge, as a fraction. Half is the middle.
    offset: float = 0.5
    #: Items per second the port supplies. Ignored on an output.
    rate: float = 10.0

    def tile(self, width: int, height: int) -> tuple[int, int]:
        tiles = self.side.tiles(width, height)
        return tiles[min(len(tiles) - 1, max(0, round(self.offset * (len(tiles) - 1))))]


@dataclass(frozen=True)
class Spec:
    """One problem: what goes in, what comes out, how big, and what counts as best."""

    name: str
    #: What the design may build with. Nothing else is available to it.
    #:
    #: Kept explicit rather than "everything in the game" because a search over 376 blocks
    #: spends its whole budget discovering that most of them are irrelevant. Narrowing it
    #: is stating the problem, not solving it.
    palette: tuple[str, ...]
    inputs: tuple[Port, ...] = ()
    outputs: tuple[Port, ...] = ()
    width: int = 12
    height: int = 12
    #: Game ticks each candidate is given to prove itself. Sixty is one second.
    ticks: int = 1800
    notes: str = ""

    def __post_init__(self) -> None:
        if not self.outputs:
            raise ValueError(
                f"{self.name} asks for nothing: a design with no output cannot be scored"
            )
        if "air" not in self.palette:
            raise ValueError(
                f"{self.name} has no empty tile in its palette, so every design would be "
                f"a solid block and none of them could contain a drill"
            )

    @property
    def target(self) -> str:
        """The item the design exists to produce."""
        return self.outputs[0].item

    def area(self) -> int:
        return self.width * self.height


#: A conveyor line from ore to the base. The first thing anyone builds, and the thing an
#: agent choosing tiles one at a time never once managed in 177 recorded episodes.
COPPER_LINE = Spec(
    name="copper-line",
    palette=("air", "conveyor", "mechanical-drill", "junction", "router"),
    outputs=(Port("copper", Side.TOP),),
    width=13, height=13,
    notes="Mine copper and get it to the edge. No inputs: the ore is under the floor.",
)

#: The first real factory. Coal is mined, a press turns two of it into one graphite, and
#: the graphite has to leave. Two production lines that have to meet.
GRAPHITE = Spec(
    name="graphite",
    palette=("air", "conveyor", "mechanical-drill", "graphite-press", "junction", "router"),
    outputs=(Port("graphite", Side.TOP),),
    width=14, height=14,
    notes="Coal comes out of the ground, a press eats two and makes one graphite.",
)

#: Given coal and sand on belts, make silicon. Three inputs counting power, and nothing at
#: all is produced until all three arrive together, which is what makes it the real test.
SILICON = Spec(
    name="silicon",
    palette=("air", "conveyor", "silicon-smelter", "combustion-generator", "power-node",
             "junction", "router"),
    inputs=(Port("coal", Side.LEFT, 0.3), Port("sand", Side.LEFT, 0.7)),
    outputs=(Port("silicon", Side.RIGHT),),
    width=16, height=16,
    notes="Coal and sand arrive on belts. Power has to be made on site.",
)

CATALOGUE: dict[str, Spec] = {s.name: s for s in (COPPER_LINE, GRAPHITE, SILICON)}


def get(name: str) -> Spec:
    if name not in CATALOGUE:
        raise KeyError(f"unknown specification {name!r}, known: {sorted(CATALOGUE)}")
    return CATALOGUE[name]
