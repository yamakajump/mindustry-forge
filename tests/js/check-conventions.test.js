/**
 * The mechanical check behind the words in AGENTS.md and CONTRIBUTING.md: conventional
 * format, a fifty-character subject, no em dash.
 *
 * `tools/check-conventions.mjs` runs both as a library, called here directly, and as the
 * command `.github/workflows/conventions.yml` invokes on every pull request. The pure
 * functions are tested first, because that is where the rules actually live; the last few
 * tests spawn the script itself, to prove the command line surface a contributor runs by
 * hand behaves the same way.
 *
 * ONE THING TO KNOW BEFORE IT COSTS YOU AN HOUR: this file tests em-dash detection, so it
 * needs em dashes in its own fixtures. Written as the literal glyph, every one of them
 * would be an added line in the pull request that introduces this file, and the workflow
 * this file exists to prove out would fail on its own test suite. `EM_DASH` below is
 * built from its code point for exactly that reason; use it instead of typing the
 * character.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  addedLines, checkCommits, checkDiffForEmDash, checkSubjectLine, relevantCommits,
} from "../../tools/check-conventions.mjs";

const SCRIPT = fileURLToPath(new URL("../../tools/check-conventions.mjs", import.meta.url));

const EM_DASH = String.fromCharCode(0x2014);

/** A scratch file, since the script reads its JSON and diff input from paths, not stdin. */
function tempFile(name, content) {
  const dir = mkdtempSync(join(tmpdir(), "check-conventions-"));
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

test("a clean conventional subject passes all three checks", () => {
  assert.deepEqual(checkSubjectLine("fix(vitrine): show the missing thumbnail"), []);
});

test("a scope and a breaking marker are both optional, not required", () => {
  assert.deepEqual(checkSubjectLine("docs: fix the thing"), []);
  assert.deepEqual(checkSubjectLine("feat(schema)!: rename the export field"), []);
});

test("an unknown type is rejected and the message names the allowed ones", () => {
  const [error] = checkSubjectLine("update: bump the dependency");
  assert.match(error, /does not match the required/);
  for (const type of ["feat", "fix", "docs", "chore", "refactor", "test", "style", "perf", "ci", "build", "revert"]) {
    assert.ok(error.includes(type), `allowed-types list should mention "${type}"`);
  }
});

test("a missing colon is rejected the same way as an unknown type", () => {
  const [error] = checkSubjectLine("fix show the missing thumbnail");
  assert.match(error, /does not match the required/);
});

test("a subject over fifty characters is rejected with the count and the text", () => {
  // 53-character subject, chosen to land past the limit without being contrived.
  const subject = "improve the way the catalogue filters very long lists";
  assert.equal(subject.length, 53);
  const [error] = checkSubjectLine(`fix(vitrine): ${subject}`);
  assert.match(error, /subject is 53 characters, the limit is 50/);
  assert.ok(error.includes(subject), "the offending subject itself should be quoted back");
});

test("a subject exactly at fifty characters passes the length check", () => {
  const subject = "a".repeat(50);
  assert.deepEqual(checkSubjectLine(`fix: ${subject}`), []);
});

test("an em dash fails even in an otherwise well-formed subject", () => {
  const [error] = checkSubjectLine(`fix(vitrine): show the plafond ${EM_DASH} not the mesure`);
  assert.match(error, /em dash/);
  assert.ok(error.includes(EM_DASH));
});

test("a subject can fail more than one rule at once", () => {
  const tooLong = "z".repeat(60);
  const errors = checkSubjectLine(`nope: ${tooLong} ${EM_DASH} still going`);
  assert.equal(errors.length, 3, "wrong format, too long, and an em dash");
});

test("addedLines numbers only what a diff actually adds", () => {
  const diff = [
    "diff --git a/site/example.js b/site/example.js",
    "index abc123..def456 100644",
    "--- a/site/example.js",
    "+++ b/site/example.js",
    "@@ -1,4 +1,5 @@",
    " line one",
    "-old line",
    "+new line",
    `+another new line ${EM_DASH} with an em dash`,
    " line four",
    "",
  ].join("\n");

  const added = addedLines(diff);
  assert.deepEqual(added, [
    { file: "site/example.js", line: 2, text: "new line" },
    { file: "site/example.js", line: 3, text: `another new line ${EM_DASH} with an em dash` },
  ]);
});

test("an em dash in a removed or context line does not fail the diff check", () => {
  const diff = [
    "diff --git a/docs/notes.md b/docs/notes.md",
    "--- a/docs/notes.md",
    "+++ b/docs/notes.md",
    "@@ -1,2 +1,2 @@",
    ` a line that already had ${EM_DASH} an em dash before this diff`,
    `-removed ${EM_DASH} with a dash too`,
    "+a clean added line",
    "",
  ].join("\n");

  assert.deepEqual(checkDiffForEmDash(diff), []);
});

test("an em dash in an added line names the file, the line, and the text", () => {
  const diff = [
    "diff --git a/docs/notes.md b/docs/notes.md",
    "--- a/docs/notes.md",
    "+++ b/docs/notes.md",
    "@@ -1,1 +1,1 @@",
    "-a clean line",
    `+a line with an em dash ${EM_DASH} right here`,
    "",
  ].join("\n");

  const [error] = checkDiffForEmDash(diff);
  assert.match(error, /^docs\/notes\.md:1: added line contains an em dash/);
  assert.ok(error.includes("a line with an em dash"));
});

test("relevantCommits drops merges and bot authors, keeps everything else", () => {
  const commits = [
    { sha: "1111111", message: "feat(vitrine): add the filter", authorLogin: "yamakajump", parentCount: 1 },
    { sha: "2222222", message: "Merge pull request #1", authorLogin: "yamakajump", parentCount: 2 },
    { sha: "3333333", message: "chore(main): release 1.2.3", authorLogin: "release-please[bot]", parentCount: 1 },
    { sha: "4444444", message: "chore: bump a dependency", authorLogin: "github-actions[bot]", parentCount: 1 },
  ];

  const kept = relevantCommits(commits);
  assert.deepEqual(kept.map((c) => c.sha), ["1111111"]);
});

test("checkCommits reports only the relevant commits, naming each by its short sha", () => {
  const commits = [
    { sha: "1111111aaaa", message: "feat(vitrine): add the filter", authorLogin: "yamakajump", parentCount: 1 },
    { sha: "abcdef01234", message: "fix bad subject with no colon", authorLogin: "yamakajump", parentCount: 1 },
    { sha: "5555555bbbb", message: "fix: whatever, written by a bot", authorLogin: "release-please[bot]", parentCount: 1 },
  ];

  const errors = checkCommits(commits);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^commit abcdef0: does not match the required/);
});

// --- command line ----------------------------------------------------------

test("CLI: a clean --subject exits 0 and reports success", () => {
  const out = execFileSync(
    process.execPath, [SCRIPT, "--subject", "fix(vitrine): show the missing thumbnail"],
    { encoding: "utf8" },
  );
  assert.match(out, /All checked conventions pass/);
});

test("CLI: a bad --subject exits non-zero and the message reaches stderr", () => {
  assert.throws(
    () => execFileSync(
      process.execPath, [SCRIPT, "--subject", "not conventional at all"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
    (thrown) => {
      assert.equal(thrown.status, 1);
      assert.match(thrown.stderr, /does not match the required/);
      return true;
    },
  );
});

test("CLI: --commits-file with a rule-breaking commit fails the process", () => {
  const path = tempFile("commits.json", JSON.stringify([
    { sha: "deadbeef000", message: "bad subject with no colon at all here", authorLogin: "yamakajump", parentCount: 1 },
  ]));

  assert.throws(
    () => execFileSync(process.execPath, [SCRIPT, "--commits-file", path], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    (thrown) => {
      assert.equal(thrown.status, 1);
      assert.match(thrown.stderr, /commit deadbee/);
      return true;
    },
  );
});

test("CLI: --diff-file with an added em dash fails the process", () => {
  const diff = [
    "diff --git a/README.md b/README.md",
    "--- a/README.md",
    "+++ b/README.md",
    "@@ -1,1 +1,1 @@",
    "-fine",
    `+not fine ${EM_DASH} has a dash`,
    "",
  ].join("\n");
  const path = tempFile("diff.patch", diff);

  assert.throws(
    () => execFileSync(process.execPath, [SCRIPT, "--diff-file", path], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    (thrown) => {
      assert.equal(thrown.status, 1);
      assert.match(thrown.stderr, /README\.md:1: added line contains an em dash/);
      return true;
    },
  );
});

test("CLI: no flag at all prints usage and exits 2, not 1", () => {
  assert.throws(
    () => execFileSync(process.execPath, [SCRIPT], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    (thrown) => {
      assert.equal(thrown.status, 2);
      assert.match(thrown.stderr, /Usage:/);
      return true;
    },
  );
});
