/**
 * The line the player is on, said the way they would say it.
 *
 * `op add result a b` is how the game stores an addition, and nobody reads it at a glance.
 * `result = a + b` is the same line and everybody does. That gap is most of what "it is far
 * from the game" means for a player looking at this editor: the game's own logic dialog
 * shows an addition as three boxes with a `+` between them, and the text form is the
 * serialisation nobody was meant to read.
 *
 * The symbols are not written here. `LogicOp` carries the symbol beside the name and picks a
 * one or two argument lambda, so `tools/build_logic_catalogue.py` takes both out of the
 * bytecode: forty-five operators, and which sixteen of them are unary. A table typed here
 * would be right until the version that adds the forty-sixth.
 *
 * **This is presentation and nothing else.** Nothing in this file decides whether a program
 * is valid, and nothing it returns goes into a file. When it cannot say a line plainly it
 * returns nothing, and the line stands as it is, which is always correct.
 */

import { catalogueOf, resolved } from "./catalogue.js";

/** The symbol and arity the game gives an operator, or nothing if it names none. */
function operator(list, name) {
  return catalogueOf().enums.get(list)?.values.find((value) => value.name === resolved(name));
}

/**
 * A statement, read aloud, or null when plain text would not be clearer than the line.
 *
 * The seven instructions here are the ones whose stored form hides their meaning: an
 * operator written before its operands, a jump whose condition sits after its target, a
 * memory cell addressed by three words in a row. `print x` is already `print x` and gets
 * nothing, because a reading that only repeats the line is noise in a strip that has to
 * earn its height.
 */
export function readingOf(entry) {
  if (!entry?.instruction || entry.noop) return null;

  const word = (at) => entry.tokens[at]?.text ?? "";
  const [, ...operands] = entry.tokens;
  if (!operands.length) return null;

  switch (entry.name) {
    case "op": {
      const how = operator("LogicOp", word(1));
      if (!how) return null;
      if (how.unary) return `${word(2)} = ${how.name}(${word(3)})`;

      /* An operator whose symbol is its own name has no infix form: `angle`, `len`, `max`,
         `noise` take two sides and are written in front of them. Put between the operands
         they read as nonsense, and `op atan2 angle y x` did exactly that, coming out as
         `angle = y angle x`. The game states which is which by giving the others a symbol
         that is not their name, so nothing here needs a list of the exceptions. */
      return how.symbol === how.name
        ? `${word(2)} = ${how.name}(${word(3)}, ${word(4)})`
        : `${word(2)} = ${word(3)} ${how.symbol} ${word(4)}`;
    }

    case "set":
      return `${word(1)} = ${word(2)}`;

    case "jump": {
      const how = operator("ConditionOp", word(2));
      if (!how) return null;
      /* `always` is not a comparison and reads as one if it is given a symbol: the game
         writes the two unused operands out anyway, and repeating them would say that the
         jump depends on them. */
      return how.name === "always"
        ? `aller a ${word(1)}`
        : `si ${word(3)} ${how.symbol} ${word(4)}, aller a ${word(1)}`;
    }

    case "sensor":
      return `${word(1)} = ${word(2)}.${word(3)}`;

    case "read":
      return `${word(1)} = ${word(2)}[${word(3)}]`;

    case "write":
      return `${word(2)}[${word(3)}] = ${word(1)}`;

    case "control":
      return `${word(2)}.${word(1)} = ${word(3)}`;

    default:
      return null;
  }
}
