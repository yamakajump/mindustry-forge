# Rebuilding the report

The request behind this design: "even rethink all the displays, there are loads of boxes on
the right where you have to read everything. I think you can try to refactor everything,
rethink everything. Delete all the code that will no longer be used, redo it all, to make a
really nice interface that would be much better." And, with five screenshots of display art
and meme builds: "there will be plenty of different types. Schematics just for fun, a bit
trolly and funny, so take that into account too."

## What is wrong, with the cause rather than the symptom

Measured on production, on a 95-block schematic with two intakes marked: **seven cards,
1 567 px of column against a 905 px viewport, 217 words.** That is the *average* case. This
schematic has no bottleneck, no waste, no logic and no notes; a schematic that triggers
every card reaches thirteen.

**The page never answers the question it asks.** The schematic is called "Water power 2306
energy". The answer, 2 402 energy a second, is the fourth card down, under a login prompt,
a list of coordinates and a shopping list of pumps.

**Everything weighs the same.** `forge.css:397` gives every `.card h2` the same 12px
uppercase treatment, and `render()` emits every card with the same border, padding and
rhythm. "Barriere de Refoulement en (1, 14)" carries exactly the authority of the net output.
That is what "you have to read everything" means: the design offers no way to skip.

**The art direction is contradicted by one line.** `docs/direction-artistique.md` states that
`--accent` is "the brand, and one thing per screen". `forge.css:399` is
`color: var(--accent)` on `.card h2`, so the accent appears seven to thirteen times per
screen. When everything is emphasised, nothing is.

**One figure is printed twice, one card apart.** "Une fois alimente a fond" states a ceiling
and "Branche comme il est" states a throughput; on an unbottlenecked schematic they are the
same number. A reader meeting 2,67 twice under two different headings has to work out that
it is one fact, not two.

**The report assumes every schematic makes something.** `awaiting` is
`!marked && !sealed && !selfFed` (`bilan.js`), so a wall of logic displays showing a meme is
asked where it plugs in, and is offered a ceiling of nothing. Mindustry has a real culture
of display art and joke builds, and the tool currently treats every one of them as a factory
that failed to be measured.

**`render()` is 634 lines** inside a 1 958-line `index.html`, building HTML by string
concatenation. Nothing in it can be tested apart from the rest.

## The shape

### 1. Thirteen cards become five blocks

| Today | Becomes |
|---|---|
| Une fois alimente a fond, Branche comme il est, Goulot | **The verdict**, one block |
| A savoir | **The warning band**, above the verdict |
| Partager, Completer ce schema | **The action**, one card |
| Entrees et sorties, Il lui faut | **Ce qu'il faut lui amener** |
| Fabrique et consomme sur place, Energie, Ce qui se perd | **Ce qu'il sort** |
| Ce que dit le jeu, Logique | **Ce qu'il coute** |

Nothing is removed, and nothing is folded behind a click. Every figure the report shows
today it still shows. What changes is that the answer is the size of an answer and the rest
is the size of support, so ninety per cent of the page becomes skippable at a glance.

### 2. The verdict says what a thing is before it says how much

Classified from the game's own taxonomy rather than from a guess: every block in
`blocks.json` carries a `category` (`logic`, `turret`, `crafting`, `distribution`,
`defense`, `power`, ...) and a `kind` (`LogicDisplay`, `CanvasBlock`, `LogicBlock`, ...),
both written by `tools/build_catalogue.py` out of the game. A display is recognised exactly,
not heuristically, which is the same rule the rest of this repository follows about reading
the game rather than a wiki.

Six answers, in this order of precedence:

| What it is | What the verdict states |
|---|---|
| It shows things | how many displays and processors, what it draws, what it costs |
| It makes things | the throughput, or the ceiling when nothing is marked |
| It makes power | the net |
| It defends | the turrets and what they are fed |
| It carries things | what can pass and how fast |
| None of the above | what it eats and what it costs |

Display art is tested first on purpose. A meme wall usually carries a battery and a solar
panel, so a rule that asked "does it produce power" first would file it as a power plant.

**The marking request disappears on the types that have nothing to plug in.** This is the
defect the screenshots exposed, and it is the one that makes the tool look stupid on first
contact: asking a wall of displays where its intake is.

The tone stays deadpan. "Ca ne fabrique rien" under a display showing ДАВАЙ ВАХНЕМ is funnier
than a written wink and does not age. Never `--bad`, never "impossible d'analyser": the block
says what the thing is, not what the tool failed to do.

### 3. The picture is what you act on, the report is what you read

Today the marking controls sit on both sides: `[Entree] [Sortie]` in the left panel,
`[Marquer autre chose] [Tout effacer]` in the right card. The reader's eyes cross the page
for one gesture.

After: everything you *do* is on the picture, everything you *read* is in the report. The
verdict's button arms a marking mode; markable tiles take a **dashed** outline; clicking one
opens a bubble anchored on that tile. `#block` loses its marking section and its
`[Tourner] [Retirer ce bloc]`, and does one thing: say what this block is.

The outline is dashed and appears only during marking mode, deliberately. `render.js:823`
records that a ghost ring on every markable tile was already tried and removed, because it
produced "fourteen green squares with one of them slightly brighter, and no way to tell
which was which". The lesson is that a candidate must not look like a mark.

`draw()` returns `{ box, scale }` and `index.html:1662` already turns a click into tile
coordinates, so anchoring a bubble on a tile is the same arithmetic run backwards.

### 4. One accent per screen

`.card h2` loses `color: var(--accent)`; group headings go to `--dim`. The amber is left to
the verdict's figure, which is the one thing per screen the art direction asks for.

### 5. The code

`render()` becomes an assembler of about sixty lines over modules under
`site/public/forge/rapport/`, one per block, each a pure function testable under Node like
the rest of `tests/js/`.

**None of them is imported by `bilan.js`.** That is the line that keeps them outside
`EngineVersion::SOURCES`: `EngineVersionTest` walks the imports out of `bilan.js`, so a
presentation module that stays out of that graph can be rewritten freely without ageing any
of the 15 534 stored analyses. `index.html`, `render.js`, `forge.css` and `lang/fr.json` are
outside the hash for the same reason.

The hand-written French goes to `fr.json` as each region is rewritten, so the ratchet in
`tests/js/chaines-en-dur.test.js` falls rather than being worked around.

## Delivered in three passes

Each one deployed, so a visual objection costs one pass and not the whole rebuild.

1. **The structure**: five blocks, the typed verdict, one accent. Marking still works as it does today.
2. **The gesture**: the bubble on the picture, `#block` stripped to one job.
3. **The sweep**: dead code, the hand-written French that is left, the duplicated figures.
