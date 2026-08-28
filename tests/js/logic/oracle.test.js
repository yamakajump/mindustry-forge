/**
 * The reader, held against the game that wrote the language.
 *
 * Every program in `bench/data/logique` was handed to Mindustry's own `LParser` and the
 * verdict written down in `bench/data/logique-oracle.json`: how many statements came out,
 * the text the game writes back, or the error it refused on. `tools/build_logic_oracle.py`
 * re-takes it. This runs the same programs through `syntax.js` and demands the same answers.
 *
 * It is the whole reason to trust anything else in this folder. An editor that disagrees
 * with the game about what a program says is worse than no editor: it is confidently wrong
 * about code the player is about to paste.
 *
 * Three things are compared, and they are the three that a player would notice:
 *
 *   * whether the program is refused outright,
 *   * how many statements it holds, because that is what `jump` counts in,
 *   * which instruction each statement turns out to be, `noop` included.
 *
 * That last one is the sharp end. `noop` is what the game silently makes of an instruction
 * it does not know, of one reserved to the world processor, and of one carrying a value
 * that is not in its list. Agreeing on where the noops fall means agreeing on every quiet
 * failure the language has.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { useCatalogue } from "../../../site/public/forge/logic/catalogue.js";
import { parse, refused } from "../../../site/public/forge/logic/syntax.js";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

useCatalogue(JSON.parse(read("site/public/forge/logic/instructions.json")));

const verdicts = JSON.parse(read("bench/data/logique-oracle.json"));
const corpus = new URL("bench/data/logique/", root);

test("the corpus and the oracle talk about the same programs", () => {
  const files = readdirSync(corpus).filter((name) => name.endsWith(".mlog")).sort();
  assert.deepEqual(files, Object.keys(verdicts).sort(),
    "a program was added without rerunning tools/build_logic_oracle.py");
});

/** The instruction each statement really is, once the game has had its way with it. */
const asGame = (report) => report.statements.map((entry) =>
  entry.noop ? "noop" : entry.name);

/** The same list, read back out of what the game wrote. */
const written = (text) => text.split("\n").filter(Boolean)
  .map((line) => line.split(" ")[0]);

for (const [name, verdict] of Object.entries(verdicts)) {
  test(`${name} reads the way the game reads it`, () => {
    const report = parse(read(`bench/data/logique/${name}`));

    if (verdict.refused) {
      assert.ok(refused(report),
        `the game refuses this program (${verdict.refused}) and we do not`);
      return;
    }

    assert.ok(!refused(report),
      `we refuse a program the game accepts: ${
        report.problems.filter((p) => p.severity === "refus")
          .map((p) => `${p.key} line ${p.line + 1}`).join(", ")}`);

    assert.equal(report.statements.length, verdict.statements, "instruction count");
    assert.deepEqual(asGame(report), written(verdict.written), "the sequence of instructions");
  });
}

test("jumps land where the game makes them land", () => {
  for (const [name, verdict] of Object.entries(verdicts)) {
    if (verdict.refused) continue;

    const theirs = verdict.written.split("\n").filter((line) => line.startsWith("jump "))
      .map((line) => Number(line.split(" ")[1]));
    if (!theirs.length) continue;

    const report = parse(read(`bench/data/logique/${name}`));
    const ours = report.statements.filter((entry) => entry.name === "jump")
      .map((entry) => {
        const target = entry.tokens[1].text;
        return /^[+-]?\d+$/.test(target) ? Number(target) : report.labels.get(target);
      });

    assert.deepEqual(ours, theirs, `${name}: the jump targets`);
  }
});
