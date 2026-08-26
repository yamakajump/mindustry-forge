# mindustry-forge

**Paste a schematic. Find out what it actually does.**

Every Mindustry calculator on the web answers the same question: how many machines do you
need for a clean ratio. That is arithmetic, and four sites already do it. None of them will
look at *your* layout, on *your* ore patch, and tell you it produces 47.3 graphite a minute
because the second press is only fed 61% of the time.

This does that. And then it tells you where to move the blocks.

## Why the numbers here can be trusted

Every other tool computes its figures by hand and asks you to believe them. This repository
ships a bench that **runs the actual game**: a headless Mindustry server on a pinned world
for a pinned number of seconds, stamping the schematic in and counting what comes out.

So the analyser is not the source of truth, it is a fast approximation of one, and the
bench is what proves it. A layout whose calculated output disagrees with its measured
output is a bug in this repository, not a matter of opinion. That check runs in CI.

Nobody else can make that claim, because nobody else has the bench.

## What is here

| | |
|---|---|
| `analyser/` | reads a `.msch`, builds the flow graph, computes throughput and the bottleneck |
| `bench/` | runs the real game and measures the same schematic, to prove the analyser right |
| `site/` | the marketplace: paste, analyse, publish, compare |
| `tests/` | including the ones that check the calculation against the game |

## The `.msch` format is not guessed

`analyser/schematic.py` implements the layout of `Schematics.write` and `TypeIO` from
Mindustry v159.7, the version pinned throughout this repository. Reading a format from a
wiki is how a tool comes to disagree with the game about what a player pasted.

## Status

Restarted from scratch on 26 August 2026. The state before that, a search that invented
layouts and published a catalogue of them, is kept at the tag
`archive/recherche-de-designs`. It worked, and on the one toy problem it was ever given it
beat a hand-written layout: 24 items delivered with 17 blocks against 19 with 21. It had
also only ever solved that one problem, which is why the product changed rather than the
code.
