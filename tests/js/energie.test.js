/**
 * A layout short of power runs slower, and the report says the same thing twice.
 *
 * It used to say two things. The steady-state solve knew about items and liquids and
 * nothing else, so a plan of three silicon smelters with thirty power a second missing
 * showed a red `Net -30` on one card and, on the next one down, "no bottleneck, everything
 * is running flat out". Both came from the same analysis. Only one of them could be true.
 *
 * The game settles it: `PowerGraph.update` hands every consumer on a grid the same
 * fraction, and `ConsumePower.efficiency` returns `power.status`, so a smelter on a grid at
 * two thirds smelts at two thirds. It slows down; it does not stop, and it does not carry
 * on regardless.
 *
 * Two figures come out of that and they are not the same number:
 *
 * - what the layout **asks** the grid for, which is what the player has to build to cover,
 *   and which `PowerGraph.getPowerNeeded` measures on the flat `usage` of every machine
 *   whose items are there, whatever the grid is currently giving it;
 * - what the layout **runs** at, which is the first multiplied by its coverage.
 *
 * Confusing the two is not a rounding error. Measure the demand on the throttled rate and a
 * shortage reports itself as zero, which would have closed the contradiction by deleting
 * the one figure that says what to build.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { analyse, buildGraph } from "../../site/public/forge/analyse.js";
import { fromBase64 } from "../../site/public/forge/schematic.js";
import { TICKS, World } from "../../site/public/forge/engine/core.js";
import { behaviourOf } from "../../site/public/forge/engine/carriers.js";
import { gridsOf } from "../../site/public/forge/engine/power.js";
import { loadCatalogue, paste } from "./helpers.js";

const known = loadCatalogue();
const close = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-3, `${why}: ${a} vs ${b}`);
const coal = { content: 0, id: known.items["coal"].id };
const sand = { content: 0, id: known.items["sand"].id };

/** Three silicon smelters, each with its own two sandbox taps. Ninety power a second. */
const smelters = () => {
  const tiles = [];
  for (let i = 0; i < 3; i++) {
    tiles.push([0, i * 3, "silicon-smelter", 0],
               [-1, i * 3, "item-source", 0, coal],
               [-1, i * 3 + 1, "item-source", 0, sand]);
  }
  return tiles;
};

test("a layout short of power names the machine it is starving", async () => {
  /* The plan that exposed all this. Three smelters want ninety a second, one combustion
     generator makes sixty, and a power node puts them on one grid.

     The two cards now agree: thirty missing, and a smelter running at two thirds. Before,
     the second card said nothing was wrong. */
  const out = await analyse(paste([...smelters(),
    [3, 3, "power-node", 0], [4, 3, "combustion-generator", 0],
    [5, 3, "item-source", 0, coal]]));

  close(out.power.spent, 90, "three smelters at thirty");
  close(out.power.made, 60, "one generator at sixty");
  close(out.power.net, -30, "thirty short");

  assert.ok(out.bottleneck, "a plan short of power has a bottleneck");
  assert.equal(out.bottleneck[0], "silicon-smelter");
  close(out.bottleneck[1], 2 / 3, "sixty out of ninety");
});

test("the throughput falls in the same proportion as the current", async () => {
  /* The point of throttling rather than merely reporting: the silicon figure moves. Two
     thirds of the current is two thirds of the silicon, and the plan that promised 270 a
     minute delivers 180. */
  const short = await analyse(paste([...smelters(),
    [3, 3, "power-node", 0], [4, 3, "combustion-generator", 0],
    [5, 3, "item-source", 0, coal]]));
  const plenty = await analyse(paste([...smelters(),
    [3, 3, "power-node", 0], [4, 3, "power-source", 0]]));

  close(plenty.perMinute.silicon, 270, "at full power");
  close(short.perMinute.silicon, 180, "at two thirds");
  close(short.perMinute.silicon / plenty.perMinute.silicon, 2 / 3, "the ratio is exact");
});

test("what a layout asks for is not what it manages to run at", async () => {
  /* No generator at all, which is the blunt version of the same thing. The smelters run at
     nothing and still need their ninety a second: that is the number a player builds
     against, and it survives being unmet. */
  const out = await analyse(paste(smelters()));
  close(out.power.spent, 90, "the demand holds even with nothing covering it");
  close(out.power.made, 0, "and nothing covers it");
  assert.ok(out.bottleneck, "the smelters are stopped and it says so");
  close(out.bottleneck[1], 0, "stopped means zero");
  assert.deepEqual(out.perMinute, {}, "a smelter with no power smelts nothing");
});

test("two grids that never touch are two grids", async () => {
  /* The budget used to sum the whole schematic, so a generator wired to nothing covered
     machines on the other side of the plan. Here the generator sits against one smelter
     and reaches neither of the other two: three grids, one of them fed.

     The demand is still ninety, because all three want their thirty whatever they get.
     What changes is who gets it, and the two on dead grids are what the worst share names.

     Read on the shares rather than on the silicon: the fed smelter has the generator on
     the only side it could have handed silicon out of, so nothing leaves the plan and
     `perMinute` is empty for a reason that has nothing to do with power. */
  const out = await analyse(paste([...smelters(),
    [2, 0, "combustion-generator", 0], [2, 1, "item-source", 0, coal]]));

  close(out.power.spent, 90, "three smelters still want ninety");
  close(out.power.made, 60, "and only one generator looks at them");
  close(out.bottleneck[1], 0, "two smelters out of three are on a dead grid");
});

test("the coverage is the fraction the game itself was measured at", async () => {
  /* The one test here that is not an opinion. `bench/data/oracle/power-short.json` is a
     laser drill and a single combustion generator, run for thirty seconds in a real v159.7
     headless server, and the game wrote down what the drill was running at:

         "block": "laser-drill", "efficiency": 0.9090909

  which is sixty made over sixty-six wanted, to seven digits. The solve has to land on the
  same number from the same shape, and the figure is read out of the recording rather than
  copied here, so a re-measurement that disagrees fails this line instead of being quietly
  outvoted by a constant somebody typed. */
  const measured = JSON.parse(readFileSync(
    new URL("../../bench/data/oracle/power-short.json", import.meta.url), "utf8"));
  const drill = measured.running.find((build) => build.block === "laser-drill");

  const ground = {};
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 3; y++) {
      ground[`${x},${y}`] = { floor: "sand-floor", overlay: "ore-copper" };
    }
  }
  const out = await analyse(paste([
    [1, 1, "laser-drill", 0], [4, 1, "vault", 0],
    [0, 5, "item-source", 0, coal], [0, 4, "router", 0],
    [0, 3, "combustion-generator", 0]]), {}, null, { ground });

  close(out.power.coverage, drill.efficiency, "the coverage is the one the game measured");
  close(out.power.made, 60, "one combustion generator");
  close(out.power.spent, 66, "a laser drill demands sixty-six");
});

test("a plan that powers its own drill settles rather than oscillating", async () => {
  /* The loop the whole design has to survive: the drill needs the current the generator
     makes from the coal the drill digs. Less current, less coal, less current.

     It settles because demand is measured on what the items allow and not on what the grid
     is currently giving. Measured the other way it would swing between flat out and starved
     for ever, and the report would show whichever round the loop happened to stop on. */
  const ground = {};
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 3; y++) ground[`${x},${y}`] = { floor: "sand-floor", overlay: "ore-coal" };
  }
  const out = await analyse(paste([
    [1, 1, "laser-drill", 0], [3, 1, "conveyor", 0],
    [4, 1, "combustion-generator", 0], [4, 0, "power-node", 0]]), {}, null, { ground });

  assert.equal(out.settled, true, "the regime is stable");
  close(out.power.spent, 66, "the drill demands sixty-six");
  close(out.power.made, 60, "the generator gives back sixty");
});

/**
 * One run of the ferry shape, with the grids worked out.
 *
 * `simulate` does not wire them, so a schematic run through it has no power at all and
 * every consumer reads full coverage. The page does wire them, and so does the bench's
 * comparison; this follows that path rather than the convenient one.
 */
const ferry = async (tiles, seconds) => {
  const graph = buildGraph((await fromBase64(paste(tiles))).tiles);
  const world = new World(graph, behaviourOf).wire(gridsOf);
  world.catalogue = known;
  for (let i = 0; i < seconds * TICKS; i++) world.step();
  return world;
};

/** A payload source set to a battery, a loader, and two conveyors going nowhere. */
const ferryLine = (feed) => [
  [0, 0, "payload-source", 0, { content: 1, id: known.blocks["battery"].id }],
  [4, 0, "payload-loader", 0],
  ...(feed ? [[4, 2, feed, 0]] : []),
  [7, 0, "payload-conveyor", 0],
  [10, 0, "payload-conveyor", 0],
];

const cargoOf = (world, name) =>
  world.builds.filter((build) => build.name === name).map((build) => build.state.payload);

test("a loader fills a battery it carries, at the rate its grid allows", async () => {
  /* `PayloadLoader.updateTile`, v159.7: `power.status * (basePowerUse +
     maxPowerConsumption)` is what the grid handed over, `basePowerUse` comes back off the
     top, and the rest goes into the battery over its capacity, times `edelta()`.

     Forty a tick into four thousand is a hundredth of a battery a frame, so sixty frames
     apart the charge is six tenths apart, and that is the figure below. It is not a rate
     anybody can read off the block's own card: `consumePowerDynamic` states a usage of
     zero, so the loader publishes no power draw at all. Measured end to end against a real
     server in `payload-battery-ferry`. */
  const after1s = cargoOf(await ferry(ferryLine("power-source"), 1), "payload-loader")[0];
  const after2s = cargoOf(await ferry(ferryLine("power-source"), 2), "payload-loader")[0];

  close(after1s.charge, 0.15, "fifteen frames in, and a hundredth a frame");
  close(after2s.charge - after1s.charge, 0.6, "sixty frames at a hundredth each");
});

test("a loader on a dead grid fills nothing, and asks all the same", async () => {
  /* The other half of the same line, and the reason the loader has to be on a grid at all.
     Its own base draw comes off the top of what arrives, so a loader getting nothing puts
     nothing in: `max(0 * 42 - 2, 0)` is zero, and it stays zero for ever rather than
     charging slowly. */
  const world = await ferry(ferryLine(null), 3);
  const loader = world.builds.find((build) => build.name === "payload-loader");

  assert.equal(loader.state.payload.charge, 0, "nothing went in");
  assert.equal(loader.state.power, 0, "and the grid gave it nothing");
  close(loader.behaviour.requestedPower(loader), 42, "while asking for two and forty");
});

test("a battery carried past a grid keeps what is in it", async () => {
  /* The claim the payload family had no way to make: a carried building is on no grid.
     `PowerGraph.add` files a lone battery under `batteries` with no producer and no
     consumer beside it, so `update` balances nothing against nothing and `distributePower`
     walks an empty list. Full when it left the loader, full two conveyors later. */
  const world = await ferry(ferryLine("power-source"), 10);
  const belts = cargoOf(world, "payload-conveyor");

  assert.equal(belts.length, 2, "both conveyors are holding one");
  for (const cargo of belts) {
    assert.equal(cargo.name, "battery");
    assert.equal(cargo.charge, 1, "neither drained nor topped up on the way");
  }
});
