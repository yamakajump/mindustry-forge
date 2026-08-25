# Putting a design on the board

You do not have to be trusted. That is the point of this whole arrangement: your
schematic is stamped into the same world as everybody else's, given the same seconds, and
the engine says what it delivered. If your number holds, it goes in. If it does not, the
robot says so and nobody has to argue.

## The short version

```bash
pip install -e ".[dev]"
cd bridge && ./gradlew jar && cd ..

# measure your schematic on the bench
python tools/measure.py copper-line \
    --schematic yours.msch --origin -4 -7 \
    --author "your name" --objective density \
    --out designs/mine.entry.json

# put it in the catalogue
python tools/publish.py designs/mine.entry.json

# open a pull request with the change to docs/catalogue.json
```

The first run downloads a pinned Mindustry server, about 19 MB. Java 17 and Python 3.11 or
newer.

## Why `--origin` is not optional

A schematic is cropped to its own bounding box, so it has forgotten where it was standing.
A copper line that reached the core when you measured it delivers exactly nothing four
tiles to the left. The origin is where the design's lower left corner sits **as an offset
from the core**, and it travels with the entry so that anybody can put the design back
exactly where you had it.

Anchored on the core rather than on the work area, deliberately. The work area is a choice
this repository makes and could change; the core is the thing being delivered into. A
design stored the other way round measured 264 items on the world it was found on and
nothing at all on three others.

## What gets refused, and why

**Measured somewhere else.** A different map, seed, duration, clearance radius or engine
version means a different problem. Ranking those together turns the column into noise, so
they are refused rather than sorted in. Use the conditions already in the category: the
site shows them under each board.

**Delivered nothing.** A design that produces nothing cannot be ranked against ones that
do, however elegant or however small.

**Already there.** The same schematic twice.

**A number that does not hold up.** Every pull request touching `docs/catalogue.json` gets
its new entries re-measured by
[`verify-catalogue.yml`](.github/workflows/verify-catalogue.yml). A claim that misses by
more than 2% fails the check, and the log shows claimed against measured. The tolerance is
not zero because a design sitting on a production tick boundary can land either side of it,
and failing somebody for arithmetic would be rude.

**Not refused: being worse than the leader.** A design that works and comes tenth still
belongs. A board with one row is a list, and nobody rereads a list.

## Found a way to cheat the bench?

Say so, loudly, in an issue. It is more valuable than a good schematic.

The bench has been wrong four times so far and every one of those was found by measuring
rather than by thinking: ore against the core made conveyors unnecessary, sparing a radius
made the last tile of every line unbuildable, the material-held figure counted the core's
own stock, and a cost ceiling handed free blocks to designs that delivered nothing. All
four are in the README under *what the search kept getting paid for instead*.

When the bench changes, the affected entries are re-measured and the ones that only worked
because of the flaw come out. That is what the provenance on every entry is for: an entry
that has forgotten which world it was measured on can never be rechecked, and a catalogue
that cannot recheck itself is a pile of claims.

## If your design uses a block nobody has used yet

The site draws with Mindustry's own art, and only the sprites the catalogue needs are kept
in the repository. Add a schematic holding a block no entry used before and it will draw as
a plain coloured tile until somebody runs:

```bash
python tools/sprites.py
```

That pulls the missing art out of the pinned engine's asset jar, writes it into
`docs/sprites/`, and prints what it fetched. Commit the result alongside your entry. It
names any block it could not find art for rather than leaving you to spot it.

## Adding a new question

A specification is what arrives, what has to leave, how big the square is and how long a
design gets. They live in [`forge/spec.py`](forge/spec.py) and are a few lines each. An
objective is what "best" means, in [`forge/objective.py`](forge/objective.py).

Two rules hold for every objective, and both were learned the hard way:

- nothing that fails to produce can win
- a hint may never pay better than the goal

If you add one, add the test that pins those, next to the ones already there.

## Working on the code

```bash
python -m pytest tests/ -q
```

Three of those tests hand a schematic to Mindustry's own decoder and need a JDK plus the
downloaded server; they skip cleanly without them, but they are the only ones that check
the format against the game instead of against our own reader, so do not let them skip in
CI.

Comments explain *why*, not *what*. Most of the ones here exist because something was
already got wrong once, and the comment is what stops it being got wrong again.
