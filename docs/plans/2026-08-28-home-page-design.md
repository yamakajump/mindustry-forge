# Home page redesign, and the word the game actually uses

**Status:** design, approved 28/08/2026. Implementation follows in a plan of its own.

## Why

The home page asks the visitor to paste a schematic and gives them nothing else. Three
things are wrong with it, and only the third is a matter of taste.

**It uses a word the game does not.** `assets-v159.7.jar`, `bundles/bundle_fr.properties`:

```
schematic  = Schéma
schematics = Schémas
```

The site writes "schematique", feminine. A French player never reads that word in their
game, and the site declines it in the wrong gender on top. The translation keys were
already named `schema.*`, so somebody half knew.

**Its showcase ranks six copies of one answer.** `HomeController::showcase()` orders by
`schematic_items.rate_per_block` over the ceiling rows. Live, that returns two identical
"Safe Reactor" entries, one schematic named "a", and six lines all reading 6300 energy/s.
The catalogue holds 844 schematics that make graphite and not one of them can ever appear
there. A showcase that shows the top of a catalogue six times does not show the catalogue.

**Nothing on it is a picture.** The list is text on text, on a site whose subject is plans
made of the game's own sprites, and whose renderer already draws them.

## Phase 0: the rename

Its own branch, `fix/schema-masculin`, merged before the home page work starts. Writing the
new page in the wrong word and correcting it three days later is how a word survives.

- **115 occurrences** across user-facing files, counted rather than estimated:
  `public/index.html` 35, `forge/lang/fr.json` 23, `outils/logique.html` 20,
  `browse.blade.php` 9, `schematic.blade.php` 7, `lang/fr/vitrine.php` 5, and seven files
  below five.
- **`compare.blade.php` (7) and the `comparer` block of `lang/fr/schema.php` (8) are out of
  this pass.** Another session is rewriting both right now and writes its new strings in
  the masculine, so those fifteen arrive corrected from a change that was going to touch
  every one of their lines anyway. Passing over them first would be a conflict per line for
  no gain.
- **Translation keys do not change.** They are already `schema.*` and `vitrine.*`. Renaming
  a key that is already right buys nothing and costs every call site.
- **`/schematiques` becomes `/schemas`, with a 301 on the old address.** Links to the
  catalogue are already shared, and an address that answers 404 is worse than an address
  that reads oddly.
- **The redirect keeps the query string.** `/schematiques?produit=silicon&tri=best&page=3`
  has to land on `/schemas` with all four parameters intact. A redirect that drops them
  answers 200 with a plausible page that is not the one the link asked for, which is the
  defect this repository has logged six times: a correct response to a question nobody
  asked. Another session is about to add `large`, `haut`, `min`, `blocs` and `planete` to
  that page, so the number of parameters silently lost would only grow. Covered by a test
  that asserts the target of the redirect, not merely its status.
- **The `/api/schematiques/...` routes keep their name.** They are addresses a machine
  reads, not words a player reads, so the argument for the rename does not reach them.
  Renaming them would also reorder a file another session is adding a route to, and
  `/api/schematiques/recherche` has to stay declared before `/api/schematiques/{schematic}`
  or the word is read as a slug.
- Repository comments stay in English, so most of them are untouched. The French comments
  in `index.html` and the Blade views change with the strings around them.
- `analyse.js` is not touched, so `EngineVersion` does not move and no stored analysis goes
  stale.

## Phase 1: the page

Four bands, in this order. The order is the argument: the visitor's own gesture first, then
the reason to stay if they have nothing to paste, then what else the site is, then why any
of the figures should be believed.

### 1. The hook and the field

Unchanged in structure. Title, lede, textarea, the four buttons, the real-supply details.
It works and it is the main gesture. Only the wording changes, to the masculine "schéma".

### 2. The showcase, six drawn plans

A 3 by 2 grid. Each tile carries:

- the schematic's **actual plan**, drawn in the visitor's browser by `render.js` from the
  schematic's own code, on `--stage`, with the game's sprites;
- its name;
- the **product icon** cut from the sheet by `/icone/{family}/{name}.png`;
- the rate, its unit, and the "au mieux" mention;
- the footprint in tiles and the block count.

**The selection changes from a ranking to a spread: one schematic per product.** The most
produced items are already computed by `BrowseController::itemsOnOffer()`, which groups the
ceiling rows by item and orders by how many schematics make each. The home page takes the
first six of that list and, for each, the single best schematic by `rate_per_block`.

Six products, six icons, no duplicate possible. Sandbox-fed and creative rows are excluded
the same way the browse page excludes them.

> **The cost is close to nothing, and that was checked before the design relied on it.**
> `index.html` line 1434 already calls `loadSprites()` unconditionally on load, so the
> 1.28 MB sheet **was** fetched by every visitor to the home page and used for nothing
> before this change. Drawing six plans adds `blocks.json` (239 kB raw), which the first
> analysis would fetch anyway.
>
> Written in the past tense on purpose. This change is what gives that download a reason,
> so a comment saying "the home page fetches a sheet it never uses" would read as a
> measurement while describing a state its own commit removes. This repository has paid for
> exactly that once already, on the comment above the `/` route.
>
> The tiles reuse `apercu.js` rather than a second copy of the drawing code.

### 3. The tool shelf

Five cards. Each carries a real block sprite at 64 px from `/icone/bloc/`, the tool's name,
and one line saying which question it answers.

| Tool | Route | Sprite | The line |
|---|---|---|---|
| Éditer | `/editer` | `router` | Build or retouch a plan in the browser |
| Comparer | `/comparer` | `container` | Two plans side by side, figure against figure |
| Logique | `/outils/logique` | `micro-processor` | Write and test mlog without launching the game |
| Planificateur | `/outils/planificateur` | `silicon-smelter` | The analysis backwards: how many blocks for X per minute |
| Blocs | `/blocs` | `core-shard` | The 254 blocks, with the figures the bench measured |

All five sprite names were checked against `blocks.json`. All five tools already exist and
are reachable only from a dropdown, which is why nobody finds them.

### 4. The proof

The bench paragraph and `brand/apercu-produit.png`, kept as they are and moved to the
bottom. It answers "why would I believe you", which is not the first thing to say.

## What does not change

- **`analyse.js`, and therefore `EngineVersion`.** The checksum of `blocks.json` is compared
  before and after the change: identical to the byte means zero stale analysis.
- **No server-side computation.** The showcase is a database query and a JSON island, as it
  is today. The drawing happens in the browser, where this site does its work.
- **No new dependency.** The repository has none and this is not the change that adds one.

## Constraints

- `montrerAccueil()` learns the new section ids, so the showcase and the shelf leave the
  page the moment a report exists, like the rest of the home content.
- The page is still served as a static file in one documented setup. Sections that depend
  on the server, which is the showcase and the icons, must degrade to nothing rather than to
  a broken image.
- A ceiling never appears without saying it is one. That rule applies to every tile.
- A quantity never travels through a translation placeholder. `{{ $n }} {{ __('...unite...') }}`.
- French for the player, English for the contributor. No em dash anywhere.

## Testing

- `HomeTest` gains cases for the spread: six distinct products, no duplicate slug, no
  sandbox-fed row.
- `NavigationTest` covers the five shelf links, so a tool added to `config/nav.php` and
  forgotten on the home page is caught.
- A redirect test for `/schematiques` to `/schemas`.
- `TranslationKeysTest` already scans `public/`, so the new strings are covered by the key
  check the day they are written.
- The real page is opened and read before the branch is called done. Five of the six defects
  this repository logged on 27/08 were invisible to a test that checks a number.

## Risks

- **The showcase spread depends on `itemsOnOffer()` returning at least six items.** It
  returns 20 today. Below six, the grid shows what it has rather than padding with the
  ranking, and says nothing about it.
- **A 301 costs a hop on every old link.** Accepted: the alternative is two live addresses
  for one page, which is worse for indexing than one hop.

## Four other sessions are working in this repository at the same time

Recorded here because it changed the design, not as a note about how the work went.

**The hazard is one working tree with one HEAD.** Five sessions shared
`C:/Users/coren/Projets/mindustry-forge`, so a `checkout -b` by one of them moved HEAD under
the others. It cost a real defect within twenty minutes: a commit landed on a branch that
was not its author's and swallowed 143 lines of a file belonging to a third session, which
had staged it seconds earlier. A targeted `git add` does not protect against this. Only
`git commit -- <paths>`, or not sharing the tree, does.

**This work moved to `C:/Users/coren/Projets/_worktrees/forge-accueil` on `fix/mot-schema`,
branched from `main`.** The polluted commit is left alone on the abandoned branch rather
than rewritten, and nothing is lost: the third session's spec already lives on its own
branch.

**The split, agreed with the other sessions rather than assumed:**

| File | Who | Why |
|---|---|---|
| `public/index.html` | serialised, this work first | The editor is being extracted from it by another session, which waits for this merge. A rewrite of the home sections against a deletion of the editor block merges; the reverse does not. |
| `compare.blade.php`, `schema.php` `comparer` block | another session | Full rewrite in progress, in the masculine. |
| `forge.css`, `forge/lang/fr.json` | shared, not serialised | Every session appends: new rules at the end of the file, new keys at the end of the object. No existing rule, token or value is rewritten, so two appends merge. |
| `forge/apercu.js` | another session, this work consumes it | Its drawing function is being exported for search results. The showcase imports it instead of copying it. One implementation is the first rule of this repository. |
| `forge/analyse.js` | nobody | Untouched by all four, so `EngineVersion` does not move and no stored analysis goes stale. |

## The showcase must not mix two natures of figure

`itemsOnOffer()` filters on `kind = PLAFOND`, and that is a coherence condition rather than
a performance detail: the list offers only what the page knows how to rank.

The home page asks that list which six products to feature, then asks a second query for the
best schematic of each. **If the second query does not carry the same filter, the two
disagree.** The failure is not an empty page, which would be noticed. It is a full page of
the wrong nature: a schematic picked on a measurement sitting under a heading built from
ceilings, or a product offered for which the second query returns nothing.

The orders of magnitude make it quiet. The catalogue holds roughly 117 measured rows against
6 775 ceilings, so a mixed query returns plenty of plausible rows. Six times on 27/08 this
repository shipped exactly that: a figure computed correctly, displayed where another
question was being asked.

**So the nature constant is extracted with the query and reused, never retyped.** And the
figure on each tile says it is a ceiling, on the tile itself and not only in a line at the
foot of the section.

## The shared query object

`itemsOnOffer()` and `blocksOnOffer()` move out of `BrowseController` into
**`App\Support\Vitrine`**, called by the browse page, the home page, and the session adding
filters to the catalogue.

Not `App\Support\Catalogue`: `App\Services\BlockCatalogue` already exists and reads
`blocks.json`. Two classes named catalogue that mean different things is a confusion this
repository would pay for later.

Both methods move at once rather than the one this work needs. A support class born with a
single method gets its second implementation written by whoever arrives three hours later,
which is the outcome the class exists to prevent.
