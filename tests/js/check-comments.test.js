/**
 * The mechanical check behind the half of the language rule nothing enforced.
 *
 * `AGENTS.md` says everything a contributor reads is in English. The translation-key tests
 * already hold the other half, that everything a player reads stays French. This one holds
 * the comments, and it holds them by extracting comments properly rather than by grepping
 * line prefixes: the tests below are mostly about that difference, because a grep reports a
 * URL as a comment and misses four lines out of five of a block.
 *
 * The scoring is a count of function words. It is tested at its boundaries rather than in
 * the middle, since a threshold nobody probes is a threshold nobody knows the position of.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { commentsOf, grammarOf } from "../../tools/comments.mjs";
import {
  englishScore, frenchComments, frenchScore, readsFrench,
} from "../../tools/check-comments.mjs";

test("a slash inside a URL does not open a comment", () => {
  const source = 'const home = "https://mindustryforge.com/schemas";\n';
  assert.deepEqual(commentsOf(source, grammarOf("a.js")), []);
});

test("a slash-star inside a string does not open a comment", () => {
  const source = 'const glob = "src/**/*.js"; // the pattern\n';
  const found = commentsOf(source, grammarOf("a.js"));
  assert.equal(found.length, 1);
  assert.equal(found[0].text.trim(), "the pattern");
});

test("a block comment is returned whole, not one line of it", () => {
  const source = "/* one\n   two\n   three */\nconst a = 1;\n";
  const found = commentsOf(source, grammarOf("a.js"));
  assert.equal(found.length, 1);
  assert.match(found[0].text, /one[\s\S]*two[\s\S]*three/);
});

test("a comment reports the line it starts on", () => {
  const source = "const a = 1;\nconst b = 2;\n// here\n";
  assert.equal(commentsOf(source, grammarOf("a.js"))[0].line, 3);
});

test("in a page, // is a comment inside a script and not outside it", () => {
  const source = '<a href="https://x.example/y">z</a>\n<script>\n// real\n</script>\n';
  const found = commentsOf(source, grammarOf("page.html"));
  assert.equal(found.length, 1);
  assert.equal(found[0].text.trim(), "real");
});

test("a Blade comment is found, and its markup is not", () => {
  const source = "{{-- why --}}\n<p>{{ $name }}</p>\n";
  const found = commentsOf(source, grammarOf("view.blade.php"));
  assert.equal(found.length, 1);
  assert.equal(found[0].text.trim(), "why");
});

test("a hash comment is a comment in YAML and not in JavaScript", () => {
  assert.equal(commentsOf("# why\nkey: value\n", grammarOf("a.yml")).length, 1);
  assert.equal(commentsOf("# why\n", grammarOf("a.js")).length, 0);
});

test("French and English function words are counted apart", () => {
  assert.ok(frenchScore("ce qui est dans une usine") >= 4);
  assert.equal(frenchScore("what the engine does with it"), 0);
  assert.ok(englishScore("what the engine does with it") >= 4);
});

test("a French comment is reported and an English one is not", () => {
  assert.equal(readsFrench("Ce qui est dans une usine, et pourquoi cela compte ainsi"), true);
  assert.equal(readsFrench("What the engine does with it, and why that matters here"), false);
});

test("an English comment quoting a French label is not reported", () => {
  const quoting = 'The button says "Les miennes" so that a reader finds it on the page.';
  assert.equal(readsFrench(quoting), false);
});

test("a file the check does not know is skipped rather than guessed at", () => {
  assert.equal(grammarOf("notes.md"), null);
  assert.deepEqual(frenchComments("notes.md", "Ce qui est dans une usine, et pourquoi"), []);
});

test("a French comment in a real file shape is reported with its line", () => {
  const source = "const a = 1;\n/* Ce qui est dans une usine, et pourquoi cela compte ainsi. */\n";
  const found = frenchComments("a.js", source);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 2);
  assert.equal(found[0].path, "a.js");
});
