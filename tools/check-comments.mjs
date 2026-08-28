/**
 * Fail when a comment in this repository is written in French.
 *
 *     node tools/check-comments.mjs            # the whole repository
 *     node tools/check-comments.mjs <paths...> # only these files
 *
 * `AGENTS.md` says everything a contributor reads is in English and everything a player
 * reads stays French. The second half is enforced by the translation-key tests. This is the
 * first half, which was an intention until the day the repository was actually translated:
 * nothing stopped the next comment from being written in French, and a rule nothing checks
 * is a rule that drifts back.
 *
 * The detection is a count of function words, not a language model. French and English
 * share almost none of them, and a comment carries enough words for the count to separate
 * cleanly: over the whole repository the highest French score in an English comment is two,
 * and the lowest in a French comment is five. The threshold sits at four, in the gap.
 *
 * A false positive is answered by `ALLOWED`, with the reason written next to it. There is
 * deliberately no in-file escape comment: an escape a contributor can type is an escape a
 * contributor will type, and this check exists because that is what happened to the rule.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { commentsOf, grammarOf } from "./comments.mjs";

/** Function words that are French and are not English, and the reverse. */
const FRENCH = /\b(qui|que|quoi|pour|dans|une|des|avec|donc|sans|cette|alors|parce|quand|jamais|toujours|chaque|deja|déjà|encore|elle|leur|nous|vous|est|sont|etait|était|ainsi|aussi|mais|plutot|plutôt|meme|même|tout|toute|rien|faut|fait|peut|doit|sur|sous|entre|apres|après|avant|depuis|puis|lui|ses|ces|cela|celui|ceux)\b/gi;
const ENGLISH = /\b(the|is|of|to|and|that|for|in|on|not|what|which|it|as|are|be|by|with|this|from|its|has|have|would|when|where|while|because|so|but|than|then|there|they|their|does|do|no|any|one|two|only|rather|already|still|never|always)\b/gi;

/** The threshold, and why it is four rather than three. See the module comment. */
const LIMIT = 4;

/**
 * Files whose French comments are correct, each with the reason.
 *
 * Kept as data rather than as a marker in the file, so that the list of exceptions is one
 * short thing somebody can read, instead of a habit spread through the sources.
 */
const ALLOWED = new Map([
  ["site/app/Support/Remarks.php",
   "quotes the repository owner verbatim; translating somebody's own words misreports them"],
]);

/** How French a piece of text reads, as the count of its French function words. */
export function frenchScore(text) {
  return (text.match(FRENCH) || []).length;
}

/** The same count for English, used to spare a comment that merely quotes a French label. */
export function englishScore(text) {
  return (text.match(ENGLISH) || []).length;
}

/** Whether a comment should be reported. */
export function readsFrench(text) {
  const french = frenchScore(text);
  return french >= LIMIT && french > englishScore(text);
}

/** Every French comment in one file, as `{ path, line, text, score }`. */
export function frenchComments(path, source) {
  const grammar = grammarOf(path);
  if (!grammar || ALLOWED.has(path)) return [];
  return commentsOf(source, grammar)
    .filter((comment) => readsFrench(comment.text))
    .map((comment) => ({ path, line: comment.line, text: comment.text, score: frenchScore(comment.text) }));
}

/** The files this check looks at: everything tracked, minus what is not ours to write. */
function tracked() {
  const out = execFileSync("git", ["ls-files"], { encoding: "utf8" });
  return out.split("\n").filter((path) =>
    path && grammarOf(path)
    && !path.startsWith("site/vendor/")
    && !path.includes("node_modules/")
    && !path.startsWith("site/lang/"));
}

function main(argv) {
  const paths = argv.length ? argv : tracked();
  const failures = [];

  for (const path of paths) {
    let source;
    try {
      source = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    failures.push(...frenchComments(path, source));
  }

  if (!failures.length) {
    console.log(`Every comment reads English across ${paths.length} file${paths.length === 1 ? "" : "s"}.`);
    return 0;
  }

  console.error("Comments in this repository are written in English. These read French:\n");
  for (const bad of failures) {
    const first = bad.text.trim().split("\n")[0].slice(0, 90);
    console.error(`  ${bad.path}:${bad.line}  (${bad.score} French function words)`);
    console.error(`    ${first}\n`);
  }
  console.error("Translate them. A comment that only quotes a French label the page shows is");
  console.error("fine and will not reach this threshold; if one does, add the file to ALLOWED");
  console.error("in tools/check-comments.mjs with the reason.");
  return 1;
}

/* Run as a script, not when imported by the tests. Compared on the file name rather than
   on a URL built from the path, because the two disagree about slashes on Windows. */
if (process.argv[1] && process.argv[1].endsWith("check-comments.mjs")) {
  process.exit(main(process.argv.slice(2)));
}
