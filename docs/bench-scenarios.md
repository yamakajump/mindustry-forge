# Adding a scenario to the bench

The claim this repository makes is that its numbers are proven against the game rather than
against itself. A scenario is the unit that claim is made in: one schematic, run for the
same number of ticks by a real Mindustry v159.7 headless server and by the transcription of
its update loop in `site/public/forge/engine/`, with the two answers counted in items. This
document is how a contributor adds one.

## What a scenario is

One schematic that feeds itself. It carries its own sandbox source at one end and its own
vault at the other, so neither side has to be told where things go in or come out, and the
string handed to the game is the string handed to the browser.

Small on purpose. A large schematic that disagrees says something is wrong; a line of eight
belts that disagrees says which line of which class.

`SECONDS` is 30 and `TICKS` therefore 1800, both in `tools/oracle.mjs`. What gets compared,
built for both sides by `tools/compare.mjs`, is the contents of containers and cores, the
liquid in every pool, battery charge, what the machines are still holding, turret ammo,
carried payloads, units produced, and which blocks are still standing. Belts are not
compared: an item halfway along one is a sub-tile position, and whether it has been handed
on at frame eighteen hundred is a coin toss neither engine owes the other.

Items are compared exactly. Liquids are compared per pool to half a unit but the total of
each liquid to a hundredth, because a settled pipeline is a gradient two engines approach
from different sides while the amount in the run is a fact about the blocks. Battery charge
is compared to a thousandth, for the same reason applied to a float added to eighteen
hundred times in a different order on each side. Those three tolerances are the resolution
of the measurement, not slack granted to make a test pass.

## Where a scenario lives

Five things, all committed, which is why `npm test` needs nothing but the repository:

| | Written by | Holds |
|---|---|---|
| an entry in `SCENARIOS`, `tools/oracle.mjs` | you | the layout |
| `bench/data/oracle/<name>.txt` | `npm run oracle:measure` | the schematic in base64, the exact string both engines are given |
| `bench/data/oracle/<name>.sol` | `npm run oracle:measure` | the ground to paint, space separated |
| `bench/data/oracle/<name>.stock` | `npm run oracle:measure` | what blocks start out holding |
| `bench/data/oracle/<name>.json` | the game | what came out |

`bench/data/oracle/commands.txt` is written alongside them and holds one `measure` line per
scenario, which is what gets piped into the server.

## What the two commands actually do

`npm run oracle` walks `SCENARIOS`, encodes each one, runs it through the port, compares
against the recorded `.json` and prints a table. It exits non-zero above a two per cent gap.
It never starts the game, which is why `site.yml` runs it on every pull request.

`npm run oracle:measure` does not start the game either. It writes the `.txt`, `.sol` and
`.stock` of every scenario and the `commands.txt`, prints the command line that feeds them
to a server, and exits. On an unchanged tree it rewrites those files byte for byte: the
encoding is deterministic, so the only diff after adding a scenario is the scenario you
added and the two lines of `commands.txt`.

`npm test` walks `bench/data/oracle/*.json`, not `SCENARIOS`. The two lists are related only
by the files between them, and that has two consequences. A scenario in `SCENARIOS` with no
`.json` is invisible to `npm test` entirely. A `.json` left behind after its entry was
deleted from `tools/oracle.mjs` goes on being tested against its committed `.txt`, so
removing a scenario means removing its files in the same commit.

## Writing the entry

The key is the name, in kebab-case, and it is the filename of the four files. The value is a
function returning either a bare array of tiles or `{ tiles, ground, stock }`.

A tile is `{ x, y, block, rotation }`, with `raw` for the configuration the game would have
written: `item("coal")`, `liquid("water")`, `unit("mono")`, `blockOf("silicon-smelter")` for
a constructor's recipe, `point(dx, dy)` for a bridge or a mass driver link, and
`links([...])` for a power node. Rotation is 0 to 3.

Ground is written `ore-copper@2,3`, stock `coal*10@3,0` for items and `water~60@3,0` for a
liquid, all in the scenario's own coordinates. `shifted()` moves both lists to where the
schematic will land, because writing a schematic moves every block so that the lowest and
leftmost tile any of them covers sits at the origin; a ground list that did not make the
same move would end up under the tile next door, and both engines would paint the same wrong
tiles and agree perfectly.

Three things decide whether a scenario measures what its name claims:

**A floor is not an overlay is not a wall.** `groundOf` in `tools/compare.mjs` sorts the
painted list by class, and the bench does the same. Ore is laid over a floor, spore moss
**is** the floor, and Erekir's ore is an overlay on a wall. Spore moss painted as an overlay
leaves a cultivator standing on bare metal as far as `sumAttribute` is concerned, and the
boost the scenario exists to measure reads zero.

**Blocks that touch share a power grid; a node does not connect itself.** A power node
placed from a schematic carries its links in its configuration, and one written without them
connects to nothing at all. A generator meant to feed a drill either touches it or carries
the link.

**Two blocks may not share a tile.** `check()` throws when they do. The game silently keeps
one of them, so without that guard the measurement is of a schematic nobody described.
Blocks are stored at a corner and reach up and right by their size.

Both sides lay the schematic down at `[12, 12]`, which is `Measure.MARGIN`, so that the one
block whose behaviour depends on its map position, a separator seeded from `tile.pos()`, is
asked the same question twice.

A scenario that measures nothing passes silently, which is the failure worth guarding
against: `tests/js/oracle.test.js` asserts that the comparison produced at least one row,
unless the name is listed in `NOTHING_HAPPENS`, where the emptiness is the result.

## Measuring it

This needs a JDK 17 and a provisioned server. Neither is in the repository: `_run/` is
gitignored, and the game's jar is not ours to redistribute.

```bash
python bench/server_setup.py _run                     # the pinned v159.7 server jar
(cd bench && ./gradlew jar)                           # build/libs/mindustry-forge-bench.jar
cp bench/build/libs/mindustry-forge-bench.jar _run/config/mods/
```

`server_setup.py` refuses a download under 15 MB, because a truncated file and an error page
saved under the wrong name both look like a jar until Java opens them. The plugin compiles
against `Anuken:Mindustry:v159.7`, pinned in `bench/build.gradle` and never `latest`, since a
silent engine bump would invalidate every measurement recorded here.

Then write the scenario files and feed them to the server:

```bash
npm run oracle:measure
cd _run && (cat ../bench/data/oracle/commands.txt; sleep 20; echo exit) \
  | java -jar server-release.jar
```

That re-measures everything and rewrites every `.json`. To measure one scenario alone, feed
its line only:

```bash
cd _run && (grep -- "/<name>.json" ../bench/data/oracle/commands.txt; sleep 20; echo exit) \
  | java -jar server-release.jar
```

The `sleep` is not padding. A command cannot advance the world from inside itself, so
`measure` arms a countdown and the frames that follow finish the job; the jobs queue rather
than replace each other, and the server has to outlive them all before `exit` reaches it.
Typed without a queue, nine commands arriving in the same frame produced one measurement.

Then `npm run oracle` for the table and `npm test` for the verdict, and commit the four
files together with the entry.

## If you have no jar

Add the entry, run `npm run oracle:measure`, commit the `.txt`, `.sol`, `.stock` and the
changed `commands.txt`, and say in the pull request that the scenario is not measured.

Nothing breaks. `npm run oracle` prints `pas encore mesure` on that line and counts it in the
tally at the bottom without failing, because its exit code depends only on the worst gap
among the scenarios that have an answer, and `npm test` never sees it because it walks the
`.json` files. The scenario sits in the repository as a question asked and not yet answered,
which is where it is useful: the next person with a provisioned server measures it by
running the two commands above, and the answer arrives in one commit.

## When a measured scenario disagrees

`node tools/trace.mjs <name>` writes one line per frame from the port, and prints the command
that makes the game write the same shape through the bench's `trace` command. The first line
where the two differ names the block and the frame. A total after eighteen hundred frames
cannot say which frame it was, which is how two scenarios sat one item apart for weeks
before turning out to be the same thing: the game counts in single precision and the port
counted in double, and a comparison that falls on the wrong side once in a run is enough.

A disagreement is a bug in the port, not a matter of opinion. Never adjust a constant until
a test goes green. If a number cannot be explained by reading the game's own source or
bytecode, say so in the pull request instead of shipping it.
