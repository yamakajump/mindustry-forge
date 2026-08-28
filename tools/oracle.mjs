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
/** A block, which is what a constructor's recipe is. Content type one. */
const blockOf = (name) => held(1, known.blocks[name].id);

/** A relative point, which is how a bridge and a mass driver both keep their link. */
const point = (dx, dy) => {
  const out = new Uint8Array(9);
  out[0] = 7;
  new DataView(out.buffer).setInt32(1, dx);
  new DataView(out.buffer).setInt32(5, dy);
  return out;
};

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

/**
 * A block claimed to do nothing, and the shape that proves it.
 *
 * A router with a vault at the end of a belt on one side and the block on the other. If it
 * refuses, all the copper ends up in the vault; if it accepted anything at all, half of it
 * would disappear. A ticked box saying "does nothing" is worth nothing until somebody has
 * looked.
 */
const refuses = (block) => {
  const size = known.blocks[block].size || 1;
  return [
    { x: -2, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: -1, y: 0, block: "conveyor", rotation: 0 },
    { x: 0, y: 0, block: "router", rotation: 0 },
    // Placed so that it touches the router's north face, whatever its size.
    { x: 0, y: 1 + Math.trunc((size - 1) / 2), block, rotation: 0 },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "conveyor", rotation: 0 },
    { x: 3, y: 0, block: "conveyor", rotation: 0 },
    // Covers 4..6 by -1..1, out of reach of the largest block under test.
    { x: 5, y: 0, block: "vault", rotation: 0 },
  ];
};

/** A scenario may be a bare list of tiles, or tiles and the ground under them. */
const shape = (built) => (Array.isArray(built) ? { tiles: built, ground: [], stock: [] }
  : { tiles: built.tiles, ground: built.ground || [], stock: built.stock || [] });

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
    const [what, at] = one.split("@");
    if (!at) return one;
    const [x, y] = at.split(",").map(Number);
    return `${what}@${x - left},${y - bottom}`;
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
  /* What a burner will and will not swallow, which is a rule this repository got wrong
     twice in two different files.

     A generator that burns "anything" names no ingredient, so something has to decide what
     covers its hunger. `needs.js` counted everything the layout made, which told a silicon
     line its silicon would feed its generators; `marks.js` used a flammability threshold,
     which cannot express an RTG eating thorium at flammability zero. Both are now read
     from the block's own `accepts`, dumped from the game.

     These two scenarios are what makes that claim checkable rather than argued. Silicon
     goes in: if the generator refuses it, every last one ends up in the vault, and a
     schematic making silicon really does still need coal delivered. Coal goes in: the
     generator takes it, and the vault is short by exactly what was burnt. Same shape, one
     item changed, so the difference between the two runs is the rule itself.

     Not yet measured: it takes `npm run oracle:measure`, which needs a provisioned server,
     and there is no jar on the machine this was written on. Until somebody runs it these
     two sit outside the test, which only walks the scenarios that have a recorded answer. */
  "burner-refuses-silicon": () => [
    { x: -2, y: 0, block: "item-source", rotation: 0, raw: item("silicon") },
    { x: -1, y: 0, block: "conveyor", rotation: 0 },
    { x: 0, y: 0, block: "router", rotation: 0 },
    { x: 0, y: 1, block: "combustion-generator", rotation: 0 },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "conveyor", rotation: 0 },
    { x: 3, y: 0, block: "conveyor", rotation: 0 },
    { x: 5, y: 0, block: "vault", rotation: 0 },
  ],

  /* The same thing with the one item the block does accept, so the pair says what the
     first one alone could not: that the vault filling up is the refusal and not the belt. */
  "burner-takes-coal": () => SCENARIOS["burner-refuses-silicon"]().map((tile) =>
    tile.block === "item-source" ? { ...tile, raw: item("coal") } : tile),

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
    /* Eleven items a second going in, six and a half going straight out.

       The scenario used to feed both branches with a belt of the same rate and end on a
       vault of a thousand: the straight branch swallowed everything, `canForward` was true
       on every frame, and the side received not one item. The two scenarios named after the
       overflow rule never exercised it once.

       Here the straight branch saturates at its own rate and the rest goes out the side.
       Both figures are non zero and different, and that is exactly the situation the rule
       exists for. */
    { x: 1, y: 0, block: "titanium-conveyor", rotation: 0 },
    { x: 2, y: 0, block: "overflow-gate", rotation: 0 },
    { x: 3, y: 0, block: "conveyor", rotation: 0 },
    { x: 4, y: 0, block: "conveyor", rotation: 0 },
    { x: 6, y: 0, block: "vault", rotation: 0 },
    { x: 2, y: 1, block: "titanium-conveyor", rotation: 1 },
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
  /* The vault starts full and nothing refills it.

     It used to be fed by a copper belt at six and a half items a second, and the only
     figure compared was what that belt had carried. An unloader at seven, eleven or forty a
     second would have given the same result: its speed was checked nowhere. On a closed
     stock of a thousand, what is left says its rate and nothing else. */
  "unloader-drains": () => ({
    tiles: [
      // Covers 0..2 by -1..1.
      { x: 1, y: 0, block: "vault", rotation: 0 },
      { x: 3, y: 0, block: "unloader", rotation: 0, raw: item("copper") },
      { x: 4, y: 0, block: "titanium-conveyor", rotation: 0 },
      { x: 5, y: 0, block: "titanium-conveyor", rotation: 0 },
      { x: 7, y: 0, block: "vault", rotation: 0 },
    ],
    stock: ["copper*1000@1,0"],
  }),

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

  /* A router splitting coal between two presses, each at the end of its own belt.

     Rewritten twice. The northern press was not against the router, so the game ran it at
     zero efficiency and the scenario, named after a split between two presses, measured one
     press behind a router. Pressed against it, it measured a **jam**: a press hands its
     graphite to every neighbour, the router included, and the router clogged with it.

     With a belt between the router and each press, the graphite has nowhere to come back
     to: the belt feeding the press points at it and refuses what it holds out. The router
     alternates, each press gets three and a quarter coal a second against a need of one and
     a third, and both run at full speed. */
  "crafter-two-presses": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("coal") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "router", rotation: 0 },

    // East: two belts, then a press at 5..6 by 0..1.
    { x: 3, y: 0, block: "conveyor", rotation: 0 },
    { x: 4, y: 0, block: "conveyor", rotation: 0 },
    { x: 5, y: 0, block: "graphite-press", rotation: 0 },
    { x: 7, y: 0, block: "conveyor", rotation: 0 },
    { x: 9, y: 0, block: "vault", rotation: 0 },

    // North: the same, press at 2..3 by 3..4.
    { x: 2, y: 1, block: "conveyor", rotation: 1 },
    { x: 2, y: 2, block: "conveyor", rotation: 1 },
    { x: 2, y: 3, block: "graphite-press", rotation: 0 },
    { x: 2, y: 5, block: "conveyor", rotation: 1 },
    { x: 2, y: 7, block: "vault", rotation: 0 },
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

  /* And the same factory pointed at a conveyor, which is the ordinary layout: you put the
     output on the side the belt runs. `canDump` is `front == null || !front.tile.solid()`,
     and a conveyor is not solid, so the game drops the dagger on the ground beside it and
     carries on. Reading any building at all as a wall, the port built one and then sat on
     sixty silicon and forty lead for the rest of the run. */
  "units-onto-belt": () => ({
    tiles: [
      ...SCENARIOS["units-daggers"]().tiles,
      { x: -1, y: 1, block: "conveyor", rotation: 2 },
    ],
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
  /* The same disease as the overflow gate, and the same cure: the straight branch has to
     saturate at its own rate, or the side never gets anything and the scenario does not
     measure what its name says. A duct carries fifteen a second and a copper belt six and a
     half, so the belt saturates and the rest goes out the side. */
  "duct-overflow": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "duct", rotation: 0 },
    { x: 2, y: 0, block: "overflow-duct", rotation: 0 },
    { x: 3, y: 0, block: "conveyor", rotation: 0 },
    { x: 4, y: 0, block: "conveyor", rotation: 0 },
    { x: 6, y: 0, block: "vault", rotation: 0 },
    { x: 2, y: 1, block: "duct", rotation: 1 },
    { x: 2, y: 3, block: "vault", rotation: 0 },
  ],

  /* An overflow duct on its own, straight through, which pins its cycle. It has no
     `handleItem` of its own, so its clock starts at zero where a duct's starts at minus
     one: an item crosses in `ceil((speed - 1) / 2)` updates rather than `speed`. Two frames
     against four, thirty items a second against fifteen, and nothing in the shape above
     could see it because the belt downstream was the bottleneck. */
  "duct-overflow-straight": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "overflow-duct", rotation: 0 },
    { x: 3, y: 0, block: "vault", rotation: 0 },
  ],

  /* And an overflow duct fed from the side, which the game refuses outright: its
     `acceptItem` is written from scratch and only the rear face passes. Inheriting a plain
     duct's rule, which takes from everywhere but the front, the port pushed a full duct's
     worth through a face that is closed.

     The router is what makes the difference a number: refused, everything piles into the
     near vault and the far one stays empty. */
  "duct-overflow-side-fed": () => [
    { x: -1, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 0, y: 0, block: "conveyor", rotation: 0 },
    { x: 1, y: 0, block: "router", rotation: 0 },
    // Pointed north, so its rear is south and the router feeds it from the side.
    { x: 2, y: 0, block: "overflow-duct", rotation: 1 },
    // What the router pushes south: covers 0..2 by -3..-1.
    { x: 1, y: -2, block: "vault", rotation: 0 },
    // What would come out of the duct: covers 2..4 by 1..3.
    { x: 3, y: 2, block: "vault", rotation: 0 },
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

  /* The same separator with its outlet leading nowhere: five belt tiles and a dead end.
     They fill, the separator fills to its ten behind them, and everything stops. Which
     four of the four metals it is still holding is the measurement.

     Written to pin `dump(null)`, which walks `content.items()` by id in the game and walked
     a Map here. It does not: a separator makes one item every thirty-five frames and offers
     one every five, so it never holds two at once until the belt closes, and once the belt
     is closed nothing moves at all. The order is transcribed because it is what the game
     does, not because anything here can see it. */
  "separator-jammed": () => [
    { x: 0, y: 0, block: "liquid-source", rotation: 0, raw: liquid("slag") },
    { x: 0, y: 1, block: "power-source", rotation: 0 },
    // Covers 1..2 by 0..1.
    { x: 1, y: 0, block: "separator", rotation: 0 },
    { x: 3, y: 0, block: "conveyor", rotation: 0 },
    { x: 4, y: 0, block: "conveyor", rotation: 0 },
    { x: 5, y: 0, block: "conveyor", rotation: 0 },
    { x: 6, y: 0, block: "conveyor", rotation: 0 },
    { x: 7, y: 0, block: "conveyor", rotation: 0 },
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

  /* The same generator on three fuels, with nothing but a battery to catch what it makes.

     What a burner produces is not its nameplate: it is the **flammability** of what it
     drew. Coal is worth 1, spore pods 1.15, pyratite 1.4, so the three batteries end at
     0.45, 0.52 and 0.63 of full and nothing else in the scenario differs. Read as "a
     combustion generator makes sixty power a second", all three read 0.45. */
  "gen-spore": () => burning("spore-pod"),
  "gen-pyratite": () => burning("pyratite"),

  /* And on a fixed ration rather than an endless one, which is where the other half of the
     table shows: pyratite lasts three times as long per item, so ten of them last the
     whole thirty seconds where ten coal are gone in twenty. Both the charge and what is
     left in the generator have to match. */
  "gen-ration-coal": () => rationed("coal"),
  "gen-ration-pyratite": () => rationed("pyratite"),

  /* An RTG, which is the same class reading radioactivity instead of flammability, and the
     extreme of the duration table: phase fabric is worth 0.6 and lasts fifteen times as
     long, so it makes **less** power for far longer. */
  "gen-rtg-thorium": () => rationed("thorium", "rtg-generator"),
  "gen-rtg-phase": () => rationed("phase-fabric", "rtg-generator"),

  /* A solar panel, which needs nothing and reads no ground. The control: it has to give
     the same answer on bare floor as a thermal generator gives a different answer on hot
     rock, or the attribute system has leaked into blocks that never asked for it. */
  "gen-solar": () => [
    { x: 0, y: 0, block: "solar-panel", rotation: 0 },
    { x: 1, y: 0, block: "battery", rotation: 0 },
  ],

  /* A thermal generator on four tiles of magmarock, and the same one on hot rock.

     `productionEfficiency` is the sum of the attribute over the tiles it covers, with no
     cap of any kind: 4 x 0.75 against 4 x 0.5, so the two batteries differ by half again.
     Clamped to one, as an efficiency usually is, both read the same. */
  "gen-thermal-magma": () => thermal("magmarock"),
  "gen-thermal-hot": () => thermal("hotrock"),

  /* A thorium reactor, fed and left to empty.

     `productionEfficiency = items.get(thorium) / itemCapacity`: a reactor holding fifteen
     thorium of thirty makes **half** its rated power. No rate table anywhere says so, and
     over thirty seconds on a fixed ration it is an eleven per cent error. Fed by a source
     it stays full and makes its nameplate figure; on a ration of thirty it does not. */
  "reactor-fed": () => reactor(true),
  "reactor-ration": () => reactor(false),

  /* And the same reactor with nothing to cool it.

     Cooling is hand rolled and sits outside the consumer system: uncooled, heat climbs
     0.02 a frame and the reactor dies at one, fifty frames in. Everything after that is a
     flat line, and the battery says exactly when it stopped. */
  "reactor-uncooled": () => ({
    tiles: [
      // Covers 0..2 by 0..2.
      { x: 1, y: 1, block: "thorium-reactor", rotation: 0 },
      // Covers 3..5 by 0..2.
      { x: 4, y: 1, block: "battery-large", rotation: 0 },
    ],
    stock: ["thorium*30@1,1"],
  }),

  /* An impact reactor, which is the only block in the game that draws on the grid it is
     feeding. It wants 25 power a frame and gives back 130 times its warmup to the fifth,
     so it is a net drain for the first twenty one seconds and a net gain after.

     Six RTGs make 27 a frame between them, which is just enough to hold the grid at full
     coverage while the reactor warms. The batteries then integrate the whole curve: a port
     that forgets the reactor consumes reads a straight line, one that forgets the fifth
     power reads a different one. */
  "reactor-impact": () => {
    const tiles = [
      // Covers 1..4 by 1..4.
      { x: 2, y: 2, block: "impact-reactor", rotation: 0 },
      { x: 0, y: 1, block: "item-source", rotation: 0, raw: item("blast-compound") },
      { x: 0, y: 3, block: "liquid-source", rotation: 0, raw: liquid("cryofluid") },
    ];
    const stock = [];
    for (let i = 0; i < 6; i++) {
      // Two wide, in a row along the reactor's top edge and each other's sides.
      tiles.push({ x: 1 + i * 2, y: 5, block: "rtg-generator", rotation: 0 });
      stock.push(`thorium*10@${1 + i * 2},5`);
    }
    for (let i = 0; i < 3; i++) {
      tiles.push({ x: 6 + i * 3, y: 2, block: "battery-large", rotation: 0 });
    }
    return { tiles, stock };
  },

  /* A flux reactor, which runs at whatever fraction of its heat requirement it is getting.

     `efficiency *= clamp(heat / maxHeat)` happens in the consumption pass, so cold it
     produces nothing **and drinks nothing**. The pair is the measurement: with heat it
     makes three hundred a frame, without it makes nothing and its cyanogen is untouched.
     A port that misses the line reads eighteen thousand power a second out of a cold
     reactor. */
  "reactor-flux": () => flux(true),
  "reactor-flux-cold": () => flux(false),

  /* A duct router, one in and three out. Nothing in the cursor divides by three: the even
     split is what a cursor that advances on refusals as well as successes comes to. */
  "duct-router-three-ways": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("beryllium") },
    { x: 1, y: 0, block: "duct", rotation: 0 },
    { x: 2, y: 0, block: "duct-router", rotation: 0 },
    { x: 3, y: 0, block: "duct", rotation: 0 },
    { x: 5, y: 0, block: "vault", rotation: 0 },
    { x: 2, y: 1, block: "duct", rotation: 1 },
    { x: 2, y: 3, block: "vault", rotation: 0 },
    { x: 2, y: -1, block: "duct", rotation: 3 },
    { x: 2, y: -3, block: "vault", rotation: 0 },
  ],

  /* The same router set to sort. The sorted item goes straight ahead and **only** straight
     ahead; everything else goes out the sides and never forward. Set to graphite and fed
     beryllium, the vault in front has to end at nothing at all. */
  "duct-router-sorted": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("beryllium") },
    { x: 1, y: 0, block: "duct", rotation: 0 },
    { x: 2, y: 0, block: "duct-router", rotation: 0, raw: item("graphite") },
    { x: 3, y: 0, block: "duct", rotation: 0 },
    { x: 5, y: 0, block: "vault", rotation: 0 },
    { x: 2, y: 1, block: "duct", rotation: 1 },
    { x: 2, y: 3, block: "vault", rotation: 0 },
  ],

  /* A surge router, which saves ten and lets them all go in one frame. The total is close
     to a plain router's; the shape is not, and a vault behind one grows by ten at a time.
     Unpowered it still works, at four sevenths of the speed, which is the part a port that
     gates on `efficiency > 0` gets wrong by refusing to run at all. */
  "stack-router-powered": () => stackRouter(true),
  "stack-router-unpowered": () => stackRouter(false),

  /* Two duct bridges throwing four tiles, and a third with nothing to link to.

     The terminal bridge refuses everything through `acceptItem` and is fed anyway, because
     the bridge behind it hands over without asking. And the receiving bridge blocks the
     face the beam arrives on: the duct pushing at that side is refused for the whole
     thirty seconds and ends holding exactly one item.

     There was a third feed here, into the free face of the middle bridge, and it turned
     the scenario into a contention: two ways in, four slots, and the two engines picked
     different winners while agreeing on the total to the item. Contention is worth
     measuring, but not in the same scenario as the two rules above. */
  "duct-bridge-span": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("beryllium") },
    { x: 1, y: 0, block: "duct", rotation: 0 },
    { x: 2, y: 0, block: "duct-bridge", rotation: 0 },
    { x: 6, y: 0, block: "duct-bridge", rotation: 0 },
    { x: 10, y: 0, block: "duct-bridge", rotation: 0 },
    { x: 11, y: 0, block: "duct", rotation: 0 },
    { x: 13, y: 0, block: "vault", rotation: 0 },

    // Pushing at the middle bridge from the west, which is the face the first bridge's
    // beam lands on. It should never get in.
    { x: 4, y: 0, block: "item-source", rotation: 0, raw: item("graphite") },
    { x: 5, y: 0, block: "duct", rotation: 0 },
  ],

  /* An armoured duct, fed three ways. From the side by a block that is not a duct it takes
     nothing; from a duct pointed at it, or from directly behind, it takes everything. The
     three together are the table, and a port that reads armoured as "same but tougher"
     fails the first, while one that reads it as "from behind only" fails the second. */
  "duct-armored-side": () => armoured("side"),
  "duct-armored-duct": () => armoured("duct"),
  "duct-armored-behind": () => armoured("behind"),

  /* Erekir's wire, which is a battery pretending to be a wire: a beam node holds a
     thousand power and reaches ten tiles in a straight line. Two of them carry a
     generator's output to a drill that touches nothing. */
  "beam-node-span": () => ({
    tiles: [
      { x: 0, y: 1, block: "item-source", rotation: 0, raw: item("coal") },
      { x: 1, y: 1, block: "combustion-generator", rotation: 0 },
      { x: 2, y: 1, block: "beam-node", rotation: 0 },
      { x: 12, y: 1, block: "beam-node", rotation: 0 },
      // Nine tiles from the first node, touching nothing but the second.
      { x: 14, y: 1, block: "laser-drill", rotation: 0 },
      { x: 16, y: 1, block: "conveyor", rotation: 0 },
      { x: 18, y: 1, block: "vault", rotation: 0 },
    ],
    ground: [13, 14, 15].flatMap((x) => [0, 1, 2].map((y) => `ore-copper@${x},${y}`)),
  }),

  /* The same beam, with a power node standing in the way. A beam node does not link to a
     power node: it steps over it and carries on to whatever is behind. Compared by the name
     of its class, `LongPowerNode` and `PowerSource` both slipped through, so the beam
     stopped dead on a beam link and left the drill behind it alone on its own grid at
     coverage zero, making nothing at all. */
  "beam-node-through-link": () => ({
    tiles: [
      { x: 0, y: 1, block: "item-source", rotation: 0, raw: item("coal") },
      { x: 1, y: 1, block: "combustion-generator", rotation: 0 },
      { x: 2, y: 1, block: "beam-node", rotation: 0 },
      // Covers 3..5 by 0..2, with no link of its own: a dead wire across the beam.
      { x: 4, y: 1, block: "beam-link", rotation: 0 },
      // Covers 6..8 by 0..2, behind the wire.
      { x: 7, y: 1, block: "laser-drill", rotation: 0 },
      { x: 9, y: 1, block: "conveyor", rotation: 0 },
      { x: 11, y: 1, block: "vault", rotation: 0 },
    ],
    ground: [6, 7, 8].flatMap((x) => [0, 1, 2].map((y) => `ore-copper@${x},${y}`)),
  }),

  /* A wave with a tank of water and nothing to shoot at. It holds its ten units for the
     whole thirty seconds and drinks not a drop: a liquid turret's water is a stock, not a
     rate, and a port that reads it as a consumer invents a supply line. */
  "turret-wave-idle": () => ({
    tiles: [{ x: 0, y: 0, block: "wave", rotation: 0 }],
    stock: ["water~10@0,0"],
  }),

  /* A meltdown, which does the opposite of reloading. It is placed fully loaded and spends
     the next seven and a half seconds drinking two hundred and twenty five water to wind
     **down** to zero, on a tank that holds sixty. And it does it on `delta()` rather than
     `edelta()`, so it drinks exactly as fast with no power at all: there is none here. */
  "turret-meltdown-drain": () => ({
    tiles: [
      // Covers 0..3 by 0..3.
      { x: 1, y: 1, block: "meltdown", rotation: 0 },
      // A pipe between the tank and the turret, and not for decoration. A tank pushes
      // `clamp(fract - ofract) * 1800`, which is enough to refill a sixty unit tank from
      // empty in one frame: the turret's level then sawtooths rather than settling, and
      // where on the sawtooth thirty seconds lands is not a fact about the block. Through
      // a pipe that holds twenty the same gradient moves twenty units at a time, and the
      // level settles.
      { x: 4, y: 1, block: "conduit", rotation: 2 },
      // Covers 5..7 by 0..2.
      { x: 6, y: 1, block: "liquid-tank", rotation: 0 },
    ],
    stock: ["water~60@1,1", "water~1800@6,1"],
  }),

  /* A lancer, which draws power and coolant only while it runs itself up to a full reload,
     and then stops dead. Eighty frames of reload, cut to fifty seven by the coolant it
     drinks on the way, and after that it asks the grid for nothing at all.

     Measured against an RTG rather than a sandbox tap, because a tap fills the battery in
     three frames and hides everything. The battery says how much the lancer took. */
  "turret-lancer-runup": () => ({
    tiles: [
      // Covers 0..1 by 0..1.
      { x: 0, y: 0, block: "rtg-generator", rotation: 0 },
      // Covers 2..3 by 0..1.
      { x: 2, y: 0, block: "lancer", rotation: 0 },
      // Covers 4..6 by -1..1.
      { x: 5, y: 0, block: "battery-large", rotation: 0 },
    ],
    stock: ["thorium*10@0,0"],
  }),

  /* And an arc, which is the same shape at a third of the size. The pair against
     `gen-rtg-thorium`, which is the same RTG and battery with nothing drawing on it, is
     what says the draw stops: a port that keeps a turret consuming reads a battery two
     thirds emptier. */
  "turret-arc-runup": () => ({
    tiles: [
      { x: 0, y: 0, block: "rtg-generator", rotation: 0 },
      { x: 2, y: 0, block: "arc", rotation: 0 },
      { x: 4, y: 0, block: "battery-large", rotation: 0 },
    ],
    stock: ["thorium*10@0,0"],
  }),

  /* A mender with nothing to repair, which eats silicon anyway. One every four hundred
     ticks, on the game's **global** clock, so placed at time zero the first goes on the
     first frame and five are gone by thirty seconds. */
  "mender-eats": () => ({
    tiles: [
      { x: 0, y: 0, block: "mender", rotation: 0 },
      { x: 1, y: 0, block: "power-source", rotation: 0 },
    ],
    stock: ["silicon*10@0,0"],
  }),

  /* An overdrive projector, same idea and a different clock: its counter is on the block
     rather than global, so the first item goes at four hundred and only four are gone.
     Five against four is the whole difference between the two classes, and it is the sort
     of thing that reads as a rounding error until it is put side by side. */
  "overdrive-eats": () => ({
    tiles: [
      // Covers 0..1 by 0..1.
      { x: 0, y: 0, block: "overdrive-projector", rotation: 0 },
      { x: 2, y: 0, block: "power-source", rotation: 0 },
    ],
    stock: ["phase-fabric*10@0,0"],
  }),

  /* A force projector, which accepts sixty units of coolant and drinks none of it: the
     only line that spends coolant sits inside `if (buildup > 0)`, and nothing has hit the
     shield. Its phase fabric is the opposite, one every three hundred and fifty ticks for
     ever. Both halves in one scenario. */
  "shield-idle": () => ({
    tiles: [
      // Covers 0..2 by 0..2.
      { x: 1, y: 1, block: "force-projector", rotation: 0 },
      { x: 3, y: 1, block: "power-source", rotation: 0 },
    ],
    stock: ["phase-fabric*10@1,1", "water~60@1,1"],
  }),

  /* A radar, which draws its power for ever and takes nothing else. Against the same RTG
     and battery as the turrets, so the three read side by side. */
  "radar-draws": () => ({
    tiles: [
      { x: 0, y: 0, block: "rtg-generator", rotation: 0 },
      { x: 2, y: 0, block: "radar", rotation: 0 },
      { x: 4, y: 0, block: "battery-large", rotation: 0 },
    ],
    stock: ["thorium*10@0,0"],
  }),

  /* A build tower with nothing to rebuild, which is the interesting case: it accepts
     thirty nitrogen, drinks none of it, and asks the grid for nothing. `shouldConsume` is
     "has this a plan", and a measurement has no rubble in it. The battery has to read
     exactly what the RTG made and not a unit less. */
  "build-tower-idle": () => ({
    tiles: [
      { x: 0, y: 0, block: "rtg-generator", rotation: 0 },
      // Covers 2..4 by -1..1.
      { x: 3, y: 0, block: "build-tower", rotation: 0 },
      // Covers 5..7 by -1..1.
      { x: 6, y: 0, block: "battery-large", rotation: 0 },
    ],
    stock: ["thorium*10@0,0", "nitrogen~30@3,0"],
  }),

  /* Erekir's unloader, which has a direction where Serpulo's has a ratio: it takes from
     the block behind and gives to the block in front, fifteen a second, and never mind how
     full either is. Two blocks with the same word in their name and nothing in common. */
  "duct-unloader-drains": () => ({
    tiles: [
      // Covers 0..2 by 0..2, primed with two kinds so the item rotation shows.
      { x: 1, y: 1, block: "vault", rotation: 0 },
      { x: 3, y: 1, block: "duct-unloader", rotation: 0 },
      { x: 4, y: 1, block: "duct", rotation: 0 },
      { x: 5, y: 1, block: "duct", rotation: 0 },
      // Covers 6..8 by 0..2.
      { x: 7, y: 1, block: "vault", rotation: 0 },
    ],
    stock: ["beryllium*300@1,1", "tungsten*300@1,1"],
  }),

  /* Set to one item, it takes that one and nothing else, and the other three hundred sit
     in the vault untouched. */
  "duct-unloader-sorted": () => ({
    tiles: [
      { x: 1, y: 1, block: "vault", rotation: 0 },
      { x: 3, y: 1, block: "duct-unloader", rotation: 0, raw: item("tungsten") },
      { x: 4, y: 1, block: "duct", rotation: 0 },
      { x: 5, y: 1, block: "duct", rotation: 0 },
      { x: 7, y: 1, block: "vault", rotation: 0 },
    ],
    stock: ["beryllium*300@1,1", "tungsten*300@1,1"],
  }),

  /* A reinforced bridge conduit: the same beam as a duct bridge, carrying a liquid. No
     configuration, four tiles, and the receiving end blocks the face the beam lands on. */
  "liquid-span": () => ({
    tiles: [
      { x: 0, y: 0, block: "liquid-source", rotation: 0, raw: liquid("water") },
      { x: 1, y: 0, block: "reinforced-bridge-conduit", rotation: 0 },
      { x: 5, y: 0, block: "reinforced-bridge-conduit", rotation: 0 },
      { x: 6, y: 0, block: "conduit", rotation: 0 },
      // Covers 7..9 by -1..1.
      { x: 8, y: 0, block: "liquid-tank", rotation: 0 },
    ],
  }),

  /* An armoured pipe, fed from the side by a tank and from behind by a pipe. The tank is
     refused outright, which is the whole block, and the pipe is not. */
  "conduit-armored-side": () => ({
    tiles: [
      { x: 0, y: 0, block: "plated-conduit", rotation: 0 },
      // Covers -1..1 by 1..3, so it presses on the pipe's north face.
      { x: 0, y: 2, block: "liquid-tank", rotation: 0 },
      { x: -2, y: 2, block: "liquid-source", rotation: 0, raw: liquid("water") },
      // Somewhere for the pipe to send it, so that "it never filled" cannot be blamed on
      // having nowhere to go.
      { x: 1, y: 0, block: "conduit", rotation: 0 },
      { x: 3, y: 0, block: "liquid-tank", rotation: 0 },
    ],
  }),

  /* The same pipe fed from directly behind, which it takes. The pair is the rule: what an
     armoured pipe refuses is the **side**, not the block. */
  "conduit-armored-behind": () => ({
    tiles: [
      { x: -1, y: 0, block: "liquid-source", rotation: 0, raw: liquid("water") },
      { x: 0, y: 0, block: "plated-conduit", rotation: 0 },
      { x: 1, y: 0, block: "conduit", rotation: 0 },
      { x: 3, y: 0, block: "liquid-tank", rotation: 0 },
    ],
  }),

  /* And an armoured belt, refused by a source standing beside it. Same rule, other
     carrier: what may feed it is a belt, or whatever is directly behind. */
  "conveyor-armored-side": () => [
    { x: 0, y: 0, block: "armored-conveyor", rotation: 0 },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 3, y: 0, block: "vault", rotation: 0 },
    { x: 0, y: 1, block: "item-source", rotation: 0, raw: item("copper") },
  ],

  "conveyor-armored-behind": () => [
    { x: -1, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 0, y: 0, block: "armored-conveyor", rotation: 0 },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 3, y: 0, block: "vault", rotation: 0 },
  ],

  /* A plasma bore, which is Erekir's drill and stands **beside** its ore rather than on
     it. Two tiles wide, so it reads two lines of sight and makes two beryllium a cycle.

     The pair is the measurement: the second bore has a bare wall in front of one of its
     two lines, and a wall that drops nothing still stops the scan, so it makes half as
     much. That is what makes a bore fussy to place and it is invisible to anything that
     reads "one drill, one rate". */
  "bore-two-lines": () => bore(2),
  "bore-one-line": () => bore(1),

  /* And the same bore with hydrogen, which is a booster and not an ingredient: two and a
     half times the speed, where a port that reads it as a requirement reports a working
     layout as starved. */
  "bore-boosted": () => {
    const built = bore(2);
    built.tiles.push(
      { x: -1, y: 1, block: "liquid-source", rotation: 0, raw: liquid("hydrogen") });
    return built;
  },

  /* A cliff crusher, pressed against two walls that are worth different amounts.

     Its speed is the sand attribute of the block against each tile of its face, summed and
     uncapped: two dune walls are worth four, two carbon walls 1.4. The pair is the
     measurement, and a crusher turned away from the cliff makes nothing at all. */
  "crusher-dune": () => crusher("dune-wall"),
  "crusher-carbon": () => crusher("carbon-wall"),

  /* A burst drill, which is where the ore count sits on the other side of the
     multiplication: an ordinary drill on sixteen tiles runs sixteen times as often, this
     one runs at the same pace and hands over sixteen at a time. Twelve seconds of nothing
     and then a lump, which is what backs a belt up.
     The boosted twin wants water and ozone at the same time, which is the pair this
     engine could not hold until the liquid module grew more than one slot. */
  "burst-drill": () => burst(false),
  "burst-drill-boosted": () => burst(true),

  /* A pyrolysis generator, which drinks two liquids and pours a third: slag and arkycite
     in, water out, and no items anywhere. The block that the one-liquid module made
     impossible, and the reason it was worth fixing rather than working around. */
  "gen-pyrolysis": () => [
    // Covers 0..2 by 0..2.
    { x: 1, y: 1, block: "pyrolysis-generator", rotation: 0 },
    { x: -1, y: 0, block: "liquid-source", rotation: 0, raw: liquid("slag") },
    { x: -1, y: 2, block: "liquid-source", rotation: 0, raw: liquid("arkycite") },
    { x: 3, y: 1, block: "conduit", rotation: 0 },
    // Covers 4..6 by 0..2.
    { x: 5, y: 1, block: "liquid-tank", rotation: 0 },
    // Covers 1..3 by 3..5, against the generator's top edge.
    { x: 2, y: 4, block: "battery-large", rotation: 0 },
  ],

  /* A water extractor, which squeezes water out of **dry** ground: `canPump` is
     `!floor.isLiquid`, so standing one in a lake is what stops it. Its base efficiency is
     one, so it works on any dry floor and the ground's water attribute is a bonus on top.
     Bare metal has none, so this is the plain case: 0.11 a frame, 6.6 a second. */
  "extractor-water": () => ({
    tiles: [
      // Covers 0..1 by 0..1.
      { x: 0, y: 0, block: "water-extractor", rotation: 0 },
      { x: -1, y: 0, block: "power-source", rotation: 0 },
      { x: 2, y: 0, block: "conduit", rotation: 0 },
      // Covers 3..5 by -1..1.
      { x: 4, y: 0, block: "liquid-tank", rotation: 0 },
    ],
  }),

  /* An oil extractor, whose base efficiency is **zero**: the sand under it is the whole
     output and one off the sand makes nothing at all. Nine tiles of sand at 0.7 give 0.7,
     so it pumps at seven tenths of its nameplate and no rate table says so. */
  "extractor-oil": () => extractor(true),
  "extractor-oil-bare": () => extractor(false),

  /* A payload crossing a line of payload conveyors.

     A payload is a third network: a unit carried whole, on a clock that belongs to the map
     rather than to the block. Every payload conveyor steps on the same frame, and a
     payload spends exactly `moveTime` on each one. Where the daggers have got to at thirty
     seconds is the measurement, and nothing else in the scenario moves at all. */
  "payload-line": () => [
    // Source is five wide, centred at 0: covers -2..2, and reaches three tiles east.
    { x: 0, y: 0, block: "payload-source", rotation: 0, raw: unit("dagger") },
    // Three wide, three apart, each covering the tile the one behind reaches.
    { x: 4, y: 0, block: "payload-conveyor", rotation: 0 },
    { x: 7, y: 0, block: "payload-conveyor", rotation: 0 },
    { x: 10, y: 0, block: "payload-conveyor", rotation: 0 },
    // And five wide again, covering 12..16.
    { x: 14, y: 0, block: "payload-void", rotation: 0 },
  ],

  /* A constructor, which eats items and puts out a **block** as cargo.

     The only block in the game whose ingredients and whose clock are both its
     configuration: what it eats is the build cost of what it is asked for, and the time it
     takes is that block's build time, itself derived from the cost.

     It is the **large** constructor here rather than the small one, for a reason that cost
     a measurement: the small one carries a list of seven blocks and silently refuses
     anything not on it, and all seven are Erekir's, so invisible on a Serpulo world. It
     then reports no recipe, consumes nothing, and sits at zero looking perfectly healthy.
     The large one has no list, only a range of sizes. */
  "constructor-drills": () => ({
    tiles: [
      // Covers -2..2, reaching three tiles east.
      { x: 0, y: 0, block: "large-constructor", rotation: 0, raw: blockOf("laser-drill") },
      { x: 0, y: 3, block: "power-source", rotation: 0 },
      { x: 4, y: 0, block: "payload-conveyor", rotation: 0 },
      { x: 8, y: 0, block: "payload-void", rotation: 0 },
    ],
    stock: ["copper*1000@0,0", "graphite*1000@0,0",
            "titanium*1000@0,0", "silicon*1000@0,0"],
  }),

  /* A payload router, which sends the cargo one way and then the other.

     Same clock as a conveyor, one extra rule: the way out is chosen by a rotating cursor
     rather than always forward. Two voids, one in front and one to the side, and the
     daggers have to end up split between the two branches. */
  "payload-router": () => [
    { x: 0, y: 0, block: "payload-source", rotation: 0, raw: unit("dagger") },
    { x: 4, y: 0, block: "payload-conveyor", rotation: 0 },
    // Three wide, covering 6..8 by -1..1, reaching two tiles each way.
    { x: 7, y: 0, block: "payload-router", rotation: 0 },
    { x: 10, y: 0, block: "payload-conveyor", rotation: 0 },
    { x: 14, y: 0, block: "payload-void", rotation: 0 },
    { x: 7, y: 3, block: "payload-conveyor", rotation: 1 },
    { x: 7, y: 7, block: "payload-void", rotation: 0 },
  ],

  /* An additive reconstructor turning daggers into maces, fed by a payload source and
     emptied into a void. The stock is the measurement: forty silicon and forty graphite a
     unit, six hundred frames a unit, and the ration says how many got made. */
  "reconstructor-daggers": () => ({
    tiles: [
      { x: 0, y: 0, block: "payload-source", rotation: 0, raw: unit("dagger") },
      { x: 4, y: 0, block: "payload-conveyor", rotation: 0 },
      // Three wide, covering 6..8.
      { x: 7, y: 0, block: "additive-reconstructor", rotation: 0 },
      // Against the reconstructor's top edge: it covers 6..8 by -1..1.
      { x: 7, y: 2, block: "power-source", rotation: 0 },
      { x: 10, y: 0, block: "payload-conveyor", rotation: 0 },
      { x: 14, y: 0, block: "payload-void", rotation: 0 },
    ],
    stock: ["silicon*200@7,0", "graphite*200@7,0"],
  }),

  /* Three blocks that draw power only when they have something to heal.

     `shouldConsume` is "is there a target": nothing is damaged in a schematic and no unit
     stands in one, so all three are **free**. Counted as permanent consumers they invented
     four hundred and twenty power a second between them. The battery has to read exactly
     what the RTG made, to the digit. */
  "idle-regen": () => idlePower("regen-projector"),
  "idle-repair": () => idlePower("repair-turret"),
  "idle-tower": () => idlePower("unit-repair-tower"),

  /* And a shockwave tower, which draws until it is loaded and then falls silent: eighty
     frames of run-up, and nothing at all for the twenty-eight seconds that follow. */
  "idle-shockwave": () => idlePower("shockwave-tower"),

  /* The sandbox voids. The liquid one was filed on the item side, so it refused every drop
     and the pipe in front of it backed up instead of draining, which is the exact opposite
     of what the block is for. */
  "void-liquid": () => [
    { x: 0, y: 0, block: "liquid-source", rotation: 0, raw: liquid("water") },
    { x: 1, y: 0, block: "conduit", rotation: 0 },
    { x: 2, y: 0, block: "conduit", rotation: 0 },
    { x: 3, y: 0, block: "liquid-void", rotation: 0 },
  ],

  /* The item one is measured by what it **takes from the other branch**: a router splits
     between a vault and the void, so the vault gets half. A void that refused would leave
     everything to the vault, and a scenario that feeds it on its own measures nothing at
     all, since the whole point of the block is to leave nothing behind. */
  "void-item": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "router", rotation: 0 },
    { x: 3, y: 0, block: "item-void", rotation: 0 },
    { x: 2, y: 1, block: "conveyor", rotation: 1 },
    { x: 2, y: 3, block: "vault", rotation: 0 },
  ],

  /* An incinerator, which is a sink only when it has power.

     `acceptItem` is `heat > 0.5`, and the heat climbs towards the efficiency at 0.04 a
     frame: thirteen frames of power before it accepts anything at all, and never anything
     if the grid is cut. A belt running into it backs up, which is the exact opposite of
     what a sink does. The pair says so: powered it takes its half, cold it takes nothing
     and the vault gets the lot. */
  "incinerator-hot": () => burner(true),
  "incinerator-cold": () => burner(false),

  /* A two by two press, fed from one side and emptied from two others.

     The only scenario that looks at the neighbour ring of a block of **even** size. The
     game takes the offsets from `Edges.getEdges` relative to the tile the block is stored
     at; the port went through a centre, which for an even size falls on half a tile, and
     the whole ring slid one square diagonally. The press then asked for the tile two
     squares to its right and never the one touching it: eighty blocks of the catalogue were
     holding their items out over a gap.

     Without the fix the press does not even see its coal source and produces nothing. */
  "press-even-ring": () => [
    { x: -1, y: 0, block: "item-source", rotation: 0, raw: item("coal") },
    // Covers 0..1 by 0..1.
    { x: 0, y: 0, block: "graphite-press", rotation: 0 },
    // Two outputs, on two different faces, so that the rotating cursor counts too.
    { x: 2, y: 0, block: "conveyor", rotation: 0 },
    { x: 4, y: 0, block: "vault", rotation: 0 },
    { x: 0, y: 2, block: "conveyor", rotation: 1 },
    { x: 0, y: 4, block: "vault", rotation: 0 },
  ],

  /* An unloader against a press, and an unloader between two vaults.

     The block's two rules, each easy to get backwards. It pulls from **any** block whose
     `unloadable` is true, which covers almost everything and includes a factory and a
     drill: against a graphite press it really does pull the graphite out. And it **never**
     puts anything into a vault or a core, whatever the numbers.

     Read as "out of a container, towards whatever is less full", the first layout moved
     nothing where the game moves eleven a second, and the second moved eleven a second
     where the game moves none. */
  "unloader-from-press": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("coal") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    // Covers 2..3 by 0..1.
    { x: 2, y: 0, block: "graphite-press", rotation: 0 },
    { x: 4, y: 0, block: "unloader", rotation: 0, raw: item("graphite") },
    { x: 5, y: 0, block: "titanium-conveyor", rotation: 0 },
    { x: 6, y: 0, block: "titanium-conveyor", rotation: 0 },
    { x: 8, y: 0, block: "vault", rotation: 0 },
  ],

  "unloader-between-vaults": () => ({
    tiles: [
      // Covers 0..2 by -1..1.
      { x: 1, y: 0, block: "vault", rotation: 0 },
      { x: 3, y: 0, block: "unloader", rotation: 0, raw: item("copper") },
      // Covers 4..6 by -1..1.
      { x: 5, y: 0, block: "vault", rotation: 0 },
    ],
    stock: ["copper*1000@1,0"],
  }),

  /* Power does not travel through a consumer.

     The game refuses to join two neighbours when both consume, neither produces and neither
     is conductive. Here the first radar touches the generator and the second touches only
     the first: the game leaves it alone on a grid with no producer, so the generator feeds
     one radar and the battery takes the rest. Joined unconditionally, the two radars ask
     for seventy-two where sixty arrives, and the battery never rises. */
  "power-not-conductive": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("coal") },
    { x: 1, y: 0, block: "combustion-generator", rotation: 0 },
    { x: 1, y: -1, block: "battery", rotation: 0 },
    { x: 2, y: 0, block: "radar", rotation: 0 },
    { x: 3, y: 0, block: "radar", rotation: 0 },
  ],

  /* And a machine with nothing to eat asks for nothing at all.

     `shouldConsumePower` falls as soon as any consumer other than the power one is not
     satisfied, and a block that does not consume asks for **zero** rather than asking and
     going without. A kiln with neither lead nor sand still claimed its thirty-six a second:
     the battery rises half as fast. */
  "power-starved-asks-nothing": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("coal") },
    { x: 1, y: 0, block: "combustion-generator", rotation: 0 },
    { x: 1, y: -1, block: "battery", rotation: 0 },
    // Covers 2..3 by 0..1, against the generator and with nothing to feed it.
    { x: 2, y: 0, block: "kiln", rotation: 0 },
  ],

  /* A laser drill with water on it, and the same one dry.

     `speed = lerp(1, liquidBoostIntensity, optionalEfficiency) * efficiency`: water is
     worth sixty per cent more. The factor was in the catalogue and the quantity was not, so
     neither the code nor the data knew how much was needed: the drill accepted the water,
     filled up, never drank it and got nothing out of it. A pipe run to a farm of drills
     changed no figure in the report. */
  "drill-wet": () => wetDrill(true),
  "drill-dry": () => wetDrill(false),

  /* And an impact drill on beryllium, which it pulls out twice as fast.

     `drillMultipliers.put(Items.beryllium, 2f)` on both impact drills, and the field was
     dumped only for the beam drill. Erekir's most produced ore was reported at exactly half
     its rate. */
  "burst-drill-beryllium": () => ({
    tiles: [
      // Covers 1..4 by 1..4.
      { x: 2, y: 2, block: "impact-drill", rotation: 0 },
      { x: 0, y: 2, block: "power-source", rotation: 0 },
      { x: 0, y: 3, block: "liquid-source", rotation: 0, raw: liquid("water") },
      { x: 5, y: 2, block: "duct", rotation: 0 },
      { x: 6, y: 2, block: "duct", rotation: 0 },
      { x: 8, y: 2, block: "vault", rotation: 0 },
    ],
    ground: [1, 2, 3, 4].flatMap((x) =>
      [1, 2, 3, 4].map((y) => `ore-beryllium@${x},${y}`)),
  }),

  /* A rotary pump on water, powered and unpowered.

     `edelta()`, where the port read `delta()`: an unpowered pump pumped forty-eight a
     second here and nothing at all in the game. A pump is a consumer like any other and
     reads the same efficiency a kiln does. */
  "pump-powered": () => rotary(true),
  "pump-unpowered": () => rotary(false),

  /* A sorter that has to alternate between its two sides.

     When the item does not match and **both** sides take it, the game alternates, with one
     bit per incoming direction. The port took the first side that accepted, so everything
     left by the same side and the layout read as though it worked. */
  "sorter-both-sides": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    // Set to lead, so the copper does not match and leaves by the sides.
    { x: 2, y: 0, block: "sorter", rotation: 0, raw: item("lead") },
    { x: 2, y: 1, block: "conveyor", rotation: 1 },
    { x: 2, y: 3, block: "vault", rotation: 0 },
    { x: 2, y: -1, block: "conveyor", rotation: 3 },
    { x: 2, y: -3, block: "vault", rotation: 0 },
  ],

  /* A conduit pointed at nothing leaks.

     `moveLiquidForward(leaks, ...)` pours two thirds of what it holds onto the ground every
     frame, so it never fills up. The flag was in the catalogue and read nowhere: an open
     pipe blocked the line here and drains continuously in the game, which inverts
     everything upstream. The plated pipe is the only one that does not leak, and the only
     case the port had right. */
  "conduit-leaks": () => [
    { x: 0, y: 0, block: "liquid-source", rotation: 0, raw: liquid("water") },
    { x: 1, y: 0, block: "conduit", rotation: 0 },
    { x: 2, y: 0, block: "conduit", rotation: 0 },
    // And nothing in front: the tile (3,0) is bare floor.
  ],

  "conduit-plated-holds": () => [
    { x: 0, y: 0, block: "liquid-source", rotation: 0, raw: liquid("water") },
    { x: 1, y: 0, block: "plated-conduit", rotation: 0 },
    { x: 2, y: 0, block: "plated-conduit", rotation: 0 },
  ],

  /* An electrolyzer with only one of its two gases tapped.

     That is the ordinary layout, and this is the only block in the game with two output
     liquids. Its hydrogen fills up in eight seconds; after that the game keeps putting out
     ozone for ever and the port fell to zero, blocking everything downstream. And each gas
     leaves by its own face: the ozone by relative face 1, the hydrogen by face 3. */
  "electrolyzer-one-tap": () => [
    // Covers 0..2 by 0..2, facing east.
    { x: 1, y: 1, block: "electrolyzer", rotation: 0 },
    { x: -1, y: 1, block: "power-source", rotation: 0 },
    { x: -1, y: 0, block: "liquid-source", rotation: 0, raw: liquid("water") },
    // Relative face 1 (north when the rotation is zero): the ozone.
    { x: 1, y: 3, block: "conduit", rotation: 1 },
    { x: 1, y: 5, block: "liquid-tank", rotation: 0 },
  ],

  /* A pair of mass drivers, which is the one carrier that does not hand items on: it
     shoots them. Filed under `sink` for want of a branch of its own, the pair carried
     nothing at all and the belt feeding it jammed on the first frame.

     The router is the whole point of the shape. `acceptItem` is
     `items.total() < itemCapacity && linkValid()`, so a driver that is not set to anything
     refuses everything and the router sends the lot into the near vault instead. Measured
     without it, both engines delivered nothing and agreed perfectly about a block neither
     of them had modelled. */
  "mass-driver-pair": () => [
    { x: -1, y: 2, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 0, y: 2, block: "conveyor", rotation: 0 },
    { x: 1, y: 2, block: "router", rotation: 0 },
    { x: 2, y: 2, block: "conveyor", rotation: 0 },
    // Covers 3..5 by 1..3, set to the driver ten tiles east.
    { x: 4, y: 2, block: "mass-driver", rotation: 0, raw: point(10, 0) },
    { x: 4, y: 4, block: "power-source", rotation: 0 },
    // What the router could not push down the barrel, at 0..2 by 3..5.
    { x: 1, y: 4, block: "vault", rotation: 0 },
    // Covers 13..15 by 1..3, unset: a receiver needs no link of its own.
    { x: 14, y: 2, block: "mass-driver", rotation: 0 },
    { x: 14, y: 4, block: "power-source", rotation: 0 },
    { x: 17, y: 2, block: "vault", rotation: 0 },
  ],

  /* And the same pair with the far end never set, which is the mistake a player makes:
     nothing goes down the barrel and everything piles into the near vault. */
  "mass-driver-unset": () => SCENARIOS["mass-driver-pair"]().map((tile) =>
    (tile.block === "mass-driver" ? { ...tile, raw: undefined } : tile)),

  /* A belt pushing onto the far end of a bridge chain, which the game refuses outright.
     `checkAccept` is the whole of what makes a bridge a bridge: without a link it takes
     nothing except from a bridge pointed at it, and with one it refuses whatever comes back
     through its own exit. Reading only the capacity, the terminal bridge swallowed what the
     belt pushed onto it and spread it round with `dump`. The router is what turns that into
     a number: refused, the lead all piles into its own vault. */
  "bridge-terminal-fed": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "bridge-conveyor", rotation: 0,
      raw: point(3, 0) },
    { x: 5, y: 0, block: "bridge-conveyor", rotation: 0 },
    { x: 6, y: 0, block: "conveyor", rotation: 0 },
    // Covers 7..9 by -1..1.
    { x: 8, y: 0, block: "vault", rotation: 0 },

    { x: 5, y: 4, block: "item-source", rotation: 0, raw: item("lead") },
    { x: 5, y: 3, block: "conveyor", rotation: 3 },
    { x: 5, y: 2, block: "conveyor", rotation: 3 },
    { x: 5, y: 1, block: "router", rotation: 0 },
    // Covers 2..4 by 1..3, against the router's west side.
    { x: 3, y: 2, block: "vault", rotation: 0 },
  ],

  /* And the same rule on the liquid side: a bridge conduit standing beside a tank, set to
     nothing. Nothing enters it in the game, so the far tank stays dry for thirty seconds.
     Accepting on capacity alone, the port drained the near tank into the far one. */
  "liquid-bridge-idle": () => [
    { x: 0, y: 0, block: "liquid-source", rotation: 0, raw: liquid("water") },
    { x: 1, y: 0, block: "conduit", rotation: 0 },
    // Covers 2..4 by -1..1.
    { x: 3, y: 0, block: "liquid-tank", rotation: 0 },
    { x: 5, y: 0, block: "bridge-conduit", rotation: 0 },
    { x: 6, y: 0, block: "conduit", rotation: 0 },
    // Covers 7..9 by -1..1.
    { x: 8, y: 0, block: "liquid-tank", rotation: 0 },
  ],

  /* A thorium reactor fed slower than it burns: one tile of ore under a laser drill makes
     a thorium about every eight seconds and the reactor wants one every six.

     Which is the shape that reads `timer(timerFuel, itemDuration)`. An `Interval` compares
     the map clock against the date it last fired and accumulates nothing, so a reactor that
     stood empty burns the next thorium the frame it arrives. Counted as a stopwatch that
     only runs while there is fuel, the port never reached three hundred and sixty and piled
     the thorium up instead. */
  "reactor-drip": () => ({
    tiles: [
      // Covers 0..2 by 0..2, on a single tile of ore.
      { x: 1, y: 1, block: "laser-drill", rotation: 0 },
      /* Two combustion generators rather than a power source: a source is a `PowerNode`, it
         links itself to anything within reach at the moment it is placed, the battery
         included, and the scenario then measured the source's own power. */
      { x: 0, y: 3, block: "combustion-generator", rotation: 0 },
      { x: 0, y: 4, block: "item-source", rotation: 0, raw: item("coal") },
      { x: 1, y: 3, block: "combustion-generator", rotation: 0 },
      { x: 1, y: 4, block: "item-source", rotation: 0, raw: item("coal") },

      { x: 3, y: 1, block: "conveyor", rotation: 0 },
      // Covers 4..6 by 0..2.
      { x: 5, y: 1, block: "thorium-reactor", rotation: 0 },
      // Cooled, or the scenario measures an explosion rather than a counter.
      { x: 5, y: 3, block: "liquid-source", rotation: 0, raw: liquid("cryofluid") },
      // On the reactor's grid and on that alone: what it took is the measurement.
      { x: 7, y: 1, block: "battery", rotation: 0 },
    ],
    ground: ["ore-thorium@1,1"],
  }),

  /* A neoplasia reactor with nowhere to put its neoplasm. `explodeOnFull` was in the
     catalogue and read by nothing: it fills its eighty in four seconds and calls `kill()`,
     taking the grid with it. Left running, the port reported seven and a half times the
     energy and declared a schematic that forgot its neoplasm pipe perfectly sound. */
  "reactor-neoplasia-full": () => ({
    tiles: [
      // Covers 0..4 by 0..4.
      { x: 2, y: 2, block: "neoplasia-reactor", rotation: 0 },
      { x: -1, y: 0, block: "item-source", rotation: 0, raw: item("phase-fabric") },
      { x: -1, y: 1, block: "liquid-source", rotation: 0, raw: liquid("arkycite") },
    ],
    /* Its water as a stock rather than one more source. What the scenario checks is the
       reactor itself: it is gone, and nothing is left inside it. Its blast is measured by
       its twin just below. */
    stock: ["water~80@2,2"],
  }),

  /* A node placed with no recorded link links itself.
     `placed()` calls `getPotentialLinks` as soon as `power.links` is empty, so a power
     source dropped next to nothing feeds the drill four tiles away. The port read only the
     recorded links, so the drill stayed alone on its grid at coverage zero and produced
     nothing at all. That is the case of a schematic whose links were not copied, and it is
     also what had skewed `reactor-drip`. */
  "power-node-autolinks": () => ({
    tiles: [
      { x: 0, y: 0, block: "power-source", rotation: 0 },
      // Covers 3..5 by 0..2, without touching the source.
      { x: 4, y: 1, block: "laser-drill", rotation: 0 },
      { x: 6, y: 1, block: "conveyor", rotation: 0 },
      // Covers 7..9 by 0..2.
      { x: 8, y: 1, block: "vault", rotation: 0 },
    ],
    ground: [3, 4, 5].flatMap((x) => [0, 1, 2].map((y) => `ore-copper@${x},${y}`)),
  }),

  /* A beam link, which is a `LongPowerNode`: five hundred tiles of range, **one** link
     only, no auto-linking, and `sameBlockConnection`, so it joins another beam link and
     nothing else.

     Written first with a single beam link aimed at the drill, it gave thirty-nine copper in
     the port and zero in the game: a link recorded in a schematic is not a link, the game
     revalidates it when the block is placed. */
  "beam-link-span": () => ({
    tiles: [
      { x: 5, y: 2, block: "item-source", rotation: 0, raw: item("coal") },
      { x: 4, y: 2, block: "combustion-generator", rotation: 0 },
      // Covers 1..3 by 1..3, against the generator, linked to the beam link opposite.
      { x: 2, y: 2, block: "beam-link", rotation: 0, raw: links([[10, 0]]) },
      // Covers 11..13 by 1..3.
      { x: 12, y: 2, block: "beam-link", rotation: 0 },
      // Covers 14..16 by 1..3.
      { x: 15, y: 2, block: "laser-drill", rotation: 0 },
      { x: 17, y: 2, block: "conveyor", rotation: 0 },
      // Covers 18..20 by 1..3.
      { x: 19, y: 2, block: "vault", rotation: 0 },
    ],
    ground: [14, 15, 16].flatMap((x) => [1, 2, 3].map((y) => `ore-copper@${x},${y}`)),
  }),

  /* A diode, the only block that moves charge between two grids without being on either of
     them. Behind it a grid that produces, in front of it a battery on its own. It sends
     half the difference in fill on every frame, so the two end at the same level. Filed as
     a `sink`, the battery in front stayed flat. */
  "diode-levels": () => [
    { x: 0, y: 1, block: "item-source", rotation: 0, raw: item("coal") },
    { x: 0, y: 0, block: "combustion-generator", rotation: 0 },
    { x: 1, y: 0, block: "battery", rotation: 0 },
    { x: 2, y: 0, block: "diode", rotation: 0 },
    { x: 3, y: 0, block: "battery", rotation: 0 },
  ],

  /* A shielded wall draws three a second for ever, whether or not anything is shooting at
     it: nothing in `updateTile` gates its consumption. Eight of them around a battery eat
     half of what a combustion generator makes, and what is left is what the battery
     took. */
  "shielded-wall-drains": () => [
    { x: -2, y: 1, block: "item-source", rotation: 0, raw: item("coal") },
    { x: -1, y: 1, block: "combustion-generator", rotation: 0 },
    // Covers 0..2 by 0..2.
    { x: 1, y: 1, block: "battery-large", rotation: 0 },
    // Two by two each, so six fit around a three by three battery.
    { x: 3, y: 0, block: "shielded-wall", rotation: 0 },
    { x: 3, y: 2, block: "shielded-wall", rotation: 0 },
    { x: 0, y: 3, block: "shielded-wall", rotation: 0 },
    { x: 0, y: -2, block: "shielded-wall", rotation: 0 },
    { x: 2, y: -2, block: "shielded-wall", rotation: 0 },
    { x: -2, y: 2, block: "shielded-wall", rotation: 0 },
  ],

  /* A two by two press whose corner touches an armoured duct.

     An armoured duct takes only from behind, and behind is measured against the **edge
     tile** the game clamps into the neighbour's footprint, not against its storage tile.
     For a block of even size the two do not say the same thing: the press is east of the
     duct and the storage tile makes it look as though it were south, so the port accepted
     what the game refuses and emptied the whole press into a line that carries none of
     it.

     The press covers 2..3 by 2..3 and has no other outlet. */
  "press-corner-armored": () => [
    { x: 4, y: 2, block: "item-source", rotation: 0, raw: item("coal") },
    { x: 2, y: 2, block: "graphite-press", rotation: 0 },
    { x: 1, y: 3, block: "armored-duct", rotation: 1 },
    { x: 1, y: 4, block: "duct", rotation: 1 },
    { x: 1, y: 5, block: "duct", rotation: 1 },
    // Covers 0..2 by 6..8.
    { x: 1, y: 7, block: "vault", rotation: 0 },
  ],

  /* A bridge configured onto a tile where somebody has since placed something else.

     The game revalidates the link on every frame: the tile opposite has to carry **the same
     block**. Otherwise the bridge is no longer a bridge, it dumps around itself. The port
     teleported all the same, four tiles on, and the backup upstream never appeared. The
     vault above is what the game fills, the one at the end is what the port filled. */
  "bridge-onto-wrong-block": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    // The first bridge aims at the second, which aims at a tile with no bridge on it. Both
    // are needed: a bridge with no valid link accepts nothing from a belt, so only another
    // bridge can give it something to dump.
    { x: 2, y: 0, block: "bridge-conveyor", rotation: 0, raw: point(3, 0) },
    { x: 5, y: 0, block: "bridge-conveyor", rotation: 0, raw: point(3, 0) },
    // Covers 4..6 by 1..3: what the second one spreads around itself.
    { x: 5, y: 2, block: "vault", rotation: 0 },
    // The tile aimed at, which carries an ordinary conveyor rather than a bridge.
    { x: 8, y: 0, block: "conveyor", rotation: 0 },
    { x: 9, y: 0, block: "conveyor", rotation: 0 },
    // Covers 10..12 by -1..1.
    { x: 11, y: 0, block: "vault", rotation: 0 },
  ],

  /* A phase conveyor fed two items at once, with an outlet narrower than its inlets, so it
     saturates and has to choose.

     `items.take()` is a cursor that turns over item **ids** and advances on every pass, so
     the two alternate strictly. The port read the first key of a Map, that is, whichever
     type arrived first, and it won for ever. The sorter at the end separates the two: it is
     the two vaults that say so, not their total, which is the same either way. */
  "phase-conveyor-two-items": () => [
    { x: 0, y: 1, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 1, block: "conveyor", rotation: 0 },
    { x: 2, y: -1, block: "item-source", rotation: 0, raw: item("coal") },
    { x: 2, y: 0, block: "conveyor", rotation: 1 },
    { x: 2, y: 1, block: "phase-conveyor", rotation: 0, raw: point(4, 0) },
    { x: 4, y: 3, block: "power-source", rotation: 0 },
    { x: 6, y: 1, block: "phase-conveyor", rotation: 0 },
    { x: 7, y: 1, block: "conveyor", rotation: 0 },
    { x: 8, y: 1, block: "sorter", rotation: 0, raw: item("copper") },
    { x: 9, y: 1, block: "conveyor", rotation: 0 },
    // Covers 10..12 by 0..2: what the sorter lets through straight on.
    { x: 11, y: 1, block: "vault", rotation: 0 },
    // Covers 7..9 by 2..4: what it pushes out the side.
    { x: 8, y: 3, block: "vault", rotation: 0 },
  ],

  /* A launch pad, which is not a sink: it fills to a hundred, and at twenty seconds the lot
     goes at once. The two conditions are separate, so a pad fed slowly launches as soon as
     it is full and a pad fed fast waits for its clock. The vault below is there only to
     show that it gives nothing back: what goes up is lost to the schematic. */
  "launch-pad-eats": () => [
    { x: -1, y: 1, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 0, y: 1, block: "conveyor", rotation: 0 },
    // Covers 1..3 by 0..2.
    { x: 2, y: 1, block: "launch-pad", rotation: 0 },
    { x: 2, y: 4, block: "power-source", rotation: 0 },
  ],

  /* The same one, advanced: it takes **one kind at a time only**, so a belt carrying two
     items jams it as soon as the second arrives. It covers 1..4 by 0..3. */
  "launch-pad-one-kind": () => [
    { x: -2, y: 1, block: "item-source", rotation: 0, raw: item("copper") },
    // Against the router, not diagonal to it: written diagonally, the lead reached nothing
    // and the scenario measured a pad fed one kind by accident.
    { x: -1, y: 2, block: "item-source", rotation: 0, raw: item("lead") },
    { x: -1, y: 1, block: "router", rotation: 0 },
    { x: 0, y: 1, block: "conveyor", rotation: 0 },
    // Four by four: covers 1..4 by 1..4.
    { x: 2, y: 2, block: "advanced-launch-pad", rotation: 0 },
    { x: 2, y: 5, block: "power-source", rotation: 0 },
  ],

  /* A power void, which asks not for a lot but for everything: `Float.MAX_VALUE`. Its whole
     grid falls to zero and the drill beside it produces nothing, although it has a
     generator to itself. The battery stays empty. */
  "power-void-drains": () => ({
    tiles: [
      { x: 0, y: 4, block: "item-source", rotation: 0, raw: item("coal") },
      { x: 0, y: 3, block: "combustion-generator", rotation: 0 },
      { x: 1, y: 3, block: "power-void", rotation: 0 },
      { x: 0, y: 2, block: "battery", rotation: 0 },
      // Covers 0..2 by -1..1, against the battery.
      { x: 1, y: 0, block: "laser-drill", rotation: 0 },
      { x: 4, y: 0, block: "conveyor", rotation: 0 },
      // Covers 6..8 by -1..1.
      { x: 7, y: 0, block: "vault", rotation: 0 },
    ],
    ground: [0, 1, 2].flatMap((x) => [-1, 0, 1].map((y) => `ore-copper@${x},${y}`)),
  }),

  /* A slag incinerator, which is not Serpulo's incinerator: this one takes nothing until it
     has slag, and swallows whatever it is given as soon as it does. The pair is the
     measurement: the same layout without the slag source. */
  "incinerator-slag": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "slag-incinerator", rotation: 0 },
    { x: 2, y: 1, block: "liquid-source", rotation: 0, raw: liquid("slag") },
  ],

  "incinerator-dry": () => SCENARIOS["incinerator-slag"]().filter(
    (tile) => tile.block !== "liquid-source"),

  /* A continuous turret with its nitrogen and nothing to aim at. It keeps its twenty units
     for the whole thirty seconds and drinks not one: a turret's liquid is a stock and not a
     rate, and a port that reads it as consumption invents a supply line. Covers 0..3 by
     0..3. */
  "turret-lustre-idle": () => ({
    tiles: [
      { x: 1, y: 1, block: "lustre", rotation: 0 },
      { x: 4, y: 1, block: "power-source", rotation: 0 },
    ],
    stock: ["nitrogen~20@1,1"],
  }),

  /* And the continuous liquid turret, whose ammunition **is** a liquid. Covers 0..2 by
     0..2. */
  "turret-sublimate-idle": () => ({
    tiles: [{ x: 1, y: 1, block: "sublimate", rotation: 0 }],
    stock: ["ozone~50@1,1"],
  }),

  /* The interplanetary accelerator, which swallows eight thousand copper and never does
     anything with it outside a campaign. What the scenario checks is that it does not jam
     the belt: a sink with twenty-five thousand slots does not fill in thirty seconds.
     Covers -2..3 by -2..3. */
  "accelerator-swallows": () => [
    { x: -6, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: -5, y: 0, block: "conveyor", rotation: 0 },
    { x: -4, y: 0, block: "conveyor", rotation: 0 },
    // Seven by seven: covers -3..3 by -3..3.
    { x: 0, y: 0, block: "interplanetary-accelerator", rotation: 0 },
    { x: 0, y: 5, block: "power-source", rotation: 0 },
  ],

  /* The blocks whose answer is "nothing", each with the shape that shows it. */
  "refuses-switch": () => refuses("switch"),
  "refuses-door": () => refuses("door"),
  "refuses-blast-door": () => refuses("blast-door"),
  /* Neither the canvas wall nor the large canvas: the game refuses to place them from a
     schematic, so they cannot appear in one and there is nothing to measure. */
  "refuses-canvas": () => refuses("canvas"),
  "refuses-large-canvas": () => refuses("large-canvas"),
  /* A processor consumes nothing at all: no power, no item, no liquid. What it does goes
     through an instruction on a block it is linked to, and that is not simulated here. What
     the bench can say, and it is true, is that it takes nothing and gives nothing back. */
  "refuses-micro-processor": () => refuses("micro-processor"),
  "refuses-hyper-processor": () => refuses("hyper-processor"),
  "refuses-thruster": () => refuses("thruster"),
  "refuses-logic-display": () => refuses("logic-display"),
  "refuses-tile-logic-display": () => refuses("tile-logic-display"),
  "refuses-landing-pad": () => refuses("landing-pad"),

  /* A landing pad, which has nothing to do outside a campaign, with water beside it that it
     does not drink. Four by four: covers 0..3 by 0..3. */
  "landing-pad-idle": () => ({
    tiles: [
      { x: 1, y: 1, block: "landing-pad", rotation: 0 },
      { x: -1, y: 1, block: "liquid-source", rotation: 0, raw: liquid("water") },
      { x: -1, y: 0, block: "conduit", rotation: 0 },
    ],
    stock: ["water~100@1,1"],
  }),

  /* The whole chain of the payload family: a source makes a container, a loader fills it
     with copper, an unloader empties it into a vault, and the empty container goes off to
     the void.

     It is the bench's first shape where a payload is something other than a name: a
     `BuildPayload` is a whole building and it carries its own stock. What the loader holds
     **inside** is compared, not only what it holds. */
  "payload-loader-line": () => [
    // Five by five: covers -2..2 by -2..2, and reaches three tiles east.
    { x: 0, y: 0, block: "payload-source", rotation: 0, raw: blockOf("container") },
    // Three by three: covers 3..5 by -1..1.
    { x: 4, y: 0, block: "payload-loader", rotation: 0 },
    // Three sources against its north face: a belt would never fill three hundred.
    { x: 3, y: 2, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 4, y: 2, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 5, y: 2, block: "item-source", rotation: 0, raw: item("copper") },
    // Covers 6..8 by -1..1.
    { x: 7, y: 0, block: "payload-unloader", rotation: 0 },
    { x: 7, y: 2, block: "power-source", rotation: 0 },
    // Covers 6..8 by -4..-2: what the unloader empties into.
    { x: 7, y: -3, block: "vault", rotation: 0 },
    // Covers 9..13 by -2..2: the empty container goes off in there.
    { x: 11, y: 0, block: "payload-void", rotation: 0 },
  ],

  /* And a deconstructor, which gives a block back as its own build cost. A router costs
     three copper and builds in six frames, so it leaves as fast as it arrives, and what
     comes out ends in the vault. */
  "payload-deconstructor-breaks": () => [
    { x: 0, y: 0, block: "payload-source", rotation: 0, raw: blockOf("router") },
    // Five by five: covers 3..7 by -2..2.
    { x: 5, y: 0, block: "deconstructor", rotation: 0 },
    { x: 5, y: 3, block: "power-source", rotation: 0 },
    { x: 8, y: 0, block: "conveyor", rotation: 0 },
    // Covers 9..11 by -1..1.
    { x: 10, y: 0, block: "vault", rotation: 0 },
  ],

  /* A pair of payload mass drivers. The same agreement at both ends as the item pair, with
     one more barrier: the cargo has to have slid to the end of the barrel before anything
     can be fired, and the shot needs ninety frames of charge on top of the hundred and
     thirty of reload. Where the containers have got to at thirty seconds is the
     measurement. */
  "payload-driver-pair": () => [
    // Five by five: covers -2..2 by -2..2, reaches three tiles east.
    { x: 0, y: 0, block: "payload-source", rotation: 0, raw: blockOf("container") },
    // Three by three: covers 3..5 by -1..1, aimed ten tiles away.
    { x: 4, y: 0, block: "payload-mass-driver", rotation: 0, raw: point(10, 0) },
    { x: 4, y: 3, block: "power-source", rotation: 0 },
    // Covers 13..15 by -1..1.
    { x: 14, y: 0, block: "payload-mass-driver", rotation: 0 },
    { x: 14, y: 3, block: "power-source", rotation: 0 },
    // Covers 16..20 by -2..2: what the second one pushes out.
    { x: 18, y: 0, block: "payload-void", rotation: 0 },
  ],

  /* An assembler on half its power. It builds its four drones one at a time, and each costs
     four seconds divided by the fraction of power it gets: with a single combustion
     generator against a hundred and fifty a second, three come out in thirty seconds and
     not four. The drones are units on the map, so the bench counts them like any other.

     And it drinks nothing: `shouldConsume` wants its whole plan present, and it has neither
     stell nor any wall. Its ninety cyanogen are untouched at the end. Five by five: covers
     3..7 by -2..2. */
  "assembler-half-fed": () => ({
    tiles: [
      { x: 5, y: 0, block: "tank-assembler", rotation: 0 },
      { x: 5, y: 3, block: "combustion-generator", rotation: 0 },
      { x: 5, y: 4, block: "item-source", rotation: 0, raw: item("coal") },
    ],
    stock: ["cyanogen~90@5,0"],
  }),

  /* An unload point nobody has configured, which is this block's famous mistake: no unit
     ever goes to it and the loader fills up to its two hundred.

     Its twin, the same thing with the point set to copper, is **not** here. The rate of an
     air freight run is not reproducible from a schematic: `AIController` draws
     `Mathf.random(40)` at the moment the unit is born, and that draw shifts its first
     loading by a number of frames nothing in the schematic decides. The port flies the
     unit, loads it and unloads it; the exact timing of the first trip would depend on a
     draw shared with everything that happened on the map before. */
  "cargo-unset": () => [
    { x: -1, y: 1, block: "item-source", rotation: 0, raw: item("copper") },
    // Covers 0..2 by 0..2.
    { x: 1, y: 1, block: "unit-cargo-loader", rotation: 0 },
    { x: 1, y: 3, block: "liquid-source", rotation: 0, raw: liquid("nitrogen") },
    { x: 1, y: -1, block: "power-source", rotation: 0 },
    // Covers 8..9 by 0..1, set to nothing.
    { x: 8, y: 0, block: "unit-cargo-unload-point", rotation: 0 },
    // Covers 10..12 by -1..1.
    { x: 11, y: 0, block: "vault", rotation: 0 },
  ],

  /* A thorium reactor with no cooling, and enough around it to measure the blast.

     Thirty thorium are worth six of explosiveness, plus the block's own five, times three
     and a half: thirty-eight, in three waves of nineteen. A conveyor has forty-five health
     and falls; a vault has four hundred and ninety-five and holds. What is left standing is
     the measurement, and without it a schematic that destroys itself read as a schematic
     that works: the counters of a dead block are zero on both sides.

     The reactor covers 1..3 by 1..3. */
  "reactor-blast": () => ({
    tiles: [
      { x: 2, y: 2, block: "thorium-reactor", rotation: 0 },
      /* A junction has thirty health, a router forty, a conveyor forty-five. The blast
         separates them: that is the measurement. */
      { x: 4, y: 2, block: "junction", rotation: 0 },
      { x: 2, y: 4, block: "router", rotation: 0 },
      { x: 0, y: 4, block: "conveyor", rotation: 0 },
      { x: 7, y: 2, block: "junction", rotation: 0 },
      // Covers 1..3 by -4..-2: solid enough to hold.
      { x: 2, y: -3, block: "vault", rotation: 0 },
    ],
    stock: ["thorium*30@2,2"],
  }),

  /* The same one, with enough around it to measure the blast: a water source pressed
     against it.

     A neoplasia reactor that kills itself takes whatever touches it with it, and it is the
     one thing in this whole repository that cannot be read from a counter: the counters of
     a dead block are zero on both sides, which reads as agreement. What is left standing is
     the measurement. */
  "reactor-neoplasia-blast": () => [
    // Covers 0..4 by 0..4.
    { x: 2, y: 2, block: "neoplasia-reactor", rotation: 0 },
    { x: -1, y: 0, block: "item-source", rotation: 0, raw: item("phase-fabric") },
    { x: -1, y: 1, block: "liquid-source", rotation: 0, raw: liquid("arkycite") },
    { x: -1, y: 3, block: "liquid-source", rotation: 0, raw: liquid("water") },
    // Conveyors around it, which have only forty-five health: which of them fall and which
    // hold is what the blast says.
    { x: 2, y: 5, block: "conveyor", rotation: 0 },
    { x: 5, y: 2, block: "conveyor", rotation: 0 },
    { x: 2, y: 7, block: "conveyor", rotation: 0 },
    { x: 8, y: 2, block: "conveyor", rotation: 0 },
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

/** A combustion generator fed forever, with a battery to catch what it makes. */
function burning(fuel) {
  return [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item(fuel) },
    { x: 1, y: 0, block: "combustion-generator", rotation: 0 },
    { x: 2, y: 0, block: "battery", rotation: 0 },
  ];
}

/**
 * The same, on a fixed ration and no source at all.
 *
 * A large battery rather than a small one wherever the small one would fill: a saturated
 * battery reads 1.000 whatever it was given, so a scenario that saturates measures nothing
 * about the generator feeding it.
 */
function rationed(fuel, block = "combustion-generator") {
  const size = sizeOf(block);
  const big = block !== "combustion-generator";
  return {
    tiles: [
      { x: 0, y: 0, block, rotation: 0 },
      { x: size + (big ? 1 : 0), y: 0, block: big ? "battery-large" : "battery", rotation: 0 },
    ],
    stock: [`${fuel}*10@0,0`],
  };
}

/** A surge router, with the grid behind it or without. */
function stackRouter(powered) {
  const tiles = [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("beryllium") },
    { x: 1, y: 0, block: "duct", rotation: 0 },
    { x: 2, y: 0, block: "surge-router", rotation: 0 },
    { x: 4, y: 0, block: "vault", rotation: 0 },
  ];
  if (powered) tiles.push({ x: 2, y: 1, block: "power-source", rotation: 0 });
  return tiles;
}

/**
 * An armoured duct fed one of three ways.
 *
 * The feed is always a source of beryllium; what changes is what stands between it and the
 * armoured duct, and on which side.
 */
function armoured(how) {
  const tiles = [
    { x: 0, y: 0, block: "armored-duct", rotation: 0 },
    { x: 1, y: 0, block: "duct", rotation: 0 },
    { x: 3, y: 0, block: "vault", rotation: 0 },
  ];
  if (how === "side") {
    // A source is not a duct, so from the side it is refused outright.
    tiles.push({ x: 0, y: 1, block: "item-source", rotation: 0, raw: item("beryllium") });
  } else if (how === "duct") {
    // A duct is family, and this one points straight at it.
    tiles.push({ x: 0, y: 2, block: "item-source", rotation: 0, raw: item("beryllium") });
    tiles.push({ x: 0, y: 1, block: "duct", rotation: 3 });
  } else {
    tiles.push({ x: -1, y: 0, block: "item-source", rotation: 0, raw: item("beryllium") });
  }
  return tiles;
}

/**
 * A plasma bore pointed at a wall of ore, with `lines` of its two lines of sight ore.
 *
 * The bore covers 0..1 by 0..1 facing east, so it looks at (2, 0) and (2, 1). Whichever of
 * those is meant to be barren gets a plain wall: it still stops the scan and it still
 * yields nothing, which is the whole point.
 */
function bore(lines) {
  return {
    tiles: [
      { x: 0, y: 0, block: "plasma-bore", rotation: 0 },
      { x: -1, y: 0, block: "power-source", rotation: 0 },
      { x: 0, y: -1, block: "duct", rotation: 3 },
      { x: 0, y: -3, block: "vault", rotation: 0 },
    ],
    ground: [
      "beryllic-stone-wall@2,0", "beryllic-stone-wall@2,1",
      ...(lines > 0 ? ["ore-wall-beryllium@2,0"] : []),
      ...(lines > 1 ? ["ore-wall-beryllium@2,1"] : []),
    ],
  };
}

/** An oil extractor, on sand or on bare floor. */
function extractor(sandy) {
  const ground = [];
  if (sandy) {
    for (let x = 0; x <= 2; x++) for (let y = 0; y <= 2; y++) ground.push(`sand-floor@${x},${y}`);
  }
  return {
    tiles: [
      // Covers 0..2 by 0..2.
      { x: 1, y: 1, block: "oil-extractor", rotation: 0 },
      { x: -1, y: 1, block: "power-source", rotation: 0 },
      { x: -1, y: 0, block: "item-source", rotation: 0, raw: item("sand") },
      { x: -1, y: 2, block: "liquid-source", rotation: 0, raw: liquid("water") },
      { x: 3, y: 1, block: "conduit", rotation: 0 },
      // Covers 4..6 by 0..2.
      { x: 5, y: 1, block: "liquid-tank", rotation: 0 },
    ],
    ground,
  };
}

/** A router splitting between an incinerator and a vault, with power or without. */
function burner(powered) {
  const tiles = [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "router", rotation: 0 },
    { x: 3, y: 0, block: "incinerator", rotation: 0 },
    { x: 2, y: 1, block: "conveyor", rotation: 1 },
    { x: 2, y: 3, block: "vault", rotation: 0 },
  ];
  if (powered) tiles.push({ x: 3, y: -1, block: "power-source", rotation: 0 });
  return tiles;
}

/**
 * One block on a grid with an RTG and a battery, and nothing else.
 *
 * The measurement is the battery: whatever it reads has to be exactly what the same RTG
 * and battery read on their own, in `gen-rtg-thorium`. A block that draws a single unit
 * shows up as a different number.
 */
function idlePower(name) {
  const wide = sizeOf(name);
  return {
    tiles: [
      { x: 0, y: 0, block: "rtg-generator", rotation: 0 },
      { x: 2 + Math.trunc((wide - 1) / 2), y: 0, block: name, rotation: 0 },
      { x: 3 + wide, y: 0, block: "battery-large", rotation: 0 },
    ],
    stock: ["thorium*10@0,0"],
  };
}

/** A rotary pump on four tiles of water, with a grid behind it or without. */
function rotary(powered) {
  const tiles = [
    // Covers 0..1 by 0..1.
    { x: 0, y: 0, block: "rotary-pump", rotation: 0 },
    { x: 2, y: 0, block: "conduit", rotation: 0 },
    // Covers 3..5 by -1..1.
    { x: 4, y: 0, block: "liquid-tank", rotation: 0 },
  ];
  if (powered) tiles.push({ x: -1, y: 0, block: "power-source", rotation: 0 });
  return {
    tiles,
    ground: [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => `shallow-water@${x},${y}`),
  };
}

/** A laser drill on nine tiles of copper, with water piped to it or without. */
function wetDrill(wet) {
  const tiles = [
    // Covers 0..2 by 0..2, with its ore under it.
    { x: 1, y: 1, block: "laser-drill", rotation: 0 },
    { x: -1, y: 1, block: "power-source", rotation: 0 },
    // The vault against the drill, so that everything produced is counted.
    { x: 4, y: 1, block: "vault", rotation: 0 },
  ];
  if (wet) tiles.push({ x: -1, y: 0, block: "liquid-source", rotation: 0, raw: liquid("water") });
  const ground = [];
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) ground.push(`ore-copper@${x},${y}`);
  return { tiles, ground };
}

/** A cliff crusher facing two walls of the same kind. */
function crusher(wall) {
  return {
    tiles: [
      // Covers 0..1 by 0..1, facing east at (2, 0) and (2, 1).
      { x: 0, y: 0, block: "cliff-crusher", rotation: 0 },
      { x: -1, y: 0, block: "power-source", rotation: 0 },
      { x: 0, y: -1, block: "duct", rotation: 3 },
      { x: 0, y: -3, block: "vault", rotation: 0 },
    ],
    ground: [`${wall}@2,0`, `${wall}@2,1`],
  };
}

/** An impact drill on sixteen tiles of copper, with ozone to speed it up or without. */
function burst(boosted) {
  const tiles = [
    // Covers 1..4 by 1..4.
    { x: 2, y: 2, block: "impact-drill", rotation: 0 },
    { x: 0, y: 2, block: "power-source", rotation: 0 },
    { x: 0, y: 3, block: "liquid-source", rotation: 0, raw: liquid("water") },
    { x: 5, y: 2, block: "duct", rotation: 0 },
    { x: 6, y: 2, block: "duct", rotation: 0 },
    // Covers 7..9 by 1..3.
    { x: 8, y: 2, block: "vault", rotation: 0 },
  ];
  if (boosted) {
    tiles.push({ x: 0, y: 1, block: "liquid-source", rotation: 0, raw: liquid("ozone") });
  }
  const ground = [];
  for (let x = 1; x <= 4; x++) for (let y = 1; y <= 4; y++) ground.push(`ore-copper@${x},${y}`);
  return { tiles, ground };
}

/** A thorium reactor, on a source that never runs out or on thirty thorium and no more. */
function reactor(fed) {
  const tiles = [
    // Covers 0..2 by 0..2.
    { x: 1, y: 1, block: "thorium-reactor", rotation: 0 },
    { x: -1, y: 1, block: "liquid-source", rotation: 0, raw: liquid("cryofluid") },
    // Covers 3..5 by 0..2.
    { x: 4, y: 1, block: "battery-large", rotation: 0 },
  ];
  if (fed) tiles.push({ x: -1, y: 0, block: "item-source", rotation: 0, raw: item("thorium") });
  return { tiles, stock: fed ? [] : ["thorium*30@1,1"] };
}

/** A flux reactor, with a heat source pointed at it or without. */
function flux(hot) {
  const tiles = [
    // Covers 0..4 by 0..4.
    { x: 2, y: 2, block: "flux-reactor", rotation: 0 },
  ];
  /* The cold one starts with a full tank of cyanogen and **no source**.

     With a source against it, the reactor was topped up on every frame and both halves of
     the pair read thirty: the "and drinks nothing" half was measured by no figure at all.
     On a closed tank, what is left says it. */
  if (hot) tiles.push({ x: -1, y: 0, block: "liquid-source", rotation: 0, raw: liquid("cyanogen") });
  // Facing east, into the reactor's left edge. A heat producer that is not pointed at what
  // it is heating delivers nothing at all.
  if (hot) tiles.push({ x: -1, y: 2, block: "heat-source", rotation: 0 });
  const banks = hot ? 12 : 1;
  for (let i = 0; i < banks; i++) {
    tiles.push({ x: 6 + i * 3, y: 2, block: "battery-large", rotation: 0 });
  }
  return hot ? tiles : { tiles, stock: ["cyanogen~30@2,2"] };
}

/** A thermal generator on four tiles of whatever the ground is made of. */
function thermal(floor) {
  return {
    tiles: [
      // Covers 0..1 by 0..1.
      { x: 0, y: 0, block: "thermal-generator", rotation: 0 },
      // Covers 2..4 by -1..1, so it touches the generator's right edge.
      { x: 3, y: 0, block: "battery-large", rotation: 0 },
    ],
    ground: [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => `${floor}@${x},${y}`),
  };
}

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
    /* The vault against the drill rather than two belts away, which is not tidiness.
    
       With belts between them the pair disagreed by one item for a long time, and the
       disagreement was not about drilling: both engines produced forty eight, and they
       differed on whether the forty eighth had reached the vault or was still a sub-tile
       position on a belt. Standing the vault against the drill, everything produced is
       counted, and the scenario measures the drill instead of the belt phase. */
    { x: 4, y: 1, block: "vault", rotation: 0 },

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
          throw new Error(`${name}: ${tile.block} and ${taken.get(at)} overlap `
            + `at ${at}`);
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
    const { tiles, ground, stock } = shape(build());
    const painted = shifted(tiles, ground);
    const filled = shifted(tiles, stock);
    const code = await toBase64(check(name, tiles), { tags: { name }, sizeOf });
    writeFileSync(join(KEPT, `${name}.txt`), code);
    writeFileSync(join(KEPT, `${name}.sol`), painted.join(" "));
    writeFileSync(join(KEPT, `${name}.stock`), filled.join(" "));
    const trailing = [...painted, ...filled];
    commands.push(`measure ${code} ${SECONDS} ../bench/data/oracle/${name}.json`
      + (trailing.length ? ` ${trailing.join(" ")}` : ""));
  }
  writeFileSync(join(KEPT, "commands.txt"), `${commands.join("\n")}\n`);
  console.log(`${commands.length} scenarios written to ${KEPT}`);
  console.log("To measure them in the real game:");
  console.log("  cd _run && (cat ../bench/data/oracle/commands.txt; sleep 20; echo exit)"
    + " | java -jar server-release.jar");
  process.exit(0);
}

let worst = 0;
let missing = 0;
console.log(`scenario / place / what is there          port     game   gap`);
console.log(`${"-".repeat(66)}`);

for (const [name, build] of Object.entries(SCENARIOS)) {
  const { tiles, ground, stock } = shape(build());
  const code = await toBase64(check(name, tiles), { tags: { name }, sizeOf });
  const theirs = measured(name);

  if (!theirs) {
    missing++;
    console.log(`${name.padEnd(28)} not measured yet`);
    continue;
  }

  const mine = await ported(code, theirs.ticks,
                            shifted(tiles, ground), shifted(tiles, stock));
  for (const gap of differences(mine, theirs)) {
    worst = Math.max(worst, gap.gap);
    console.log(`${`${name} ${gap.what}`.padEnd(38)}`
      + `${String(gap.mine).padStart(8)} ${String(gap.theirs).padStart(8)}`
      + `   ${gap.gap < 0.0001 ? "exact" : `${(gap.gap * 100).toFixed(1)}%`}`);
  }
}

console.log(`${"-".repeat(66)}`);
if (missing) {
  console.log(`${missing} scenario(s) never measured: run again with --measure`);
}
console.log(`worst gap: ${(worst * 100).toFixed(2)}%`);
process.exitCode = worst > 0.02 ? 1 : 0;
