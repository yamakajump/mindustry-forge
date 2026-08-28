# Ground rendering implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A painted patch of ground stops reading as corduroy: tiles meet with no joint, repeat with the game's own variants, and blend at the boundary between two floors the way `Floor.drawEdges` blends them.

**Architecture:** A new pure module `site/public/forge/tiling.js` holds the three decisions that can be tested without a canvas - where a tile's rectangle lands, which variant a tile takes, and which neighbouring floors bleed onto it. `render.js` keeps the `drawImage` calls and gains nothing else. The data the last decision needs (`blend_id`, `draw_edge_out`, variant counts) is dumped from the game into `bench/data/blocks.json` and lands in a new `site/public/forge/sols.json`, never in the hashed `site/public/forge/blocks.json`.

**Tech Stack:** Vanilla ES modules, `node --test` (no framework, no dependency), Python 3 with Pillow for the atlas, Java 17 and Gradle for the block dump.

This plan implements section 2 of `docs/plans/2026-08-28-mode-edition-refonte-design.md`. Read that first: it carries the reasoning, this file carries the steps. It is the first of five plans for that design; the palette, the board and frames, the work spaces and the separate editor page follow in their own files.

## Global Constraints

- Repository language: **English** for code, comments, commit subjects and PR text. French only in `site/lang/` and `site/public/forge/lang/`.
- **No em dash (U+2014) anywhere.** Use a comma, a colon, a full stop or a short hyphen.
- Commit subjects: conventional, imperative, **50 characters maximum**. Body explains
  *why*. Count it rather than eyeing it: every one of this plan's first six suggested
  subjects was over, between 51 and 60. `git log -1 --pretty=%s | wc -c` before pushing.
- Accented characters are written out in French strings. The font carries them.
- **`site/public/forge/blocks.json` must come out of this plan byte-identical.** It is hashed by `EngineVersion` and fifteen thousand stored analyses depend on it. Task 3 verifies this with a checksum, and a mismatch stops the task.
- Work happens in a dedicated git worktree on `feat/mode-edition`, not in the shared
  checkout. Several other sessions are live on this repository at the same time.
- Do not open `site/public/index.html`: another session holds it until it merges. Nothing in this plan needs it.
- Stage by explicit path: `git add <the files this task names>` then `git commit -m`.
  **Never `git add -A`.** This worktree is yours alone, but the habit is what keeps a
  commit honest about what it contains.
- Run `npm test` before every commit. It must pass, not merely "not obviously break".

## The jar this plan reads

`tools/build_sprites.py` and Task 3 need `mindustry-forge/assets-v159.7.jar` and
`mindustry-forge/server-release.jar`. The `mindustry-forge/` directory is gitignored, so a
fresh worktree does not have it. Before Task 2, make it visible from the worktree root, by
pointing a junction at the same directory in the main checkout:

```bash
cmd //c mklink //J "<worktree>\mindustry-forge" "<main checkout>\mindustry-forge"
```

A junction rather than a copy: the jars are 35 MB and 19 MB, and a copy is a second thing
that can drift from the pinned build. Verify with `ls mindustry-forge/*.jar` from the
worktree root before starting Task 2.

---

### Task 1: WITHDRAWN - the seam it fixed does not exist

Kept numbered rather than removed, so that the numbers in the ledger and in the commit
history still line up with this file.

This task rounded both edges of a ground tile so that neighbours would meet on the same
pixel. It was written, reviewed, committed as `bb84ec3` and reverted in `560781e` once
somebody measured instead of reading: `editor/camera.js:20` clamps the editor's zoom with
`Math.round` and `render.js:364` derives the report's with `Math.floor`, so the scale is
always whole, and `devicePixelRatio` is 1 on the machine the complaint came from. A probe
drawing eight tiles at scales 13, 24 and 31, with and without the rounding, counted zero
background columns in all six cases.

`tileRect` is gone with it. Tasks 2 and 5 draw at the existing `px` and `py`, which were
never wrong.

**Start at Task 2.**

---

### Task 2: The variants the game ships and the atlas throws away

`tools/build_sprites.py:171` takes `grass1` and skips `grass2` and `grass3`. Every tile of
grass is therefore the same 32 pixel image, and its diagonal pattern lines up from tile to
tile into stripes. 67 of the catalogue's 107 floors have unused variants in the jar.

**Files:**
- Modify: `tools/build_sprites.py:170-178`
- Create: `site/public/forge/tiling.js`
- Create: `tests/js/tiling.test.js`
- Modify: `site/public/forge/render.js:419-435` (the ground loop)

**Interfaces:**
- Consumes: nothing.
- Produces: `variantOf(x, y, count) -> integer in [0, count)`. Atlas keys gain
  `floor/<name>#<n>` for n from 1, alongside the existing `floor/<name>`.

- [ ] **Step 1: Write the failing test**

Create `tests/js/tiling.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { variantOf } from "../../site/public/forge/tiling.js";

test("a floor with one sprite always takes it", () => {
  for (const [x, y] of [[0, 0], [7, 3], [-4, 19]]) {
    assert.equal(variantOf(x, y, 1), 0);
    assert.equal(variantOf(x, y, 0), 0);
  }
});

test("the variant is in range and never moves", () => {
  for (let x = -20; x < 20; x++) {
    for (let y = -20; y < 20; y++) {
      const first = variantOf(x, y, 3);
      assert.ok(first >= 0 && first < 3, `${x},${y} gave ${first}`);
      assert.equal(variantOf(x, y, 3), first, "not stable across calls");
    }
  }
});

test("the variant depends on both coordinates, which is the whole point", () => {
  /* A hash of x alone stripes the board vertically, a hash of y alone stripes it
     horizontally, and either one is the defect this replaces wearing a different hat. So
     the check is not "it varies" but "it varies along both axes". */
  const alongX = new Set();
  const alongY = new Set();
  for (let i = 0; i < 40; i++) {
    alongX.add(variantOf(i, 0, 3));
    alongY.add(variantOf(0, i, 3));
  }
  assert.ok(alongX.size > 1, "a whole row took the same variant");
  assert.ok(alongY.size > 1, "a whole column took the same variant");
});

test("the three variants come up about as often as each other", () => {
  /* 4096 tiles is the largest board this editor allows, so this is the real population
     rather than a sample of it. A hash that is technically in range but favours one
     variant four to one looks, on a painted patch, exactly like no variants at all. */
  const seen = [0, 0, 0];
  for (let x = 0; x < 64; x++) {
    for (let y = 0; y < 64; y++) seen[variantOf(x, y, 3)]++;
  }
  const expected = 4096 / 3;
  for (const [n, count] of seen.entries()) {
    assert.ok(Math.abs(count - expected) < expected * 0.15,
      `variant ${n} came up ${count} times, expected about ${Math.round(expected)}`);
  }
});

test("neighbours usually differ, which is what kills the stripes", () => {
  let same = 0;
  for (let x = 0; x < 63; x++) {
    for (let y = 0; y < 64; y++) {
      if (variantOf(x, y, 3) === variantOf(x + 1, y, 3)) same++;
    }
  }
  // A third of neighbours matching is what three variants picked independently gives.
  assert.ok(same < 63 * 64 * 0.45, `${same} of ${63 * 64} horizontal neighbours matched`);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test`
Expected: FAIL, `variantOf is not a function`.

- [ ] **Step 3: Write `variantOf`**

Create `site/public/forge/tiling.js`:

```js
/**
 * The decisions behind drawing the ground, kept out of the canvas so they can be tested.
 *
 * `render.js` owns the `drawImage` calls and nothing else. What is here is arithmetic, and
 * a canvas is not needed to check arithmetic.
 */
```

then append to it:

```js
/**
 * Which of a floor's sprites this tile takes.
 *
 * The game asks `Mathf.randomSeed(Point2.pack(x, y), 0, variants - 1)`, and this is
 * deliberately not that. The game seeds on a position in a real map; a schematic's tiles
 * are at local coordinates and do not know where they will be pasted, so an exact port
 * would produce a different pattern from the one the player saw in game anyway. There is no
 * accuracy on offer here, only the absence of repetition, and any well spread hash gives
 * that. Said plainly because "this follows the game's formula" is a claim this repository
 * makes seriously, and it would be false here.
 *
 * The mixing is the finalising half of murmur3, over a pair of odd multipliers, which
 * spreads adjacent inputs rather than merely distinguishing them. `x % count` on a plain
 * sum does distinguish them and stripes the board diagonally, which is the defect wearing
 * a different hat.
 */
export function variantOf(x, y, count) {
  if (count <= 1) return 0;
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) % count;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Pack the variants into the atlas**

In `tools/build_sprites.py`, replace the ground block at lines 170-178 with:

```python
    # The ground. Every variant the game ships, not just the first: `grass1`, `grass2` and
    # `grass3` exist, the game picks one per tile, and packing only `grass1` made a painted
    # patch line its diagonal pattern up from tile to tile into stripes.
    #
    # The bare `floor/<name>` key stays, and stays first: it is what a caller with no
    # position to hash asks for, and what a floor with a single sprite has.
    for name, entry in catalogue["blocks"].items():
        if not entry.get("floor"):
            continue
        path = sprites.get(name) or sprites.get(f"{name}1")
        if path:
            wanted.append((f"floor/{name}", path))
        for n in range(1, 10):
            variant = sprites.get(f"{name}{n}")
            if variant:
                wanted.append((f"floor/{name}#{n}", variant))
```

- [ ] **Step 6: Rebuild the atlas and read what it says**

Run: `python tools/build_sprites.py`
Expected: the printed sprite count rises by about 230 and the printed size rises. Write both
numbers down, before and after: Task 6 needs them and an unrecorded measurement is an
estimate by the time anybody asks.

- [ ] **Step 7: Draw the variant in `render.js`**

Import `variantOf` from `./tiling.js`, and replace the ground loop body with:

```js
      for (const name of [layers.floor, layers.overlay]) {
        if (!name) continue;
        /* How many sprites this floor has, counted once per floor rather than per tile: a
           64 by 64 board asks this 4096 times a frame. */
        let count = variantCounts.get(name);
        if (count === undefined) {
          count = 0;
          while (atlas?.sprites?.[`floor/${name}#${count + 1}`]) count++;
          variantCounts.set(name, count);
        }
        const art = count > 1
          ? atlas.sprites[`floor/${name}#${variantOf(x, y, count) + 1}`]
          : atlas?.sprites?.[`floor/${name}`];
        if (art) {
          context.drawImage(sheet, art.x, art.y, art.w, art.h, px, py, scale, scale);
        }
      }
```

Declare the cache next to the `atlas` module variable near the top of `render.js`, beside
the existing `let atlas = null;`:

```js
/** How many sprites each floor has, filled on first sight and kept for the page's life. */
const variantCounts = new Map();
```

- [ ] **Step 8: Look at it**

Serve the site, open `/editer`, paint a patch of grass 20 tiles wide.
Expected: the surface is irregular, with no diagonal stripe crossing more than a tile or
two. Compare against the same floor in the game if a screenshot is handy; it will not match
tile for tile, and Step 3's comment says why.

- [ ] **Step 9: Commit**

```bash
git add tools/build_sprites.py site/public/forge/tiling.js tests/js/tiling.test.js site/public/forge/render.js site/public/forge/atlas.png site/public/forge/atlas.json \
  && git commit -m "feat(render): pick a variant per ground tile

The atlas kept grass1 and dropped grass2 and grass3, so every tile of a
painted patch carried the same 32 pixel image and its diagonal pattern
lined up across tiles into stripes. 67 of 107 floors had variants sitting
unused in the jar.

The per-tile choice is a local hash, not the game's Mathf.randomSeed: the
game seeds on a map position and a schematic has none, so there is no
pattern to match, only repetition to break."
```

---

### Task 3: Dump what blending needs, without touching the hashed catalogue

`Floor.doEdge` decides blending on `blendId`, and `drawEdges` skips a floor whose
`drawEdgeOut` is false. Neither is in `bench/data/blocks.json`, and neither can be guessed:
they are assigned in the game's own content definitions.

They must **not** reach `site/public/forge/blocks.json`, which `EngineVersion` hashes.
`tools/build_catalogue.py:133` filters every block through the `KEEP` tuple, so adding a
field to the dump does not reach the catalogue unless `KEEP` names it. This task relies on
that and proves it with a checksum.

**Files:**
- Modify: `bench/src/mindustryforge/DumpBlocks.java:1711-1738`
- Create: `tools/dump_blocks.py`
- Regenerate: `bench/data/blocks.json`
- Verify unchanged: `site/public/forge/blocks.json`

**Interfaces:**
- Consumes: nothing.
- Produces: in `bench/data/blocks.json`, each floor gains `blend_id` (integer),
  `draw_edge_out` (boolean, omitted when true) and `blend_group` (string, omitted when the
  floor is its own group).

- [ ] **Step 1: Record the checksum before anything moves**

```bash
sha256sum site/public/forge/blocks.json | tee /tmp/blocks-before.txt
```

- [ ] **Step 2: Add the three fields to the dump**

In `bench/src/mindustryforge/DumpBlocks.java`, inside the `if (!(block instanceof Floor
floor))` branch that starts at line 1711, after `entry.put("floor", true);`:

```java
        /* What decides whether two floors bleed into each other, read from the game rather
           than inferred. `Floor.doEdge` compares `realBlendId` on both sides and the higher
           one wins; `drawEdges` skips a neighbour whose `drawEdgeOut` is false.
           
           These three go to the bench dump and stop there. `build_catalogue.py` filters on
           its KEEP tuple, so they do not reach `site/public/forge/blocks.json`, which
           `EngineVersion` hashes. They decide how a page looks and no answer it gives, and
           the day they enter the catalogue is the day fifteen thousand analyses go stale
           for the sake of presentation. */
        entry.put("blend_id", floor.blendId);
        if (!floor.drawEdgeOut) entry.put("draw_edge_out", false);
        if (floor.blendGroup != floor) entry.put("blend_group", floor.blendGroup.name);
```

- [ ] **Step 3: Write the script that actually runs the dump**

`dump-blocks` is a **console command of the bench plugin, not a Gradle task**. An earlier
draft of this plan said `./gradlew dumpBlocks` and that target does not exist. Running the
dump means four things nobody remembers a week later: build the plugin jar, drop it into a
provisioned server's mod directory, start the headless server, and type the command at its
stdin. `bench/server.py` already has the pieces; nothing ties them together.

Create `tools/dump_blocks.py`:

```python
"""Re-dump the game's block data by running the pinned headless server.

    python tools/dump_blocks.py

`dump-blocks` is a console command of the bench plugin rather than a Gradle target, so
getting block data out of the game means building the plugin, installing it, booting a
server and talking to it. Written down as a script because a plan that guessed it was a
Gradle task has already been written once, and because the four steps are the kind that
get half-remembered.

The plugin's own `DumpBlocks.defaultOut()` still points at `analyser/data/blocks.json`,
a path from before the repository was restarted, so the destination is always passed
explicitly.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from bench.server import ServerProcess, install_plugin
from bench.server_setup import setup_server

RUN = ROOT / "_run"
JAR = ROOT / "bench" / "build" / "libs" / "mindustry-forge-bench.jar"
OUT = ROOT / "bench" / "data" / "blocks.json"


def main() -> None:
    gradlew = "gradlew.bat" if sys.platform == "win32" else "./gradlew"
    subprocess.run([gradlew, "jar"], cwd=ROOT / "bench", check=True)

    server_dir = setup_server(RUN)
    install_plugin(server_dir, JAR)

    with ServerProcess(server_dir) as server:
        # An absolute path: the server's working directory is the run directory, not the
        # repository, so a relative one writes the catalogue somewhere nobody looks.
        server.command(f"dump-blocks {OUT}", r"\[forge\] wrote", timeout=120)

    print(f"wrote {OUT}, {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3b: Run it**

Run: `python tools/dump_blocks.py`

Expected: Gradle builds, the server boots, and the script prints the path and size.
Then check the new field arrived:

```bash
python -c "import json;print(json.load(open('bench/data/blocks.json'))['blocks']['grass'])"
```

Expected: the printed entry contains `blend_id`.

If Gradle cannot reach the network to fetch the Mindustry dependency jar, or the server
refuses to boot, **stop and report it** rather than hand-editing `bench/data/blocks.json`.
A catalogue typed by hand is exactly the thing this repository refuses to trust.

- [ ] **Step 4: Rebuild the catalogue and prove it did not move**

```bash
python tools/build_catalogue.py
sha256sum site/public/forge/blocks.json
diff <(cat /tmp/blocks-before.txt | cut -d' ' -f1) <(sha256sum site/public/forge/blocks.json | cut -d' ' -f1)
```

Expected: identical, `diff` silent, exit code 0.

**If it differs, stop.** Do not commit, do not carry on to Task 4. A changed checksum means
a field leaked past `KEEP` into the hashed catalogue and every stored analysis has just been
marked stale. Find which field, and take it out of the catalogue rather than out of the
dump.

- [ ] **Step 5: Commit**

```bash
git add bench/src/mindustryforge/DumpBlocks.java bench/data/blocks.json tools/dump_blocks.py \
  && git commit -m "feat(bench): dump what decides floor blending

Floor.doEdge compares blendId across a boundary and drawEdges skips a
neighbour whose drawEdgeOut is false. Neither is in the dump and neither
can be inferred: the game assigns them in its content definitions.

They stop at the bench dump. build_catalogue.py filters on KEEP, so they
do not reach the catalogue EngineVersion hashes; its checksum is
unchanged, which is the whole reason they were added here rather than
there. They decide how a page looks, not what an answer is."
```

---

### Task 4: `sols.json`, and the edge sheets in the atlas

**Files:**
- Create: `tools/build_sols.py`
- Create: `site/public/forge/sols.json`
- Modify: `tools/build_sprites.py`
- Create: `tests/js/sols.test.js`

**Interfaces:**
- Consumes: `bench/data/blocks.json` with the fields from Task 3.
- Produces: `site/public/forge/sols.json` shaped
  `{"floors": {"<name>": {"blend": <int>, "out": <bool>, "variants": <int>, "sheet":
  <string or null>}}}`,
  and atlas keys `floor/<name>#edge`.

- [ ] **Step 1: Write `tools/build_sols.py`**

```python
"""What the browser needs to draw the ground, beside the catalogue rather than inside it.

    python tools/build_sols.py

Blending data decides how a patch of ground looks and decides no figure the analyser
reports. `site/public/forge/blocks.json` is hashed by `EngineVersion`, so a field added
there marks every stored analysis stale; a field added here marks nothing. That boundary is
written down in CLAUDE.md and this file is on the presentation side of it.
"""

from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path

JAR = Path("mindustry-forge/assets-v159.7.jar")
SOURCE = Path("bench/data/blocks.json")
TARGET = Path("site/public/forge/sols.json")


def main() -> None:
    raw = json.loads(SOURCE.read_text(encoding="utf-8"))
    with zipfile.ZipFile(JAR) as archive:
        art = {name.rsplit("/", 1)[1][:-4]
               for name in archive.namelist()
               if "/environment/" in name and name.endswith(".png")}

    floors = {}
    for name, entry in raw["blocks"].items():
        if not entry.get("floor"):
            continue
        variants = 0
        while f"{name}{variants + 1}" in art:
            variants += 1
        # Whose edge sheet this floor bleeds with.
        #
        # `Floor.edges()` is `blendGroup.asFloor().edges`, not the floor's own, and the
        # distinction is not cosmetic: all fourteen floors carrying a `blend_group` (every
        # crater and every vent) ship NO sheet of their own, and all fourteen of their
        # groups ship one. Reading `<name>-edge` alone records nothing for the lot, and a
        # vent then refuses to blend against anything at all.
        #
        # `None` means this floor does not blend, which is a real answer for the fifty-two
        # whose group has no sheet either.
        sheet = entry.get("blend_group", name)
        floors[name] = {
            "blend": entry.get("blend_id", 0),
            # Absent means true in the dump, which is how the game's own default reads.
            "out": entry.get("draw_edge_out", True),
            "variants": variants,
            "sheet": sheet if f"{sheet}-edge" in art else None,
        }

    TARGET.write_text(json.dumps({"floors": floors}, separators=(",", ":")),
                      encoding="utf-8")
    with_edges = sum(1 for f in floors.values() if f["sheet"])
    print(f"{len(floors)} sols, {with_edges} avec raccords, "
          f"{sum(1 for f in floors.values() if f['variants'] > 1)} avec variantes")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

Run: `python tools/build_sols.py`
Expected: `107 sols, 69 avec raccords, 64 avec variantes`.

**69, not 55.** 55 floors ship their own sheet and 14 more borrow their blend group's.
A run reporting 55 means the group resolution above is not working, whatever else passes.
64 rather than 67 because the glyph kinds are excluded from the variant count too, for the
same reason `build_sprites.py` excludes them from the atlas.

- [ ] **Step 3: Write the test that keeps the two files apart**

Create `tests/js/sols.test.js`:

```js
/**
 * The floor data that decides how the ground looks, and the promise that it is not in the
 * file that decides what the analyser answers.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => JSON.parse(
  readFileSync(new URL(`../../site/public/forge/${name}`, import.meta.url), "utf8"));

const sols = read("sols.json");
const catalogue = read("blocks.json");

test("every floor in the catalogue has an entry", () => {
  const floors = Object.entries(catalogue.blocks)
    .filter(([, block]) => block.floor).map(([name]) => name);
  for (const name of floors) {
    assert.ok(sols.floors[name], `${name} is missing from sols.json`);
  }
});

test("blending data stays out of the hashed catalogue", () => {
  /* `EngineVersion` hashes blocks.json. A blend id in there would mark fifteen thousand
     stored analyses stale for the sake of a boundary between two patches of grass. This is
     the check that stops that from happening by accident, since the rule alone is an
     intention. */
  for (const block of Object.values(catalogue.blocks)) {
    for (const forbidden of ["blend_id", "draw_edge_out", "blend_group"]) {
      assert.ok(!(forbidden in block), `${forbidden} leaked into blocks.json`);
    }
  }
});

test("a floor that names an edge sheet has that sheet in the atlas", () => {
  const atlas = read("atlas.json");
  for (const [name, floor] of Object.entries(sols.floors)) {
    if (!floor.sheet) continue;
    assert.ok(atlas.sprites[`floor/${floor.sheet}#edge`],
      `${name} blends with ${floor.sheet}, which is not packed`);
  }
});

test("a vent blends with its group's sheet rather than with nothing", () => {
  /* Every crater and every vent carries a blend_group and ships no sheet of its own, so
     reading `<name>-edge` records nothing for all fourteen and they stop blending.
     `Floor.edges()` is `blendGroup.asFloor().edges`, which is what this checks. */
  for (const [name, group] of [["crater-stone", "stone"], ["basalt-vent", "basalt"],
                               ["carbon-vent", "carbon-stone"]]) {
    assert.equal(sols.floors[name]?.sheet, group, `${name} should blend with ${group}`);
  }
});

test("a floor that says it has variants has them in the atlas", () => {
  const atlas = read("atlas.json");
  for (const [name, floor] of Object.entries(sols.floors)) {
    for (let n = 1; n <= floor.variants; n++) {
      assert.ok(atlas.sprites[`floor/${name}#${n}`], `no variant ${n} packed for ${name}`);
    }
  }
});
```

- [ ] **Step 4: Run it and watch the atlas tests fail**

Run: `npm test`
Expected: the first two tests pass, "a floor that says it has edges" fails: the sheets are
not packed yet.

- [ ] **Step 5: Pack the edge sheets**

In `tools/build_sprites.py`, in the ground block from Task 2, after the variant loop:

```python
        # The 96 by 96 sheet the game blends a boundary with: nine 32 pixel cells, which
        # `Floor.edge(x, y, i, j)` reads as `edges[i][2 - j]`. 55 of the 107 floors ship
        # one; the rest do not blend, and a hard edge decided in code beats a guess.
        if f"{name}-edge" in sprites:
            wanted.append((f"floor/{name}#edge", sprites[f"{name}-edge"]))
```

- [ ] **Step 6: Rebuild and run the tests**

Run: `python tools/build_sprites.py && npm test`
Expected: PASS. Record the new sprite count and file size beside the ones from Task 2.

- [ ] **Step 7: Commit**

```bash
git add tools/build_sols.py tools/build_sprites.py site/public/forge/sols.json tests/js/sols.test.js site/public/forge/atlas.png site/public/forge/atlas.json \
  && git commit -m "feat(sol): keep blending data out of the catalogue

How two patches of ground meet decides how a page looks and no figure the
analyser reports, so it goes in sols.json. blocks.json is hashed by
EngineVersion and a field added there would mark fifteen thousand stored
analyses stale for the sake of presentation.

The rule was already written down; the test that blocks.json carries none
of the three fields is what turns it from an intention into a check."
```

---

### Task 5: The boundary between two floors

`Floor.drawEdges`, decompiled from `mindustry/world/blocks/environment/Floor.class` in
`mindustry-forge/server-release.jar` with `javap -p -c`. Verify it rather than trusting this
summary:

```bash
cd /tmp && unzip -o -q "<repo>/mindustry-forge/server-release.jar" \
  "mindustry/world/blocks/environment/Floor.class" && javap -p -c \
  mindustry/world/blocks/environment/Floor.class | less
```

What it does, for one tile:

1. For each of the eight neighbours in `Geometry.d8` order.
2. The neighbour's contributing floor is its **overlay** when the overlay is not air and
   the neighbour's floor differs from this tile's floor, otherwise its **floor**.
3. Skip it unless that floor's `drawEdgeOut` is true.
4. Skip it unless `doEdge`, which is
   `other.blendId > this.blendId || this.edges === null`. So a floor with no sheet of its
   own is bled onto by any neighbour that has one.
5. Skip it unless that floor has an edge sheet.
6. Collect the distinct contributing floors, and remember which of the eight directions each
   one came from.
7. Sort them by block id ascending, and draw each one's sheet cell for each of its
   directions.

**Files:**
- Modify: `site/public/forge/tiling.js`
- Modify: `tests/js/tiling.test.js`
- Modify: `site/public/forge/render.js`

**Interfaces:**
- Consumes: `sols.json` shape from Task 4, and `variantOf` from Task 2.
- Produces: `blendersAt(ground, x, y, floors) -> [{name, dirs}]`, sorted, where `dirs` is an
  array of indices into `D8`. Also exports `D8`, the eight offsets in the game's order.

- [ ] **Step 1: Write the failing test**

Append to `tests/js/tiling.test.js`:

```js
import { blendersAt, D8 } from "../../site/public/forge/tiling.js";

/* Two floors, one that blends over the other. Written here rather than read out of
   sols.json so the test says what it depends on. */
const floors = {
  stone: { blend: 10, out: true, variants: 3, sheet: "stone" },
  grass: { blend: 20, out: true, variants: 3, sheet: "grass" },
  // A floor the game tells not to bleed outwards, which is the one case where a higher
  // blend id still draws nothing.
  shale: { blend: 30, out: false, variants: 1, sheet: "shale" },
  // A floor with no sheet anywhere, neither its own nor its group's: it cannot bleed, and
  // anything bleeds onto it.
  sand: { blend: 5, out: true, variants: 3, sheet: null },
  // A vent, which ships no sheet and borrows its group's. Fourteen real floors are shaped
  // like this, and reading `<name>-edge` alone drops every one of them.
  "stone-vent": { blend: 12, out: true, variants: 3, sheet: "stone" },
};

const ground = (cells) => Object.fromEntries(
  Object.entries(cells).map(([at, floor]) => [at, { floor }]));

test("the eight directions are the game's, in the game's order", () => {
  assert.equal(D8.length, 8);
  // Geometry.d8 starts at (-1,-1) and turns; what matters is that every neighbour appears
  // exactly once and the centre never does.
  const seen = new Set(D8.map(([dx, dy]) => `${dx},${dy}`));
  assert.equal(seen.size, 8);
  assert.ok(!seen.has("0,0"));
});

test("a higher blend id bleeds onto a lower one", () => {
  const board = ground({ "0,0": "stone", "1,0": "grass" });
  const found = blendersAt(board, 0, 0, floors);
  assert.deepEqual(found.map((b) => b.name), ["grass"]);
});

test("a lower blend id does not bleed onto a higher one", () => {
  const board = ground({ "0,0": "grass", "1,0": "stone" });
  assert.deepEqual(blendersAt(board, 0, 0, floors), []);
});

test("the same floor on both sides is not a boundary", () => {
  const board = ground({ "0,0": "grass", "1,0": "grass", "0,1": "grass" });
  assert.deepEqual(blendersAt(board, 0, 0, floors), []);
});

test("drawEdgeOut false means it never bleeds, whatever its id", () => {
  const board = ground({ "0,0": "stone", "1,0": "shale" });
  assert.deepEqual(blendersAt(board, 0, 0, floors), []);
});

test("a floor with no sheet at all is bled onto by a lower id", () => {
  /* doEdge is `other.blendId > this.blendId || this.edges === null`. Sand has no sheet, so
     stone bleeds onto it although stone's id is higher, and grass would too. Without this
     clause a patch of sand next to anything reads as a cut-out. */
  const board = ground({ "0,0": "sand", "1,0": "stone" });
  assert.deepEqual(blendersAt(board, 0, 0, floors).map((b) => b.name), ["stone"]);
});

test("a vent bleeds, and does it with its group's sheet", () => {
  const board = ground({ "0,0": "sand", "1,0": "stone-vent" });
  const found = blendersAt(board, 0, 0, floors);
  assert.deepEqual(found.map((b) => b.name), ["stone-vent"]);
  assert.equal(found[0].sheet, "stone", "a vent must draw its group's sheet, not its own");
});

test("one neighbour contributes once, with every direction it came from", () => {
  const board = ground({ "0,0": "stone", "1,0": "grass", "0,1": "grass", "1,1": "grass" });
  const found = blendersAt(board, 0, 0, floors);
  assert.equal(found.length, 1, "grass was listed more than once");
  assert.equal(found[0].dirs.length, 3, "not every direction was recorded");
});

test("blenders come out sorted, so two of them stack the same way every frame", () => {
  const board = ground({ "0,0": "sand", "1,0": "grass", "0,1": "stone" });
  const found = blendersAt(board, 0, 0, floors);
  assert.deepEqual(found.map((b) => b.name), ["stone", "grass"]);
});

test("an unpainted neighbour is not a floor and contributes nothing", () => {
  /* The board is mostly empty and stays that way: a tile nobody painted has no floor, and
     reading it as one would draw a boundary around every patch against nothing. */
  const board = ground({ "0,0": "stone" });
  assert.deepEqual(blendersAt(board, 0, 0, floors), []);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test`
Expected: FAIL, `blendersAt is not a function`.

- [ ] **Step 3: Write `blendersAt`**

Append to `site/public/forge/tiling.js`:

```js
/**
 * The eight neighbours, in `arc.math.geom.Geometry.d8` order.
 *
 * The order matters and is not cosmetic: it is the index into a floor's edge sheet, so
 * turning it changes which cell of the 96 pixel sheet is drawn on which side.
 */
export const D8 = [
  [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1],
];

/** The floor a tile contributes to its neighbour: its overlay when it has one, else itself. */
function contributorAt(ground, x, y, mine) {
  const layers = ground[`${x},${y}`];
  if (!layers?.floor) return null;
  return layers.overlay && layers.floor !== mine ? layers.overlay : layers.floor;
}

/**
 * Which neighbouring floors bleed onto this tile, and from which sides.
 *
 * `Floor.drawEdges` of v159.7, decompiled from `server-release.jar` rather than read off a
 * wiki. The clause worth naming is `doEdge`: a neighbour bleeds when its blend id is higher
 * **or when this tile's floor has no edge sheet at all**. Drop the second half and every
 * patch of a sheetless floor reads as a cut-out with hard borders, which is the state this
 * replaces rather than an improvement on it.
 *
 * Returns one entry per distinct floor, sorted by blend id ascending so that two of them
 * stack the same way on every frame, each carrying the directions it came from.
 */
export function blendersAt(ground, x, y, floors) {
  const mine = ground[`${x},${y}`]?.floor;
  const here = mine ? floors[mine] : null;
  const found = new Map();

  for (const [index, [dx, dy]] of D8.entries()) {
    const name = contributorAt(ground, x + dx, y + dy, mine);
    if (!name || name === mine) continue;

    const other = floors[name];
    if (!other?.out || !other.sheet) continue;
    // `doEdge`: a higher id wins, and a floor whose group has no sheet loses to everything.
    if (here?.sheet && other.blend <= (here.blend ?? 0)) continue;

    const already = found.get(name);
    if (already) already.dirs.push(index);
    else found.set(name, { name, sheet: other.sheet, dirs: [index] });
  }

  return [...found.values()].sort((a, b) => floors[a.name].blend - floors[b.name].blend);
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, all nine new tests.

- [ ] **Step 5: Draw the edges in `render.js`**

Extend the import line added in Task 2, which now reads:

```js
import { variantOf, blendersAt, D8 } from "./tiling.js";
```

`sols.json` has to be loaded beside the atlas. In `render.js`, extend the existing
`loadSprites` fetch block (around line 27) to fetch it too, and keep it in a module
variable `let soils = null;` beside `let atlas = null;`.

Then, in the ground loop, after the floor and overlay are drawn for this tile:

```js
      /* The boundary, drawn over this tile rather than over its neighbour: the game bleeds
         inwards, so a patch of grass beside stone has grass creeping onto the stone tile. */
      if (soils) {
        for (const blender of blendersAt(ground, x, y, soils.floors)) {
          const edgeArt = atlas?.sprites?.[`floor/${blender.sheet}#edge`];
          if (!edgeArt) continue;
          // Nine cells in a 96 pixel sheet, so a cell is a third of its width.
          const cell = edgeArt.w / 3;
          for (const dir of blender.dirs) {
            const [dx, dy] = D8[dir];
            // `Floor.edge(x, y, i, j)` is `edges[i][2 - j]`: column from dx, row flipped
            // because the board's y grows upwards and the sheet's grows downwards.
            const col = dx + 1;
            const row = 2 - (dy + 1);
            context.drawImage(sheet,
              edgeArt.x + col * cell, edgeArt.y + row * cell, cell, cell,
              px, py, scale, scale);
          }
        }
      }
```

- [ ] **Step 6: Look at it, which is the only check there is**

Serve the site, open `/editer`, paint a patch of grass and a patch of stone that touch.

Expected: the higher-id floor creeps over the boundary in a soft, irregular edge rather than
stopping at a straight line.

**Say plainly what this step is not.** The bench runs a headless server and renders nothing,
so there is no oracle for this and no measurement to hold it against. Fidelity here is
judged by eye against the game's own art, and that is a weaker claim than the rest of this
repository makes about its numbers. It is worth making anyway, because the alternative is a
straight line where the game has none, but it does not get written up as "verified".

- [ ] **Step 7: Commit**

```bash
git add site/public/forge/tiling.js tests/js/tiling.test.js site/public/forge/render.js \
  && git commit -m "feat(render): blend the boundary between floors

Two patches met on a straight line, which the game never draws. This
follows Floor.drawEdges of v159.7, decompiled from server-release.jar:
eight neighbours in Geometry.d8 order, a neighbour bleeds when its blend
id is higher, and the sheet is nine cells read as edges[i][2 - j].

The clause that is easy to drop is the second half of doEdge, where a
floor with no sheet of its own is bled onto by everything. Without it a
patch of any sheetless floor reads as a cut-out."
```

---

### Task 6: Weigh what this cost

The design says the byte cost is measured after the build and not predicted from the pixel
area, and names +400 KB as the figure above which the edge sheets get reconsidered. An
estimate that never gets replaced by a measurement is the defect this repository keeps
paying for.

**Files:**
- Modify: `docs/plans/2026-08-28-mode-edition-refonte-design.md`

- [ ] **Step 1: Measure**

```bash
git show <commit before Task 2>:site/public/forge/atlas.png | wc -c    # before Task 2
ls -l site/public/forge/atlas.png                       # now
```

Find that commit with `git log --oneline -- site/public/forge/atlas.png`.

- [ ] **Step 2: Write the number into the design, replacing the estimate**

In the "The cost, measured rather than estimated" paragraph, append a sentence giving the
measured before and after in bytes and the difference. If the difference exceeds 400 KB,
stop and raise it rather than carrying on: the decision the design records is that the edge
sheets are what gets reconsidered, and that is a decision to take with the number in hand.

- [ ] **Step 3: Commit**

```bash
git add docs/plans/2026-08-28-mode-edition-refonte-design.md \
  && git commit -m "docs(sol): record what the atlas actually weighed

The design said the byte cost would be measured after the build rather
than predicted from the pixel area. This is that measurement, written in
the same paragraph so the estimate cannot be read as one."
```

---

## What this plan does not do

The palette, the board and its frames, the work spaces and the separate editor page are the
other four plans of this design. Nothing here touches `site/public/index.html`,
`site/public/forge/editor/`, the database or the routes, which is what lets it run while
another session holds the home page.
