# Rebuilding the editor: design

Asked on 28/08/2026, after using the editor shipped the day before: "the whole editing
part. When you go to the editing area you get the main page, then a very fast switch to
the editor, it's weird. There are plenty of UI/UX optimisations to make it easier for
users. On the ground you get streaks on every tile, it isn't unified. And picking floors
or buildings is very limited and all over the place. Redoing this whole part would be
good. Maybe work zones, several work zones, saved in the database and not in cache so you
can pick it back up anywhere."

`docs/plans/2026-08-27-mode-edition.md` built that editor. This document does not replace
it: the placement mechanics, the 64x64 rule and the module split it defined all stand.
What follows is what a day of real use found on top of them.

## What is wrong, with the cause rather than the symptom

Each of the four complaints was traced to a line, because "the ground looks bad" and "the
ground is drawn with one sprite per floor and no rounding" are not the same problem and
only the second one can be fixed.

**The flash.** `site/public/index.html:1441` is `if (location.pathname === "/editer")
enterEditor([])`, and it is the last statement of the module. The browser paints the whole
analyser home page, then the editor mounts full screen over it. Nothing is broken; the
page just does two things when one was asked.

**The streaks on the ground.** One defect, and this paragraph first claimed two.

`tools/build_sprites.py:171` says it outright: *"One sprite each, no edge variants for
now"*. The game ships `grass1`, `grass2`, `grass3` and picks one per tile; the atlas
carries `grass1` only, so the motif lines up from tile to tile and reads as corduroy. 67 of
the 107 floors in the catalogue have unused variants sitting in the jar. Confirmed by
drawing 16 by 16 tiles of `floor/grass` in a browser: the result reproduces the complaint,
and carries no grid at all.

**The second cause was invented, and the correction is worth more than the fact.** This
document originally blamed `render.js:429` as well, for drawing at `px = (x - box.left) *
scale` with no rounding, which at a fractional zoom would let the background through the
joint. The code says that; the conclusion does not follow. `editor/camera.js:20` clamps the
zoom with `Math.round` and `render.js:364` derives the report's with `Math.floor`, so the
scale is always a whole number of pixels, and `devicePixelRatio` is 1 on the machine the
complaint came from. A probe drawing eight tiles side by side at scales 13, 24 and 31, with
and without rounding, counted zero background columns in all six cases. The sprites also
tile perfectly against themselves: edge delta 0.0, alpha 255.

A fix for it was written, reviewed, committed as `bb84ec3` and reverted in `560781e`. It
was read out of the code, not measured, and its commit message stated the gap in the past
tense as though somebody had seen it. That is the defect this repository already tracks,
one step further along: not a right number beside the wrong question on a page, but a right
number about a question nobody had asked, written into the history as an observation.

**The palette.** `site/public/forge/editor/ui.js:285` is `searchRow.hidden = onGround`.
The BUILD tab has a search box, a world filter and categories; the GROUND tab has none of
them, and shows 86 floors as a flat alphabetical list of 9-pixel chips. The previous
design document called the thing it replaced "a directory, not a palette". The GROUND tab
is still that directory.

**One draft, in one browser.** `site/public/forge/editor/draft.js` keeps a single board in
`localStorage` for seven days. Two schematics in progress means losing one, and a schematic
started on the desktop does not exist on the laptop.

## The shape

### 1. The editor gets its own page

`/editer` serves `site/public/editeur.html` instead of `index.html`. The page that arrives
is the page that was asked for, so there is nothing to hide and nothing to repaint.

`index.html` keeps its `loadSprites()` call: the home page draws schematic previews now and
needs the atlas. The editor page makes its own call, and the browser serves the second one
from cache.

Two entry points move with it, and both break silently if forgotten:

- `index.html`'s `id="build"` button ("Construire depuis zero") becomes `<a href="/editer">`.
- A report's "Editer ce schema" button becomes a link to `/editer?s=<key>`.

They change in the same commit as the move, not in the one after. A path into the tool that
still looks like a button and does nothing is worse than no button.

### 2. The ground, drawn the way the game draws it

Two corrections, in this order, because the second is invisible until the first lands.

**Variants.** `build_sprites.py` takes `grass1..grass3` rather than `grass1`, and the
renderer picks one per tile from a stable hash of the tile position.

Deliberately **not** the game's own `Mathf.randomSeed(tile.pos(), ...)`. The game indexes
its choice on a position in a real map; ours are local schematic coordinates, so an exact
port would still produce a different pattern than the one a player saw in game. Copying the
algorithm would buy an accuracy that does not exist. What is wanted is that the repetition
breaks, and any stable hash does that. Written down because "we reproduced the game's
formula" is the kind of claim this repository is built on, and this is a place where it
would be false.

**Edges.** 55 floors ship a `<name>-edge.png` in the jar, 96x96, which is the 3x3 sheet of
the eight directions plus centre. They go into the atlas and the renderer follows
`Floor.drawEdges` of v159.7, decompiled from `server-release.jar`, never read off a wiki.

**A sheet is looked up through the blend group, not through the floor.** `Floor.edges()` is
`blendGroup.asFloor().edges`, and that is not a detail: **all fourteen floors carrying a
blend group ship no sheet of their own, and all fourteen groups ship one.** Every crater and
every vent is in that list. An implementation that reads `<name>-edge` records nothing for
the lot, and a vent stops blending against anything, which is fourteen floors quietly wrong
in a way that looks deliberate.

So 69 floors blend, not 55: the 55 with a sheet plus the 14 that borrow their group's. The
remaining 38 do not, and that is a hard edge decided in code and named as such rather than a
guess. Found by measuring the dump against the jar before the code was written, which is the
order this document failed to follow once already.

**The cost, measured rather than estimated.** The atlas is 2048 x 2464 = 5 046 272 px,
1 310 669 bytes. The additions are 223 360 px of variants across 67 floors and 506 880 px
of edge sheets across 55, so **730 240 px, +14.5 % of surface**. The byte cost is not
predictable from that and is **measured after the build, not before**: PNG compresses, and
a ground texture compresses worse than a block sprite. If it lands above +400 KB, the edge
sheets are the part to reconsider, since they are two thirds of the added area.

None of `render.js`, `ui.js`, `editor/*` or the atlas is in `EngineVersion::SOURCES`.
Verified in `site/app/Services/EngineVersion.php`. **No stored analysis goes stale.**

### 3. The palette

The two tabs get the same skeleton: tools, recents, search, world filter, grid by family.
Today they have two different shapes, which is most of why GROUND feels bolted on.

**A grid of previews, not a list of names.** The question asked in front of a floor palette
is what it looks like, never what it is called: `arkycite-floor`, `dark-panel-3` and
`crystalline-vent` tell a player nothing, and translating them to French would not help
because "dark panel 3" carries no meaning in any language. A texture is recognised at a
glance.

**A recents row at the top.** Painting uses four floors, not eighty-six. This removes
almost all of the scrolling and costs about fifteen lines.

**The name and the rule on hover**: "eau profonde - seuls les blocs flottants s'y posent".
The constraint is said when the floor is chosen, not when the placement is refused.
`rules.js` already speaks this language; it only needs calling earlier.

**A pipette on the ground tab**, bound to `Q`. BUILD has one on middle click, GROUND has
none, and picking up a floor already painted is the most frequent gesture in a map editor.
`Q` currently does nothing and the help panel apologises for it; this is the game's key for
it, so it gets honoured.

**Where the ordering lives.** A new `site/public/forge/sols.json`: family, world, French
name, game name. **Never in `blocks.json`**, which is hashed by `EngineVersion`. Palette
ordering decides no answer, so putting it in the catalogue would mark fifteen thousand
analyses stale for the sake of presentation. This is the boundary `CLAUDE.md` records
having got wrong in both directions on 27/08.

The check that goes with it, because the rule alone is an intention: **compare the checksum
of `blocks.json` before and after. Identical to the byte means zero stale analyses.**

### 4. The board, and frames

The board becomes a fixed 256 x 256, not a growable one: a bounded board is a bounded
snapshot, a bounded save and a bounded undo history, and sixteen frames of the game's own
maximum size is more than anybody lays out side by side. A **frame** is a named rectangle
of at most 64 x 64, drawn with the mouse, and it is the unit that gets analysed, copied to
`.msch` and published.

- The top gauge reports the **active frame**, not the board: `cadre fonderie - 22 x 14 /
  64 x 64`. The game's hard limit applies per frame.
- The board dims around the active frame, so the other work sites are visible without being
  confusable.
- The frame carries its own actions: analyse, copy, publish, rename, delete.
- **Blocks can be placed anywhere**, inside a frame or not. The board is a workbench: you
  tinker beside the thing and draw a frame round it once it stands up. What sits outside
  every frame does not export, and that is said once, in the status bar, when the first
  orphan block is placed. No modal, no repeated toast.
- **No frame at all means the whole board is one**, capped at 64 x 64 exactly as today.
  Somebody building one thing never meets the word "frame".

That last rule is what keeps the feature from taxing the simple case, and it is the reason
frames are drawn by hand rather than created automatically around what gets placed: an
automatic frame moves under the fingers and silently merges two work sites that were built
too close together.

### 5. Work spaces

A new table, never `schematics`.

A draft changes every few seconds and carries no analysis, no engine freshness, no
moderation state and no public key. Writing it into the table that holds all four would mean
touching the catalogue's own table on every keystroke. A **publish** button on a frame
creates the `schematics` row when the player decides, through the path that already exists.

| column | |
|---|---|
| `user_id` | the owner |
| `name` | "Usine a silicium" |
| `board` | the JSON: blocks, ground, frames |
| `opened_at` | to sort "mes plans" by last opened |

**A full snapshot on every save, no deltas.** A well filled 256 x 256 board is a few hundred
kilobytes, and a delta log would be a second data model to keep in agreement with the first
in exchange for bandwidth that costs nothing. Saved three seconds after the last gesture, and
on `beforeunload`.

- **Anonymous**: today's single `localStorage` draft, seven days. Unchanged.
- **Signed in**: as many spaces as wanted, resumed on any machine. A quota of 50, so that a
  runaway loop cannot fill the database.
- **On signing in with a local draft present**, importing it is offered, never done silently.
  `draft.js` already applies that rule and states the reason: quietly overwriting what
  somebody just pasted is worse than losing the draft.

**A draft written by yesterday's editor still opens.** It carries `tiles` and `ground` and
no `frames` key, which is exactly the "no frame at all" case above: the whole board is one
frame, capped at 64 x 64. So the old format needs no migration and no version field, it
needs `frames` to default to the empty list. Said here because the alternative - refusing to
read a draft written the day before - is how a tool loses the twenty minutes of building
`draft.js` exists to protect.

### 6. Picked up along the way

Small, and each one has been felt.

1. **No visible save button.** The word "enregistre" in the top bar replaces it, and is
   better: there is nothing to click, there is only something to know.
2. **The status bar is plain text.** It becomes readable keys, as the help panel already
   renders them.
3. **The rail has a fixed width** and overflows on a small screen. A drag handle, and the
   width remembered.
4. **`Q` does nothing.** It becomes the pipette. See above.
5. **Floor names are English** in a French interface. They go into `sols.json` with their
   French name beside the game name, because a player searches for one or the other
   depending on where they learned it.

## Deliberately left out

No live simulation, no collaborative editing, no unit layer, no version history on a space,
no sharing a space between accounts. A frame published to the catalogue is already the
sharing story.

## Order

1. **The ground**: rounding, variants, edges. Visible immediately, independent of everything
   else, and touches only `render.js` and `build_sprites.py`, which no other session opens.
2. **The separate `/editer` page**, once the session holding `index.html` has merged.
3. **The palette and the rail.**
4. **The board, frames, the per-frame gauge.**
5. **`workspaces`**: migration, controller, "mes plans", deferred save.
6. **The five items picked up along the way.**

Step 1 first, and not the frames, because a repetition-free ground is the thing the player
sees on the first screenshot, and because it is the only step that depends on nobody.

## Working conditions

Four other sessions are live on this repository. This work happens in a dedicated git
worktree on `feat/mode-edition` rather than in the shared checkout, after a shared HEAD
moved under a session twice in thirty minutes on 28/08.

Agreed with the session rewriting the home page:

- `site/public/index.html` is serialised: it is theirs until they merge.
- `site/public/forge/forge.css` and `site/public/forge/lang/fr.json` are shared by appending
  at the end of the file only. No existing rule or value is rewritten, no `:root` token is
  touched.
- New user-facing strings say **"un schema"**, masculine, which is what the game's own
  `bundle_fr.properties` says for v159.7. The site's feminine "schematique" is being
  corrected in parallel.
