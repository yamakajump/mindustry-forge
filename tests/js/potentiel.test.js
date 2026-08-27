/**
 * Le plafond : ce qu'une schematique rendrait si on lui amenait ce qui lui manque.
 *
 * Ce depot a deja supprime une fonctionnalite qui ressemblait a celle-ci, et il a eu
 * raison : `ports.js` choisissait le transporteur d'arrivee le plus probable, toute la page
 * decoulait de ce choix, et un choix rate rendait des debits qui avaient l'air calcules.
 * `docs/todo.md` : « la devinette des entrees est supprimee, pas amelioree ».
 *
 * Ce qui est teste ici doit donc prouver deux choses, et la seconde est la plus importante.
 * D'abord que le chiffre est bon. Ensuite **qu'aucun choix n'est fait pour l'obtenir** : le
 * plafond ne designe aucune arrivee et ne route aucun flux, c'est la soustraction de ce que
 * les machines font a plein regime moins ce qu'elles se mangent entre elles. Et il ne
 * remplace jamais la mesure : un joueur qui colle sa schematique doit continuer a voir zero
 * quand c'est zero, et l'invitation a marquer ses entrees.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { analyse } from "../../site/public/forge/analyse.js";
import { loadCatalogue, paste } from "./helpers.js";

loadCatalogue();

const close = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-3, `${why}: ${a} vs ${b}`);

test("une presse que rien n'alimente annonce ce qu'elle ferait, sans rien mesurer", async () => {
  const out = await analyse(paste([[0, 0, "graphite-press", 0]]));

  /* Le defaut ne bouge pas. C'est la moitie du contrat : la page continue de dire qu'elle
     ne sait pas ou ca se branche, et de le demander. */
  assert.deepEqual(out.perMinute, {}, "rien de mesure tant que rien n'est marque");
  assert.equal(out.awaiting, true, "et elle attend toujours la reponse");

  // Deux charbons par fournee, une fournee toutes les 90 images : 40 graphite la minute.
  close(out.potentialPerMinute.graphite, 40, "le plafond, lui, est calculable");
});

test("le plafond tombe sur ce que le solveur rend quand on marque l'entree a la main", async () => {
  /*
   * Le test qui autorise a appeler ca un plafond plutot qu'une estimation. Les deux
   * chemins n'ont rien en commun : celui du haut resout un probleme de flot a partir d'une
   * arrivee designee, celui du bas soustrait deux totaux. S'ils divergent, l'un des deux
   * ment, et ce ne sera pas celui que le banc corrobore.
   */
  const code = paste([[0, 0, "graphite-press", 0]]);
  const bare = await analyse(code);

  const marked = Object.fromEntries(
    Object.keys(bare.offers).map((at) => [at, { side: "in", resource: "coal" }]));
  const fed = await analyse(code, {}, marked);

  close(fed.perMinute.graphite, bare.potentialPerMinute.graphite,
    "mesure alimentee et plafond disent le meme nombre");
});

test("ce qu'elle se mange elle-meme ne compte pas comme sortie", async () => {
  // Une presse mange le charbon qu'une centrifugeuse fait : ce charbon-la ne sort pas, et
  // l'annoncer ferait chercher une source de charbon a qui n'en a pas besoin.
  const out = await analyse(paste([
    [0, 0, "coal-centrifuge", 0],
    [4, 0, "graphite-press", 0],
  ]));

  // La centrifugeuse fait 2 charbon/s, la presse en mange 1,33 : il en reste 40 la minute.
  close(out.potentialPerMinute.coal, 40, "seul le surplus de charbon sort");
  close(out.potentialPerMinute.graphite, 40, "et le graphite qui en decoule");
});

test("le combustible d'un bruleur est deduit, meme s'il n'a pas de recette", async () => {
  /*
   * Un generateur a combustion brule « n'importe quoi » : il ne reclame aucune matiere
   * nommee, donc rien ne l'a retiree du total des sorties. Sans deduction, une
   * centrifugeuse qui alimente ses propres bruleurs figurait avec la totalite du charbon
   * qu'ils avalent - le plafond annoncait 120 la minute la ou il y en a 60.
   */
  const seule = await analyse(paste([[0, 0, "coal-centrifuge", 0]]));
  const avecDeux = await analyse(paste([
    [0, 0, "coal-centrifuge", 0],
    [4, 0, "combustion-generator", 0],
    [6, 0, "combustion-generator", 0],
  ]));

  close(seule.potentialPerMinute.coal, 120, "la centrifugeuse seule");
  close(avecDeux.potentialPerMinute.coal, 60, "moins ce que deux bruleurs avalent");
});

test("un bruleur qui mange plus que la schematique ne fait laisse un besoin, pas un negatif", async () => {
  const out = await analyse(paste([
    [0, 0, "coal-centrifuge", 0],
    ...Array.from({ length: 8 }, (_, i) => [4 + i * 2, 0, "combustion-generator", 0]),
  ]));

  assert.equal(out.potentialPerMinute.coal, undefined, "il ne reste pas de charbon a sortir");
  // Et les deux moitiés se recoupent : 240 brulés, 120 faits, 120 réclamés.
  const fuel = out.needs.find((need) => need.resource === "*combustible");
  close(fuel.perMinute, 120, "ce qui manque est demande, pas escamote");
});

test("aucun besoin sans nom ne se retrouve annonce comme une sortie", async () => {
  // `*combustible` est un trou dans une liste de courses, pas une matiere.
  const out = await analyse(paste([[0, 0, "combustion-generator", 0]]));

  for (const item of Object.keys(out.potentialPerMinute)) {
    assert.ok(!item.startsWith("*"), `${item} n'est pas quelque chose qui sort`);
  }
});

test("une schematique qui ne fabrique rien n'a pas de plafond a annoncer", async () => {
  // Une bande n'est pas une usine. Elle porte, elle ne fait pas, et un plafond a zero
  // affiche serait une ligne de plus a lire pour rien.
  const out = await analyse(paste([[0, 0, "conveyor", 0], [1, 0, "conveyor", 0]]));

  assert.deepEqual(out.potentialPerMinute, {});
});

test("le plafond ne depend d'aucune arrivee designee", async () => {
  /*
   * La garantie qui distingue ceci de `ports.js`. La meme usine, decrite deux fois avec des
   * bordures differentes - une bande d'arrivee de plus d'un cote - rend le meme plafond,
   * parce que rien dans le calcul ne regarde par ou ca entre. Un chiffre qui bougerait
   * selon la bande choisie serait une devinette, quel que soit son nom.
   */
  const nue = await analyse(paste([[0, 0, "graphite-press", 0]]));
  const avecBandes = await analyse(paste([
    [0, 0, "graphite-press", 0],
    [-1, 0, "conveyor", 0], [-2, 0, "conveyor", 0], [-1, 1, "conveyor", 0],
  ]));

  assert.deepEqual(avecBandes.potentialPerMinute, nue.potentialPerMinute);
});
