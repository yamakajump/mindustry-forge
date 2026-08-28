# The scripts

Nothing in this directory is served or shipped. Three kinds of script live here:

- **builders**, in Python, which regenerate the data the site reads from the game's own
  registry: `build_catalogue.py`, `build_sols.py`, `build_names.py`, `build_sprites.py`
  and their neighbours. What they write is generated, never edited by hand: a
  hand-maintained second copy of the block data drifts from the first, which is the
  failure this repository is arranged around.
- **the drivers of the comparison against the game**: `oracle.mjs`, `compare.mjs`,
  `gap.mjs`, `trace.mjs`. `compare.mjs` is shared by the tool and the test deliberately,
  because the two were briefly separate copies and drifted apart within the hour.
- **`ingest.mjs`**, which runs the browser's analysis over a batch of schematics under
  Node and writes one JSON line each for the PHP side to store.

Several builders write into `site/public/forge/`, and part of what they write is hashed.
Read [`../site/public/forge/AGENTS.md`](../site/public/forge/AGENTS.md) before running one:
a build that changes a hashed byte ages the whole catalogue.

## `ingest.mjs` is inside the engine fingerprint

It is the one file outside `site/public/forge/` that `EngineVersion` hashes, listed apart
in `EngineVersion::PIPELINE`, and it is there because it decides which of the analysis's
fields reach a column. A field the engine computes and this pass drops is a field nobody
has.

That is not a hypothesis. `potentialPerMinute` was computed for every schematic and kept
for none. Only `public/forge` was hashed at the time, so the version never moved, fifteen
thousand rows read as current, and the item ceiling the site sells reached none of them. It
cost two evenings to find. Editing this file now ages the catalogue, and that is the point:
the next omission cannot hide the same way.

Which makes the whitelist inside `ingest.mjs` load-bearing. Computing a new field in the
analysis without adding it there stores nothing, and `EngineVersionTest` covers the file
being hashed, not the field being kept.
