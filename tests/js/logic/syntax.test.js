/**
 * What the oracle cannot say.
 *
 * `oracle.test.js` holds the parser against the game: same instructions, same noops, same
 * refusals. But the game warns about nothing, and that is the whole point of the tool. It
 * does not say "this jump aims at a line that does not exist", it jumps and the program
 * stops; it does not say "cell1 is linked to nothing", it reads null.
 *
 * Those warnings are ours, so they are tested here one by one, each next to the case where
 * it must not fire. A warning that shouts at correct code is a warning people switch off,
 * and they switch off the whole column with it.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { useCatalogue } from "../../../site/public/forge/logic/catalogue.js";
import { parse, tokenize, refused } from "../../../site/public/forge/logic/syntax.js";

const catalogue = useCatalogue(JSON.parse(readFileSync(
  new URL("../../../site/public/forge/logic/instructions.json", import.meta.url), "utf8")));

const keys = (text, options) => parse(text, options).problems.map((p) => p.key);

test("un programme correct ne dit rien", () => {
  const text = "set x 1\nop add x x 2\nprint x\nprintflush message1\n";
  assert.deepEqual(keys(text, { links: [{ name: "message1", dx: 1, dy: 0 }] }), []);
});

test("les mots peints portent leur nature", () => {
  const report = parse('set x 1\nprint "salut"\nsensor n vault1 @totalItems\n',
    { links: [{ name: "vault1", dx: 0, dy: 1 }] });
  const kinds = report.lines.flatMap((line) => line.tokens.map((token) => token.kind));
  assert.deepEqual(kinds, ["instruction", "variable", "nombre",
                           "instruction", "chaine",
                           "instruction", "variable", "lien", "propriete"]);
});

test("un commentaire et une etiquette ne sont pas des instructions", () => {
  const report = parse("# rien\nboucle:\nend\n");
  assert.equal(report.statements.length, 1);
  assert.deepEqual([...report.labels.keys()], ["boucle"]);
  assert.equal(report.lines[0].tokens[0].kind, "commentaire");
  assert.equal(report.lines[1].tokens[0].kind, "etiquette");
});

test("un saut hors du programme est signale, un saut dedans non", () => {
  assert.deepEqual(keys("end\njump 9 always\n"), ["outils.logique.probleme.saut-hors-programme"]);
  assert.deepEqual(keys("end\njump 0 always\n"), []);
});

test("une instruction du monde est signalee, meme si elle existe", () => {
  const problems = parse("setrate 10\n").problems;
  assert.deepEqual(problems.map((p) => p.key), ["outils.logique.probleme.instruction-monde"]);
  assert.equal(problems[0].params.nom, "setrate");
});

test("les anciennes orthographes du jeu passent sans un mot", () => {
  assert.deepEqual(keys("op atan2 r a b\nop dst d x y\n"), []);
  assert.deepEqual(keys("control configure sorter1 @copper 0 0 0\n",
    { links: [{ name: "sorter1", dx: 1, dy: 0 }] }), []);
});

test("un nom qui ressemble a un lien absent est signale, quand il y a des liens", () => {
  assert.deepEqual(keys("print cell1\n", { links: [{ name: "cell2", dx: 0, dy: 1 }] }),
    ["outils.logique.probleme.lien-inconnu"]);
  assert.deepEqual(keys("print cell1\n", { links: [{ name: "cell1", dx: 0, dy: 1 }] }), []);
});

test("et pas du tout quand le processeur n'a ete relie a rien", () => {
  /* Un programme ecrit pour etre colle dans un processeur qui existe deja dans le jeu ne
     declare aucun lien ici, et il n'en a aucun a declarer : le cablage a ete fait dans le
     jeu, en cliquant. Avertir alors mettrait un trait sous chaque nom de bloc du programme
     sans rien dire de vrai sur aucun, ce qui est la facon dont une colonne entiere
     d'avertissements se fait eteindre. */
  assert.deepEqual(keys("print cell1\nprint vault1\ncontrol enabled conveyor1 1 0 0 0\n"), []);
});

test("un nom que le programme ecrit lui-meme n'est pas un lien oublie", () => {
  /* `getlink` fills `bloc1`: a variable holding a building, not a link. Without this
     exception the tool would shout at the idiomatic way of walking your own links. */
  assert.deepEqual(keys("getlink bloc1 0\nprint bloc1\n"), []);
});

test("le resultat d'un op est sa deuxieme operande, pas la premiere", () => {
  const report = parse("op add total1 a b\nprint total1\n");
  assert.ok(report.variables.has("total1"));
  assert.deepEqual(report.problems.map((p) => p.key), []);
});

test("les operandes en trop sont comptees", () => {
  const problems = parse("set x 1 2 3\n").problems;
  assert.deepEqual(problems.map((p) => p.key), ["outils.logique.probleme.operandes-en-trop"]);
  assert.equal(problems[0].params.compte, 2);
});

test("un programme plus gros que ce que le jeu accepte est refuse ici aussi", () => {
  const long = `print "${"a".repeat(200)}"\n`.repeat(600);
  assert.ok(long.length > catalogue.limits.code_bytes);
  assert.ok(keys(long).includes("outils.logique.probleme.programme-trop-long"));
});

test("trop de liens est signale sans qu'il faille les taper", () => {
  const links = Array.from({ length: catalogue.limits.links + 1 },
    (whole, index) => ({ name: `cell${index}`, dx: 0, dy: 0 }));
  assert.ok(keys("end\n", { links }).includes("outils.logique.probleme.liens-trop"));
});

test("un guillemet ouvert refuse le programme sans effacer le reste", () => {
  const report = parse('set x 1\nprint "jamais referme\n');
  assert.ok(refused(report));
  /* The line before keeps its colours: an editor that goes blind while a string is being
     typed is an editor you watch go blind on every string. */
  assert.equal(report.lines[0].tokens[0].kind, "instruction");
  assert.equal(report.statements.length, 1);
});

test("une espace manquante apres une chaine refuse le programme", () => {
  assert.ok(refused(parse('print "a"b\n')));
});

test("le point-virgule separe deux instructions sur une ligne", () => {
  const report = parse("set a 1; set b 2\n");
  assert.equal(report.statements.length, 2);
  assert.equal(report.statements[1].at, 1);
});

test("un diese dans une chaine reste dans la chaine", () => {
  const { lines } = tokenize('print "un # dedans"\n');
  assert.deepEqual(lines[0].tokens.map((token) => token.kind), ["operande", "chaine"]);
});
