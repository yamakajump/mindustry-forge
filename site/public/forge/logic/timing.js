/**
 * How long a program takes, which is the one thing the game never tells a player.
 *
 * Read out of `LogicBlock.LogicBuild.updateTile` in v8 build 159.7, and it is worth being
 * exact about which of the two rate fields matters, because the catalogue carries both and
 * only one of them ever applies to a processor a schematic can hold.
 *
 *     if (!privileged) ipt = block.instructionsPerTick;
 *     accumulator += edelta() * ipt;
 *     if (accumulator > maxInstructionScale * ipt) accumulator = maxInstructionScale * ipt;
 *     for (int i = 0; i < (int)accumulator; i++) { executor.runOnce(); accumulator--; }
 *
 * Three things follow, and none of them is guessable from the field names.
 *
 * **`instructionsPerTick` is the whole story.** A building carries its own `ipt`, and
 * `setrate` writes to it, clamped to `maxInstructionsPerTick`. But the first line above
 * puts it back every single tick on anything that is not privileged, so on a micro, logic
 * or hyper processor `setrate` is erased before it can matter. `maxInstructionsPerTick` is
 * a number this page must never show: it applies to the world processor alone, and a
 * schematic cannot contain one.
 *
 * **The accumulator carries the remainder**, so a program is not rounded up to a whole tick
 * every pass. Nine instructions on a processor doing two a tick is four and a half ticks,
 * not five, because the half tick of credit is still there on the next pass.
 *
 * **Falling behind is not deferred, it is lost.** The accumulator is capped at five ticks
 * of budget, so a server that drops frames lets a processor catch up by five ticks and no
 * more. That ceiling is the second number here, and it is the one a player cannot find
 * anywhere in the game.
 *
 * A processor draws no power and its `edelta()` is therefore its delta, so full speed is
 * the honest baseline and it is the one used.
 */

import { catalogueOf } from "./catalogue.js";

/** Ticks in a second, at the rate the game runs its world. */
const TICKS_PER_SECOND = 60;

/**
 * What `count` instructions cost on `block`, or nothing when the block is not a processor.
 *
 * `ticks` and `seconds` are one pass through the program at full speed. `burst` is the most
 * instructions that can ever run in a single tick, which is what a processor catching up
 * after a stall will do.
 */
export function timingOf(block, count) {
  const processor = catalogueOf().processors.find((entry) => entry.name === block);
  if (!processor?.instructions_per_tick || !count) return null;

  const rate = processor.instructions_per_tick;
  return {
    rate,
    ticks: count / rate,
    seconds: count / rate / TICKS_PER_SECOND,
    burst: processor.max_instruction_scale * rate,
  };
}

/**
 * A tick count, written the way it reads best.
 *
 * Under ten, one decimal, because "3,5 ticks" is the difference between a program that fits
 * in a tick and one that does not. Above, whole ticks: nobody reading "204 ticks" is served
 * by the tenth.
 */
export const ticksAsText = (ticks) =>
  ticks < 10 ? ticks.toFixed(1).replace(".", ",") : String(Math.round(ticks));

/** A duration in seconds, at the precision a player can actually perceive. */
export const secondsAsText = (seconds) =>
  seconds < 1 ? `${Math.round(seconds * 1000)} ms`
    : `${seconds.toFixed(seconds < 10 ? 1 : 0).replace(".", ",")} s`;
