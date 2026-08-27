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
    /* Onze objets a la seconde en entree, six et demi en sortie tout droit.

       Le scenario nourrissait les deux branches avec une bande de meme debit et se
       terminait sur un coffre de mille : la branche droite avalait tout, `canForward`
       etait vrai a chaque image, et le cote ne recevait pas un objet. Les deux scenarios
       nommes d'apres la regle de debordement ne l'exercaient pas une fois.

       Ici la branche droite sature a son propre debit et le reste passe sur le cote. Les
       deux chiffres sont non nuls et differents, et c'est exactement la situation pour
       laquelle la regle existe. */
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
  /* Le coffre part plein et rien ne le remplit.

     Il etait alimente par une bande cuivre a six objets et demi la seconde, et le seul
     chiffre compare etait ce que cette bande avait porte. Un dechargeur a sept, onze ou
     quarante par seconde aurait donne le meme resultat : sa vitesse n'etait verifiee nulle
     part. Sur un stock ferme de mille, ce qui reste dit son debit et rien d'autre. */
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

  /* Un routeur qui partage du charbon entre deux presses, chacune au bout de sa bande.

     Deux fois refait. La presse nord n'etait pas collee au routeur, donc le jeu la donnait
     a efficacite zero et le scenario, nomme d'apres un partage entre deux presses, mesurait
     une presse derriere un routeur. Collee, il mesurait un **bourrage** : une presse rend
     son graphite a tous ses voisins, routeur compris, et le routeur se bouchait avec.

     Avec une bande entre le routeur et chaque presse, le graphite n'a nulle part ou
     revenir : la bande qui alimente la presse pointe vers elle et refuse ce qu'elle lui
     tend. Le routeur alterne, chaque presse recoit trois charbons et quart la seconde pour
     un et un tiers de besoin, et les deux tournent a plein. */
  "crafter-two-presses": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("coal") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "router", rotation: 0 },

    // Est : deux bandes, puis une presse en 5..6 par 0..1.
    { x: 3, y: 0, block: "conveyor", rotation: 0 },
    { x: 4, y: 0, block: "conveyor", rotation: 0 },
    { x: 5, y: 0, block: "graphite-press", rotation: 0 },
    { x: 7, y: 0, block: "conveyor", rotation: 0 },
    { x: 9, y: 0, block: "vault", rotation: 0 },

    // Nord : idem, presse en 2..3 par 3..4.
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
  /* Meme maladie que la porte de trop-plein, meme remede : la branche droite doit saturer
     a son propre debit, sinon le cote ne recoit jamais rien et le scenario ne mesure pas
     ce que son nom annonce. Un duct porte quinze par seconde et une bande cuivre six et
     demi, donc la bande sature et le reste passe sur le cote. */
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
    // Pointe au nord, donc son arriere est au sud et le routeur le prend par le flanc.
    { x: 2, y: 0, block: "overflow-duct", rotation: 1 },
    // Ce que le routeur pousse vers le sud : couvre 0..2 par -3..-1.
    { x: 1, y: -2, block: "vault", rotation: 0 },
    // Ce qui sortirait du duct : couvre 2..4 par 1..3.
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
      // Couvre 3..5 par 0..2, sans lien a lui : un fil mort en travers du faisceau.
      { x: 4, y: 1, block: "beam-link", rotation: 0 },
      // Couvre 6..8 par 0..2, derriere le fil.
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

  /* Une charge utile qui traverse une ligne de convoyeurs.

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

  /* Un constructeur, qui mange des objets et sort un **bloc** comme cargaison.

     Le seul bloc du jeu dont les ingredients et l'horloge sont tous deux sa configuration :
     ce qu'il mange est le cout de construction de ce qu'on lui demande, et le temps qu'il
     met est le temps de construction de ce bloc la, lui-meme derive du cout.

     C'est le **grand** constructeur ici, et pas le petit, pour une raison qui a coute une
     mesure : le petit porte une liste de sept blocs et refuse en silence tout ce qui n'y
     est pas, et les sept sont d'Erekir, donc invisibles sur un monde de Serpulo. Il ne
     rapporte alors aucune recette, ne consomme rien, et reste a zero l'air en pleine sante.
     Le grand n'a pas de liste, seulement une fourchette de tailles. */
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

  /* Un routeur a charge utile, qui envoie la cargaison d'un cote puis de l'autre.

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

  /* Trois blocs qui ne tirent d'energie que quand ils ont quelque chose a soigner.

     `shouldConsume` est "y a-t-il une cible" : rien n'est abime dans une schematique et
     aucune unite n'y stationne, donc les trois sont **gratuits**. Comptes comme des
     consommateurs permanents ils inventaient quatre cent vingt d'energie par seconde a
     eux trois. La batterie doit lire exactement ce que le RTG a fait, au chiffre pres. */
  "idle-regen": () => idlePower("regen-projector"),
  "idle-repair": () => idlePower("repair-turret"),
  "idle-tower": () => idlePower("unit-repair-tower"),

  /* Et une tour a onde de choc, qui tire jusqu'a etre chargee puis se tait : quatre-vingts
     images de course, et plus rien pendant les vingt-huit secondes suivantes. */
  "idle-shockwave": () => idlePower("shockwave-tower"),

  /* Les vidanges du bac a sable. Celle a liquide etait classee cote objets, donc elle
     refusait chaque goutte et le tuyau devant elle bouchonnait au lieu de se vider, ce qui
     est l'exact contraire de ce a quoi le bloc sert. */
  "void-liquid": () => [
    { x: 0, y: 0, block: "liquid-source", rotation: 0, raw: liquid("water") },
    { x: 1, y: 0, block: "conduit", rotation: 0 },
    { x: 2, y: 0, block: "conduit", rotation: 0 },
    { x: 3, y: 0, block: "liquid-void", rotation: 0 },
  ],

  /* Celle a objets est mesuree par ce qu'elle **prend a l'autre branche** : un routeur
     partage entre un coffre et la vidange, donc le coffre en recoit la moitie. Une vidange
     qui refuse laisserait tout au coffre, et un scenario qui la nourrit toute seule ne
     mesure rien du tout puisque le propre du bloc est de ne rien laisser derriere. */
  "void-item": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "router", rotation: 0 },
    { x: 3, y: 0, block: "item-void", rotation: 0 },
    { x: 2, y: 1, block: "conveyor", rotation: 1 },
    { x: 2, y: 3, block: "vault", rotation: 0 },
  ],

  /* Un incinerateur, qui n'est un puits que s'il a du courant.

     `acceptItem` est `heat > 0.5`, et la chaleur monte vers l'efficacite a 0,04 par image :
     treize images de courant avant qu'il accepte quoi que ce soit, et jamais rien si le
     reseau est coupe. Une bande qui y entre bouchonne, ce qui est l'exact contraire de ce
     que fait un puits. La paire le dit : alimente il prend sa moitie, froid il ne prend
     rien et le coffre recoit tout. */
  "incinerator-hot": () => burner(true),
  "incinerator-cold": () => burner(false),

  /* Une presse deux par deux, nourrie d'un cote et videe de deux autres.

     Le seul scenario qui regarde l'anneau de voisinage d'un bloc de taille **paire**. Le
     jeu prend les decalages de `Edges.getEdges` relativement a la tuile ou le bloc est
     range ; le portage passait par un milieu, qui pour une taille paire tombe sur une demi
     tuile, et l'anneau entier glissait d'une case en diagonale. La presse demandait alors
     la tuile a deux cases a sa droite et jamais celle qui la touche : quatre-vingts blocs
     du catalogue tendaient leurs objets par dessus un trou.

     Sans le correctif la presse ne voit meme pas sa source de charbon et ne produit rien. */
  "press-even-ring": () => [
    { x: -1, y: 0, block: "item-source", rotation: 0, raw: item("coal") },
    // Covers 0..1 by 0..1.
    { x: 0, y: 0, block: "graphite-press", rotation: 0 },
    // Deux sorties, sur deux faces differentes, pour que le tourniquet compte aussi.
    { x: 2, y: 0, block: "conveyor", rotation: 0 },
    { x: 4, y: 0, block: "vault", rotation: 0 },
    { x: 0, y: 2, block: "conveyor", rotation: 1 },
    { x: 0, y: 4, block: "vault", rotation: 0 },
  ],

  /* Un dechargeur colle a une presse, et un dechargeur entre deux coffres.

     Les deux regles du bloc, chacune facile a prendre a l'envers. Il tire de **tout** bloc
     dont le `unloadable` est vrai, ce qui couvre presque tout et inclut une usine et une
     foreuse : contre une presse a graphite il en sort vraiment le graphite. Et il ne verse
     **jamais** dans un coffre ni dans un noyau, quels que soient les chiffres.

     Lu comme "hors d'un conteneur, vers ce qui est moins plein", le premier montage ne
     bougeait rien la ou le jeu sort onze par seconde, et le second en sortait onze par
     seconde la ou le jeu n'en bouge aucun. */
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

  /* Le courant ne traverse pas un consommateur.

     Le jeu refuse de relier deux voisins quand les deux consomment, qu'aucun ne produit et
     qu'aucun n'est conducteur. Ici le premier radar touche le generateur et le second ne
     touche que le premier : le jeu le laisse seul sur une grille sans producteur, donc le
     generateur n'alimente qu'un radar et la batterie encaisse le reste. Relies sans
     condition, les deux radars demandent soixante-douze la ou il en arrive soixante, et la
     batterie ne monte jamais. */
  "power-not-conductive": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("coal") },
    { x: 1, y: 0, block: "combustion-generator", rotation: 0 },
    { x: 1, y: -1, block: "battery", rotation: 0 },
    { x: 2, y: 0, block: "radar", rotation: 0 },
    { x: 3, y: 0, block: "radar", rotation: 0 },
  ],

  /* Et une machine a sec ne demande rien du tout.

     `shouldConsumePower` tombe des qu'un consommateur autre que celui d'energie ne rend
     rien, et un bloc qui ne consomme pas demande **zero** plutot que de demander et de
     s'en passer. Un four sans plomb ni sable reclamait quand meme ses trente-six par
     seconde : la batterie monte de moitie moins vite. */
  "power-starved-asks-nothing": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("coal") },
    { x: 1, y: 0, block: "combustion-generator", rotation: 0 },
    { x: 1, y: -1, block: "battery", rotation: 0 },
    // Covers 2..3 by 0..1, contre le generateur et sans rien pour le nourrir.
    { x: 2, y: 0, block: "kiln", rotation: 0 },
  ],

  /* Une foreuse laser arrosee, et la meme a sec.

     `speed = lerp(1, liquidBoostIntensity, optionalEfficiency) * efficiency` : l'eau vaut
     soixante pour cent de plus. Le facteur etait dans le catalogue et la quantite non,
     donc ni le code ni la donnee ne savaient combien il en fallait : la foreuse acceptait
     l'eau, se remplissait, ne la buvait jamais et n'en tirait rien. Une conduite posee sur
     une ferme de foreuses ne changeait aucun chiffre du rapport. */
  "drill-wet": () => wetDrill(true),
  "drill-dry": () => wetDrill(false),

  /* Et une foreuse a percussion sur du beryllium, qu'elle sort deux fois plus vite.

     `drillMultipliers.put(Items.beryllium, 2f)` sur les deux foreuses a percussion, et le
     champ n'etait dumpe que pour la foreuse a faisceau. Le minerai le plus produit
     d'Erekir etait rapporte a exactement la moitie de sa vitesse. */
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

  /* Une pompe rotative sur de l'eau, alimentee et non alimentee.

     `edelta()`, et le portage lisait `delta()` : une pompe sans courant pompait
     quarante-huit par seconde ici et rien du tout dans le jeu. Une pompe est un
     consommateur comme un autre et lit la meme efficacite qu'un four. */
  "pump-powered": () => rotary(true),
  "pump-unpowered": () => rotary(false),

  /* Un trieur qui doit alterner entre ses deux cotes.

     Quand l'objet ne correspond pas et que les **deux** cotes le prennent, le jeu alterne,
     avec un bit par direction d'arrivee. Le portage prenait le premier cote qui acceptait,
     donc tout partait du meme cote et la disposition se lisait comme si elle marchait. */
  "sorter-both-sides": () => [
    { x: 0, y: 0, block: "item-source", rotation: 0, raw: item("copper") },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    // Regle sur du plomb, donc le cuivre ne correspond pas et sort par les cotes.
    { x: 2, y: 0, block: "sorter", rotation: 0, raw: item("lead") },
    { x: 2, y: 1, block: "conveyor", rotation: 1 },
    { x: 2, y: 3, block: "vault", rotation: 0 },
    { x: 2, y: -1, block: "conveyor", rotation: 3 },
    { x: 2, y: -3, block: "vault", rotation: 0 },
  ],

  /* Un conduit qui pointe dans le vide fuit.

     `moveLiquidForward(leaks, ...)` verse les deux tiers de ce qu'il tient dans une flaque
     a chaque image, donc il ne sature jamais. Le drapeau etait dans le catalogue et lu
     nulle part : une conduite ouverte bloquait la ligne ici et se vidange en continu dans
     le jeu, ce qui inverse tout l'amont. Le tuyau plaque est le seul qui ne fuit pas, et le
     seul cas que le portage avait juste. */
  "conduit-leaks": () => [
    { x: 0, y: 0, block: "liquid-source", rotation: 0, raw: liquid("water") },
    { x: 1, y: 0, block: "conduit", rotation: 0 },
    { x: 2, y: 0, block: "conduit", rotation: 0 },
    // Et rien devant : la case (3,0) est du sol nu.
  ],

  "conduit-plated-holds": () => [
    { x: 0, y: 0, block: "liquid-source", rotation: 0, raw: liquid("water") },
    { x: 1, y: 0, block: "plated-conduit", rotation: 0 },
    { x: 2, y: 0, block: "plated-conduit", rotation: 0 },
  ],

  /* Un electrolyseur dont on ne tape qu'un des deux gaz.

     C'est le montage courant, et le seul bloc du jeu a deux liquides de sortie. Son
     hydrogene sature en huit secondes ; ensuite le jeu continue a sortir de l'ozone pour
     toujours et le portage tombait a zero en bloquant tout l'aval. Et chaque gaz sort par
     sa propre face : l'ozone par la face relative 1, l'hydrogene par la 3. */
  "electrolyzer-one-tap": () => [
    // Covers 0..2 by 0..2, tourne vers l'est.
    { x: 1, y: 1, block: "electrolyzer", rotation: 0 },
    { x: -1, y: 1, block: "power-source", rotation: 0 },
    { x: -1, y: 0, block: "liquid-source", rotation: 0, raw: liquid("water") },
    // Face relative 1 (le nord quand la rotation est zero) : l'ozone.
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
    // Couvre 7..9 par -1..1.
    { x: 8, y: 0, block: "vault", rotation: 0 },

    { x: 5, y: 4, block: "item-source", rotation: 0, raw: item("lead") },
    { x: 5, y: 3, block: "conveyor", rotation: 3 },
    { x: 5, y: 2, block: "conveyor", rotation: 3 },
    { x: 5, y: 1, block: "router", rotation: 0 },
    // Couvre 2..4 par 1..3, contre le flanc ouest du routeur.
    { x: 3, y: 2, block: "vault", rotation: 0 },
  ],

  /* And the same rule on the liquid side: a bridge conduit standing beside a tank, set to
     nothing. Nothing enters it in the game, so the far tank stays dry for thirty seconds.
     Accepting on capacity alone, the port drained the near tank into the far one. */
  "liquid-bridge-idle": () => [
    { x: 0, y: 0, block: "liquid-source", rotation: 0, raw: liquid("water") },
    { x: 1, y: 0, block: "conduit", rotation: 0 },
    // Couvre 2..4 par -1..1.
    { x: 3, y: 0, block: "liquid-tank", rotation: 0 },
    { x: 5, y: 0, block: "bridge-conduit", rotation: 0 },
    { x: 6, y: 0, block: "conduit", rotation: 0 },
    // Couvre 7..9 par -1..1.
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
      // Couvre 0..2 par 0..2, sur une seule case de minerai.
      { x: 1, y: 1, block: "laser-drill", rotation: 0 },
      /* Deux chambres a combustion plutot qu une source de courant : une source est un
         `PowerNode`, elle se relie toute seule a tout ce qui passe a portee au moment de la
         pose, batterie comprise, et le scenario mesurait son courant a elle. */
      { x: 0, y: 3, block: "combustion-generator", rotation: 0 },
      { x: 0, y: 4, block: "item-source", rotation: 0, raw: item("coal") },
      { x: 1, y: 3, block: "combustion-generator", rotation: 0 },
      { x: 1, y: 4, block: "item-source", rotation: 0, raw: item("coal") },

      { x: 3, y: 1, block: "conveyor", rotation: 0 },
      // Couvre 4..6 par 0..2.
      { x: 5, y: 1, block: "thorium-reactor", rotation: 0 },
      // Refroidi, sinon le scenario mesure une explosion plutot qu un compteur.
      { x: 5, y: 3, block: "liquid-source", rotation: 0, raw: liquid("cryofluid") },
      // Sur la grille du reacteur et sur elle seule : ce qu elle a pris est la mesure.
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
      // Couvre 0..4 par 0..4.
      { x: 2, y: 2, block: "neoplasia-reactor", rotation: 0 },
      { x: -1, y: 0, block: "item-source", rotation: 0, raw: item("phase-fabric") },
      { x: -1, y: 1, block: "liquid-source", rotation: 0, raw: liquid("arkycite") },
    ],
    /* Son eau en reserve plutot qu une source de plus. Ce que la mort du reacteur fait
       autour de lui, le portage ne le modelise pas : le jeu emporte une partie de ce qui
       touche un bloc de cinq sur cinq qui saute, donc le scenario ne pose que ce qui a
       survecu a la mesure. Ce qu il verifie est le reacteur lui-meme : il n est plus la,
       et il ne reste rien dedans. */
    stock: ["water~80@2,2"],
  }),

  /* Un noeud pose sans lien enregistre se relie tout seul.
     `placed()` appelle `getPotentialLinks` des que `power.links` est vide, donc une source
     de courant lachee a cote de rien alimente la foreuse quatre cases plus loin. Le portage
     ne lisait que les liens enregistres, donc la foreuse restait seule sur sa grille a
     couverture zero et ne sortait rien du tout. C'est le cas d'un schema dont les liens
     n'ont pas ete copies, et c'est aussi ce qui avait fausse `reactor-drip`. */
  "power-node-autolinks": () => ({
    tiles: [
      { x: 0, y: 0, block: "power-source", rotation: 0 },
      // Couvre 3..5 par 0..2, sans toucher la source.
      { x: 4, y: 1, block: "laser-drill", rotation: 0 },
      { x: 6, y: 1, block: "conveyor", rotation: 0 },
      // Couvre 7..9 par 0..2.
      { x: 8, y: 1, block: "vault", rotation: 0 },
    ],
    ground: [3, 4, 5].flatMap((x) => [0, 1, 2].map((y) => `ore-copper@${x},${y}`)),
  }),

  /* Un beam-link, qui est un `LongPowerNode` : cinq cents cases de portee, **un** seul
     lien, pas d'auto-liaison, et `sameBlockConnection`, donc il ne se relie qu'a un autre
     beam-link et a rien d'autre.

     Ecrit d'abord avec un seul beam-link vise sur la foreuse, il donnait trente-neuf
     cuivres au portage et zero dans le jeu : un lien enregistre dans un schema n'est pas
     un lien, le jeu le revalide a la pose. */
  "beam-link-span": () => ({
    tiles: [
      { x: 5, y: 2, block: "item-source", rotation: 0, raw: item("coal") },
      { x: 4, y: 2, block: "combustion-generator", rotation: 0 },
      // Couvre 1..3 par 1..3, contre le generateur, relie au beam-link d'en face.
      { x: 2, y: 2, block: "beam-link", rotation: 0, raw: links([[10, 0]]) },
      // Couvre 11..13 par 1..3.
      { x: 12, y: 2, block: "beam-link", rotation: 0 },
      // Couvre 14..16 par 1..3.
      { x: 15, y: 2, block: "laser-drill", rotation: 0 },
      { x: 17, y: 2, block: "conveyor", rotation: 0 },
      // Couvre 18..20 par 1..3.
      { x: 19, y: 2, block: "vault", rotation: 0 },
    ],
    ground: [14, 15, 16].flatMap((x) => [1, 2, 3].map((y) => `ore-copper@${x},${y}`)),
  }),

  /* Une diode, le seul bloc qui deplace de la charge entre deux grilles sans etre sur
     aucune des deux. Derriere elle une grille qui produit, devant elle une batterie seule.
     Elle envoie la moitie de l'ecart de remplissage a chaque image, donc les deux finissent
     au meme niveau. Classee en `sink`, la batterie de devant restait a plat. */
  "diode-levels": () => [
    { x: 0, y: 1, block: "item-source", rotation: 0, raw: item("coal") },
    { x: 0, y: 0, block: "combustion-generator", rotation: 0 },
    { x: 1, y: 0, block: "battery", rotation: 0 },
    { x: 2, y: 0, block: "diode", rotation: 0 },
    { x: 3, y: 0, block: "battery", rotation: 0 },
  ],

  /* Un mur bouclier tire trois par seconde en permanence, qu'on lui tire dessus ou non :
     rien dans `updateTile` ne conditionne sa consommation. Huit d'entre eux autour d'une
     batterie mangent la moitie de ce qu'une chambre a combustion fabrique, et ce qui reste
     est ce que la batterie a pris. */
  "shielded-wall-drains": () => [
    { x: -2, y: 1, block: "item-source", rotation: 0, raw: item("coal") },
    { x: -1, y: 1, block: "combustion-generator", rotation: 0 },
    // Couvre 0..2 par 0..2.
    { x: 1, y: 1, block: "battery-large", rotation: 0 },
    // Deux sur deux chacun, donc six tiennent autour d'une batterie de trois sur trois.
    { x: 3, y: 0, block: "shielded-wall", rotation: 0 },
    { x: 3, y: 2, block: "shielded-wall", rotation: 0 },
    { x: 0, y: 3, block: "shielded-wall", rotation: 0 },
    { x: 0, y: -2, block: "shielded-wall", rotation: 0 },
    { x: 2, y: -2, block: "shielded-wall", rotation: 0 },
    { x: -2, y: 2, block: "shielded-wall", rotation: 0 },
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
    // Le coffre colle a la foreuse, pour que tout ce qui sort soit compte.
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
  /* Le froid part avec un plein de cyanogene et **aucune source**.

     Avec une source collee, le reacteur etait rempli a ras a chaque image et les deux
     moities de la paire affichaient trente : la moitie "et ne boit rien" n'etait mesuree
     par aucun chiffre. Sur un plein ferme, ce qui reste le dit. */
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
  const { tiles, ground, stock } = shape(build());
  const code = await toBase64(check(name, tiles), { tags: { name }, sizeOf });
  const theirs = measured(name);

  if (!theirs) {
    missing++;
    console.log(`${name.padEnd(28)} pas encore mesure`);
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
  console.log(`${missing} scenario(s) jamais mesures : relance avec --measure`);
}
console.log(`ecart maximum : ${(worst * 100).toFixed(2)}%`);
process.exitCode = worst > 0.02 ? 1 : 0;
