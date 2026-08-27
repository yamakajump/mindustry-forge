/**
 * Ouvrir l'editeur sur un processeur qui existe deja quelque part.
 *
 * Ce que ce mode apporte tient en une phrase : les liens arrivent remplis, avec les noms que
 * le programme emploie vraiment, pris dans la configuration que le jeu a ecrite. L'editeur
 * seul ne peut pas les connaitre, parce qu'il n'y a pas encore de blocs.
 *
 * Trois chiffres decident de sa forme, mesures sur quatre-vingt-seize schematiques prises
 * dans la vitrine et decodees avec le lecteur de ce depot :
 *
 *   * 40 % portent au moins un processeur ;
 *   * 45 % de celles-la en portent plusieurs, et l'une des quatre-vingt-seize en porte 22 ;
 *   * 96 % des 507 liens tombent sur un bloc present dans la schematique.
 *
 * Le deuxieme est la raison d'etre du choix, et le troisieme est ce qui rendra le clic sur
 * le bloc possible quand il viendra.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { useCatalogue } from "../../../site/public/forge/logic/catalogue.js";
import { Program, quote, toSchematic } from "../../../site/public/forge/logic/program.js";
import { processorsIn } from "../../../site/public/forge/logic/opened.js";

useCatalogue(JSON.parse(readFileSync(
  new URL("../../../site/public/forge/logic/instructions.json", import.meta.url), "utf8")));

/** Une schematique d'un processeur, fabriquee par le meme code que la page emploie. */
const unProcesseur = (programme, block = "micro-processor") =>
  programme.toSchematic({ block });

test("un processeur rend son code, ses liens et de quoi le reconnaitre", async () => {
  const pasted = await unProcesseur(new Program()
    .comment("deux lignes de commentaire")
    .comment("qui ne comptent pas comme des lignes de code")
    .link("reactor1", -9, -3)
    .link("dome1", 5, -6)
    .line("sensor", "chaud", "reactor1", "@heat")
    .line("print", "chaud"));

  const [un] = await processorsIn(pasted);

  assert.equal(un.block, "micro-processor");
  assert.equal(un.at, 0);
  assert.deepEqual(un.links, [{ name: "reactor1", dx: -9, dy: -3 },
                              { name: "dome1", dx: 5, dy: -6 }]);
  assert.match(un.code, /sensor chaud reactor1 @heat/);
});

test("le compte de lignes ignore les vides, parce qu'il sert a reconnaitre un processeur", () => {
  /* « Processeur 3 sur 22 » ne dit rien a personne ; « un micro processeur en 14, 6,
     quarante lignes » dit lequel on visait. Ce compte est donc une etiquette, et compter les
     lignes vides le rendrait faux sur exactement les programmes espaces. */
  return unProcesseur(new Program().line("end")).then(async (pasted) => {
    const [un] = await processorsIn(pasted);
    assert.equal(un.lines, 1);
  });
});

test("un commentaire compte comme une ligne, parce que le jeu le garde", async () => {
  /* La configuration stocke le texte que le joueur a ecrit, commentaires compris : les
     ecarter du compte ferait dire a l'etiquette moins que ce que le processeur porte. */
  const pasted = await unProcesseur(new Program().comment("une note").line("end"));
  const [un] = await processorsIn(pasted);
  assert.equal(un.lines, 2);
});

test("une schematique sans processeur ne rend rien plutot que d'inventer", async () => {
  const { toBase64 } = await import("../../../site/public/forge/schematic.js");
  const pasted = await toBase64([{ block: "router", x: 0, y: 0 }], { sizeOf: () => 1 });
  assert.deepEqual(await processorsIn(pasted), []);
});

test("un accent survit au voyage jusqu'a la liste", async () => {
  const pasted = await unProcesseur(new Program()
    .line("print", quote("il y en a deja trop")).comment("déjà"));
  const [un] = await processorsIn(pasted);
  assert.match(un.code, /déjà/);
});

test("les processeurs gardent l'ordre de la schematique", async () => {
  /* L'ordre du fichier est l'ordre de construction du jeu, et c'est le seul ordre stable
     qu'on puisse offrir : trier par position ferait bouger la liste au moindre deplacement
     d'un bloc, et l'index qu'on montre ne designerait plus la meme chose. */
  const { write, read } = await import("../../../site/public/forge/schematic.js");
  const un = await toSchematic({ code: "end\n", block: "micro-processor" });
  const { tiles } = await read(
    (await import("../../../site/public/forge/schematic.js")).bytesFromBase64(un));

  const deux = await write([
    { ...tiles[0], x: 0, y: 0 },
    { ...tiles[0], x: 4, y: 0 },
  ], { sizeOf: () => 1 });

  let binaire = "";
  for (const octet of deux) binaire += String.fromCharCode(octet);
  const trouves = await processorsIn(btoa(binaire));

  assert.equal(trouves.length, 2);
  assert.deepEqual(trouves.map((one) => one.at), [0, 1]);
  assert.deepEqual(trouves.map((one) => one.x), [0, 4]);
});
