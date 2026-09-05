/**
 * What the mark chips put in the page, which is what the engine reads back.
 *
 * The analyser asks the player what arrives on a belt and offers a row of chips. The chip
 * carries the answer in `data-resource`, and the click handler copies that attribute
 * straight into the mark, where the engine looks it up in the catalogue. The catalogue is
 * keyed by the game's identifiers, so the attribute has to hold `titanium` even though the
 * button reads « Titane ».
 *
 * It held « Titane ». Nothing threw: the mark was stored, the picture drew a ring, and the
 * lookup simply found nothing, so the marked intake fed nothing and the report went on
 * saying the schematic was short of what had just been marked. The only visible trace was
 * that the chip did not stay selected, which reads as a click that missed.
 *
 * It bit exactly where the player had a choice to make. One offer and the mark is filled
 * from the offer itself, with the identifier, which is the path a belt takes; a turret
 * offers every kind of ammunition it takes, so a turret always took the broken path.
 *
 * Checked on the source because that is where the bug lives: the handler is inline in
 * `index.html`, there is no module to import, and the two halves of this are eight hundred
 * lines apart. A test that reads the file is the only one that sees them together.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PAGE = readFileSync(
  fileURLToPath(new URL("../../site/public/index.html", import.meta.url)), "utf8");

test("a mark chip carries the identifier, not the name it shows", () => {
  const attribute = PAGE.match(/data-resource="\$\{([^}]*)\}/);
  assert.ok(attribute, "the mark chips no longer carry data-resource");

  assert.doesNotMatch(attribute[1], /lisible|nameOf/,
    "data-resource holds a translated name; the engine looks it up by identifier");
});

test("the chip still shows the name a player reads", () => {
  // The other half of the same line, and the reason the mistake was easy to make: the
  // attribute and the label come from one expression and must not be the same value.
  assert.match(PAGE, /data-resource="[^"]*"[^]{0,120}?lisible\(resource\)/,
    "the mark chips no longer show a readable name");
});

test("the click handler reads the mark back out of that attribute", () => {
  // If this ever stops being true, the test above is guarding nothing.
  assert.match(PAGE, /resource:\s*button\.dataset\.resource/,
    "the handler no longer takes the mark from data-resource");
});
