/**
 * La schematique qu'on produit, relue par le vrai jeu.
 *
 * Un programme de processeur traverse trois formats emboites, et les trois sont ecrits ici.
 * Un aller-retour d'un bout a l'autre ne prouve donc rien : il montre que ce depot est
 * d'accord avec lui-meme, ce qui reste vrai le jour ou il a tort.
 *
 * `bench/data/logique-collee.json` est ce que Mindustry a lu, pour de vrai, dans la
 * schematique fabriquee par `tools/js/logique-collee.mjs` : `Schematics.readBase64`, la
 * meme fonction que la touche coller du jeu. `tools/build_logic_paste.py` le reprend quand
 * le programme d'epreuve change. Ce test refabrique la meme schematique et exige que notre
 * lecteur y trouve exactement ce que le jeu y a trouve.
 *
 * `matches_game_writer` est le champ qui a servi : il compare nos octets a ceux de
 * `LogicBlock.compress`, et il valait faux, parce que l'octet de version d'une
 * configuration de processeur vaut 1 et qu'on ecrivait 0. Les deux se relisaient, des deux
 * cotes, sans que rien ne le signale.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { BLOCK, build, catalogue } from "../../../tools/js/logique-collee.mjs";
import { fromSchematic } from "../../../site/public/forge/logic/program.js";

catalogue();

const seen = JSON.parse(readFileSync(
  new URL("../../../bench/data/logique-collee.json", import.meta.url), "utf8"));

test("le jeu a bien lu la schematique qu'on fabrique", () => {
  assert.ok(!seen.refused, `le jeu l'a refusee : ${seen.refused}`);
  assert.equal(seen.processors.length, 1);
  assert.ok(seen.processors[0].matches_game_writer,
    "nos octets ne sont plus ceux que LogicBlock.compress ecrit");
});

test("on relit ce que le jeu a relu", async () => {
  const pasted = await build().toSchematic({ block: BLOCK, name: "epreuve" });
  const ours = await fromSchematic(pasted);

  assert.equal(ours.length, 1);
  assert.equal(ours[0].block, seen.processors[0].block);
  assert.equal(ours[0].x, seen.processors[0].x);
  assert.equal(ours[0].y, seen.processors[0].y);
  assert.equal(ours[0].code, seen.processors[0].code);
  assert.deepEqual(ours[0].links, seen.processors[0].links);
});

test("le programme d'epreuve est celui que le jeu a vu", () => {
  assert.equal(build().text(), seen.processors[0].code,
    "le programme a change sans que tools/build_logic_paste.py soit relance");
});
