"""How much actually moves, and what stops more from moving.

The graph says what is connected. This says what a connected thing delivers, which is the
question every other Mindustry calculator declines to answer. They compute ratios: three
presses per two drills. That is arithmetic about a factory nobody has built yet. It says
nothing about the one in front of you, where the second press is starved because the belt
feeding it is shared with a smelter and runs at 6.5 items a second for two machines that
want 8.

Solved by pushing supply forward until it stops changing, rather than by a single pass.
A single pass is only right on a graph with no loops, and a router pointed back into its
own line makes one out of an ordinary belt. The fixed point is reached in a handful of
rounds on any real layout, and the round cap is stated rather than hidden: a layout that
has not settled is reported as unsettled instead of quietly rounded off.

What this is not: a simulation. It computes a steady state, so it says nothing about the
first thirty seconds, about a belt that has not filled yet, or about a buffer draining. The
bench exists for that, and the two are checked against each other.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from analyser.blocks import Catalogue, catalogue
from analyser.graph import Graph, Node

#: How many rounds of pushing supply forward before a layout is called unsettled.
#: Reached only by graphs that feed themselves in a loop, which is a real thing a player
#: can build and not a thing this should pretend to have solved.
ROUNDS = 200

#: Below this, two rates are the same number. Items a second, so a thousandth is far below
#: anything the game can express.
SETTLED = 1e-4


@dataclass
class Rates:
    """Items a second, by item name."""

    per_item: dict[str, float] = field(default_factory=lambda: defaultdict(float))

    def add(self, item: str, amount: float) -> None:
        self.per_item[item] += amount

    def total(self) -> float:
        return sum(self.per_item.values())

    def of(self, item: str) -> float:
        return self.per_item.get(item, 0.0)

    def scaled(self, factor: float) -> "Rates":
        return Rates(defaultdict(float, {k: v * factor for k, v in self.per_item.items()}))

    def __bool__(self) -> bool:
        return any(v > SETTLED for v in self.per_item.values())


@dataclass
class Result:
    """What a layout does, per block and in total."""

    #: What each node passes on, per second, by item.
    through: list[Rates]
    #: What arrives at each sink, which is what the layout is for.
    delivered: Rates
    #: Fraction of full speed each crafter runs at. Below one means starved.
    fed: dict[int, float]
    settled: bool
    rounds: int

    def bottleneck(self, graph: Graph) -> tuple[int, float] | None:
        """The starved machine holding the layout back, worst first.

        Reported as a block rather than as a number, because "you produce 61% of what you
        could" is not actionable and "the second press is fed 61% of the time" is.

        A machine nothing feeds at all is not the bottleneck, it is a machine somebody
        forgot to connect, and it is reported as waste instead. Naming it here pointed at
        the wrong block on the first real schematic this ran on: a stranded press at 0%
        drowned out the one actually limiting the line.
        """
        starved = [(index, share) for index, share in self.fed.items()
                   if share < 0.999 and graph.into(index)]
        if not starved:
            return None
        return min(starved, key=lambda pair: pair[1])


def _carrier_cap(node: Node) -> float:
    """The most a carrier passes on per second, or unlimited when it is not a carrier.

    A belt is the commonest bottleneck in the game and the one players most often miss:
    six and a half items a second, whatever is upstream of it.
    """
    if node.role in ("conveyor", "junction"):
        return node.block.rate or float("inf")
    return float("inf")


def solve(graph: Graph, supply: dict[int, Rates] | None = None,
          source: Catalogue | None = None) -> Result:
    """Push supply forward to a fixed point.

    `supply` is what each source node introduces per second, keyed by node index. Drills
    are the usual source and their rate depends on the ore beneath them, which a schematic
    does not carry: a layout on a rich patch and the same layout on a poor one are the same
    schematic. So the caller states it, and `sources.py` works it out when the ore is known.
    """
    known = source or catalogue()
    through: list[Rates] = [Rates() for _ in graph.nodes]
    fed: dict[int, float] = {}
    supply = supply or {}

    settled = False
    rounds = 0
    for rounds in range(1, ROUNDS + 1):
        arriving: list[Rates] = [Rates() for _ in graph.nodes]

        for index, rates in supply.items():
            if 0 <= index < len(graph.nodes):
                for item, amount in rates.per_item.items():
                    arriving[index].add(item, amount)

        for index, node in enumerate(graph.nodes):
            outgoing = graph.out_of(index)
            if not outgoing:
                continue
            # Split evenly. A router hands round-robin between its ways out and a drill
            # offloads the same way, so an even split is what the game does when nothing
            # downstream is backed up. It is wrong when one branch is full and the other is
            # not, and that case is what the bench is for.
            share = 1.0 / len(outgoing)
            passed = through[index].scaled(share)
            for target in outgoing:
                for item, amount in passed.per_item.items():
                    arriving[target].add(item, amount)

        changed = False
        for index, node in enumerate(graph.nodes):
            settled_here = _advance(node, index, arriving[index], through, fed, known)
            changed = changed or settled_here

        if not changed:
            settled = True
            break

    return Result(through=through, delivered=_delivered(graph, through),
                  fed=fed, settled=settled, rounds=rounds)


def _advance(node: Node, index: int, arriving: Rates, through: list[Rates],
             fed: dict[int, float], known: Catalogue) -> bool:
    """Work out what this block passes on, and say whether that changed."""
    before = dict(through[index].per_item)

    if node.role == "crafter":
        # A recipe runs at the pace of its scarcest ingredient, never faster than its own
        # craft time. Fed twice the coal it can use, a press still makes one graphite every
        # ninety ticks, and the extra coal backs up rather than becoming graphite.
        share = 1.0
        for item, needed in node.block.inputs.items():
            wanted = node.block.consumes(item)
            if wanted <= 0:
                continue
            share = min(share, arriving.of(item) / wanted if wanted else 0.0)
        share = max(0.0, min(1.0, share))
        fed[index] = share
        made = Rates()
        for item in node.block.outputs:
            made.add(item, node.block.produces(item) * share)
        through[index] = made
    elif node.role == "sink":
        # It takes what it is given and nothing leaves.
        through[index] = Rates()
    else:
        cap = _carrier_cap(node)
        total = arriving.total()
        if total > cap and total > 0:
            through[index] = arriving.scaled(cap / total)
        else:
            through[index] = arriving

    after = through[index].per_item
    if set(before) != set(after):
        return True
    return any(abs(after[item] - before.get(item, 0.0)) > SETTLED for item in after)


def _delivered(graph: Graph, through: list[Rates]) -> Rates:
    """What reaches somewhere it is meant to stop.

    A sink, or a carrier with nowhere left to hand on. The second case is the honest one
    for a schematic torn out of a base: its belt ends at the edge because the rest of the
    factory was not copied, and calling that nothing delivered would score every shared
    schematic at zero.
    """
    total = Rates()
    for index, node in enumerate(graph.nodes):
        if node.role == "sink" or not graph.out_of(index):
            source = _arriving_at(graph, through, index) if node.role == "sink" \
                else through[index]
            for item, amount in source.per_item.items():
                total.add(item, amount)
    return total


def _arriving_at(graph: Graph, through: list[Rates], index: int) -> Rates:
    total = Rates()
    for upstream in graph.into(index):
        share = 1.0 / max(1, len(graph.out_of(upstream)))
        for item, amount in through[upstream].per_item.items():
            total.add(item, amount * share)
    return total
