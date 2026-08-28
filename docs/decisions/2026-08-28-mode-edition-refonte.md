# Rebuilding the editor

The request behind this design: "the whole editing part. When you go to the editing area
you get the main page, then a very fast switch to the editor, it's weird. There are plenty
of UI/UX optimisations to make it easier for users. On the ground you get streaks on every
tile, it isn't unified. And picking floors or buildings is very limited and all over the
place. Redoing this whole part would be good. Maybe work zones, several work zones, saved
in the database and not in cache so you can pick it back up anywhere."

The existing editor's placement mechanics, the 64x64 rule and its module split all stand.
What follows is what real use found on top of them.

## What is wrong, with the cause rather than the symptom

Each of the four complaints was traced to a line, because "the ground looks bad" and "the
ground is drawn with one sprite per floor and no rounding" are not the same problem and
only the second one can be fixed.

**The flash.** `site/public/index.html:1541` is `if (location.pathname === "/editer")
enterEditor([])`, and it is the last statement of the module. The browser paints the whole
analyser home page, then the editor mounts full screen over it. Nothing is broken; the
page just does two things when one was asked.

**The streaks on the ground.** `tools/build_sprites.py` packs one sprite per floor, no edge
variants. The game ships `grass1`, `grass2`, `grass3` and picks one per tile; the atlas
carries `grass1` only, so the motif lines up from tile to tile and reads as corduroy. 67 of
the 107 floors in the catalogue have unused variants sitting in the jar. Confirmed by
drawing 16 by 16 tiles of `floor/grass` in a browser: the result reproduces the complaint,
and carries no grid at all.

The scale at which a tile is drawn is not a cause: `editor/camera.js` clamps the zoom with
`Math.round` and `render.js` derives the same value with `Math.floor`, so a tile's on-screen
size is always a whole number of pixels, and adjacent tiles tile against each other exactly,
with no fractional gap for a background colour to show through.

**The palette.** `site/public/forge/editor/ui.js` hides the search row on the GROUND tab.
The BUILD tab has a search box, a world filter and categories; the GROUND tab has none of
them, and shows 86 floors as a flat alphabetical list of 9-pixel chips: a directory, not a
palette.

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

**Shipped differently.** `/editer` still serves `index.html`, not a separate page: a
`route-editeur` class added inline in `<head>` (`index.html:43`) and hidden by CSS
(`.route-editeur main { display: none; }` in `forge.css`) hides the analyser instead of
letting the browser paint it, and `leaveEditor()` removes the class when control returns.
`EditorNoFlashTest.php` covers it. No `editeur.html` file exists.

### 2. The ground, drawn the way the game draws it

**Shipped.** The algorithm this section reasons through now has its own page,
[`docs/ground-rendering.md`](../ground-rendering.md), which is the one to read for how the
code works today; what follows is why it was built that way.

Two corrections, in this order, because the second is invisible until the first lands.

**Variants.** `build_sprites.py` takes `grass1..grass3` rather than `grass1`, and the
renderer picks one per tile from a stable hash of the tile position.

Deliberately **not** the game's own `Mathf.randomSeed(tile.pos(), ...)`. The game indexes
its choice on a position in a real map; a schematic's tiles are local coordinates, so an
exact port would still produce a different pattern than the one a player saw in game.
Copying the algorithm would buy an accuracy that does not exist. What is wanted is that the
repetition breaks, and any stable hash does that. Stated plainly because "this reproduces
the game's own formula" is the kind of claim this repository makes seriously, and here it
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
guess.

**The cost, measured rather than estimated.** The atlas is 2048 x 2464 = 5 046 272 px,
1 310 669 bytes. The additions are 223 360 px of variants across 67 floors and 506 880 px
of edge sheets across 55, so **730 240 px, +14.5 % of surface**. The byte cost is not
predictable from that and is **measured after the build, not before**: PNG compresses, and
a ground texture compresses worse than a block sprite. If it lands above +400 KB, the edge
sheets are the part to reconsider, since they are two thirds of the added area.

**Measured after the build: 1 310 669 to 1 544 912 bytes, so +234 243 bytes, +17.9 %.**
Inside the +400 KB line, and a little over half of it, so the edge sheets stay. The +14.5 %
of surface predicted +17.9 % of bytes, close enough to be coincidence rather than a
reliable method: byte cost still has to be measured after each build, not predicted from
pixel area.

The atlas grew in two steps and the second is the cheap one, which is worth knowing before
anybody trims. The variants across 67 floors cost 66 860 bytes; the 55 edge sheets, three
times their pixel area, cost 167 383. Both together are less than an eighth of the picture
the page already downloads for its schematics.

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
analyses stale for the sake of presentation.

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

A new table, never `schematics`. Shipped as `spaces` (model `Space`, routes under
`/api/espaces`), not `workspaces` as drafted below.

A draft changes every few seconds and carries no analysis, no engine freshness, no
moderation state and no public key. Writing it into the table that holds all four would mean
touching the catalogue's own table on every keystroke. A **publish** button on a frame
creates the `schematics` row when the player decides, through the path that already exists.

| column | |
|---|---|
| `user_id` | the owner |
| `name` | "Usine a silicium" |
| `board` | the JSON: blocks, ground, frames |
| `opened_at` | to sort a player's spaces by last opened |

**A full snapshot on every save, no deltas.** A well filled 256 x 256 board is a few hundred
kilobytes, and a delta log would be a second data model to keep in agreement with the first
in exchange for bandwidth that costs nothing. Saved three seconds after the last gesture, and
on `beforeunload`.

- **Anonymous**: today's single `localStorage` draft, seven days. Unchanged.
- **Signed in**: as many spaces as wanted, resumed on any machine. Shipped as a quota of 30
  (`Space::MAX_SPACES`), not 50 as drafted below, so that a runaway loop cannot fill the
  database. Resuming today means the `/api/espaces` routes; no "mes plans" page reads them
  yet.
- **On signing in with a local draft present**, importing it is offered, never done silently.
  `draft.js` already applies that rule and states the reason: quietly overwriting what
  somebody just pasted is worse than losing the draft.

**A draft written by the previous format still opens.** It carries `tiles` and `ground` and
no `frames` key, which is exactly the "no frame at all" case above: the whole board is one
frame, capped at 64 x 64. So the old format needs no migration and no version field, it
needs `frames` to default to the empty list. Refusing to read an older draft is how a tool
loses the work `draft.js` exists to protect.

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

## Order, and what it became

This was the planned order. It is recorded as planned rather than rewritten as history,
because the order itself is the reasoning worth keeping; what actually shipped is noted
against each step instead.

1. **The ground**: variants, edges. Visible immediately, independent of everything else,
   and touches only `render.js` and `build_sprites.py`. Shipped, see
   [`docs/ground-rendering.md`](../ground-rendering.md).
2. **The separate `/editer` page.** Shipped, but not as a separate page: see the note under
   "The editor gets its own page" above.
3. **The palette and the rail.** Shipped for search, recents and the `Q` pipette. The
   ground tab still has no world filter, a gap `editor/ui.js` names in its own comment.
4. **The board, frames, the per-frame gauge.** Shipped: the board is a fixed 256 x 256,
   frames cap at 64 x 64.
5. **`workspaces`**: migration, controller, "mes plans", deferred save. Shipped as `spaces`
   (see above), except "mes plans": the table and the API exist, no page reads them yet.
6. **The five items picked up along the way.** Not reverified individually here.

Step 1 first, and not the frames, because a repetition-free ground is the thing the player
sees on the first screenshot, and because it depends on nothing else in this list.
