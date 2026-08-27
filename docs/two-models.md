# The gap between the solve and the game, measured

**This is a measurement. It changes no behaviour and proposes no repair.**

This repository holds two models of the same thing in JavaScript:

| | |
|---|---|
| `engine/**` | a transcription of Mindustry's update loop, tick by tick. `npm run oracle` holds it against a real v159.7 headless server on every scenario in `bench/data/oracle`, and it is at **0.00%**. |
| `analyse.js` | a steady-state maximum flow. It answers a different way, it is much faster, and **it is the one whose numbers reach the player**. |

Nobody had ever asked the second one the questions the first one has already answered. `node tools/gap.mjs` does that, and only that.

## The answer

```
88 scenarios compared, of 164 recorded
  agree within 20%                  37
  the throughput is wrong           42
  right throughput, wrong container  9
```

**They diverge widely.** Of the three outcomes worth planning against, this is the third one: the report is wrong more often than it is right on the shapes the game has answered, so merging the two models is not a plumbing job to schedule when convenient.

Read the whole table with `node tools/gap.mjs`.

## What the gap is not

The recordings are thirty seconds from a cold start, so they carry the warm-up: belts filling, crafters reaching their first output, items still in flight when the clock stops. The solve reports a steady state and knows none of that. **A few per cent of overshoot is expected everywhere and means nothing.** Twelve of the thirty-seven agreements sit between 0.5% and 5%, and that is what warm-up looks like.

The thirty-seven agreements bear that out. Four are exact, two are under one per cent,
seventeen sit between one and five, and fourteen between five and twenty. That is the shape
of a model that is right and measured from a cold start, not the shape of a model that is
nearly right.

What is worth reading is the tail. A scenario at a hundred per cent is not a warm-up.

## Two ways of being wrong, counted apart

A scenario whose totals match but whose containers do not is not producing the wrong amount, it is putting the right amount in the wrong place. That is a different defect from a throughput the page would print as a fact, and it needs a different repair, so the tool separates them rather than summing them into one alarming number.

## Three causes, verified rather than guessed

The list is not forty-two separate bugs. Three families account for most of it, and each was checked in the graph rather than inferred from the table.

### A duct does not hand to another duct — 13 scenarios

`duct-line` is a sandbox source, seven ducts, and a vault. The solve's graph:

```
0 item-source@0,1  ->  []
1 duct@1,1         ->  []
2 duct@2,1         ->  []
...
8 duct@8,1         ->  [9]
9 vault@10,1       ->  []
```

Only the last duct, the one touching the vault, has an outgoing edge. The chain is broken at every other link, and nothing arrives. The same shape built from conveyors wires up correctly, so this is about ducts and not about sources.

Erekir's whole item-carrier family is affected: `duct`, `armored-duct`, `duct-router`, `duct-bridge`, `duct-unloader`. **Any Erekir layout analysed on the live site reports nothing moving through it.**

### A junction does not cross — `junction-cross`, and the sorters with it

Two lines crossing at a junction, one carrying copper east and one carrying lead north, one vault at each end. The game puts 193 lead in one and 193 copper in the other. The solve puts **both** items in the same vault and nothing in the other.

The totals are right, which is why this class is counted separately: the flow is conserved, its destination is invented. `sorter-diverts`, `sorter-both-sides` and `router-three-ways` fail the same way.

### Erekir's drills and crushers produce nothing — 8 scenarios

`bore-*`, `burst-drill-*` and `crusher-*` deliver zero where the game delivers between 0.37 and 2.17 a second. Not investigated further here; it is named so that whoever takes it knows it is one family and not eight.

## What this says about the next step

Bringing the report onto the engine would change every number on the site at once, and no one could review that diff. This measurement says something more useful: **there is a list**, it is 51 scenarios long, it groups into a handful of causes, and each cause can be repaired and re-measured on its own with this tool.

The order that falls out of the numbers, worst first:

1. ducts, because a whole planet's worth of layouts currently reads as inert;
2. junctions and sorters, because the amount is right and only the destination is wrong, which is the kind of error a player trusts;
3. Erekir drills and crushers.

None of that is a rewrite. All of it is measurable before and after.

## How to re-run it

```bash
node tools/gap.mjs         # the table, worst gap first
node tools/gap.mjs --all   # including scenarios that deliver nothing
```

It reads the recordings that are already committed, so it needs no server and no game.
