# mindustry-forge

**Ask for a factory. Get one nobody designed.**

You say what arrives, what has to leave, and what "best" means. The forge searches for a
layout, stamps each candidate into a running Mindustry server, and keeps the ones that
actually deliver. Nothing here is told what a conveyor is for, which way a drill faces, or
that the two go together. The rules of the game are the entire fitness function.

```bash
python tools/optimise.py copper-line
python tools/optimise.py graphite --objective compact
python tools/optimise.py copper-line --objective budget --budget-blocks 20
```

A browser window opens on the search while it runs: the design currently winning, the
population behind it, and the material stuck inside the design beside the score.

## Or take one without running anything

**[The catalogue](https://yamakajump.github.io/mindustry-forge/)** holds designs that have
already been measured. Copy one, paste it into your game with `ctrl+v`, done. No mod, no
install, no account.

What makes it worth reading is not that it has schematics, every site has schematics. It
is that **every number in it was measured rather than claimed**, by the bench in this
repository, on one pinned world, for the same number of seconds, on one pinned version of
the game. An entry measured anywhere else is refused rather than quietly ranked alongside,
because two designs compared across different worlds are not being compared at all.

Beat one and it goes on the board. Your submission is re-measured automatically on the
same bench, so nobody has to take your word for it, and nobody has to take mine either.
See [CONTRIBUTING.md](CONTRIBUTING.md).

## No human blueprints, on purpose

The community shares thousands of schematics. Importing them would have been easy and
would have proved nothing: copying a design from somebody who already solved the game
automates a player rather than beats one. Every layout the forge produces comes out of its
own search, scored on what it delivered.

The first design it found, given nothing but "get copper to the edge", was a vertical
conveyor trunk fed by drills on both sides. Nobody showed it that. Put back on three maps
it had never seen, repeated three times, it beat a hand-written routine on all three while
using half the blocks per unit delivered.

## Asking a question

A problem is three statements and nothing more.

**What arrives.** Input ports sit on the edges of the work area and hand items in at a
rate you choose, standing in for a belt from somewhere else. A specification with no
inputs has to mine what it needs.

**What has to leave.** An output port takes whatever it is given and counts it. One named
item, never "anything", because scoring anything makes the answer sand: it covers most of
the map, it sits next to the base, and the winning design is drills with no conveyor at
all. Correct, optimal, and silent on the question.

**What best means**, because the smallest design and the fastest one are almost never the
same:

| objective | what wins |
|---|---|
| `throughput` | as much as possible, with a light penalty for sprawl |
| `compact` | the fewest blocks that still clear a delivery rate you name |
| `density` | the most output per block |
| `budget` | as much as possible inside a hard ceiling on blocks |

Specifications live in [`forge/spec.py`](forge/spec.py) and objectives in
[`forge/objective.py`](forge/objective.py). Adding either is a few lines.

## How a design is written down decides what can be found

The genome is not a detail. Measured on the same problem, the same budget, the same world:

| written as | after 25 generations |
|---|---|
| a grid of cells, one square at a time | **nothing delivered**, 110 blocks of noise |
| machines and lines | **30 delivered**, still climbing |

Spelling a ten-tile conveyor line one square at a time means getting ten rotations right in
a row: one chance in a million, before choosing which ten of a hundred and sixty-nine
tiles. Written as a line, it is one gene, its rotations come from the direction of travel,
and it cannot be wrong.

Both genomes are in [`forge/layout.py`](forge/layout.py), because the second is only
interesting next to the first. `--genome cells` runs the losing one.

## What the search kept getting paid for instead

Every one of these was found by measuring, not by thinking, and each cost hours.

**A hint that pays better than the goal is not a hint.** Material stuck inside a design is
what lifts an incomplete line out of the flat zero it shares with an empty rectangle;
without it the search has nothing to climb and the population shrinks towards building
nothing. Uncapped, the same term became the thing being optimised: a population settled at
a mean score of which **89% was material sitting in belts going nowhere**, against a
twentieth of that delivered. It had stopped building lines and started hoarding. It is
capped now, a test holds the cap, and the viewer draws it beside the score so the next
such drift shows in a glance.

**A gate that is not a gate.** An earlier `compact` claimed a design had to reach a
delivery rate to count, and actually used that rate as a ceiling on the credit for
delivering. Everything that produced a single unit passed, so the ranking became "the
smallest design that delivers at least one thing", which is a drill with nowhere to send
its ore.

**A bench with a trivial answer.** Put the material against the output and no line is
needed: the engine pushes from a drill into any adjacent building. The work area now keeps
the material out of reach.

**A bench that could not be won.** Sparing a radius around the output instead of the tiles
it actually stands on leaves the ring around it unbuildable, so the last tile of every
line, the one that has to touch the output, is silently skipped. No design could deliver,
however right it was.

**A ceiling that exempts exactly who it should charge.** The block cost could make
emptiness optimal: three delivered across seventy blocks scored below an empty rectangle,
and being told the answer is to stop building is the worst thing a search can hear in its
second generation. Capping that cost at half of what was *delivered* fixed it and broke
something else, because the cap is zero for anything that delivers nothing: a hoarder got
all of its blocks free and tied a design that worked. The cap sits on what was *earned*
now, partial credit included, and both properties hold at once.

**The bench was counting the base's own stock.** The work area has to cover the output, the
output is a core holding hundreds of the item being counted, and the material-held figure
included it. A hand-built line standing six blocks reported 210 items stuck, where thirty
is the physical maximum. Every candidate collected the same large number, so the partial
credit stopped telling any two of them apart and became a constant, which is the one thing
a gradient must never be.

**Asked for is not the same as got.** A design whose blocks were partly refused asks for
more than it stands. The search scored the accepted count and the run printed the requested
one; seventeen advertised, twelve standing. Worse, the exported schematic carried all
seventeen, so a player would have pasted five blocks that never existed in the world the
number came from.

**Mindustry maps are not fixed.** `World.applyFilters` calls `filter.randomize()` on every
generation filter at every load, so the ore is repainted each time. Three loads of the same
map: 1339, 1543 and 1330 tiles of copper. Every run here pins a seed, and without one no
two runs are comparable.

## Running it

Java 17 and Python 3.11. The Mindustry server downloads itself on first run.

```bash
pip install -e ".[dev]"
python tools/optimise.py copper-line
```

The forge talks to a headless Mindustry server through a small plugin in
[`bridge/`](bridge), built automatically. Every measurement comes from the engine: items
delivered are counted by the game's own transport counter, and material held inside a
design is read off the buildings themselves.

## Where it stands

Working: the copper line, the two genomes, the four objectives, the live viewer, seeded
worlds, export to `.msch`, the catalogue, and the re-measurement that guards it.

The export is checked against the game rather than against itself.
[`tests/game/CheckSchematic.java`](tests/game/CheckSchematic.java) hands the bytes to
Mindustry's own decoder and compares tile by tile, because a reader written from the same
notes as the writer agrees with it whether or not either is right.

Is the forge any good? On `copper-line`, asked for density, it reaches **1.75 copper per
block** against **1.67** for a drill and a belt placed by hand on the same world. It wins,
narrowly, while delivering twice as much. Asked for raw throughput instead it sprawls,
which is not a failure of the search but a correct answer to a question worth less: at a
block cost of 0.05, waste is nearly free. `tools/measure.py` builds the hand-made baseline
so that any claim here can be checked against one.

Next: the recipes with real depth. Graphite needs a coal line and a press; silicon needs
coal, sand and power arriving together and produces nothing until all three do. That is
where a schematic optimiser earns its name, and it is what the input ports and the `give`
bridge command were built for.

## Related

[mindustry-ai](https://github.com/yamakajump/mindustry-ai), where this search was first
built and measured. That project asks whether an agent can learn to play; this one asks
what the best machine for a job is. They turned out to be different questions with
different loops, so they became different repositories. The designs found here are the
vocabulary that one is trying to learn to place.
