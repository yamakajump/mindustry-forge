/**
 * Opening the editor on a processor that already exists somewhere.
 *
 * The standalone editor writes a program for a processor a player will build later, so it
 * has no blocks to talk about and offers none. Opened from a schematic, it has all of them:
 * real names, real positions, and links that were made by clicking in the game rather than
 * typed as two integers here.
 *
 * Measured on ninety-six schematics taken from the live catalogue and decoded with this
 * repository's own reader, because the shape of this module rests on three numbers that
 * were not guessable:
 *
 *   * **40 %** carry at least one processor;
 *   * **45 % of those carry more than one**, and one of the ninety-six carries twenty-two,
 *     which is why choosing is not an afterthought and why it is a list rather than a pair
 *     of tabs;
 *   * **96 % of the 507 links land on a block that is in the schematic**, which is what
 *     makes naming them possible at all. Had that been 40 %, this module would not be worth
 *     writing.
 *
 * The remaining four per cent point outside the copied area. They keep the two numbers,
 * which are honest about knowing only where the block was, not what it was.
 */

import { fromSchematic } from "./program.js";

/**
 * Every processor in a pasted schematic, with what a chooser needs to tell them apart.
 *
 * Position, block and line count, because "processor 3 of 22" tells a reader nothing and
 * "a micro processor at 14, 6, forty lines" tells them which one they meant.
 */
export async function processorsIn(pasted) {
  const found = await fromSchematic(pasted);

  return found.map((one, at) => ({
    ...one,
    at,
    lines: one.code.split("\n").filter((line) => line.trim()).length,
  }));
}

/**
 * Fetch a published schematic by its short id.
 *
 * The same address the analyser uses, and plain text: this is a public schematic and
 * everything else about it is on its own page.
 */
export async function schematicNamed(slug) {
  const answer = await fetch(`/api/schematiques/${encodeURIComponent(slug)}/code`, {
    headers: { Accept: "text/plain" },
  });
  if (!answer.ok) throw new Error(`schématique introuvable (${answer.status})`);

  const code = (await answer.text()).trim();
  if (!code) throw new Error("cette schématique est vide");
  return code;
}
