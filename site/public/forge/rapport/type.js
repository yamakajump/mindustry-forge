/**
 * What kind of thing a schematic is, asked before how much of it there is.
 *
 * The report used to assume every schematic was a factory that had failed to be measured.
 * A wall of logic displays showing a meme came back asked where it plugged in, over a
 * ceiling of nothing, which is the tool looking stupid on first contact with a whole
 * category of what players actually build: Mindustry has a real culture of display art and
 * joke builds, and none of them makes anything.
 *
 * Read off the game's own taxonomy rather than guessed. Every block in `blocks.json`
 * carries a `category` and a `kind` written by `tools/build_catalogue.py` out of the game,
 * so a display is recognised exactly. That is the same rule the rest of this repository
 * follows about the `.msch` format: read the game, never a wiki, and never a keyword in a
 * schematic's name.
 *
 * This file is deliberately NOT imported by `bilan.js`. `EngineVersionTest` walks the
 * imports out of that file, and anything it can reach is hashed into the fingerprint
 * stamped on all 15 534 stored analyses. Deciding how a page reads is not deciding what a
 * schematic produces, so this stays on the presentation side of that line and can be
 * rewritten without ageing a single stored figure.
 */

/** It shows things, and makes nothing. */
export const MONTRE = "montre";

/** It makes matter, or units. */
export const FABRIQUE = "fabrique";

/** It makes more power than it burns. */
export const COURANT = "courant";

/** It shoots. */
export const DEFEND = "defend";

/** It moves or holds what it is given. */
export const TRANSPORTE = "transporte";

/** None of the above, which is a real answer and not a failure. */
export const RIEN = "rien";

/**
 * The blocks that put a picture on a wall.
 *
 * By `kind` and not by name: the game has four of them today and will have more, and a
 * list of names would go stale silently at the next version while a `kind` is what the
 * class actually is.
 */
const ECRANS = new Set(["LogicDisplay", "TileableLogicDisplay", "CanvasBlock"]);

/** What drives them. */
const PROCESSEURS = new Set(["LogicBlock"]);

/** Roles that turn out units rather than items, which no item rate would report. */
const USINES = new Set(["unit-factory", "unit-assembler", "reconstructor", "constructor"]);

const compte = (held, catalogue, garde) => Object.entries(held || {})
  .reduce((total, [name, n]) => {
    const block = catalogue?.blocks?.[name];
    return block && garde(block, name) ? total + n : total;
  }, 0);

/** Tiles rather than blocks: one large display covers thirty-six of them and a wall one. */
const cases = (held, catalogue, garde) => Object.entries(held || {})
  .reduce((total, [name, n]) => {
    const block = catalogue?.blocks?.[name];
    if (!block || !garde(block, name)) return total;
    const size = block.size || 1;
    return total + n * size * size;
  }, 0);

/**
 * What a schematic is, and the figures that answer for that kind.
 *
 * The order of the tests is the design. Display art is tested first on purpose: a meme wall
 * almost always carries a battery and a solar panel to light itself, so a rule that asked
 * "does it make power" first would file half of them as power plants.
 *
 * `potentialPerMinute` and not `perMinute` decides whether it makes anything, because the
 * kind of thing a schematic is cannot depend on whether somebody has marked it yet. A
 * factory nobody has plugged in is still a factory, and its ceiling says so.
 */
export function typeOf(report, catalogue) {
  const held = report.held || {};
  const ecrans = compte(held, catalogue, (block) => ECRANS.has(block.kind));
  const processeurs = compte(held, catalogue, (block) => PROCESSEURS.has(block.kind));
  const tourelles = cases(held, catalogue, (block) => block.category === "turret");
  const fabrique = Object.keys(report.potentialPerMinute || {}).length > 0
    || cases(held, catalogue, (_, name) => USINES.has(roleOf(catalogue, name))) > 0;

  const ceiling = report.potential || { made: 0, spent: 0 };
  const chiffres = { ecrans, processeurs };

  if (ecrans > 0 && !fabrique) return { kind: MONTRE, ...chiffres };
  if (fabrique) return { kind: FABRIQUE, ...chiffres };
  if (ceiling.made > ceiling.spent && ceiling.made > 0) return { kind: COURANT, ...chiffres };
  if (tourelles > 0) return { kind: DEFEND, ...chiffres };

  const porte = cases(held, catalogue, (block) =>
    block.category === "distribution" || block.category === "liquid");
  const tout = cases(held, catalogue, () => true);
  if (tout > 0 && porte * 2 > tout) return { kind: TRANSPORTE, ...chiffres };

  return { kind: RIEN, ...chiffres };
}

/** The role the catalogue gives a block, which is not always on the block itself. */
function roleOf(catalogue, name) {
  return catalogue?.blocks?.[name]?.role || "";
}

/**
 * Whether this kind of schematic has anything to plug in.
 *
 * The one question the old report never asked, and the reason it asked a wall of displays
 * where its intake was. A schematic that shows a picture, or one that is only walls, takes
 * nothing from outside, so the whole apparatus of marking has nothing to act on and must
 * not be offered: an instruction nobody can follow reads as the tool being broken.
 */
export function seBranche(kind) {
  return kind !== MONTRE && kind !== RIEN;
}
