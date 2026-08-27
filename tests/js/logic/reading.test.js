/**
 * La ligne du curseur, dite comme un joueur la dirait.
 *
 * `op add result a b` est la forme que le jeu stocke, et c'est le grief que Corentin a
 * resume par « c'est loin du jeu » : le dialogue de logique de Mindustry montre une addition
 * comme trois cases avec un `+` entre elles, et la forme texte est la serialisation que
 * personne n'etait cense lire.
 *
 * Les symboles ne sont pas ecrits ici ni dans le module : `LogicOp` porte le symbole a cote
 * du nom et choisit une lambda a un ou deux arguments, donc le generateur sort les deux du
 * bytecode. Ce que ces tests tiennent, c'est la mise en forme, et surtout les deux endroits
 * ou une mise en forme naive se trompe.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { useCatalogue } from "../../../site/public/forge/logic/catalogue.js";
import { parse } from "../../../site/public/forge/logic/syntax.js";
import { readingOf } from "../../../site/public/forge/logic/reading.js";

const catalogue = useCatalogue(JSON.parse(readFileSync(
  new URL("../../../site/public/forge/logic/instructions.json", import.meta.url), "utf8")));

/** La lecture de la premiere instruction d'un programme. */
const lecture = (code) => readingOf(parse(`${code}\n`).statements[0]);

test("le jeu porte le symbole et l'arite de chaque operateur", () => {
  const ops = catalogue.enums.get("LogicOp").values;
  assert.equal(ops.filter((one) => one.symbol).length, ops.length,
    "un operateur sans symbole viendrait d'une extraction cassee, pas du jeu");
  assert.ok(ops.some((one) => one.unary), "seize d'entre eux sont unaires");
});

test("une operation se lit avec son signe au milieu", () => {
  assert.equal(lecture("op add total a b"), "total = a + b");
  assert.equal(lecture("op idiv q a b"), "q = a // b");
  assert.equal(lecture("op lessThan petit a b"), "petit = a < b");
});

test("une operation a un seul cote se lit comme une fonction", () => {
  assert.equal(lecture("op abs r x"), "r = abs(x)");
  assert.equal(lecture("op sqrt r x"), "r = sqrt(x)");
});

test("une operation a deux cotes sans signe aussi", () => {
  /* Le piege. `angle` prend deux operandes et n'a pas de forme infixe : son symbole est son
     propre nom. Mise entre les operandes, elle donnait `angle = y angle x`. Rien ici ne
     liste les exceptions, c'est le jeu qui les distingue en donnant aux autres un symbole
     qui n'est pas leur nom. */
  assert.equal(lecture("op angle a y x"), "a = angle(y, x)");
  assert.equal(lecture("op max m a b"), "m = max(a, b)");
});

test("une ancienne orthographe se lit comme celle qui l'a remplacee", () => {
  assert.equal(lecture("op atan2 a y x"), "a = angle(y, x)");
  assert.equal(lecture("op dst d x y"), "d = len(x, y)");
});

test("un saut dit sa condition avant sa cible", () => {
  assert.equal(lecture("jump 4 lessThan i 10"), "si i < 10, aller a 4");
  assert.equal(lecture("jump boucle greaterThanEq a b"), "si a >= b, aller a boucle");
});

test("un saut inconditionnel ne parle pas de ses operandes inutilisees", () => {
  /* Le jeu ecrit `jump 0 always x false` : les deux dernieres ne servent a rien, et les
     repeter dirait que le saut en depend. */
  assert.equal(lecture("jump 0 always x false"), "aller a 0");
});

test("les acces se lisent comme des acces", () => {
  assert.equal(lecture("sensor n vault1 @totalItems"), "n = vault1.@totalItems");
  assert.equal(lecture("read v cell1 3"), "v = cell1[3]");
  assert.equal(lecture("write v cell1 3"), "cell1[3] = v");
  assert.equal(lecture("control enabled conveyor1 1 0 0 0"), "conveyor1.enabled = 1");
});

test("ce qui se lit deja tout seul ne recoit rien", () => {
  /* Une lecture qui ne fait que repeter la ligne est du bruit dans une bande qui doit
     gagner sa hauteur. */
  assert.equal(lecture('print "coucou"'), null);
  assert.equal(lecture("end"), null);
  assert.equal(lecture("printflush message1"), null);
});

test("une ligne que le jeu ne lira pas ne se lit pas non plus", () => {
  /* Une instruction inconnue, une valeur absente d'une liste : le jeu en fait un noop, et
     en donner une lecture propre lui donnerait l'air de marcher. */
  assert.equal(lecture("op pasunop r a b"), null);
  assert.equal(lecture("tourner 3"), null);
  assert.equal(lecture("setrate 10"), null);
});

test("un commentaire et une etiquette n'ont pas de lecture", () => {
  assert.equal(readingOf(parse("# rien\n").statements[0]), null);
  assert.equal(readingOf(parse("boucle:\n").statements[0]), null);
});
