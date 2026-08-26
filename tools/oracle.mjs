/**
 * Hold the port against the engine it was transcribed from.
 *
 *     node tools/oracle.mjs            build the scenarios and compare
 *     node tools/oracle.mjs --measure  re-run them in the real game first
 *
 * The browser now carries a transcription of Mindustry's update loop. A transcription is
 * worth nothing unless something can tell it apart from a plausible invention, and the
 * only thing that can is the engine it came from. So each scenario is one schematic, run
 * both ways for the same number of ticks, and the two answers are counted in items rather
 * than compared as rates: "a hundred and eighty two both times" leaves nowhere to hide,
 * where "about six and a half" hides a six per cent error.
 *
 * A scenario feeds itself. It carries its own sandbox source at one end and its own vault
 * at the other, so neither side has to be told where things go in or come out, and the
 * string that goes into the game is the string that goes into the browser.
 *
 * Measuring needs a provisioned server, which is why it is a flag rather than the default:
 *
 *     cd _run && echo "measure <base64> 30 ../bench/data/<name>.json" | java -jar server-release.jar
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const { differences, KEPT, known, measured, ported } = await import(
  new URL("./compare.mjs", import.meta.url));
const { toBase64 } = await import(
  new URL("../site/public/forge/schematic.js", import.meta.url));

const sizeOf = (name) => known.blocks[name]?.size || 1;

/** A content configuration, as the game writes it: type 5, a content kind, an id. */
const held = (kind, id) => Uint8Array.from([5, kind, (id >> 8) & 255, id & 255]);
const item = (name) => held(0, known.items[name].id);
const liquid = (name) => held(4, known.liquids[name].id);
const unit = (name) => held(6, known.units[name].id);

/**
 * A power node's links, as the game writes them: a `Point2[]`, each packed into one int,
 * each an offset from the node itself.
 */
const links = (offsets) => {
  const out = new Uint8Array(2 + offsets.length * 4);
  out[0] = 8;
  out[1] = offsets.length;
  const view = new DataView(out.buffer);
  offsets.forEach(([dx, dy], i) => view.setInt32(2 + i * 4, (dx << 16) | (dy & 0xFFFF)));
  return out;
};

/** A scenario may be a bare list of tiles, or tiles and the ground under them. */
const shape = (built) => (Array.isArray(built) ? { tiles: built, ground: [] }
  : { tiles: built.tiles, ground: built.ground || [] });

/**
 * The ground, moved to where the schematic will land.
 *
 * A schematic has no absolute position: writing one shifts every block so the lowest and
 * leftmost tile any of them **covers** sits at the origin. The ground list is written in
 * the scenario's own coordinates, so it has to make the same move, or it ends up under the
 * tile next door.
 *
 * This was wrong and silent for a while, because both engines painted the same wrong tiles
 * and agreed perfectly: `drill-copper` covered two tiles of ore rather than four and
 * `drill-half` one rather than two. The port was right; the question was not the one the
 * name claimed.
 */
function shifted(tiles, ground) {
  if (!ground.length) return ground;
  let left = Infinity;
  let bottom = Infinity;
  for (const tile of tiles) {
    const offset = Math.trunc(-(sizeOf(tile.block) - 1) / 2);
    left = Math.min(left, tile.x + offset);
    bottom = Math.min(bottom, tile.y + offset);
  }
  return ground.map((one) => {
    const [block, at] = one.split("@");
    if (!at) return one;
    const [x, y] = at.split(",").map(Number);
    return `${block}@${x - left},${y - bottom}`;
  });
}

/**
 * The scenarios.
 *
 * Small on purpose. A big schematic that disagrees tells you that something is wrong; a
 * line of eight belts that disagrees tells you which line of which class.
 */
/**
 * A scenario is either a list of tiles, or a list of tiles and the ground under them.
 *
 * A drill on bare metal floor pulls up nothing, so a scenario that measures one has to say
 * what it stands on. The same patch is painted in both engines, from the same list.
 */
const SCENARIOS = {
  /* A source, a line, a vault. The plainest question there is: how fast does a belt go. */
  "belt-copper": () => line("conveyor", 8),
  "belt-titanium": () => line("titanium-conveyor", 8),
  "belt-plastanium": () => line("plastanium-conveyor", 8),

  /* A short line and a long one, because a belt's rate should not depend on its length. */
  "belt-short": () => line("conveyor", 2),
  "belt-long": () => line("conveyor", 20),

  /* One in, three out. Nothing in `dump` divides by three: the even split is what a
     rotating cursor comes to, and getting the cursor wrong skips a branch entirely. */
  "router-three-ways": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "router", rotation: 0 },
    { x: 3, y: 0, block: "conveyor", rotation: 0 },
    { x: 5, y: 0, block: "vault", rotation: 0 },
    { x: 2, y: 1, block: "conveyor", rotation: 1 },
    { x: 2, y: 3, block: "vault", rotation: 0 },
    { x: 2, y: -1, block: "conveyor", rotation: 3 },
    { x: 2, y: -3, block: "vault", rotation: 0 },
  ],

  /* Straight on first, sideways only when it cannot. A maximum flow gets the total right
     and the branch wrong, which is exactly what a simulation is for. */
  "overflow-priority": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "overflow-gate", rotation: 0 },
    { x: 3, y: 0, block: "conveyor", rotation: 0 },
    { x: 5, y: 0, block: "vault", rotation: 0 },
    { x: 2, y: 1, block: "conveyor", rotation: 1 },
    { x: 2, y: 3, block: "vault", rotation: 0 },
  ],

  /* Two lines crossing. If they merge, both vaults hold both items. */
  "junction-cross": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "junction", rotation: 0 },
    { x: 3, y: 0, block: "conveyor", rotation: 0 },
    { x: 5, y: 0, block: "vault", rotation: 0 },
    { x: 2, y: -2, block: "item-source", rotation: 0, raw: item("lead") },
    { x: 2, y: -1, block: "conveyor", rotation: 1 },
    { x: 2, y: 1, block: "conveyor", rotation: 1 },
    { x: 2, y: 3, block: "vault", rotation: 0 },
  ],

  /* A sorter has two paths and each gets a scenario of its own.
  
     Merging two lines to test both at once did not work: a sandbox source pours a hundred
     a second, so whichever item is on the main line floods every round of the merge and
     three lead got through in thirty seconds. One item, one path, no ambiguity.
  
     Set to copper and carrying copper: everything goes straight on and the side vault
     stays empty. Set to copper and carrying lead: everything is turned aside and the
     vault in front stays empty. Compared container by container, so "the side vault is
     empty" is part of the answer rather than lost in a total. */
  "sorter-passes": () => sorter("copper"),
  "sorter-diverts": () => sorter("lead"),

  /* A vault that starts empty, filled by a source, emptied by an unloader into another
     vault. Eleven a second is the unloader's own stat line. */
  "unloader-drains": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 3, y: 0, block: "vault", rotation: 0 },
    { x: 5, y: 0, block: "unloader", rotation: 0, raw: item("copper") },
    { x: 6, y: 0, block: "titanium-conveyor", rotation: 0 },
    { x: 7, y: 0, block: "titanium-conveyor", rotation: 0 },
    { x: 9, y: 0, block: "vault", rotation: 0 },
  ],

  /* A press. Two coal in, one graphite out, ninety frames a batch, so at most two thirds
     of a graphite a second whatever it is fed. Fed a hundred a second by a sandbox source,
     what comes out is the machine's own pace and nothing else.
  
     A press is two across and stored at its corner, so it covers x..x+1 and y..y+1. The
     first go at this left a gap of one tile between the belt and the press and measured a
     factory that was never connected: both engines agreed on nothing at all, which is the
     right answer to the wrong question. */
  "crafter-press": () => [
    { x: 0, y: 1, block: "item-source", rotation: 0, raw: item("coal") },
    { x: 1, y: 1, block: "conveyor", rotation: 0 },
    { x: 2, y: 1, block: "conveyor", rotation: 0 },
    { x: 3, y: 1, block: "graphite-press", rotation: 0 },
    { x: 5, y: 1, block: "conveyor", rotation: 0 },
    { x: 6, y: 1, block: "conveyor", rotation: 0 },
    { x: 8, y: 1, block: "vault", rotation: 0 },
  ],

  /* Four presses along one belt, which carries 6.5 coal a second where they want 5.33
     between them. They should all run, and what the belt does not deliver ends in the
     vault as coal: both numbers have to match, not just the graphite. */
  "crafter-starved": () => {
    const tiles = [
      { x: 0, y: 1, block: "item-source", rotation: 0, raw: item("coal") },
      { x: 11, y: 1, block: "vault", rotation: 0 },
      { x: 11, y: 4, block: "vault", rotation: 0 },
    ];
    for (let x = 1; x <= 9; x++) tiles.push({ x, y: 1, block: "conveyor", rotation: 0 });
    for (let x = 1; x <= 9; x++) tiles.push({ x, y: 4, block: "conveyor", rotation: 0 });
    for (const x of [2, 4, 6, 8]) {
      tiles.push({ x, y: 2, block: "graphite-press", rotation: 0 });
    }
    return tiles;
  },

  /* Two presses off one router, each with its own vault, so the split is visible. */
  "crafter-two-presses": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("coal") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "router", rotation: 0 },

    // East of the router: covers 3..4 by 0..1.
    { x: 3, y: 0, block: "graphite-press", rotation: 0 },
    { x: 5, y: 0, block: "conveyor", rotation: 0 },
    { x: 7, y: 0, block: "vault", rotation: 0 },

    // North of the router: covers 2..3 by 2..3, which clears the first press by a tile.
    { x: 2, y: 2, block: "graphite-press", rotation: 0 },
    { x: 2, y: 4, block: "conveyor", rotation: 1 },
    { x: 2, y: 6, block: "vault", rotation: 0 },
  ],

  /* A pipe. Liquids do not travel like items: they move by pressure, a fraction at a
     time, so a settled line has a gradient along it and the far end is thinner than the
     near end. The tank at the end is what makes that measurable. */
  "pipe-water": () => ({
    tiles: [
      { x: 0, y: 0, block: "liquid-source", rotation: 0, raw: liquid("water") },
      ...Array.from({ length: 8 }, (_, i) => (
        { x: i + 1, y: 0, block: "conduit", rotation: 0 })),
      { x: 10, y: 0, block: "liquid-tank", rotation: 0 },
    ],
  }),

  /* The same with a pulse conduit, which holds twice as much and pushes slightly harder. */
  "pipe-pulse": () => ({
    tiles: [
      { x: 0, y: 0, block: "liquid-source", rotation: 0, raw: liquid("water") },
      ...Array.from({ length: 8 }, (_, i) => (
        { x: i + 1, y: 0, block: "pulse-conduit", rotation: 0 })),
      { x: 10, y: 0, block: "liquid-tank", rotation: 0 },
    ],
  }),

  /* A drill on four tiles of copper. Its rate is the game's own formula over the tiles it
     covers, and its warmup is the part a steady-state answer cannot express: it does not
     start at full speed, it creeps up over the first second and a bit. */
  "drill-copper": () => ({
    tiles: [
      { x: 0, y: 0, block: "mechanical-drill", rotation: 0 },
      { x: 2, y: 0, block: "conveyor", rotation: 0 },
      { x: 3, y: 0, block: "conveyor", rotation: 0 },
      { x: 5, y: 0, block: "vault", rotation: 0 },
    ],
    ground: [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => `ore-copper@${x},${y}`),
  }),

  /* Half on the patch, so half as fast. Nothing anywhere multiplies by a half: it falls
     out of counting the tiles. */
  "drill-half": () => ({
    tiles: [
      { x: 0, y: 0, block: "mechanical-drill", rotation: 0 },
      { x: 2, y: 0, block: "conveyor", rotation: 0 },
      { x: 3, y: 0, block: "conveyor", rotation: 0 },
      { x: 5, y: 0, block: "vault", rotation: 0 },
    ],
    ground: [[0, 0], [0, 1]].map(([x, y]) => `ore-copper@${x},${y}`),
  }),

  /* A generator that burns coal, a battery, and nothing drawing on it. Thirty seconds is
     more than enough to fill the battery, so what is measured is that it fills at all and
     that the generator kept burning. */
  "power-charge": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("coal") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "combustion-generator", rotation: 0 },
    { x: 3, y: 0, block: "battery", rotation: 0 },
  ],

  /* A grid that cannot keep up.
  
     A laser drill wants 66 power a second and one combustion generator makes 60, so the
     grid runs at nine tenths and the drill drills at nine tenths. It does not stop, and
     nothing anywhere decides which machine to switch off: every consumer on a grid is
     handed the same fraction, which is the line that makes a whole base dim together.
  
     The same drill with two generators has all the power it wants, and the pair of
     scenarios is the comparison. */
  "power-short": () => laserDrill(1),
  "power-plenty": () => laserDrill(2),

  /* A ground factory making daggers: ten silicon and ten lead every nine hundred frames,
     which is fifteen seconds, so two in thirty.
  
     Every feed touches what it feeds. The first go at this had the generators diagonal to
     the router and the belts stopping a tile short of the factory, so nothing at all was
     connected and both engines dutifully made nothing: the right answer to the wrong
     question, which is this scenario file's recurring failure mode.
  
     What comes out is not an item and never reaches a container, so the measurement is
     the units standing on the map at the end. */
  /* The same factory pointed into its own generators, so the dagger it builds has nowhere
     to go. It builds exactly one and then sits on its silicon for the rest of the run,
     which is a thing worth being able to tell a player about their design. */
  "units-boxed-in": () => ({
    tiles: SCENARIOS["units-daggers"]().tiles.map((tile) =>
      (tile.block === "ground-factory" ? { ...tile, rotation: 0 } : tile)),
  }),

  /* And the same factory with nobody having chosen what it builds, which makes nothing.
     Worth a scenario of its own, because it is a mistake a player really makes. */
  "units-unset": () => ({
    tiles: SCENARIOS["units-daggers"]().tiles.map((tile) =>
      (tile.block === "ground-factory" ? { ...tile, raw: undefined } : tile)),
  }),

  "units-daggers": () => ({
    tiles: [
      // Covers 0..2 by 0..2.
      // Set to build daggers. A factory nobody has configured makes nothing at all:
      // `currentPlan` starts at -1, which is a thing worth knowing about a schematic.
      // Pointed west, at open ground: a finished unit needs somewhere to be put down,
      // and a factory that has nowhere builds one and stops.
      { x: 1, y: 1, block: "ground-factory", rotation: 2, raw: unit("dagger") },

      { x: 0, y: 5, block: "item-source", rotation: 0, raw: item("silicon") },
      { x: 0, y: 4, block: "conveyor", rotation: 3 },
      { x: 0, y: 3, block: "conveyor", rotation: 3 },

      { x: 2, y: 5, block: "item-source", rotation: 0, raw: item("lead") },
      { x: 2, y: 4, block: "conveyor", rotation: 3 },
      { x: 2, y: 3, block: "conveyor", rotation: 3 },

      // Three generators against the factory's right edge, each with its own coal.
      { x: 3, y: 0, block: "combustion-generator", rotation: 0 },
      { x: 4, y: 0, block: "item-source", rotation: 0, raw: item("coal") },
      { x: 3, y: 1, block: "combustion-generator", rotation: 0 },
      { x: 4, y: 1, block: "item-source", rotation: 0, raw: item("coal") },
      { x: 3, y: 2, block: "combustion-generator", rotation: 0 },
      { x: 4, y: 2, block: "item-source", rotation: 0, raw: item("coal") },
    ],
  }),

  /* A duct, which is what Erekir has instead of a belt. It holds exactly one item and
     carries it across in `speed` frames, so its rate is a plain division and a line of
     them cannot buffer at all. */
  "duct-line": () => line("duct", 8),
  // One duct and two, to pin down the cycle: how often a single duct can take a new item
  // is a fact about one block, where a line of eight is a fact about a wave.
  "duct-one": () => line("duct", 1),
  "duct-two": () => line("duct", 2),
  "duct-armored": () => line("armored-duct", 8),

  /* An overflow duct: straight on when it can, to the sides when it cannot. */
  "duct-overflow": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "duct", rotation: 0 },
    { x: 2, y: 0, block: "overflow-duct", rotation: 0 },
    { x: 3, y: 0, block: "duct", rotation: 0 },
    { x: 5, y: 0, block: "vault", rotation: 0 },
    { x: 2, y: 1, block: "duct", rotation: 1 },
    { x: 2, y: 3, block: "vault", rotation: 0 },
  ],

  /* A turret at the end of a belt, with nobody shooting at it. It fills to its capacity
     and then refuses, which is the half of a turret a still picture can answer: not how
     fast it eats, but how much it swallows before it backs the belt up. */
  "turret-fills": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("graphite") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "conveyor", rotation: 0 },
    { x: 3, y: 0, block: "duo", rotation: 0 },
  ],

  /* A bigger one, which holds more and is worth more per item. */
  "turret-salvo": () => [
    { x: 0, y: 1, block: "item-source", rotation: 0, raw: item("graphite") },
    { x: 1, y: 1, block: "conveyor", rotation: 0 },
    { x: 2, y: 1, block: "conveyor", rotation: 0 },
    // Two across, stored at its corner: it reaches to x+1, so it starts where the belt
    // ends rather than a tile further on.
    { x: 3, y: 1, block: "salvo", rotation: 0 },
  ],

  /* Erekir's chemistry, which runs on heat.
  
     Heat is a third network and it travels like neither of the other two: not on a belt
     and not on a grid, but from one block's face to the face pressed against it. A
     producer has to be facing what it heats.
  
     A carbide crucible wants forty heat, and a sandbox heat source pours a thousand, so
     this measures the overheat rule as well: past its requirement a crucible runs faster,
     up to four times, and four times is where it lands. */
  "heat-crucible": () => [
    // Covers 0..2 by 0..2.
    { x: 1, y: 1, block: "carbide-crucible", rotation: 0 },
    // Facing west, into the crucible's right edge.
    { x: 3, y: 1, block: "heat-source", rotation: 2 },
    { x: 3, y: 0, block: "power-source", rotation: 0 },

    { x: 0, y: 5, block: "item-source", rotation: 0, raw: item("tungsten") },
    { x: 0, y: 4, block: "conveyor", rotation: 3 },
    { x: 0, y: 3, block: "conveyor", rotation: 3 },
    { x: 2, y: 5, block: "item-source", rotation: 0, raw: item("graphite") },
    { x: 2, y: 4, block: "conveyor", rotation: 3 },
    { x: 2, y: 3, block: "conveyor", rotation: 3 },

    { x: 1, y: -1, block: "conveyor", rotation: 3 },
    { x: 1, y: -3, block: "vault", rotation: 0 },
  ],

  /* The same crucible with the heat carried to it by a redirector instead of pressed
     against it, which is how a real base does it. */
  "heat-redirected": () => [
    { x: 1, y: 1, block: "carbide-crucible", rotation: 0 },
    { x: 4, y: 1, block: "heat-redirector", rotation: 2 },
    { x: 6, y: 1, block: "heat-source", rotation: 2 },
    // Touching the crucible: diagonal is not touching, and a crucible with no
    // power does not run however much heat is pressed against it.
    { x: 0, y: -1, block: "power-source", rotation: 0 },

    { x: 0, y: 5, block: "item-source", rotation: 0, raw: item("tungsten") },
    { x: 0, y: 4, block: "conveyor", rotation: 3 },
    { x: 0, y: 3, block: "conveyor", rotation: 3 },
    { x: 2, y: 5, block: "item-source", rotation: 0, raw: item("graphite") },
    { x: 2, y: 4, block: "conveyor", rotation: 3 },
    { x: 2, y: 3, block: "conveyor", rotation: 3 },

    { x: 2, y: -1, block: "conveyor", rotation: 3 },
    { x: 2, y: -3, block: "vault", rotation: 0 },
  ],

  /* A power node, which is how a real base joins things that do not touch. Its links are
     part of its configuration; written without them it connects to nothing at all. */
  "power-node": () => ({
    tiles: [
      { x: 0, y: 1, block: "item-source", rotation: 0, raw: item("coal") },
      { x: 1, y: 1, block: "combustion-generator", rotation: 0 },
      { x: 2, y: 1, block: "power-node", rotation: 0, raw: links([[-1, 0], [4, 0]]) },

      // Four tiles away, touching nothing: only the node joins it to the generator.
      { x: 7, y: 1, block: "laser-drill", rotation: 0 },
      { x: 9, y: 1, block: "conveyor", rotation: 0 },
      { x: 11, y: 1, block: "vault", rotation: 0 },
    ],
    ground: [6, 7, 8].flatMap((x) => [0, 1, 2].map((y) => `ore-copper@${x},${y}`)),
  }),

  /* A core, which is where most schematics that are not self-contained are meant to
     deliver. It takes anything and hands nothing back. */
  "core-delivery": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "conveyor", rotation: 0 },
    { x: 4, y: 0, block: "core-shard", rotation: 0 },
  ],

  /* A cultivator on four tiles of spore moss, and the same one on bare floor.
  
     `AttributeCrafter`: the ground multiplies the speed. The sum is over the tiles it
     covers rather than an average, so four tiles at 0.3 read 1.2 and a two by two
     cultivator runs at 1 + 1.2 = 2.2 times its nameplate. The pair is the measurement: one
     number on its own could be a wrong craft time, two that differ by exactly the boost
     could not. */
  "cultivator-spores": () => cultivator(true),
  "cultivator-bare": () => cultivator(false),

  /* A separator, whose output is drawn rather than decided.
  
     One item per batch, weighted five copper to three lead to two graphite to two
     titanium. The total is arithmetic and would match whatever the draw did; the split
     only matches if the generator is reproduced bit for bit, down to the seed being the
     block's position on the map. */
  "separator-mix": () => [
    { x: 0, y: 0, block: "liquid-source", rotation: 0, raw: liquid("slag") },
    { x: 0, y: 1, block: "power-source", rotation: 0 },
    // Covers 1..2 by 0..1.
    { x: 1, y: 0, block: "separator", rotation: 0 },
    { x: 3, y: 0, block: "conveyor", rotation: 0 },
    { x: 4, y: 0, block: "conveyor", rotation: 0 },
    { x: 6, y: 0, block: "vault", rotation: 0 },
  ],

  /* A disassembler, which is the same class with an item to eat as well: it takes scrap
     and slag and gives back one of four things, one of which is scrap-free sand. Fed
     faster than it can chew, so what it holds at the end is part of the answer. */
  "separator-disassembler": () => [
    // Covers 1..3 by 1..3, so both sources have to stand against its left edge.
    { x: 2, y: 2, block: "disassembler", rotation: 0 },
    { x: 0, y: 2, block: "liquid-source", rotation: 0, raw: liquid("slag") },
    { x: 0, y: 3, block: "power-source", rotation: 0 },

    { x: 2, y: 5, block: "item-source", rotation: 0, raw: item("scrap") },
    { x: 2, y: 4, block: "conveyor", rotation: 3 },

    { x: 4, y: 2, block: "conveyor", rotation: 0 },
    { x: 5, y: 2, block: "conveyor", rotation: 0 },
    { x: 7, y: 2, block: "vault", rotation: 0 },
  ],

  /* A bridge over a gap. Unmodelled, a line that jumps a wall reads as two dead ends. */
  "bridge-span": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "bridge-conveyor", rotation: 0,
      raw: Uint8Array.from([7, 0, 0, 0, 3, 0, 0, 0, 0]) },
    { x: 5, y: 0, block: "bridge-conveyor", rotation: 0 },
    { x: 6, y: 0, block: "conveyor", rotation: 0 },
    { x: 8, y: 0, block: "vault", rotation: 0 },
  ],
};

/**
 * A cultivator, on spore moss or on nothing.
 *
 * The floor is painted rather than the overlay: `sumAttribute` reads the floor and skips
 * whatever ore is laid over it, so spore moss has to **be** the ground and not sit on it.
 */
function cultivator(mossy) {
  const tiles = [
    { x: -1, y: 0, block: "liquid-source", rotation: 0, raw: liquid("water") },
    { x: -1, y: 1, block: "power-source", rotation: 0 },
    // Covers 0..1 by 0..1.
    { x: 0, y: 0, block: "cultivator", rotation: 0 },
    { x: 2, y: 0, block: "conveyor", rotation: 0 },
    { x: 3, y: 0, block: "conveyor", rotation: 0 },
    { x: 5, y: 0, block: "vault", rotation: 0 },
  ];
  const ground = mossy
    ? [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => `spore-moss@${x},${y}`)
    : [];
  return { tiles, ground };
}

/**
 * A laser drill on nine tiles of copper, fed by however many generators are asked for.
 *
 * The generators touch the drill rather than reaching it through a power node. A node
 * placed from a schematic carries its links in its configuration, and one written without
 * them connects to nothing at all: the first go at this had a node between them and
 * measured a drill with no power, in both engines, which is the right answer to the wrong
 * question. Blocks that touch share a grid, and that needs no configuration.
 */
function laserDrill(generators) {
  const tiles = [
    // Covers 0..2 by 0..2, with its ore under it.
    { x: 1, y: 1, block: "laser-drill", rotation: 0 },
    { x: 3, y: 1, block: "conveyor", rotation: 0 },
    { x: 4, y: 1, block: "conveyor", rotation: 0 },
    { x: 6, y: 1, block: "vault", rotation: 0 },

    { x: 0, y: 5, block: "item-source", rotation: 0, raw: item("coal") },
    { x: 0, y: 4, block: "router", rotation: 0 },
    { x: 0, y: 3, block: "combustion-generator", rotation: 0 },
  ];
  if (generators > 1) {
    tiles.push({ x: 1, y: 4, block: "conveyor", rotation: 3 });
    tiles.push({ x: 1, y: 3, block: "combustion-generator", rotation: 0 });
  }
  const ground = [];
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) ground.push(`ore-copper@${x},${y}`);
  return { tiles, ground };
}

/** A sorter set to copper, on a line carrying whatever is asked for. */
function sorter(carried) {
  return [
    { x: 0, y: 1, block: "item-source", rotation: 0, raw: item(carried) },
    { x: 1, y: 1, block: "conveyor", rotation: 0 },
    { x: 2, y: 1, block: "conveyor", rotation: 0 },
    { x: 3, y: 1, block: "sorter", rotation: 0, raw: item("copper") },
    { x: 4, y: 1, block: "conveyor", rotation: 0 },
    { x: 6, y: 1, block: "vault", rotation: 0 },
    { x: 3, y: 0, block: "conveyor", rotation: 3 },
    { x: 3, y: -2, block: "vault", rotation: 0 },
  ];
}

/**
 * Refuse a scenario whose blocks stand on each other.
 *
 * Written after losing an hour to two presses sharing a tile. The game silently kept one
 * of them, so the measurement was of a schematic nobody had described, and the port and
 * the engine disagreed about a layout neither of them should have been given. Blocks are
 * stored at a corner and reach up and right by their size, which is exactly the sort of
 * arithmetic worth having checked rather than remembered.
 */
function check(name, tiles) {
  const taken = new Map();
  for (const tile of tiles) {
    const size = sizeOf(tile.block);
    const offset = Math.trunc(-(size - 1) / 2);
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        const at = `${tile.x + offset + dx},${tile.y + offset + dy}`;
        if (taken.has(at)) {
          throw new Error(`${name} : ${tile.block} et ${taken.get(at)} se chevauchent `
            + `en ${at}`);
        }
        taken.set(at, tile.block);
      }
    }
  }
  return tiles;
}

function line(block, length) {
  const tiles = [{ x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") }];
  for (let x = 1; x <= length; x++) tiles.push({ x, y: 0, block, rotation: 0 });
  tiles.push({ x: length + 2, y: 0, block: "vault", rotation: 0 });
  return tiles;
}

/**
 * Line the containers up so they can be compared one to one.
 *
 * Summed together, a sorter that sorts nothing passes: the copper and the lead are both
 * there, just in the wrong vaults. Told apart by where they stand, it does not. The two
 * engines number the world differently, so the containers are sorted by position relative
 * to the leftmost and lowest of them and matched in that order.
 */
function lineUp(containers) {
  const left = Math.min(...containers.map((one) => one.x));
  const bottom = Math.min(...containers.map((one) => one.y));
  return containers
    .map((one) => ({ at: `${one.x - left},${one.y - bottom}`, items: one.items }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

const SECONDS = 30;
const TICKS = SECONDS * 60;

mkdirSync(KEPT, { recursive: true });

if (process.argv.includes("--measure")) {
  const commands = [];
  for (const [name, build] of Object.entries(SCENARIOS)) {
    const { tiles, ground } = shape(build());
    const painted = shifted(tiles, ground);
    const code = await toBase64(check(name, tiles), { tags: { name }, sizeOf });
    writeFileSync(join(KEPT, `${name}.txt`), code);
    writeFileSync(join(KEPT, `${name}.sol`), painted.join(" "));
    commands.push(`measure ${code} ${SECONDS} ../bench/data/oracle/${name}.json`
      + (painted.length ? ` ${painted.join(" ")}` : ""));
  }
  writeFileSync(join(KEPT, "commands.txt"), `${commands.join("\n")}\n`);
  console.log(`${commands.length} scenarios ecrits dans ${KEPT}`);
  console.log("Pour les mesurer dans le vrai jeu :");
  console.log("  cd _run && (cat ../bench/data/oracle/commands.txt; sleep 20; echo exit)"
    + " | java -jar server-release.jar");
  process.exit(0);
}

let worst = 0;
let missing = 0;
console.log(`scenario / place / ce qui s'y trouve   portage      jeu   ecart`);
console.log(`${"-".repeat(66)}`);

for (const [name, build] of Object.entries(SCENARIOS)) {
  const { tiles, ground } = shape(build());
  const code = await toBase64(check(name, tiles), { tags: { name }, sizeOf });
  const theirs = measured(name);

  if (!theirs) {
    missing++;
    console.log(`${name.padEnd(28)} pas encore mesure`);
    continue;
  }

  const mine = await ported(code, theirs.ticks, shifted(tiles, ground));
  for (const gap of differences(mine, theirs)) {
    worst = Math.max(worst, gap.gap);
    console.log(`${`${name} ${gap.what}`.padEnd(38)}`
      + `${String(gap.mine).padStart(8)} ${String(gap.theirs).padStart(8)}`
      + `   ${gap.gap < 0.0001 ? "exact" : `${(gap.gap * 100).toFixed(1)}%`}`);
  }
}

console.log(`${"-".repeat(66)}`);
if (missing) {
  console.log(`${missing} scenario(s) jamais mesures : relance avec --measure`);
}
console.log(`ecart maximum : ${(worst * 100).toFixed(2)}%`);
process.exitCode = worst > 0.02 ? 1 : 0;
