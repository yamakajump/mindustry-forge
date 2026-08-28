/**
 * The check that an issue template cannot ask for a label that does not exist.
 *
 * The defect it answers was silent in both directions: GitHub applies nothing when a
 * template names an unknown label, and reports nothing either, so `feature.yml` asked for
 * `idea` and `measurement.yml` for `measurement` for as long as they existed and every
 * issue opened through them arrived bare.
 *
 * The parsing is tested rather than the command, because the command's only other job is
 * reading a file the workflow writes with `gh label list`.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { labelsDeclared, missingFrom } from "../../tools/check-labels.mjs";

test("the labels line is read, whichever quotes it uses", () => {
  assert.deepEqual(labelsDeclared('name: A\nlabels: ["bug"]\n'), ["bug"]);
  assert.deepEqual(labelsDeclared("labels: ['bug', 'idea']\n"), ["bug", "idea"]);
});

test("a template with no labels line asks for nothing", () => {
  assert.deepEqual(labelsDeclared("name: A\ndescription: B\n"), []);
});

test("a labels word inside the body is not the labels line", () => {
  const yaml = 'name: A\nbody:\n  - type: markdown\n    value: labels: ["nope"]\n';
  assert.deepEqual(labelsDeclared(yaml), []);
});

test("a label that exists is not reported, one that does not is", () => {
  assert.deepEqual(missingFrom(["bug"], ["bug", "enhancement"]), []);
  assert.deepEqual(missingFrom(["bug", "idea"], ["bug", "enhancement"]), ["idea"]);
});

test("the comparison is exact, because GitHub's is", () => {
  assert.deepEqual(missingFrom(["Bug"], ["bug"]), ["Bug"]);
  assert.deepEqual(missingFrom(["good first issue"], ["good-first-issue"]), ["good first issue"]);
});
