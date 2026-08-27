/**
 * The schematic handed to the game so it can be asked what it reads in it.
 *
 * One program, written once, with two readers: `tools/build_logic_paste.py` builds it and
 * passes it to Mindustry, and `tests/js/logic/collee.test.js` rebuilds it and compares it to
 * what the game said. Written here rather than in both, because two copies of a trial
 * program end up proving two different things.
 *
 * It aims at the corners that cost time: a comment, a label, a string with spaces in it, a
 * link negative on both axes, and a jump by name.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { useCatalogue } from "../../site/public/forge/logic/catalogue.js";
import { Program, quote } from "../../site/public/forge/logic/program.js";

export const BLOCK = "logic-processor";

export function catalogue() {
  return useCatalogue(JSON.parse(readFileSync(
    new URL("../../site/public/forge/logic/instructions.json", import.meta.url), "utf8")));
}

/** The trial program, as it stands. */
export function build() {
  return new Program()
    .comment("lit une cellule et l'affiche")
    .link("cell1", 1, 0)
    .link("message1", -2, -3)
    .label("boucle")
    .line("read", "valeur", "cell1", 0)
    .line("print", quote("il y en a : "))
    .line("print", "valeur")
    .line("printflush", "message1")
    .line("wait", 0.5)
    .line("jump", "boucle", "always");
}

/* Run directly rather than imported. `pathToFileURL` rather than a hand-assembled
   `file://`: on Windows the path becomes `file:///C:/...`, the comparison read false, and
   the script exited without writing anything, silently and with status 0. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  catalogue();
  process.stdout.write(await build().toSchematic({ block: BLOCK, name: "epreuve" }));
}
