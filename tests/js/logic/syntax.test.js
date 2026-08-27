/**
 * Ce que l'oracle ne peut pas dire.
 *
 * `oracle.test.js` tient l'analyseur contre le jeu : memes instructions, memes noops, memes
 * refus. Mais le jeu ne previent de rien, et c'est tout l'interet de l'outil. Il ne dit pas
 * « ce saut vise une ligne qui n'existe pas », il saute et le programme s'arrete ; il ne dit
 * pas « cell1 n'est relie a rien », il lit null.
 *
 * Ces avertissements-la sont a nous, donc ils sont testes ici, un par un, avec le cas ou ils
 * ne doivent surtout pas se declencher juste a cote. Un avertissement qui crie sur du code
 * correct est un avertissement qu'on eteint, et on eteint la colonne entiere avec.
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
  assert.deepEqual(keys("end\njump 9 always\n"), ["saut-hors-programme"]);
  assert.deepEqual(keys("end\njump 0 always\n"), []);
});

test("une instruction du monde est signalee, meme si elle existe", () => {
  const problems = parse("setrate 10\n").problems;
  assert.deepEqual(problems.map((p) => p.key), ["instruction-monde"]);
  assert.equal(problems[0].params.nom, "setrate");
});

test("les anciennes orthographes du jeu passent sans un mot", () => {
  assert.deepEqual(keys("op atan2 r a b\nop dst d x y\n"), []);
  assert.deepEqual(keys("control configure sorter1 @copper 0 0 0\n",
    { links: [{ name: "sorter1", dx: 1, dy: 0 }] }), []);
});

test("un nom qui ressemble a un lien absent est signale", () => {
  assert.deepEqual(keys("print cell1\n"), ["lien-inconnu"]);
  assert.deepEqual(keys("print cell1\n", { links: [{ name: "cell1", dx: 0, dy: 1 }] }), []);
});

test("un nom que le programme ecrit lui-meme n'est pas un lien oublie", () => {
  /* `getlink` remplit `bloc1` : c'est une variable qui contient un batiment, pas un lien.
     Sans cette exception l'outil crierait sur la facon idiomatique de parcourir ses liens. */
  assert.deepEqual(keys("getlink bloc1 0\nprint bloc1\n"), []);
});

test("le resultat d'un op est sa deuxieme operande, pas la premiere", () => {
  const report = parse("op add total1 a b\nprint total1\n");
  assert.ok(report.variables.has("total1"));
  assert.deepEqual(report.problems.map((p) => p.key), []);
});

test("les operandes en trop sont comptees", () => {
  const problems = parse("set x 1 2 3\n").problems;
  assert.deepEqual(problems.map((p) => p.key), ["operandes-en-trop"]);
  assert.equal(problems[0].params.compte, 2);
});

test("un programme plus gros que ce que le jeu accepte est refuse ici aussi", () => {
  const long = `print "${"a".repeat(200)}"\n`.repeat(600);
  assert.ok(long.length > catalogue.limits.code_bytes);
  assert.ok(keys(long).includes("programme-trop-long"));
});

test("trop de liens est signale sans qu'il faille les taper", () => {
  const links = Array.from({ length: catalogue.limits.links + 1 },
    (whole, index) => ({ name: `cell${index}`, dx: 0, dy: 0 }));
  assert.ok(keys("end\n", { links }).includes("liens-trop"));
});

test("un guillemet ouvert refuse le programme sans effacer le reste", () => {
  const report = parse('set x 1\nprint "jamais referme\n');
  assert.ok(refused(report));
  /* La ligne d'avant garde ses couleurs : un editeur qui devient aveugle pendant qu'on
     tape une chaine est un editeur qu'on regarde devenir aveugle a chaque chaine. */
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
