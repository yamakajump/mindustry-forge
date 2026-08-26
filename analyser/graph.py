"""Turn a layout into the network the items actually travel through.

A schematic is a bag of blocks with coordinates. What decides whether it works is which
block hands items to which, and that is not visible in the bag: it comes from each block's
rotation, its size, and the game's rules about which sides accept what.

Those rules are the whole subject. A conveyor sends one way and takes from the other three.
A junction passes straight through and never turns. A router takes from anywhere and gives
to everywhere else, which is why one dropped into a line loops items back where they came
from and halves the line. Getting these wrong produces a graph that looks reasonable and
describes a factory nobody built.

Everything here is topology only. How much moves is `flow.py`; this says what is connected
to what, and it is deliberately separate because a wrong answer in one is a very different
bug from a wrong answer in the other.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from analyser.blocks import DIRECTIONS, Block, Catalogue, catalogue

#: Roles that carry items along rather than making or consuming them.
CARRIERS = frozenset({"conveyor", "junction", "router"})

#: Roles that put items into the network without being fed.
SOURCES = frozenset({"drill"})

#: Roles that take items out of it.
SINKS = frozenset({"sink"})


@dataclass
class Node:
    """One placed block, at the tile it was stored on."""

    x: int
    y: int
    block: Block
    rotation: int
    #: Every tile this block covers, since a two-wide drill is fed through any of four.
    footprint: tuple[tuple[int, int], ...] = ()

    @property
    def name(self) -> str:
        return self.block.name

    @property
    def role(self) -> str:
        return self.block.role

    def __hash__(self) -> int:
        return hash((self.x, self.y, self.name))


@dataclass
class Graph:
    """Who hands items to whom, and what is unreachable."""

    nodes: list[Node] = field(default_factory=list)
    #: Directed edges as indices into `nodes`.
    edges: list[tuple[int, int]] = field(default_factory=list)
    at: dict[tuple[int, int], int] = field(default_factory=dict)

    def out_of(self, index: int) -> list[int]:
        return [b for a, b in self.edges if a == index]

    def into(self, index: int) -> list[int]:
        return [a for a, b in self.edges if b == index]


def footprint(x: int, y: int, size: int) -> tuple[tuple[int, int], ...]:
    """The tiles a block covers, given the tile it is stored on.

    Mindustry stores a block by its centre and offsets by `-(size - 1) / 2`, truncating
    towards zero. A two-wide drill stored at (4, 4) therefore covers (4, 4) to (5, 5), and
    a schematic that assumed it covered only its own tile would let a conveyor be laid
    inside it.
    """
    offset = int(-(size - 1) / 2)
    return tuple((x + offset + dx, y + offset + dy)
                 for dx in range(size) for dy in range(size))


def outputs_of(node: Node) -> list[tuple[int, int]]:
    """The tiles this block tries to hand items to.

    A conveyor sends one way and one way only. Everything that produces or stores offloads
    to whatever is adjacent, which is why a drill with two belts beside it feeds both.
    """
    if node.role == "conveyor":
        dx, dy = DIRECTIONS[node.rotation % 4]
        return [(node.x + dx, node.y + dy)]

    if node.role == "junction":
        # Straight through, all four ways. Which one an item takes is decided by the side
        # it arrived on, which is why a junction is the one block that needs its edges
        # paired rather than pooled, and why `flow.py` treats it apart.
        return [(node.x + dx, node.y + dy) for dx, dy in DIRECTIONS]

    # Routers, drills, crafters and anything else that offloads: every tile touching the
    # footprint, minus the footprint itself.
    covered = set(node.footprint)
    around: list[tuple[int, int]] = []
    for cx, cy in node.footprint:
        for dx, dy in DIRECTIONS:
            tile = (cx + dx, cy + dy)
            if tile not in covered and tile not in around:
                around.append(tile)
    return around


def accepts(node: Node, from_tile: tuple[int, int]) -> bool:
    """Whether this block takes an item handed in from that tile.

    The rule that matters and is easy to get backwards: a conveyor refuses anything pushed
    against its own direction of travel. Belt facing right, something to its right pushing
    left, and nothing moves. A graph built without this happily reports a working loop
    between two belts pointing at each other.
    """
    if node.role == "unknown":
        return False

    if node.role == "conveyor":
        dx, dy = DIRECTIONS[node.rotation % 4]
        ahead = (node.x + dx, node.y + dy)
        return from_tile != ahead

    if node.role in ("junction", "router"):
        return True

    if node.role == "drill":
        # A drill makes its own ore and takes nothing. Feeding one is a wasted belt, and
        # the report should say so rather than draw an edge that carries nothing.
        return False

    return node.block.role in ("crafter", "sink") or bool(node.block.inputs)


def build(tiles, source: Catalogue | None = None) -> Graph:
    """The network a list of `(x, y, block, rotation)` tiles describes."""
    known = source or catalogue()
    graph = Graph()

    for x, y, name, rotation in tiles:
        block = known.block(name)
        node = Node(x=x, y=y, block=block, rotation=int(rotation),
                    footprint=footprint(x, y, block.size))
        index = len(graph.nodes)
        graph.nodes.append(node)
        for tile in node.footprint:
            graph.at[tile] = index

    for index, node in enumerate(graph.nodes):
        for tile in outputs_of(node):
            target = graph.at.get(tile)
            if target is None or target == index:
                continue
            # Which tile of this block did the item leave from. A two-wide drill hands to
            # its neighbour from whichever of its own tiles touches it, and a conveyor
            # cares which side that is.
            leaving = _nearest(node.footprint, tile)
            if accepts(graph.nodes[target], leaving):
                edge = (index, target)
                if edge not in graph.edges:
                    graph.edges.append(edge)

    return graph


def _nearest(covered, tile) -> tuple[int, int]:
    return min(covered, key=lambda c: abs(c[0] - tile[0]) + abs(c[1] - tile[1]))


def orphans(graph: Graph) -> list[int]:
    """Blocks that neither receive nor deliver anything.

    The single most common thing wrong with a shared schematic, and the one no existing
    tool reports: a drill nothing collects from, a belt that ends in the air, a press with
    no coal. They cost resources and they move nothing.
    """
    connected = {a for a, _ in graph.edges} | {b for _, b in graph.edges}
    return [i for i in range(len(graph.nodes)) if i not in connected]
