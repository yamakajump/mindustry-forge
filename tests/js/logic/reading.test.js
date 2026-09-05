/**
 * The cursor's line, said the way a player would say it.
 *
 * `op add result a b` is the form the game stores, and it is the complaint Corentin summed
 * up as "it's far from the game": Mindustry's logic dialog shows an addition as three boxes
 * with a `+` between them, and the text form is the serialization nobody was ever meant to
 * read.
 *
 * The symbols are not written here nor in the module: `LogicOp` carries the symbol next to
 * the name and picks a lambda of one or two arguments, so the generator pulls both out of
 * the bytecode. What these tests hold is the formatting, and above all the two places where
 * a naive formatting gets it wrong.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { useCatalogue } from "../../../site/public/forge/logic/catalogue.js";
import { parse } from "../../../site/public/forge/logic/syntax.js";
import { readingOf } from "../../../site/public/forge/logic/reading.js";

const catalogue = useCatalogue(JSON.parse(readFileSync(
  new URL("../../../site/public/forge/logic/instructions.json", import.meta.url), "utf8")));

/** The reading of a program's first instruction. */
const lecture = (code) => readingOf(parse(`${code}\n`).statements[0]);

test("the game carries the symbol and arity of each operator", () => {
  const ops = catalogue.enums.get("LogicOp").values;
  assert.equal(ops.filter((one) => one.symbol).length, ops.length,
    "an operator without a symbol would come from a broken extraction, not from the game");
  assert.ok(ops.some((one) => one.unary), "sixteen of them are unary");
});

test("an operation reads with its sign in the middle", () => {
  assert.equal(lecture("op add total a b"), "total = a + b");
  assert.equal(lecture("op idiv q a b"), "q = a // b");
  assert.equal(lecture("op lessThan petit a b"), "petit = a < b");
});

test("an operation with one side reads like a function", () => {
  assert.equal(lecture("op abs r x"), "r = abs(x)");
  assert.equal(lecture("op sqrt r x"), "r = sqrt(x)");
});

test("an operation with two sides but no sign, too", () => {
  /* The trap. `angle` takes two operands and has no infix form: its symbol is its own name.
     Placed between the operands, it gave `angle = y angle x`. Nothing here lists the
     exceptions; it is the game that sets them apart by giving the others a symbol that is
     not their name. */
  assert.equal(lecture("op angle a y x"), "a = angle(y, x)");
  assert.equal(lecture("op max m a b"), "m = max(a, b)");
});

test("an old spelling reads like the one that replaced it", () => {
  assert.equal(lecture("op atan2 a y x"), "a = angle(y, x)");
  assert.equal(lecture("op dst d x y"), "d = len(x, y)");
});

test("a jump states its condition before its target", () => {
  assert.equal(lecture("jump 4 lessThan i 10"), "si i < 10, aller à 4");
  assert.equal(lecture("jump boucle greaterThanEq a b"), "si a >= b, aller à boucle");
});

test("an unconditional jump does not mention its unused operands", () => {
  /* The game writes `jump 0 always x false`: the last two serve no purpose, and repeating
     them would suggest the jump depends on them. */
  assert.equal(lecture("jump 0 always x false"), "aller à 0");
});

test("accesses read like accesses", () => {
  assert.equal(lecture("sensor n vault1 @totalItems"), "n = vault1.@totalItems");
  assert.equal(lecture("read v cell1 3"), "v = cell1[3]");
  assert.equal(lecture("write v cell1 3"), "cell1[3] = v");
  assert.equal(lecture("control enabled conveyor1 1 0 0 0"), "conveyor1.enabled = 1");
});

test("what already reads itself gets nothing added", () => {
  /* A reading that only repeats the line is noise in a strip that has to earn its height. */
  assert.equal(lecture('print "coucou"'), null);
  assert.equal(lecture("end"), null);
  assert.equal(lecture("printflush message1"), null);
});

test("a line the game will not read does not get read either", () => {
  /* An unknown instruction, a value missing from a list: the game turns it into a noop, and
     giving it a clean reading would make it look like it works. */
  assert.equal(lecture("op pasunop r a b"), null);
  assert.equal(lecture("tourner 3"), null);
  assert.equal(lecture("setrate 10"), null);
});

test("a comment and a label have no reading", () => {
  assert.equal(readingOf(parse("# rien\n").statements[0]), null);
  assert.equal(readingOf(parse("boucle:\n").statements[0]), null);
});
