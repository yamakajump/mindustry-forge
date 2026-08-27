/**
 * Aucune phrase de l'editeur ne manque, et aucune ne traine.
 *
 * Les chaines de cet outil sont deja passees par une cle, avant meme que le socle
 * multilingue soit livre, parce qu'une chaine ecrite en dur aujourd'hui est une chaine que
 * personne ne retrouve le jour ou on traduit.
 *
 * Le trou qu'un test comme celui-ci bouche est particulier : la moitie des cles de cet
 * outil ne sont pas ecrites en clair dans le code. Les diagnostics sont construits par
 * `outils.logique.probleme.${cle}`, ou la cle vient de l'analyseur, et rien ne relie les
 * deux au moment de l'ecriture. Un diagnostic ajoute sans sa phrase ne casse pas la page :
 * il affiche `outils.logique.probleme.machin` a un joueur, et seulement a lui.
 *
 * Alors les deux sens sont verifies. Toute cle employee existe, et toute cle qui existe est
 * employee.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { FR } from "../../../site/public/forge/logic/i18n.js";
import { KINDS } from "../../../site/public/forge/logic/editor.js";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const modules = readdirSync(new URL("site/public/forge/logic/", root))
  .filter((name) => name.endsWith(".js"))
  .map((name) => read(`site/public/forge/logic/${name}`));
const page = read("site/public/outils/logique.html");
const sources = [...modules, page].join("\n");

/** Les cles ecrites telles quelles : `t("...")` et `data-i18n="..."`. */
const written = new Set([
  ...sources.matchAll(/\bt\("([\w.-]+)"/g),
  ...sources.matchAll(/data-i18n="([\w.-]+)"/g),
].map((found) => found[1]));

/** Les diagnostics que l'analyseur et la page savent produire, refus du lexeur compris. */
const syntax = read("site/public/forge/logic/syntax.js");
const problems = new Set([
  ...syntax.matchAll(/key: "([\w-]+)"/g),
  ...syntax.matchAll(/fatal: "([\w-]+)"/g),
  ...page.matchAll(/key: "([\w-]+)"/g),
].map((found) => `outils.logique.probleme.${found[1]}`));

/** Les familles de completions que l'editeur sait etiqueter. */
const kinds = new Set(KINDS
  .map((kind) => kind === "monde" ? "instruction" : kind)
  .map((kind) => `outils.logique.completion-${kind}`));

const used = new Set([...written, ...problems, ...kinds]);

test("chaque cle employee a une phrase", () => {
  const absentes = [...used].filter((key) => FR[key] === undefined);
  assert.deepEqual(absentes, [], "des cles sans phrase francaise");
});

test("chaque phrase sert a quelque chose", () => {
  const orphelines = Object.keys(FR).filter((key) => !used.has(key));
  assert.deepEqual(orphelines, [], "des phrases que plus rien n'affiche");
});

test("les cles suivent la convention <domaine>.<ecran>.<element>", () => {
  for (const key of Object.keys(FR)) {
    assert.match(key, /^outils\.logique\.[a-z][\w.-]*$/,
      `${key} sort du domaine outils`);
  }
});

test("aucune phrase ne porte de tiret cadratin", () => {
  for (const [key, line] of Object.entries(FR)) {
    assert.ok(!line.includes("—"), `${key} contient un tiret cadratin`);
  }
});
