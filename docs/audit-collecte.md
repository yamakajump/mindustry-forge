# Audit: the collector, the ingestion and the marketplace data

Written 27 August 2026, a few hours after the catalogue went live: 15 533 schematics
collected from two other sites, analysed, and published.

Everything below was established by running something. Where a claim rests on reading code
rather than on a measurement, it says so, and where nothing could establish it at all it is
in the last section. That last list is the point of the exercise: it says where to look
next.

**One thing worth stating before the findings.** Three of the defects known tonight were
found by the first person who looked at the rendered pages, within ten minutes: the missing
previews, the raw colour tags in names, and their leak into share cards. None of them is
visible from the code. An audit that only reads source would have missed all three, and
this one nearly did.

---

## What is wrong

### 1. A removed schematic comes back at the next collection

**Severity: this one breaks a written promise.** `SECURITY.md` says a takedown request from
an author will be honoured. It cannot be, past the next collection.

Proven end to end rather than argued:

```
target        : 6a8ff2d6cf5ff63210ac4874 "Surge"   (mindustryschematics)
deleted       : 2948 rows left for that source
re-collected  : php artisan forge:collecter mindustryschematics --limite=1
result        : 1 taken, 0 already held  ->  back, 2949 rows
```

The collector reports it as an ordinary new entry. It has no way to tell "never collected"
from "collected and deliberately removed", because the only thing it asks before fetching
is whether the row is in `schematics`. That is what makes the resume stateless, and it is
the same property turned against us.

There is no blocklist anywhere in the codebase - grepped for it, nothing.

What it needs is a small table of `(source, source_id)` that the collector consults
alongside the "already held" check, written by whatever handles a takedown, and never
cleared by a collection. Removing the row is not enough and must not be the whole gesture:
a takedown that quietly undoes itself is worse than no takedown, because the author has
been told it was done.

### 2. The item ceiling never reaches the database

`analyse.js` computes `potentialPerMinute` - what a schematic would make if it were fed -
and `Schematic::indexWhatItCouldMake()` is wired to index it. Nothing connects the two:
`tools/ingest.mjs` does not list `potentialPerMinute` in `KEPT`, so the collector's analysis
pass drops it before it reaches PHP.

Measured, not deduced. Thirty collected schematics analysed with the code on `main`:

```
kind=plafond, items : 0
kind=plafond, power : 6
kind=mesure         : 18
stored analysis keys: ... power, potential, asTheGameSaysIt, ...   (no potentialPerMinute)
```

The power ceiling survives because `potential` is in the list; the item ceiling does not
exist for any of the 15 533. This is the one line that was left for after the collector
merged, and it was never added. It is a one-word fix followed by a re-run of
`forge:analyser`, which is free because the engine version already changed tonight.

### 3. Deep unfiltered pagination falls off a cliff

Measured against production, three runs each, seconds:

| page | offset | `tri=new` (default) | `tri=small` | `tri=seen` |
|---|---|---|---|---|
| 1 | 0 | 0.10 / 0.10 / 0.12 | | |
| 200 | 4 776 | 0.12 / 0.13 / 0.13 | | |
| 600 | 14 376 | **1.63 / 1.67** | 0.74 / 0.31 | **1.65 / 1.84** |
| 646 | 15 504 | **2.07 / 2.10 / 2.77** | | |

A filtered listing stays fast at any depth (`produit=power&tri=best&page=250` answers in
0.15 s), because the filter cuts the set to something small. It is the unfiltered walk that
degrades, and it degrades non-linearly: three times the offset costs twelve times the time,
which looks like a threshold being crossed rather than a longer walk.

`tri=seen` has **no index at all**: the migrations create `(visibility, created_at)` and
`(visibility, blocks)`, and nothing on `views`. That is consistent with it being as slow as
the default at depth and it is the cheapest thing to fix here.

I could not establish the mechanism - see the last section.

### 4. Mindustry colour tags in names, and the fix that would make it worse

1 233 names carry the game's colour markup, rendered raw everywhere including `og:title`,
so they reach share cards. Found in production by the design voie, not by this audit.

**The obvious fix is a trap, and there is already a victim in the catalogue.** A schematic
published tonight is called `[Silicon]Stackable Thin Crusibles`. Any regular expression of
the shape `\[[^\]]*\]` deletes `[Silicon]` and renames it `Stackable Thin Crusibles`, which
is not cleaning a name, it is damaging one.

The game's own rule, read from `Strings.stripColors` and `parseColorMarkup` in Arc rather
than from a wiki, is narrower than it looks:

- `[#rrggbb]` through `[#rrggbbaa]` - between 2 and 8 hex digits, nothing else - is markup.
- `[]` is markup, and closes the current colour.
- `[[` is an escaped literal bracket.
- `[name]` is markup **only if `Colors.get(name)` finds a registered colour.** Anything
  else, `[Silicon]` included, is text and is kept.
- An unclosed `[` is text.

So a faithful stripper needs the game's colour registry, and we do not have it. We have
`blocks.json`, dumped from the game by the bench, and this belongs beside it: the same
argument that keeps the block catalogue out of a hand-written list keeps a colour list out
of one. That is a line in `tools/build_catalogue.py`, and it needs the bench.

**Where the stripping should happen, which is the part worth arguing about.** Not at
ingestion, and not at each surface.

Not at ingestion, because a stripper we get wrong once has already eaten the original by
the time we find out, and correcting it would mean re-collecting fifteen thousand entries.
`source_meta` does keep their untouched answer, so it is recoverable in principle, but only
for imported rows - a member posting a name with a bracket has no such copy.

Not at each surface either, because that is the arrangement that produced this defect: the
listing, the page and the share card each had to remember, and the share card forgot.

One accessor on the model, called by every surface, with a test that fails when any
rendered page emits markup. One implementation, correctable in one place, applied to rows
already stored without touching them. `name` stays exactly as the source wrote it.

**Recommendation, and the half that can ship now.** Stripping `[#...]` and `[]` needs no
registry and cannot touch `[Silicon]`: it is unambiguous and it covers the
`[#1000][] [#ffa77a99]Graphite` shape. Named colours wait for the registry to be dumped.
Half the defect, none of the risk, and the remaining half is one dumper line away.

---

## What was checked and is fine

Listed because an audit that only reports defects tells you nothing about what it looked at.

**A schematic with no measured output does not claim it makes nothing.** This was the one I
most expected to find broken, since it is the failure this repository has repaired three
times in other forms. The page of an unmeasured import says "chiffres non verifies",
"personne ne l'a relue", states what it needs, and prints no production figure at all.
Absence is rendered as absence. Checked on live pages, not on the template.

**A page view does not rewrite the search index.** `SchematicController` calls
`increment('views')` on every visit, and the model has a `saved` hook that rebuilds
`schematic_items`. If `increment` fired that hook, every visit would delete and re-insert
index rows. It does not - measured with the query log: one `update` and nothing else.

**The item filter cannot duplicate a schematic.** The listing joins `schematic_items`, and
a join that matched twice would show the same schematic twice on one page. The unique key
is `(schematic_id, item, sens, kind)` and the filter pins all three of the last, so at most
one row can match.

**Ceilings stay out of the listing.** The dropdown and the ranking both filter on
`kind = mesure` explicitly. A ceiling in the database appears in neither, which is what was
decided, and a test holds it.

**Provenance survives to the page.** Origin, author as the source spelled it, a link back
to the schematic where it was published, and the date it was fetched - all present and
correct on live pages.

**No 429, no backoff, no lost page** across roughly 23 000 calls from this machine, under
two very different regimes: 800 ms sequential, then no pause with 24 calls in flight. No
entry vanished between listing and detail either, which is worth more than it sounds: it
means their catalogues are stable while being read, and that is what makes a stateless
resume correct rather than merely convenient.

---

## What could not be established

The list an audit is most tempted to leave out.

**Why deep pagination falls off a cliff.** The timings are solid; the cause is not. It
needs `EXPLAIN` on the production MySQL, on the exact query, and I have no access to it.
The non-linear shape is consistent with a sort spilling out of `sort_buffer_size`, but that
is a hypothesis and should be labelled as one until somebody runs:

```sql
EXPLAIN SELECT schematics.* FROM schematics WHERE visibility = 'public'
  ORDER BY created_at DESC, id DESC LIMIT 24 OFFSET 14376;
```

**What proportion of the catalogue carries a measured figure.** Of 70 rows analysed
locally, 17 have at least one measured item - 24%. That disagrees with the 60% quoted for
production, and my sample is small, drawn from the head of one source, and therefore not
representative. Someone with the production database should count it properly, because the
number decides how badly the missing item ceiling actually hurts.

**What happens if a source reuses a `source_id` for a different schematic.** Unfalsifiable
from here: it needs the source to do it. By reading, the outcome is that we hold the old
schematic under that id forever, because the collector never re-fetches something it
already has. Nothing detects it and nothing repairs it.

**What happens if a source changes its JSON shape.** `fetchMany` reads every field
defensively and a missing one degrades to null, so a renamed field would quietly produce
rows without descriptions or authors rather than an error. That is a reading, not a test,
and the failure mode is the quiet kind.

**Whether the two new bench scenarios agree with the game.** `burner-refuses-silicon` and
`burner-takes-coal` are written and unmeasured: `npm run oracle:measure` needs a
provisioned server and there is no jar on this machine. The tool reports them as never
measured, and the test suite only walks scenarios with a recorded answer, so nothing is
pretending they passed.

**Whether the collector behaves the same on the production database.** Everything here was
measured on SQLite. The published run on MySQL reported 0 failures over 15 533, which is
strong evidence, but the transaction and duplicate-handling behaviour under a constraint
violation differ between the two engines and were only exercised locally.
