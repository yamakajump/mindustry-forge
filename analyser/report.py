"""The answer a player actually wants, from a schematic string.

One entry point, because everything upstream of it is machinery and this is the product:
paste what you copied out of the game, get told what it makes, where it chokes and what it
wastes.

The waste part is the half nobody else reports. Every calculator on the web will tell you a
ratio; none will tell you that four of your belts carry nothing because they end in a wall,
which is the commonest thing wrong with a schematic somebody shared in a Discord.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from analyser import flow, graph, schematic
from analyser.blocks import Catalogue, catalogue
from analyser.flow import Rates


@dataclass
class Report:
    """What a schematic is and does."""

    name: str
    width: int
    height: int
    blocks: int
    game_version: str

    produced: dict[str, float] = field(default_factory=dict)
    #: Block name and how starved it is, or None when everything runs flat out.
    bottleneck: tuple[str, float] | None = None
    #: Blocks connected to nothing at all, by name and count.
    idle: dict[str, int] = field(default_factory=dict)
    #: Items a second handed in that the layout cannot use, by item. Over-supply is not an
    #: error, it is the belt backing up, and a player wants to know they are paying for
    #: three times the coal a press can eat.
    surplus: dict[str, float] = field(default_factory=dict)
    #: Blocks this catalogue has never seen, which the analysis had to treat as walls.
    unknown: dict[str, int] = field(default_factory=dict)
    cost: dict[str, int] = field(default_factory=dict)
    power: float = 0.0
    settled: bool = True

    def per_minute(self) -> dict[str, float]:
        return {item: rate * 60 for item, rate in self.produced.items()}

    def lines(self) -> list[str]:
        """The report as a person reads it, which is also what the tests assert on."""
        out = [f"{self.name}  {self.width}x{self.height}, {self.blocks} blocs"]

        if self.produced:
            for item, rate in sorted(self.per_minute().items(), key=lambda kv: -kv[1]):
                out.append(f"  sortie      {rate:8.1f} {item} / min")
        else:
            out.append("  sortie      rien n'en sort")

        if self.bottleneck:
            name, share = self.bottleneck
            out.append(f"  goulot      {name}, nourri a {share:.0%}")
        elif self.produced:
            out.append("  goulot      aucun, tout tourne a plein")

        if self.surplus:
            detail = ", ".join(f"{rate * 60:.0f} {item}/min"
                               for item, rate in sorted(self.surplus.items()))
            out.append(f"  en trop     {detail} arrivent sans pouvoir etre consommes")

        if self.idle:
            total = sum(self.idle.values())
            detail = ", ".join(f"{n} x{c}" for n, c in sorted(self.idle.items()))
            out.append(f"  gaspille    {total} blocs relies a rien : {detail}")

        if self.unknown:
            detail = ", ".join(f"{n} x{c}" for n, c in sorted(self.unknown.items()))
            out.append(f"  inconnu     {detail} (traites comme des murs)")

        if self.power:
            out.append(f"  energie     {self.power:.0f} / s consommes")

        if not self.settled:
            out.append("  attention   la disposition boucle sur elle-meme, "
                       "le debit n'est pas un regime stable")

        return out

    def __str__(self) -> str:
        return "\n".join(self.lines())


def analyse(text: str, supply: dict[str, float] | None = None,
            source: Catalogue | None = None) -> Report:
    """Read a schematic string and say what it does.

    `supply` is what arrives from outside, per item per second, and it is asked for rather
    than guessed. A schematic torn out of a base is a middle: a press with no drill in the
    picture makes nothing at all, and reporting that as a broken design would be wrong. So
    a caller who knows what feeds it says so, and a caller who does not gets what the
    layout produces on its own.
    """
    known = source or catalogue()
    parsed = schematic.from_base64(text)
    made = graph.build(parsed["tiles"], known)

    feeds: dict[int, Rates] = {}
    if supply:
        # Handed to every block on the edge that will take it, which is where a belt from
        # somewhere else would arrive.
        for index in _entrances(made):
            rates = Rates()
            for item, rate in supply.items():
                rates.add(item, rate)
            feeds[index] = rates

    solved = flow.solve(made, feeds, known)

    idle: dict[str, int] = {}
    for index in graph.orphans(made):
        name = made.nodes[index].name
        idle[name] = idle.get(name, 0) + 1

    unknown: dict[str, int] = {}
    cost: dict[str, int] = {}
    power = 0.0
    for node in made.nodes:
        if node.role == "unknown":
            unknown[node.name] = unknown.get(node.name, 0) + 1
        for item, amount in node.block.cost.items():
            cost[item] = cost.get(item, 0) + amount
        power += node.block.power

    culprit = solved.bottleneck(made)
    surplus = {item: rate for item, rate in _surplus(made, solved, feeds).items()
               if rate > flow.SETTLED}
    return Report(
        name=parsed["tags"].get("name", "sans nom"),
        width=parsed["width"],
        height=parsed["height"],
        blocks=len(parsed["tiles"]),
        game_version=known.game_version,
        produced={item: rate for item, rate in solved.delivered.per_item.items()
                  if rate > flow.SETTLED},
        bottleneck=(made.nodes[culprit[0]].name, culprit[1]) if culprit else None,
        idle=idle,
        surplus=surplus,
        unknown=unknown,
        cost=cost,
        power=power,
        settled=solved.settled,
    )


def _surplus(made: graph.Graph, solved: flow.Result,
             feeds: dict[int, Rates]) -> dict[str, float]:
    """What was handed in and neither came out nor was turned into something else.

    The difference between what entered and what left, per item, which on a settled layout
    is exactly what is backing up against a machine that cannot eat it fast enough.
    """
    put_in: dict[str, float] = {}
    for rates in feeds.values():
        for item, rate in rates.per_item.items():
            put_in[item] = put_in.get(item, 0.0) + rate

    left: dict[str, float] = dict(solved.delivered.per_item)
    eaten: dict[str, float] = {}
    for index, node in enumerate(made.nodes):
        if node.role != "crafter":
            continue
        share = solved.fed.get(index, 0.0)
        for item in node.block.inputs:
            eaten[item] = eaten.get(item, 0.0) + node.block.consumes(item) * share

    return {item: rate - left.get(item, 0.0) - eaten.get(item, 0.0)
            for item, rate in put_in.items()}


def _entrances(made: graph.Graph) -> list[int]:
    """Blocks nothing inside the schematic feeds, which is where the outside comes in.

    A block leading nowhere is not one of them. Feeding an orphan belt handed it the full
    supply and counted every item straight back out as delivered: the first real schematic
    this was run on reported 240 coal a minute out of a single stranded conveyor, which
    would have made a broken layout look like the best in the catalogue.
    """
    return [index for index in range(len(made.nodes))
            if not made.into(index)
            and made.out_of(index)
            and made.nodes[index].role != "drill"]
