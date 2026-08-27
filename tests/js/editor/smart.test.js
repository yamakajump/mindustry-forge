/**
 * Ce que le jeu décide à la place du joueur quand il trace une ligne.
 *
 * Les deux mécaniques qui font qu'on trace à travers son usine sans y penser : la jonction
 * au croisement, et le pont qui franchit un obstacle tout seul. Transcrites de
 * `Conveyor.getReplacement` et `Placement.smartCalculateBridges` de la v159.7.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { blockerOf, isSidePlace, withBridges, withJunctions }
  from "../../../site/public/forge/editor/smart.js";
import { createBoard } from "../../../site/public/forge/editor/state.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const sizeOf = (name) => known.blocks[name]?.size || 1;
const board = (tiles = [], ground = {}) => createBoard({ tiles, ground, sizeOf });
const bande = (x, y, rotation = 0) => ({ x, y, block: "conveyor", rotation });
const ligne = (from, to, y = 0, rotation = 0) => {
  const out = [];
  for (let x = from; x <= to; x++) out.push(bande(x, y, rotation));
  return out;
};

/* --- La jonction au croisement -------------------------------------------------------- */

test("traverser une ligne perpendiculaire pose une jonction", () => {
  // Une bande verticale en (2, 0), et on trace une ligne horizontale a travers.
  const plateau = board([bande(2, 0, 1)]);
  const posee = withJunctions(ligne(0, 4), plateau, known);
  assert.equal(posee[2].block, "junction");
  assert.deepEqual(posee.filter((p) => p.block === "junction").length, 1);
});

test("une jonction ne se pose pas au bout de la ligne", () => {
  /* La regle du jeu demande que la ligne continue DES DEUX COTES : au bout, il n y a rien
     a faire traverser, et une jonction terminale ne serait qu un convoyeur en moins. */
  const plateau = board([bande(4, 0, 1)]);
  const posee = withJunctions(ligne(0, 4), plateau, known);
  assert.equal(posee[4].block, "conveyor");
});

test("un convoyeur dans le meme sens se remplace, il ne devient pas une jonction", () => {
  const plateau = board([bande(2, 0, 0)]);
  const posee = withJunctions(ligne(0, 4), plateau, known);
  assert.equal(posee[2].block, "conveyor");
});

test("un convoyeur a contresens n est pas un croisement non plus", () => {
  // Rotation 2 contre 0 : deux quarts de tour d ecart, donc pas perpendiculaire.
  const plateau = board([bande(2, 0, 2)]);
  assert.equal(withJunctions(ligne(0, 4), plateau, known)[2].block, "conveyor");
});

test("une case vide reste un convoyeur", () => {
  const posee = withJunctions(ligne(0, 4), board(), known);
  assert.equal(posee.every((p) => p.block === "conveyor"), true);
});

test("un bloc sans jonction de remplacement n en pose jamais", () => {
  // Une gaine d Erekir n a pas de `junctionReplacement` dans le jeu.
  const plateau = board([{ x: 2, y: 0, block: "duct", rotation: 1 }]);
  const gaines = ligne(0, 4).map((p) => ({ ...p, block: "duct" }));
  assert.equal(withJunctions(gaines, plateau, known).every((p) => p.block === "duct"), true);
});

/* --- Le garde-fou de la pose de cote --------------------------------------------------- */

test("une ligne posee de cote est laissee tranquille", () => {
  /* Le premier bloc regarde le nord alors que la ligne part vers l est : ce n est pas une
     ligne qu on prolonge, c est une entree qu on branche. */
  assert.equal(isSidePlace(ligne(0, 4, 0, 1)), true);
  assert.equal(isSidePlace(ligne(0, 4, 0, 0)), false);
});

/* --- Les ponts automatiques ------------------------------------------------------------ */

const franchir = (plans, plateau, block = "conveyor") => withBridges(plans, {
  blocked: blockerOf(plateau, known, block),
  reach: known.blocks[known.blocks[block].bridge_replacement].range,
  bridge: known.blocks[block].bridge_replacement,
});

test("sans obstacle, la ligne reste une ligne", () => {
  const posee = franchir(ligne(0, 6), board());
  assert.equal(posee.every((p) => p.block === "conveyor"), true);
});

test("une presse au milieu de la ligne se franchit en pont", () => {
  /* Le geste que le jeu fait a la place du joueur : la ligne rencontre un bloc qu elle ne
     peut pas remplacer, et deux ponts apparaissent de part et d autre pour l enjamber. */
  const plateau = board([{ x: 3, y: 0, block: "graphite-press", rotation: 0 }]);
  const posee = franchir(ligne(0, 6), plateau);
  const ponts = posee.filter((p) => p.block === "bridge-conveyor");
  assert.ok(ponts.length >= 2, `${ponts.length} pont(s), il en faut au moins deux`);
  const vise = ponts.find((p) => p.config);
  assert.ok(vise, "aucun pont ne vise son vis-a-vis");
  assert.equal(vise.config.type, 7);
});

test("un pont ne s ouvre pas pour rien : un obstacle hors de portee laisse la ligne", () => {
  /* La portee d un pont a bande est de quatre. Un mur de six cases ne se saute pas, donc le
     calcul ne doit pas fabriquer un pont impossible. */
  const mur = [];
  for (let x = 2; x <= 7; x++) mur.push({ x, y: 0, block: "graphite-press", rotation: 0 });
  const posee = franchir(ligne(0, 10), board(mur));
  const ponts = posee.filter((p) => p.block === "bridge-conveyor");
  for (const pont of ponts) {
    if (!pont.config) continue;
    const far = Math.max(Math.abs(pont.config.dx), Math.abs(pont.config.dy));
    assert.ok(far <= 4, `un pont vise a ${far} cases, sa portee est de quatre`);
  }
});

test("le pont prefere le saut le plus court", () => {
  /* Le malus par case vide enjambee est ce qui l en empeche : sans lui, un pont de portee
     quatre sauterait toujours de quatre, meme pour franchir une seule case. */
  const plateau = board([{ x: 3, y: 0, block: "graphite-press", rotation: 0 }]);
  const posee = franchir(ligne(0, 8), plateau);
  const vise = posee.find((p) => p.config);
  const saut = Math.max(Math.abs(vise.config.dx), Math.abs(vise.config.dy));
  assert.ok(saut <= 3, `saut de ${saut} cases pour franchir une presse de deux`);
});

test("une ligne qui n est pas droite n est pas touchee", () => {
  // Le jeu ne calcule les ponts que sur une ligne orthogonale.
  const coude = [bande(0, 0), bande(1, 0), bande(1, 1)];
  assert.deepEqual(withBridges(coude, { blocked: () => true, reach: 4, bridge: "bridge-conveyor" }),
                   coude);
});

test("un mur du terrain bloque comme un bloc", () => {
  const plateau = board([], { "3,0": { floor: "stone", wall: "stone-wall" } });
  const gene = blockerOf(plateau, known, "conveyor");
  assert.equal(gene(3, 0), true);
  assert.equal(gene(2, 0), false);
});

test("un liquide profond bloque, sauf ce qui flotte", () => {
  const plateau = board([], { "3,0": { floor: "deep-water" } });
  assert.equal(blockerOf(plateau, known, "conveyor")(3, 0), true);
  assert.equal(blockerOf(plateau, known, "thermal-generator")(3, 0), false);
});

test("un convoyeur du meme groupe ne bloque pas, il se remplace", () => {
  const plateau = board([bande(3, 0)]);
  assert.equal(blockerOf(plateau, known, "titanium-conveyor")(3, 0), false);
});

test("une jonction ne traverse qu un transporteur, pas une presse", () => {
  /* Le garde-fou qui rend le pont possible. `avoid` du jeu vaut `b instanceof Conveyor` :
     une jonction ne se pose que pour croiser un transporteur. Sans lui, le calcul faisait
     passer une jonction imaginaire au travers d une presse pour 30, contre 200 pour un
     pont, et aucun pont ne s ouvrait jamais. Mesure avant correction : dix-sept convoyeurs
     et zero pont sur une ligne coupee par une presse. */
  const plateau = board([{ x: 3, y: 0, block: "graphite-press", rotation: 0 }]);
  const avec = withBridges(ligne(0, 8), {
    blocked: blockerOf(plateau, known, "conveyor"),
    reach: 4, bridge: "bridge-conveyor", hasJunction: true,
    avoid: (x, y) => {
      const under = plateau.at(x, y);
      return Boolean(under && known.blocks[under.block]?.conveyor_placement);
    },
  });
  assert.ok(avec.some((p) => p.block === "bridge-conveyor"),
            "une presse doit se franchir en pont");

  // Et sans le garde-fou, la presse se laissait traverser : le pont ne gagnait jamais.
  const sans = withBridges(ligne(0, 8), {
    blocked: blockerOf(plateau, known, "conveyor"),
    reach: 4, bridge: "bridge-conveyor", hasJunction: true,
    avoid: () => true,
  });
  assert.equal(sans.some((p) => p.block === "bridge-conveyor"), false);
});
