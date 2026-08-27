/**
 * La schematique qu'on donne au jeu pour lui demander ce qu'il en lit.
 *
 * Un seul programme, ecrit une fois, et deux lecteurs : `tools/build_logic_paste.py` le
 * fabrique et le passe a Mindustry, et `tests/js/logic/collee.test.js` le refabrique et le
 * compare a ce que le jeu en a dit. Ecrit ici plutot que dans les deux, parce que deux
 * copies d'un programme d'epreuve finissent par prouver deux choses differentes.
 *
 * Il vise les coins qui font perdre du temps : un commentaire, une etiquette, une chaine
 * avec des espaces, un lien negatif dans les deux directions, un saut par nom.
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

/** Le programme d'epreuve, tel quel. */
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

/* Lance directement plutot qu'importe. `pathToFileURL` plutot qu'un `file://`
   assemble a la main : sous Windows le chemin devient `file:///C:/...`, la comparaison
   tombait a faux et le script sortait sans rien ecrire, en silence et en code 0. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  catalogue();
  process.stdout.write(await build().toSchematic({ block: BLOCK, name: "epreuve" }));
}
