#!/usr/bin/env node
/**
 * Mechanically enforce the commit and pull request rules that AGENTS.md and
 * CONTRIBUTING.md already state in prose: conventional format, a subject under fifty
 * characters (it becomes a line in CHANGELOG.md, read alone, months later), and no em
 * dash, anywhere.
 *
 * Nothing checked it. PR #120's title was 67 characters and PR #125's was 52; squash
 * merges turn a title into the commit subject on `main`, so both are now permanent
 * history. This script is what `.github/workflows/conventions.yml` runs on every pull
 * request so the next violation fails loud instead of landing quiet.
 *
 * Run it yourself before pushing:
 *
 *     node tools/check-conventions.mjs --subject "fix(vitrine): show the missing thumbnail"
 *     node tools/check-conventions.mjs --commits-file commits.json
 *     node tools/check-conventions.mjs --diff-file diff.patch
 *
 * `--subject` checks one line (a pull request title, or a commit subject you are about to
 * write) against all three rules. `--commits-file` takes a JSON array of
 * `{ sha, message, authorLogin, parentCount }` (the shape the workflow asks `gh api` for)
 * and checks every commit that is neither a merge nor written by a bot this repository
 * does not author by hand. `--diff-file` takes a unified diff, as `git diff` writes it,
 * and checks every line it adds for an em dash; removed and context lines are left alone,
 * because an em dash already sitting in code this pull request does not touch is not this
 * pull request's problem to fix. The three flags can be combined; every issue found across
 * all of them is printed before the process exits.
 *
 * All three checks are exported as plain functions so `tests/js/check-conventions.test.js`
 * can call them directly, without spawning a process, alongside the subprocess tests that
 * cover the command line surface itself.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** The eleven conventional-commit types this repository accepts. */
export const ALLOWED_TYPES = [
  "feat", "fix", "docs", "chore", "refactor", "test", "style", "perf", "ci", "build", "revert",
];

export const MAX_SUBJECT_LENGTH = 50;

// Written as an escape, not the literal glyph: the diff-added-line check below would
// otherwise flag this very file for the character it exists to look for.
const EM_DASH = String.fromCharCode(0x2014);

/** `type(scope)!: subject`, scope and the breaking-change `!` both optional. */
const SUBJECT_PATTERN = new RegExp(`^(?:${ALLOWED_TYPES.join("|")})(?:\\([^)]+\\))?!?: .+$`);

/** Bot commits this repository does not write by hand, so its own rules do not bind them. */
const BOT_AUTHORS = new Set([
  "release-please[bot]", "github-actions[bot]", "release-please", "GitHub Actions",
  "dependabot[bot]", "dependabot",
]);

/** Everything after the first `": "`, which is what the fifty-character limit measures. */
function subjectOf(line) {
  const at = line.indexOf(": ");
  return at === -1 ? line : line.slice(at + 2);
}

/**
 * Check one subject line - a pull request title, or a single commit's first line - against
 * the three rules. Returns an array of teaching sentences, each naming the rule broken and
 * showing the text that broke it; an empty array means the line is clean.
 */
export function checkSubjectLine(rawLine, author = null) {
  const line = rawLine.trim();
  const errors = [];
  /* A bot's title is generated, not written, and no wording here changes it. Dependabot
     opens with "bump the actions group across 1 directory with 6 updates", which is 55
     characters and describes the update honestly; refusing it would block a dependency
     update on a style rule. The format and the em dash still bind, because those a bot
     either satisfies or does not, and both of ours satisfy them. */
  const written = !BOT_AUTHORS.has(author);

  if (!SUBJECT_PATTERN.test(line)) {
    errors.push(
      `does not match the required "type(scope)!: subject" format (scope and "!" are `
      + `optional). Allowed types: ${ALLOWED_TYPES.join(", ")}. Got: "${line}"`,
    );
  }

  const subject = subjectOf(line);
  if (written && subject.length > MAX_SUBJECT_LENGTH) {
    errors.push(
      `subject is ${subject.length} characters, the limit is ${MAX_SUBJECT_LENGTH}: `
      + `"${subject}"`,
    );
  }

  if (line.includes(EM_DASH)) {
    errors.push(
      "contains an em dash (U+2014), which this repository forbids everywhere. Use a "
      + `hyphen (-), a comma, a colon, or rewrite the sentence: "${line}"`,
    );
  }

  return errors;
}

/**
 * Of a pull request's commits, the ones its own rules bind: no merge commit (a merge
 * carries no hand-written subject of its own) and no commit from a bot this repository
 * does not author by hand.
 */
export function relevantCommits(commits) {
  return commits.filter((commit) => commit.parentCount <= 1 && !BOT_AUTHORS.has(commit.authorLogin));
}

/** `checkSubjectLine` on every relevant commit, each error naming the commit it came from. */
export function checkCommits(commits) {
  const errors = [];
  for (const commit of relevantCommits(commits)) {
    const subject = commit.message.split("\n")[0];
    for (const issue of checkSubjectLine(subject)) {
      errors.push(`commit ${commit.sha.slice(0, 7)}: ${issue}`);
    }
  }
  return errors;
}

/**
 * Every line a unified diff adds, with the file it lands in and its line number in the new
 * file. Context and removed lines are not returned: they were not introduced by this diff.
 */
export function addedLines(diffText) {
  const results = [];
  let file = null;
  let newLine = 0;

  for (const raw of diffText.split("\n")) {
    if (raw.startsWith("+++ ")) {
      const path = raw.slice(4).trim();
      file = path === "/dev/null" ? null : path.replace(/^b\//, "");
      continue;
    }
    if (raw.startsWith("@@")) {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      if (hunk) newLine = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith("+")) {
      results.push({ file, line: newLine, text: raw.slice(1) });
      newLine += 1;
      continue;
    }
    if (raw.startsWith("-")) continue; // removed, no line number in the new file
    if (raw.startsWith(" ")) newLine += 1; // context, unchanged
    // anything else ("diff --git", "index ...", "\ No newline at end of file") is metadata
  }

  return results;
}

/** Every added line carrying an em dash, as a teaching sentence naming the file and line. */
export function checkDiffForEmDash(diffText) {
  return addedLines(diffText)
    .filter((entry) => entry.text.includes(EM_DASH))
    .map((entry) => {
      const where = entry.file ? `${entry.file}:${entry.line}` : `line ${entry.line}`;
      return `${where}: added line contains an em dash (U+2014): "${entry.text.trim()}"`;
    });
}

// --- command line ---------------------------------------------------------

const USAGE = `Usage:
  node tools/check-conventions.mjs --subject "<pull request title or commit subject>"
                                   [--author <login, to spare a bot's generated title>]
  node tools/check-conventions.mjs --commits-file <path to JSON array of commits>
  node tools/check-conventions.mjs --diff-file <path to a unified diff>

At least one flag is required; all three can be combined in one call.`;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--subject") args.subject = argv[++i];
    else if (flag === "--author") args.author = argv[++i];
    else if (flag === "--commits-file") args.commitsFile = argv[++i];
    else if (flag === "--diff-file") args.diffFile = argv[++i];
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const errors = [];

  if (args.subject !== undefined) {
    errors.push(...checkSubjectLine(args.subject, args.author)
      .map((issue) => `pull request title ${issue}`));
  }

  if (args.commitsFile) {
    const commits = JSON.parse(readFileSync(args.commitsFile, "utf8"));
    errors.push(...checkCommits(commits));
  }

  if (args.diffFile) {
    errors.push(...checkDiffForEmDash(readFileSync(args.diffFile, "utf8")));
  }

  if (args.subject === undefined && !args.commitsFile && !args.diffFile) {
    console.error(USAGE);
    process.exit(2);
  }

  if (errors.length) {
    console.error("These rules from AGENTS.md and CONTRIBUTING.md are not met:\n");
    for (const error of errors) console.error(`  - ${error}`);
    console.error(`\n${errors.length} issue(s) found.`);
    process.exit(1);
  }

  console.log("All checked conventions pass.");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) main(process.argv.slice(2));
