/**
 * Fail when an issue template asks for a label the repository does not have.
 *
 *     gh label list --json name > labels.json
 *     node tools/check-labels.mjs --labels-file labels.json
 *
 * GitHub applies the labels in a template's `labels:` line silently, and silently applies
 * nothing when one of them does not exist. Two of the three templates here shipped that
 * way: `feature.yml` asked for `idea` and `measurement.yml` for `measurement`, neither of
 * which had ever been created, so every idea and every measurement report arrived with no
 * label at all and the triage the templates were written for never happened. Nothing said
 * so, which is why this is a check rather than a note.
 *
 * The label list is passed in as a file rather than fetched here, so the parsing is a pure
 * function the tests can drive without a network or a token.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const TEMPLATES = ".github/ISSUE_TEMPLATE";

/**
 * The labels one template asks for.
 *
 * Read with a regular expression rather than a YAML parser: the line has one shape,
 * `labels: ["a", "b"]`, and a parser would be a dependency this repository does not have
 * for a job this size.
 */
export function labelsDeclared(yaml) {
  const line = yaml.match(/^labels:\s*\[(.*)\]\s*$/m);
  if (!line) return [];
  return [...line[1].matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => m[1] ?? m[2]);
}

/** Which of `declared` are not in `existing`, compared exactly, case included. */
export function missingFrom(declared, existing) {
  const known = new Set(existing);
  return declared.filter((label) => !known.has(label));
}

function main(argv) {
  const at = argv.indexOf("--labels-file");
  if (at < 0 || !argv[at + 1]) {
    console.error("usage: node tools/check-labels.mjs --labels-file <labels.json>");
    return 2;
  }

  const existing = JSON.parse(readFileSync(argv[at + 1], "utf8")).map((l) => l.name ?? l);
  const failures = [];

  for (const file of readdirSync(TEMPLATES).filter((f) => /\.ya?ml$/.test(f))) {
    if (file === "config.yml") continue;
    /* Joined then normalised: the message names a path a reader pastes back into a
       command, and a Windows separator is not that path on the machine CI runs on. */
    const path = join(TEMPLATES, file).split("\\").join("/");
    for (const label of missingFrom(labelsDeclared(readFileSync(path, "utf8")), existing)) {
      failures.push({ path, label });
    }
  }

  if (!failures.length) {
    console.log(`Every label the issue templates ask for exists (${existing.length} labels).`);
    return 0;
  }

  console.error("An issue template asks for a label this repository does not have.");
  console.error("GitHub applies nothing in that case, and says nothing about it:\n");
  for (const bad of failures) console.error(`  ${bad.path} asks for "${bad.label}"`);
  console.error(`\nExisting labels: ${existing.join(", ")}`);
  console.error("\nEither create the label with `gh label create`, or point the template at one");
  console.error("that exists. Two labels meaning the same thing is worse than one.");
  return 1;
}

/* Run as a script, not when imported by the tests. Compared on the file name rather than
   on a URL built from the path, because the two disagree about slashes on Windows. */
if (process.argv[1] && process.argv[1].endsWith("check-labels.mjs")) {
  process.exit(main(process.argv.slice(2)));
}
