# The gap between the solve and the game, measured

**This is a measurement. It changes no behaviour and proposes no repair.**

This repository holds two models of the same thing in JavaScript:

| | |
|---|---|
| `site/public/forge/engine/**` | a transcription of Mindustry's update loop, tick by tick. `npm run oracle` holds it against a real v159.7 headless server on every scenario in `bench/data/oracle`, and it is at **0.00%**. |
| `bilan.js` | a steady-state maximum flow. It answers a different way, it is much faster, and **it is the one whose numbers reach the player**. |

Nobody had ever asked the second one the questions the first one has already answered. `node tools/gap.mjs` does that, and only that.

## The answer

```
88 scenarios compared, of 164 recorded
  agree within 20%                  49
  the throughput is wrong           27
  right throughput, wrong container 12
```

**They still diverge widely.** Of the three outcomes worth planning against, this is the third one: the report disagrees with the game on close to half the shapes it has answered, so merging the two models is not a plumbing job to schedule when convenient.

Read the whole table with `node tools/gap.mjs`.

## What the gap is not

The recordings are thirty seconds from a cold start, so they carry the warm-up: belts filling, crafters reaching their first output, items still in flight when the clock stops. The solve reports a steady state and knows none of that. **A few per cent of overshoot is expected everywhere and means nothing.**

The forty-nine agreements bear that out. Six are exact, six are under one per cent, twenty
sit between one and five, and seventeen between five and twenty. That is the shape of a
model that is right and measured from a cold start, not the shape of a model that is
nearly right.

What is worth reading is the tail. A scenario at a hundred per cent is not a warm-up.

## Two ways of being wrong, counted apart

A scenario whose totals match but whose containers do not is not producing the wrong amount, it is putting the right amount in the wrong place. That is a different defect from a throughput the page would print as a fact, and it needs a different repair, so the tool separates them rather than summing them into one alarming number.

## Three causes, and one of them is closed

The list is not thirty-nine separate bugs. Three families were checked in the graph rather
than inferred from the table; two are still open, and the largest of the three has since
been fixed.

### Closed: a duct did not hand to another duct

`duct-line` used to be a sandbox source, seven ducts, and a vault, whose graph gave an
outgoing edge only to the last duct, the one touching the vault: the chain was broken at
every other link, and nothing arrived. It affected Erekir's whole item-carrier family
(`duct`, `armored-duct`, `duct-router`, `duct-bridge`, `duct-unloader`) and, at the time
this was measured, any Erekir layout on the live site reported nothing moving through it.

That bug is fixed. `duct-line` now agrees with the game within 1.3%, and every plain
duct-to-duct hand-off scenario in `bench/data/oracle` (`duct-one`, `duct-two`,
`duct-armored`, `duct-armored-duct`, `duct-armored-behind`, `duct-armored-side`,
`duct-overflow-side-fed`, `duct-overflow-straight`, `duct-bridge-span`) now agrees too. Two
duct scenarios still fail (`duct-unloader-drains`, `duct-unloader-sorted`), but on
unloader behaviour, not on hand-off between ducts.

### Open: a junction does not cross, and the sorters with it

Two lines crossing at a junction, one carrying copper east and one carrying lead north, one vault at each end. The game puts 193 lead in one and 193 copper in the other. The solve puts **both** items in the same vault and nothing in the other.

The totals are right, which is why this class is counted separately: the flow is conserved, its destination is invented. `sorter-diverts`, `sorter-both-sides` and `router-three-ways` fail the same way.

### Open: Erekir's drills and crushers deliver almost nothing

`bore-boosted`, `bore-one-line`, `bore-two-lines`, `crusher-carbon` and `crusher-dune`
deliver zero where the game delivers between 0.37 and 2.17 a second.
`burst-drill-boosted` fails the same class of block by a lesser margin, 37.5% under the
game's rate rather than zero. `burst-drill` and `burst-drill-beryllium`, which used to be
in this family, now agree with the game within 20%.

## What this says about the next step

Bringing the report onto the engine would change every number on the site at once, and no one could review that diff. This measurement says something more useful: **there is a list**, it is 39 scenarios long, and two of its causes are traced above and can be repaired and re-measured on their own with this tool. The rest of the list is real but not yet grouped.

The order that falls out of the two traced causes, worst first:

1. junctions and sorters, because the amount is right and only the destination is wrong, which is the kind of error a player trusts;
2. Erekir drills and crushers.

None of that is a rewrite. All of it is measurable before and after.

## How to re-run it

```bash
node tools/gap.mjs         # the table, worst gap first
node tools/gap.mjs --all   # including scenarios that deliver nothing
```

It reads the recordings that are already committed, so it needs no server and no game.
