/**
 * Ce qu'un glissé pose, transcrit de `InputHandler.iterateLine` et de `Placement` de la
 * v159.7.
 *
 * La première version de ce fichier testait un coude en L, inventé de mémoire. Ce coude
 * n'existe nulle part dans le jeu, et tous ses tests passaient : c'est le rappel que des
 * tests verts ne valident que la fidélité de l'implémentation à ce qu'on croyait, jamais
 * au jeu. Chaque test ci-dessous cite la fonction du jeu dont il vient.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  bresenham, calculateNodes, lineOf, normalizeLine, normalizeRectangle, upgradeLine,
} from "../../../site/public/forge/editor/lines.js";
import { createBoard } from "../../../site/public/forge/editor/state.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const sizeOf = (name) => known.blocks[name]?.size || 1;
const at = (x, y) => ({ x, y });
const cells = (plans) => plans.map((t) => [t.x, t.y]);
const line = (from, to, block, rotation = 0, options = {}) =>
  lineOf(from, to, block, known, rotation, options);

/* --- `Placement.normalizeLine` : le tracé par défaut ---------------------------------- */

test("le glisse par defaut est une ligne droite, pas un coude", () => {
  /* C'est LA correction de ce fichier. Un glissé en diagonale, sans toucher a aucune
     touche, donne une ligne droite sur l axe dominant et rien d autre : le coude que tout
     le monde croit voir vient du fait qu on fait deux glisses. */
  assert.deepEqual(cells(line(at(0, 0), at(4, 2), "conveyor")),
                   [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
});

test("l axe dominant decide, et l egalite va a la verticale", () => {
  // `normalizeLine` teste `abs(dx) > abs(dy)` : a egalite, c est la hauteur qui gagne.
  assert.deepEqual(cells(normalizeLine(at(0, 0), at(3, 3))),
                   [[0, 0], [0, 1], [0, 2], [0, 3]]);
});

test("une bande regarde toujours la suivante", () => {
  const posee = line(at(0, 0), at(3, 0), "conveyor");
  assert.deepEqual(posee.map((t) => t.rotation), [0, 0, 0, 0]);
  assert.deepEqual(line(at(3, 0), at(0, 0), "conveyor").map((t) => t.rotation), [2, 2, 2, 2]);
  assert.deepEqual(line(at(0, 0), at(0, 2), "conveyor").map((t) => t.rotation), [1, 1, 1]);
});

/* --- `Bresenham2.lineNoDiagonal` : le mode diagonal ------------------------------------ */

test("le mode diagonal fait un escalier qui colle a la vraie diagonale", () => {
  const marche = bresenham(at(0, 0), at(3, 3));
  // Jamais deux axes dans le meme pas : chaque case touche la precedente par un cote.
  for (let i = 1; i < marche.length; i++) {
    const pas = Math.abs(marche[i].x - marche[i - 1].x) + Math.abs(marche[i].y - marche[i - 1].y);
    assert.equal(pas, 1, `saut en diagonale entre ${i - 1} et ${i}`);
  }
  assert.deepEqual([marche[0], marche[marche.length - 1]], [at(0, 0), at(3, 3)]);
});

test("la touche diagonale change vraiment le trace", () => {
  const droit = cells(line(at(0, 0), at(4, 3), "conveyor"));
  const escalier = cells(line(at(0, 0), at(4, 3), "conveyor", 0, { diagonal: true }));
  assert.notDeepEqual(droit, escalier);
  assert.deepEqual(escalier[escalier.length - 1], [4, 3]);
});

test("un bloc qui refuse la diagonale l ignore, touche ou pas", () => {
  // Les ponts portent `allowDiagonal = false` dans le jeu.
  assert.equal(known.blocks["phase-conveyor"].allow_diagonal, false);
  const sans = cells(line(at(0, 0), at(20, 6), "phase-conveyor"));
  const avec = cells(line(at(0, 0), at(20, 6), "phase-conveyor", 0, { diagonal: true }));
  assert.deepEqual(sans, avec);
});

test("un pylone inverse le basculement, parce qu on le veut presque toujours en escalier", () => {
  assert.equal(known.blocks["power-node"].swap_diagonal_placement, true);
  const sansTouche = cells(line(at(0, 0), at(9, 4), "power-node"));
  const avecTouche = cells(line(at(0, 0), at(9, 4), "power-node", 0, { diagonal: true }));
  assert.notDeepEqual(sansTouche, avecTouche);
});

/* --- `Placement.normalizeRectangle` : remplir une zone --------------------------------- */

test("un mur se pose par zones entieres, pas par lignes", () => {
  const remplissage = normalizeRectangle(at(0, 0), at(2, 2), 1);
  assert.equal(remplissage.length, 9);
  assert.deepEqual(remplissage[0], at(0, 0));
  assert.deepEqual(remplissage[8], at(2, 2));
});

test("le pas d un remplissage vaut la taille du bloc", () => {
  // Sinon chaque bloc pose detruit le precedent, et il ne reste qu une case.
  const remplissage = normalizeRectangle(at(0, 0), at(5, 5), 3);
  assert.deepEqual(remplissage.map((p) => [p.x, p.y]),
                   [[0, 0], [3, 0], [0, 3], [3, 3]]);
});

test("un remplissage marche aussi a l envers", () => {
  const remplissage = normalizeRectangle(at(5, 5), at(3, 3), 1);
  assert.equal(remplissage.length, 9);
  assert.deepEqual(remplissage[0], at(5, 5));
  assert.deepEqual(remplissage[8], at(3, 3));
});

/* --- `Placement.calculateNodes` : les ponts sautent ------------------------------------ */

test("un pont ne se pose pas case par case, il saute jusqu ou il voit", () => {
  /* Douze cases avec un conduit de phase, de portee douze : deux ponts, pas treize. C est
     exactement ce que `changePlacementPath` fait dans le jeu, et son absence est ce qui
     rendait les ponts inutilisables ici. */
  const posee = line(at(0, 0), at(12, 0), "phase-conveyor");
  assert.equal(posee.length, 2);
  assert.deepEqual(cells(posee), [[0, 0], [12, 0]]);
});

test("au dela de sa portee, le pont pose un relais", () => {
  const posee = line(at(0, 0), at(12, 0), "bridge-conveyor");   // portee 4
  assert.deepEqual(cells(posee), [[0, 0], [4, 0], [8, 0], [12, 0]]);
});

test("chaque pont est lie au suivant, et le dernier ne l est pas", () => {
  /* `handlePlacementLine` : la configuration d un pont est le decalage vers le suivant.
     Sans elle, un glisse donne une file de ponts qui s ignorent, ce qui a l image ressemble
     a une chaine et ne transporte rien. */
  const posee = line(at(0, 0), at(8, 0), "bridge-conveyor");
  assert.deepEqual(posee[0].config, { type: 7, dx: 4, dy: 0 });
  assert.deepEqual(posee[1].config, { type: 7, dx: 4, dy: 0 });
  assert.equal(posee[posee.length - 1].config, undefined);
});

test("les noeuds gardent toujours le dernier point du glisse", () => {
  // Treize cases avec une portee de quatre : le dernier point ne tombe pas sur un multiple.
  const posee = line(at(0, 0), at(13, 0), "bridge-conveyor");
  assert.deepEqual(cells(posee)[cells(posee).length - 1], [13, 0]);
});

test("un pylone s espace de sa portee, comme un pont", () => {
  const posee = line(at(0, 0), at(18, 0), "power-node");   // portee 6
  assert.ok(posee.length >= 3 && posee.length <= 5, `${posee.length} pylones`);
  for (let i = 1; i < posee.length; i++) {
    const ecart = Math.max(Math.abs(posee[i].x - posee[i - 1].x),
                           Math.abs(posee[i].y - posee[i - 1].y));
    assert.ok(ecart <= 6, `deux pylones a ${ecart} cases ne se voient plus`);
  }
});

test("calculateNodes garde le premier et le dernier, quoi qu il arrive", () => {
  const points = [at(0, 0), at(1, 0), at(2, 0), at(3, 0)];
  const noeuds = calculateNodes(points, (a, b) => Math.abs(a.x - b.x) <= 2);
  assert.deepEqual(noeuds[0], at(0, 0));
  assert.deepEqual(noeuds[noeuds.length - 1], at(3, 0));
});

/* --- `Placement.upgradeLine` : suivre une chaine existante ----------------------------- */

test("glisser sur une ligne existante la suit au lieu de la couper", () => {
  /* Le geste qui remplace toute une ligne de convoyeurs par des titane en un glisse, en
     epousant ses virages. Tracer droit couperait a travers l usine. */
  const plateau = createBoard({ sizeOf, tiles: [
    { x: 0, y: 0, block: "conveyor", rotation: 0 },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
    { x: 2, y: 0, block: "conveyor", rotation: 1 },
    { x: 2, y: 1, block: "conveyor", rotation: 1 },
    { x: 2, y: 2, block: "conveyor", rotation: 1 },
  ] });
  const suivi = upgradeLine(at(0, 0), at(2, 2), plateau);
  assert.deepEqual(suivi.map((p) => [p.x, p.y]),
                   [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]]);
});

test("une chaine qui ne mene pas au but ne se suit pas", () => {
  const plateau = createBoard({ sizeOf, tiles: [
    { x: 0, y: 0, block: "conveyor", rotation: 0 },
    { x: 1, y: 0, block: "conveyor", rotation: 0 },
  ] });
  assert.equal(upgradeLine(at(0, 0), at(9, 9), plateau), null);
});

test("une chaine qui tourne en rond ne boucle pas indefiniment", () => {
  const plateau = createBoard({ sizeOf, tiles: [
    { x: 0, y: 0, block: "conveyor", rotation: 0 },
    { x: 1, y: 0, block: "conveyor", rotation: 2 },
  ] });
  assert.equal(upgradeLine(at(0, 0), at(5, 5), plateau), null);
});

test("en mode diagonal, le glisse suit la chaine quand il y en a une", () => {
  const plateau = createBoard({ sizeOf, tiles: [
    { x: 0, y: 0, block: "conveyor", rotation: 0 },
    { x: 1, y: 0, block: "conveyor", rotation: 1 },
    { x: 1, y: 1, block: "conveyor", rotation: 1 },
  ] });
  const posee = line(at(0, 0), at(1, 1), "titanium-conveyor", 0,
                     { diagonal: true, board: plateau });
  assert.deepEqual(cells(posee), [[0, 0], [1, 0], [1, 1]]);
});

/* --- Les cas limites ------------------------------------------------------------------- */

test("un glisse d une seule case pose un seul bloc", () => {
  const posee = line(at(2, 2), at(2, 2), "conveyor", 3);
  assert.equal(posee.length, 1);
  assert.equal(posee[0].rotation, 3, "rien n indique une direction, la main decide");
});

test("un bloc qui ne tourne pas sort a zero, quoi que la main tienne", () => {
  /* `Block.planRotation` : `!rotate && lockRotation ? 0 : rot`. Une presse ne tourne pas et
     `lockRotation` vaut vrai pour tous les blocs du jeu, donc elle sort toujours a zero.

     Ce test attendait l inverse et c est le code qui avait raison : garder la rotation de
     la main sur un bloc qui ne tourne pas ecrit dans le fichier une valeur que le jeu
     remettrait a zero, donc une schematique qui ne se recopie pas a l identique. */
  assert.deepEqual(line(at(0, 0), at(4, 0), "graphite-press", 3).map((t) => t.rotation),
                   [0, 0, 0]);
});

test("un bloc qui ignore le sens du glisse garde la rotation de la main", () => {
  /* `ignoreLineRotation`, que trente blocs portent : une foreuse a faisceau ou une tourelle
     tourne, mais ne doit pas se retourner parce qu on a tire vers la droite. Sans ce
     drapeau, poser une rangee de foreuses a faisceau les fait toutes viser le voisin au
     lieu de viser le mur qu on avait choisi. */
  assert.equal(known.blocks["plasma-bore"].ignore_line_rotation, true);
  assert.deepEqual(line(at(0, 0), at(6, 0), "plasma-bore", 3).map((t) => t.rotation),
                   [3, 3, 3, 3]);
  // Une bande, elle, suit bien le glisse.
  assert.deepEqual(line(at(0, 0), at(2, 0), "conveyor", 3).map((t) => t.rotation), [0, 0, 0]);
});

test("un gros bloc s espace de sa taille au lieu de se detruire lui-meme", () => {
  /* Une presse fait deux cases de cote. Posee case par case, chaque exemplaire recouvre le
     precedent et le fait disparaitre : au bout d un glisse de dix cases il ne resterait
     qu une presse. Trois exemplaires sur un glisse de quatre cases, donc, et non cinq. */
  assert.deepEqual(cells(line(at(0, 0), at(4, 0), "graphite-press")),
                   [[0, 0], [2, 0], [4, 0]]);
});

test("chaque case n est posee qu une fois", () => {
  const posee = line(at(0, 0), at(6, 6), "conveyor", 0, { diagonal: true });
  assert.equal(new Set(posee.map((t) => `${t.x},${t.y}`)).size, posee.length);
});

test("une gaine a pont ne configure rien, elle regarde devant elle", () => {
  /* Le jeu a deux familles de ponts et elles ne se lient pas pareil. `ItemBridge` retient
     le decalage vers sa cible dans sa configuration ; `DirectionBridge`, dont sortent la
     gaine a pont et le conduit renforce, ne configure rien et balaie droit devant lui
     jusqu a sa portee. Leur donner a tous une configuration ecrirait dans le fichier une
     liaison que le jeu ignore. */
  const gaines = line(at(0, 0), at(8, 0), "duct-bridge");
  assert.deepEqual(cells(gaines), [[0, 0], [4, 0], [8, 0]], "l espacement reste celui de la portee");
  for (const gaine of gaines) assert.equal(gaine.config, undefined);
  assert.deepEqual(gaines.map((g) => g.rotation), [0, 0, 0], "elles regardent la suivante");

  const ponts = line(at(0, 0), at(8, 0), "bridge-conveyor");
  assert.deepEqual(ponts[0].config, { type: 7, dx: 4, dy: 0 });
});

test("en mode diagonal, une bande contourne ce qui est deja la", () => {
  /* `pathfindLine` du jeu : un A* pour les blocs a `conveyorPlacement`. Une usine au milieu
     du passage se contourne au lieu de se faire ecraser, et c est ce qui permet de tirer une
     bande d un bout a l autre d une base sans la demonter. */
  const plateau = createBoard({ sizeOf, tiles: [
    { x: 2, y: 0, block: "graphite-press", rotation: 0 },
  ] });
  const posee = line(at(0, 0), at(6, 0), "conveyor", 0, { diagonal: true, board: plateau });
  const dessus = posee.filter((p) => p.x >= 2 && p.x <= 3 && p.y >= 0 && p.y <= 1);
  assert.equal(dessus.length, 0, "la ligne passe au travers de la presse");
  assert.deepEqual([posee[posee.length - 1].x, posee[posee.length - 1].y], [6, 0]);
});
