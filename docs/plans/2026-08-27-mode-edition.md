# Mode édition - plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un mode édition plein écran dans l'analyseur Forge, qui reprend les mécaniques de pose de Mindustry v159.7 et refuse toute schématique que le jeu refuserait.

**Architecture:** Un dossier `site/public/forge/editor/` de modules purs (état, règles, tracé, sélection, caméra) plus deux modules de navigateur (interface, branchement). `render.js` gagne une caméra optionnelle et des calques mis en cache, sans changer ce qu'il fait pour le rapport. Le catalogue apprend les champs du jeu qui décident de la légalité d'une pose.

**Tech Stack:** JavaScript ESM sans dépendance, `node --test` pour les tests, canvas 2D, Java 17 côté `bench` (greffon Mindustry), Python 3 pour le trimmage du catalogue, Laravel 12 pour la persistance.

## Global Constraints

- **Version du jeu : Mindustry v159.7.** Toute règle vient de la source de cette version, jamais d'un wiki. Le fichier qui l'implémente cite la classe d'origine.
- **`Vars.maxSchematicSize = 64`.** La boîte englobante d'une schématique ne dépasse jamais 64 × 64 tuiles, murs des gros blocs compris.
- **Une case sans sol peint n'a aucune règle.** Tant que rien n'est peint sous un bloc, toute pose est légale. Les contraintes de sol n'existent que là où le sol est décrit.
- **Aucune dépendance npm.** Le dépôt n'en a pas une seule, ce n'est pas ce chantier qui en introduit.
- **Français dans les commentaires et l'interface, anglais dans le code.** Pas de tiret cadratin nulle part.
- **Commits conventionnels en français**, sujet à l'impératif, 50 caractères maximum.
- **Le worktree est `C:\Users\coren\Projets\_worktrees\forge-mode-edition`, sur `feat/mode-edition`, basé sur `restart/place-de-marche`** (et non sur `main`, qui a 73 commits de retard).
- **`npm test` doit passer à chaque commit.** Baseline au départ du chantier : 227 tests, 0 échec.

## Structure des fichiers

| Fichier | Sa seule responsabilité |
|---|---|
| `site/public/forge/editor/state.js` | Les blocs posés, le sol, la boîte de 64 × 64, l'historique annuler/refaire |
| `site/public/forge/editor/rules.js` | Une pose est-elle légale, et sinon pourquoi, en français affichable |
| `site/public/forge/editor/lines.js` | Ce qu'un glissé pose : le L des convoyeurs, la ligne droite des autres |
| `site/public/forge/editor/selection.js` | Copier, coller, tourner, retourner un groupe de blocs |
| `site/public/forge/editor/camera.js` | Origine, échelle, conversion écran vers tuile et retour |
| `site/public/forge/editor/ui.js` | Rail, onglets, palette, barre d'état, panneau du bloc en main |
| `site/public/forge/editor/mount.js` | Branche pointeur, clavier et bascule sur le plateau |
| `site/public/forge/render.js` | *(modifié)* caméra optionnelle et calques mis en cache |
| `site/public/index.html` | *(modifié)* la bascule, et les cartes d'édition qui déménagent |
| `bench/src/mindustryforge/DumpBlocks.java` | *(modifié)* les champs du jeu qui décident d'une pose |
| `tools/build_catalogue.py` | *(modifié)* les laisser passer jusqu'au navigateur |

Les cinq premiers sont du calcul pur, sans `document` ni `window`, donc testés dans le `npm test` existant. `ui.js` et `mount.js` touchent le navigateur et se vérifient à la main, avec la liste de contrôle donnée dans leur tâche.

Ce découpage affine celui de `docs/plan-edition.md`, qui annonçait un seul `tools.js` : le tracé de ligne et les opérations de sélection sont deux algorithmes sans rapport, et `camera.js` mérite d'exister seul parce que la conversion écran vers tuile est exactement l'endroit où vivent les erreurs d'une case.

---

### Tâche 1 : Le catalogue apprend ce qu'il faut pour poser

Aucun des champs qui décident d'une pose n'existe aujourd'hui, ni dans `bench/data/blocks.json`, ni dans le catalogue trimé. `rules.js` ne peut pas décider un remplacement sans eux, et les deviner depuis `role` donnerait un éditeur qui refuse des poses que le jeu accepte.

Vérifié avant d'écrire ce plan : régénérer le dump avec le `DumpBlocks` actuel produit un fichier **identique octet pour octet** à celui qui est versionné. Le diff de cette tâche ne contiendra donc que les champs ajoutés.

**Files:**
- Modify: `bench/src/mindustryforge/DumpBlocks.java`
- Modify: `tools/build_catalogue.py` (la constante `KEEP`)
- Regenerate: `bench/data/blocks.json`, `site/public/forge/blocks.json`
- Test: `tests/js/editor/catalogue.test.js` (créer)

**Interfaces:**
- Produces: pour chaque bloc du catalogue, les clés `category`, `group`, `group_any_replace`, `subclass`, `conveyor_placement`, `replaceable`, `always_replace`, `quick_rotate`, `privileged`, `placeable_on`, `requires_water`, `placeable_liquid`, `planet`.

- [ ] **Étape 1 : Écrire le test qui échoue**

Créer `tests/js/editor/catalogue.test.js` :

```javascript
/**
 * Ce que le catalogue doit savoir pour qu'une pose soit décidable.
 *
 * `Block.canReplace` de la v159.7 lit `group`, `subclass`, `replaceable`, `alwaysReplace`,
 * `privileged` et `quickRotate`. Sans eux, remplacer un convoyeur par un convoyeur titane
 * n'est pas une question à laquelle l'éditeur peut répondre, et il refuse un geste que le
 * jeu accepte.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const bloc = (name) => {
  const found = known.blocks[name];
  assert.ok(found, `${name} manque au catalogue`);
  return found;
};

test("chaque bloc constructible porte une categorie du jeu", () => {
  const categories = new Set(["turret", "production", "distribution", "liquid", "power",
                              "defense", "crafting", "units", "effect", "logic"]);
  const constructibles = Object.entries(known.blocks)
    .filter(([, b]) => b.cost && !b.floor);
  assert.ok(constructibles.length > 100, "le catalogue a perdu ses blocs constructibles");
  for (const [name, b] of constructibles) {
    assert.ok(categories.has(b.category), `${name} a la categorie ${b.category}`);
  }
});

test("deux convoyeurs partagent un groupe, ce qui les rend interchangeables", () => {
  assert.equal(bloc("conveyor").group, "transportation");
  assert.equal(bloc("titanium-conveyor").group, "transportation");
});

test("un glisse trace en L sur une bande, en ligne droite sur un routeur", () => {
  assert.equal(bloc("conveyor").conveyor_placement, true);
  assert.notEqual(bloc("router").conveyor_placement, true);
});

test("chaque bloc sait de quelle planete il vient", () => {
  assert.equal(bloc("conveyor").planet, "serpulo");
  assert.equal(bloc("duct").planet, "erekir");
});

test("le sol dit s il accepte qu on batisse dessus", () => {
  // `placeableOn` vaut vrai par defaut et n est ecrit que la ou il est faux.
  assert.notEqual(bloc("deep-water").placeable_on, undefined);
});
```

- [ ] **Étape 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd /c/Users/coren/Projets/_worktrees/forge-mode-edition
node --test "tests/js/editor/catalogue.test.js"
```

Attendu : ÉCHEC, `undefined` au lieu de `"transportation"`.

- [ ] **Étape 3 : Étendre le dumpeur**

Dans `DumpBlocks.java`, dans la boucle `for (Block block : Vars.content.blocks())`, à la suite de `entry.put("rotate", block.rotate)`, ajouter :

```java
/* Ou ranger le bloc dans la palette, et avec quoi il est interchangeable.
   `Block.canReplace` lit `group`, `subclass`, `replaceable`, `alwaysReplace`,
   `privileged` et `quickRotate` : un editeur qui n en a qu une partie refuse des
   gestes que le jeu accepte, ce qui est pire qu un editeur qui n en a aucune. */
entry.put("category", block.category.name());
entry.put("group", block.group.name());
if (block.group.anyReplace) entry.put("group_any_replace", true);
if (block.subclass != null) entry.put("subclass", block.subclass.getSimpleName());
if (block.conveyorPlacement) entry.put("conveyor_placement", true);
if (!block.replaceable) entry.put("replaceable", false);
if (block.alwaysReplace) entry.put("always_replace", true);
if (block.quickRotate) entry.put("quick_rotate", true);
if (block.privileged) entry.put("privileged", true);
/* Ce que le sol sous un bloc autorise, lu dans `Build.validPlace`. Un liquide
   profond ne porte que ce qui flotte, et une thermogeneratrice exige son eau. */
if (!block.placeableOn) entry.put("placeable_on", false);
if (block.requiresWater) entry.put("requires_water", true);
if (block.placeableLiquid) entry.put("placeable_liquid", true);
```

Puis, après la boucle des blocs, la planète de chacun. `TechTree.all` porte tous les nœuds de tous les arbres, et `node.planet` vaut `null` quand il faut retomber sur Serpulo :

```java
/* De quelle planete vient un bloc, pour que la palette puisse ne montrer qu une des
   deux. Le champ `planet` d un noeud vaut null quand il faut deduire, auquel cas le
   jeu retombe sur Serpulo, et c est ce que fait cette ligne. */
for (TechNode node : TechTree.all) {
    if (!(node.content instanceof Block)) continue;
    Jval entry = blocks.get(node.content.name);
    if (entry == null) continue;
    entry.put("planet", node.planet == null ? "serpulo" : node.planet.name);
}
```

Ajouter les imports `mindustry.content.TechTree` et `mindustry.content.TechTree.TechNode`.

- [ ] **Étape 4 : Reconstruire le greffon et régénérer le dump**

```bash
cd /c/Users/coren/Projets/_worktrees/forge-mode-edition/bench
./gradlew jar --offline -q
cp build/libs/mindustry-forge-bench.jar ../_run/config/mods/
cd ../_run
echo "dump-blocks C:/Users/coren/Projets/_worktrees/forge-mode-edition/bench/data/blocks.json" | java -jar server-release.jar
```

Si `_run/` n'existe pas dans le worktree, le copier depuis le dépôt principal : `cp -r /c/Users/coren/Projets/mindustry-forge/_run .` (il est gitignoré, donc c'est gratuit).

Vérifier que le diff ne contient que des ajouts :

```bash
cd /c/Users/coren/Projets/_worktrees/forge-mode-edition
git diff --stat bench/data/blocks.json
```

Attendu : que des lignes ajoutées, aucune valeur existante modifiée. Si une valeur change, **s'arrêter** : le greffon ne dumpe plus la même chose et c'est une régression, pas un ajout.

- [ ] **Étape 5 : Laisser passer les champs jusqu'au navigateur**

Dans `tools/build_catalogue.py`, ajouter à la constante `KEEP` :

```python
        # Ce qui decide d une pose dans l editeur, lu dans `Build.validPlace` et
        # `Block.canReplace`. Ranger la palette demande les trois premiers, decider un
        # remplacement demande tous les autres.
        "category", "group", "group_any_replace", "subclass", "planet",
        "conveyor_placement", "replaceable", "always_replace", "quick_rotate",
        "privileged", "placeable_on", "requires_water", "placeable_liquid",
```

Puis régénérer :

```bash
python tools/build_catalogue.py
```

- [ ] **Étape 6 : Lancer les tests**

```bash
npm test
```

Attendu : les 227 tests d'origine passent, plus les 5 nouveaux.

- [ ] **Étape 7 : Commit**

```bash
git add bench/src/mindustryforge/DumpBlocks.java tools/build_catalogue.py \
        bench/data/blocks.json site/public/forge/blocks.json tests/js/editor/catalogue.test.js
git commit -m "feat(catalogue): ce que le jeu sait et qui decide d une pose"
```

---

### Tâche 2 : `state.js`, le plateau et son historique

**Files:**
- Create: `site/public/forge/editor/state.js`
- Test: `tests/js/editor/state.test.js`

**Interfaces:**
- Produces:
  - `createBoard({ tiles = [], ground = {}, sizeOf })` rend un plateau.
  - `board.tiles` : `Array<{ x, y, block, rotation, config }>`, position au centre comme le jeu.
  - `board.ground` : `{ "x,y": { floor, overlay, wall } }`.
  - `board.at(x, y)` rend la tuile qui couvre cette case, ou `null`.
  - `board.box()` rend `{ left, bottom, width, height }`, boîte englobante réelle.
  - `board.fits(plan)` rend `true` si poser `plan` garde la boîte dans 64 × 64.
  - `board.apply(change)` applique et empile ; `change` vaut `{ place: [...], remove: [...], paint: {...} }`.
  - `board.undo()` / `board.redo()` rendent `true` s'il y avait quelque chose à faire.
  - `MAX_SIZE = 64`.

- [ ] **Étape 1 : Écrire le test qui échoue**

Créer `tests/js/editor/state.test.js` :

```javascript
/**
 * Le plateau : ce qui est pose, ce qui est peint, et ce qu on peut defaire.
 *
 * La limite de 64 vient de `Vars.maxSchematicSize` de la v159.7. Elle porte sur la boite
 * englobante, murs des gros blocs compris, pas sur le nombre de blocs.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createBoard, MAX_SIZE } from "../../../site/public/forge/editor/state.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const sizeOf = (name) => known.blocks[name]?.size || 1;
const board = (tiles = []) => createBoard({ tiles, sizeOf });

test("la limite est celle du jeu", () => {
  assert.equal(MAX_SIZE, 64);
});

test("la boite se mesure sur ce que les blocs couvrent", () => {
  // Une foreuse mecanique fait deux de cote et se range par son centre, donc posee en
  // (5, 5) elle couvre jusqu a (6, 6).
  const plateau = board([{ x: 5, y: 5, block: "mechanical-drill", rotation: 0 }]);
  assert.deepEqual(plateau.box(), { left: 5, bottom: 5, width: 2, height: 2 });
});

test("un plateau vide a une boite vide plutot que des infinis", () => {
  assert.deepEqual(board().box(), { left: 0, bottom: 0, width: 0, height: 0 });
});

test("un bloc qui ferait deborder de 64 ne rentre pas", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  assert.equal(plateau.fits({ x: 63, y: 0, block: "conveyor", rotation: 0 }), true);
  assert.equal(plateau.fits({ x: 64, y: 0, block: "conveyor", rotation: 0 }), false);
});

test("un gros bloc compte par ce qu il couvre, pas par son centre", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  // La foreuse posee en (62, 0) couvre (62, 0) a (63, 1) : la boite fait 64 de large.
  assert.equal(plateau.fits({ x: 62, y: 0, block: "mechanical-drill", rotation: 0 }), true);
  assert.equal(plateau.fits({ x: 63, y: 0, block: "mechanical-drill", rotation: 0 }), false);
});

test("ce qui couvre une case se retrouve par cette case", () => {
  const plateau = board([{ x: 5, y: 5, block: "mechanical-drill", rotation: 0 }]);
  assert.equal(plateau.at(6, 6)?.block, "mechanical-drill");
  assert.equal(plateau.at(7, 7), null);
});

test("un geste s annule d un coup, meme s il a pose trente blocs", () => {
  const plateau = board();
  const ligne = Array.from({ length: 30 },
    (_, i) => ({ x: i, y: 0, block: "conveyor", rotation: 0 }));
  plateau.apply({ place: ligne });
  assert.equal(plateau.tiles.length, 30);
  assert.equal(plateau.undo(), true);
  assert.equal(plateau.tiles.length, 0);
  assert.equal(plateau.redo(), true);
  assert.equal(plateau.tiles.length, 30);
});

test("annuler sans rien a annuler ne casse rien", () => {
  const plateau = board();
  assert.equal(plateau.undo(), false);
  assert.equal(plateau.redo(), false);
});

test("un nouveau geste jette ce qui avait ete defait", () => {
  const plateau = board();
  plateau.apply({ place: [{ x: 0, y: 0, block: "conveyor", rotation: 0 }] });
  plateau.undo();
  plateau.apply({ place: [{ x: 5, y: 5, block: "router", rotation: 0 }] });
  assert.equal(plateau.redo(), false);
  assert.equal(plateau.tiles.length, 1);
  assert.equal(plateau.tiles[0].block, "router");
});

test("le sol s annule comme le reste", () => {
  const plateau = board();
  plateau.apply({ paint: { "3,4": { floor: "sand" } } });
  assert.equal(plateau.ground["3,4"].floor, "sand");
  plateau.undo();
  assert.equal(plateau.ground["3,4"], undefined);
});

test("poser sur une case occupee remplace au lieu d empiler", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  plateau.apply({ place: [{ x: 0, y: 0, block: "titanium-conveyor", rotation: 1 }] });
  assert.equal(plateau.tiles.length, 1);
  assert.equal(plateau.tiles[0].block, "titanium-conveyor");
  assert.equal(plateau.tiles[0].rotation, 1);
});
```

- [ ] **Étape 2 : Lancer le test pour vérifier qu'il échoue**

```bash
node --test "tests/js/editor/state.test.js"
```

Attendu : ÉCHEC, `Cannot find module .../editor/state.js`.

- [ ] **Étape 3 : Écrire l'implémentation minimale**

Créer `site/public/forge/editor/state.js`. La structure attendue :

```javascript
/**
 * Ce qui est pose, ce qui est peint, et ce qu on peut defaire.
 *
 * Un geste est une entree d historique, pas un bloc : une ligne de trente convoyeurs se
 * defait d un coup, parce que c est d un coup qu elle a ete tracee. L inverse oblige a
 * marteler ctrl+Z trente fois pour reparer un glisse rate, ce qui n est pas une annulation
 * mais une punition.
 */

export const MAX_SIZE = 64;

/** Toutes les cases qu un bloc couvre, rangees par son centre comme le jeu les range. */
function footprint(tile, sizeOf) {
  const size = sizeOf(tile.block) || 1;
  const offset = Math.trunc(-(size - 1) / 2);
  const cells = [];
  for (let dx = 0; dx < size; dx++) {
    for (let dy = 0; dy < size; dy++) cells.push([tile.x + offset + dx, tile.y + offset + dy]);
  }
  return cells;
}

export function createBoard({ tiles = [], ground = {}, sizeOf }) {
  const board = {
    tiles: tiles.map((t) => ({ rotation: 0, ...t })),
    ground: { ...ground },
    // Ce qui a ete fait, et ce qui a ete defait et pourrait etre refait.
    done: [],
    undone: [],
  };

  board.at = (x, y) => board.tiles.find(
    (tile) => footprint(tile, sizeOf).some(([cx, cy]) => cx === x && cy === y)) || null;

  board.box = () => { /* min et max sur les empreintes, {0,0,0,0} si vide */ };

  board.fits = (plan) => { /* boite de tiles + plan, largeur et hauteur <= MAX_SIZE */ };

  board.apply = (change) => { /* retire ce que place recouvre, applique, empile, vide undone */ };

  board.undo = () => { /* depile done, remet l etat d avant, empile dans undone */ };
  board.redo = () => { /* l inverse */ };

  return board;
}
```

Pour l'historique, garder dans chaque entrée **ce qui a été retiré et ce qui a été ajouté**, blocs et sol, plutôt qu'une copie complète du plateau : une copie par geste sur un plateau de quatre mille blocs est un mégaoctet par clic.

- [ ] **Étape 4 : Lancer les tests**

```bash
node --test "tests/js/editor/state.test.js"
```

Attendu : les 11 tests passent.

- [ ] **Étape 5 : Commit**

```bash
git add site/public/forge/editor/state.js tests/js/editor/state.test.js
git commit -m "feat(edition): le plateau, sa boite de 64 et son historique"
```

---

### Tâche 3 : `rules.js`, la légalité d'une pose

**Files:**
- Create: `site/public/forge/editor/rules.js`
- Test: `tests/js/editor/rules.test.js`

**Interfaces:**
- Consumes: `createBoard` de la tâche 2.
- Produces: `canPlace(board, plan, catalogue)` rend `{ ok: true }` ou `{ ok: false, why: "<phrase française>" }`. `plan` vaut `{ x, y, block, rotation }`.

- [ ] **Étape 1 : Écrire le test qui échoue**

Créer `tests/js/editor/rules.test.js` :

```javascript
/**
 * Ce que le jeu accepte qu on pose, et ce qu il refuse.
 *
 * Les regles viennent de `Build.validPlace`, `Block.canReplace`, `Drill.canMine` et
 * `Pump.canPlaceOn` de la v159.7. Celle qui commande les autres n est pas du jeu, elle
 * est de Corentin : une case sans sol peint n a aucune regle. Un editeur qui refuserait
 * une foreuse sur une toile vierge sous pretexte qu il n y voit pas de minerai serait un
 * editeur ou l on ne peut rien construire.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createBoard } from "../../../site/public/forge/editor/state.js";
import { canPlace } from "../../../site/public/forge/editor/rules.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const sizeOf = (name) => known.blocks[name]?.size || 1;
const board = (tiles = [], ground = {}) => createBoard({ tiles, ground, sizeOf });
const put = (plateau, plan) => canPlace(plateau, plan, known);

test("sans sol peint, tout se pose", () => {
  const plateau = board();
  assert.equal(put(plateau, { x: 0, y: 0, block: "mechanical-drill", rotation: 0 }).ok, true);
  assert.equal(put(plateau, { x: 0, y: 0, block: "mechanical-pump", rotation: 0 }).ok, true);
});

test("un convoyeur remplace un convoyeur", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  assert.equal(put(plateau, { x: 0, y: 0, block: "titanium-conveyor", rotation: 0 }).ok, true);
});

test("un routeur ne remplace pas un convoyeur, et le dit", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  const refus = put(plateau, { x: 0, y: 0, block: "graphite-press", rotation: 0 });
  assert.equal(refus.ok, false);
  assert.match(refus.why, /\S/);
});

test("au dela de 64 tuiles, le jeu ne suit plus", () => {
  const plateau = board([{ x: 0, y: 0, block: "conveyor", rotation: 0 }]);
  const refus = put(plateau, { x: 64, y: 0, block: "conveyor", rotation: 0 });
  assert.equal(refus.ok, false);
  assert.match(refus.why, /64/);
});

test("rien ne se batit sur un mur", () => {
  const plateau = board([], { "0,0": { floor: "stone", wall: "stone-wall" } });
  assert.equal(put(plateau, { x: 0, y: 0, block: "conveyor", rotation: 0 }).ok, false);
});

test("un liquide profond ne porte que ce qui flotte", () => {
  const plateau = board([], { "0,0": { floor: "deep-water" } });
  assert.equal(put(plateau, { x: 0, y: 0, block: "conveyor", rotation: 0 }).ok, false);
  // Le routeur ne flotte pas non plus ; le conduit blinde, si.
  const flottant = Object.entries(known.blocks).find(([, b]) => b.floating);
  assert.ok(flottant, "aucun bloc flottant au catalogue");
  assert.equal(put(plateau, { x: 0, y: 0, block: flottant[0], rotation: 0 }).ok, true);
});

test("une foreuse veut du minerai qu elle sait creuser", () => {
  const sansMinerai = board([], {
    "0,0": { floor: "stone" }, "1,0": { floor: "stone" },
    "0,1": { floor: "stone" }, "1,1": { floor: "stone" },
  });
  assert.equal(put(sansMinerai, { x: 0, y: 0, block: "mechanical-drill", rotation: 0 }).ok, false);

  const cuivre = board([], {
    "0,0": { floor: "stone", overlay: "ore-copper" }, "1,0": { floor: "stone" },
    "0,1": { floor: "stone" }, "1,1": { floor: "stone" },
  });
  assert.equal(put(cuivre, { x: 0, y: 0, block: "mechanical-drill", rotation: 0 }).ok, true);
});

test("une foreuse mecanique ne creuse pas le titane, sa durete la depasse", () => {
  const titane = board([], {
    "0,0": { floor: "stone", overlay: "ore-titanium" }, "1,0": { floor: "stone" },
    "0,1": { floor: "stone" }, "1,1": { floor: "stone" },
  });
  // tier 2 de la foreuse mecanique contre durete 3 du titane.
  assert.equal(put(titane, { x: 0, y: 0, block: "mechanical-drill", rotation: 0 }).ok, false);
  assert.equal(put(titane, { x: 0, y: 0, block: "pneumatic-drill", rotation: 0 }).ok, true);
});

test("une pompe veut du liquide sous chacune de ses cases", () => {
  const moitie = board([], { "0,0": { floor: "water" }, "1,0": { floor: "stone" } });
  assert.equal(put(moitie, { x: 0, y: 0, block: "mechanical-pump", rotation: 0 }).ok, true);
  // La pompe mecanique fait une case ; la rotative en fait deux et deborde sur la pierre.
  assert.equal(put(moitie, { x: 0, y: 0, block: "rotary-pump", rotation: 0 }).ok, false);
});

test("une case a moitie decrite ne bloque que ce qui est decrit", () => {
  // La case (0,0) est de la pierre, la case (1,0) n est pas peinte du tout. Une foreuse
  // qui couvre les deux ne peut pas etre refusee : la moitie du terrain est inconnue.
  const plateau = board([], { "0,0": { floor: "stone" } });
  assert.equal(put(plateau, { x: 0, y: 0, block: "mechanical-drill", rotation: 0 }).ok, true);
});
```

- [ ] **Étape 2 : Lancer le test pour vérifier qu'il échoue**

```bash
node --test "tests/js/editor/rules.test.js"
```

Attendu : ÉCHEC, module introuvable.

- [ ] **Étape 3 : Écrire l'implémentation**

Créer `site/public/forge/editor/rules.js`. L'ordre des vérifications compte : la raison affichée doit être la plus utile, donc la limite de taille passe avant le sol, et le sol avant le remplacement.

```javascript
/**
 * Une pose est-elle legale, et sinon pourquoi.
 *
 * LA REGLE QUI COMMANDE TOUTES LES AUTRES : une case sans sol peint n a aucune regle.
 * Tant que rien n est peint sous un bloc, la pose est legale. Les contraintes de terrain
 * n existent qu a mesure que le terrain est decrit. Autrement une toile vierge serait
 * inconstructible, et coller une schematique venue du jeu dans un editeur vide deviendrait
 * impossible.
 *
 * Le reste vient de `Build.validPlace`, `Block.canReplace`, `Drill.canMine` et
 * `Pump.canPlaceOn` de la v159.7.
 */
```

Les règles, dans cet ordre :

1. **La taille.** `board.fits(plan)` faux donne `« 64 tuiles de côté, le jeu n'en accepte pas plus »`.
2. **Le sol, case par case, et seulement là où il est peint.** Pour chaque case de l'empreinte qui a une entrée dans `board.ground` :
   - un `wall` posé donne `« rien ne se construit sur un mur »` ;
   - un sol `deep` avec un bloc sans `floating` donne `« un liquide profond ne porte que ce qui flotte »` ;
   - un sol `placeable_on` à `false` donne `« on ne bâtit pas sur ce sol »`.
3. **La foreuse.** Si `role === "drill"`, chercher dans les cases peintes de l'empreinte le minerai dominant. S'il existe au moins une case peinte et **aucune** case peinte ne porte un minerai creusable (`tier` du bloc `>=` `hardness` de l'objet, hors `blocked_items`), refuser avec `« il faut du minerai sous une foreuse »`. Si aucune case de l'empreinte n'est peinte, accepter.
4. **La pompe.** Même forme : parmi les cases peintes, toutes doivent porter le même `drops_liquid`. Une seule case peinte sans liquide donne `« une pompe veut du liquide sous chacune de ses cases »`.
5. **Le remplacement.** Si `board.at()` rend une tuile, appliquer `canReplace` du jeu :

```javascript
/** `Block.canReplace` de la v159.7, transcrit et non paraphrase. */
function canReplace(block, other) {
  if (other.always_replace) return true;
  if (other.privileged) return false;
  return other.replaceable !== false
    && (other !== block || (block.rotate && block.quick_rotate))
    && ((block.group !== "none" && other.group === block.group) || other === block)
    && (block.size === other.size
        || (block.size >= other.size
            && ((block.subclass != null && block.subclass === other.subclass)
                || block.group_any_replace)));
}
```

- [ ] **Étape 4 : Lancer les tests**

```bash
node --test "tests/js/editor/rules.test.js"
```

Attendu : les 10 tests passent. Si le test du bloc flottant ne trouve pas de candidat, lire le catalogue plutôt que de modifier l'assertion.

- [ ] **Étape 5 : Commit**

```bash
git add site/public/forge/editor/rules.js tests/js/editor/rules.test.js
git commit -m "feat(edition): ce que le jeu accepte qu on pose, et pourquoi pas"
```

---

### Tâche 4 : `lines.js`, ce qu'un glissé pose

**Files:**
- Create: `site/public/forge/editor/lines.js`
- Test: `tests/js/editor/lines.test.js`

**Interfaces:**
- Produces: `lineOf(from, to, block, catalogue)` rend `Array<{ x, y, block, rotation }>`. `from` et `to` valent `{ x, y }`.

- [ ] **Étape 1 : Écrire le test qui échoue**

Créer `tests/js/editor/lines.test.js` :

```javascript
/**
 * Ce qu un glisse pose, d apres `Placement.calculateNodes` de la v159.7.
 *
 * Un convoyeur trace en L et chaque segment regarde le suivant. C est la mecanique qui
 * fait la difference entre poser trente blocs en un geste et les poser en trente clics
 * suivis de quatre-vingt-dix clics pour les orienter.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { lineOf } from "../../../site/public/forge/editor/lines.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const line = (from, to, block) => lineOf(from, to, block, known);

test("un glisse droit pose une bande orientee vers l arrivee", () => {
  const posee = line({ x: 0, y: 0 }, { x: 3, y: 0 }, "conveyor");
  assert.equal(posee.length, 4);
  // Rotation 0 est l est, comptee dans le sens antihoraire comme le jeu la compte.
  assert.deepEqual(posee.map((t) => t.rotation), [0, 0, 0, 0]);
  assert.deepEqual(posee.map((t) => t.x), [0, 1, 2, 3]);
});

test("un glisse vers l ouest oriente les bandes vers l ouest", () => {
  const posee = line({ x: 3, y: 0 }, { x: 0, y: 0 }, "conveyor");
  assert.deepEqual(posee.map((t) => t.rotation), [2, 2, 2, 2]);
});

test("un glisse en diagonale fait un coude, et le coude tourne", () => {
  const posee = line({ x: 0, y: 0 }, { x: 2, y: 2 }, "conveyor");
  // Le premier segment suit l axe dominant du glisse, puis tourne une fois.
  assert.equal(posee.length, 5);
  const derniere = posee[posee.length - 1];
  assert.deepEqual({ x: derniere.x, y: derniere.y }, { x: 2, y: 2 });
  // Chaque bloc regarde celui d apres, donc au moins une rotation differe des autres.
  assert.ok(new Set(posee.map((t) => t.rotation)).size > 1, "aucun coude");
});

test("un bloc sans trace en L reste sur une ligne droite", () => {
  const posee = line({ x: 0, y: 0 }, { x: 3, y: 1 }, "router");
  assert.equal(posee.every((t) => t.y === 0), true, "le routeur a suivi un coude");
  assert.equal(posee.length, 4);
});

test("un gros bloc s espace de sa taille au lieu de se chevaucher", () => {
  const posee = line({ x: 0, y: 0 }, { x: 6, y: 0 }, "mechanical-drill");
  assert.deepEqual(posee.map((t) => t.x), [0, 2, 4, 6]);
});

test("un glisse d une seule case pose un seul bloc", () => {
  assert.equal(line({ x: 2, y: 2 }, { x: 2, y: 2 }, "conveyor").length, 1);
});
```

- [ ] **Étape 2 : Lancer le test pour vérifier qu'il échoue**

```bash
node --test "tests/js/editor/lines.test.js"
```

Attendu : ÉCHEC, module introuvable.

- [ ] **Étape 3 : Écrire l'implémentation**

Créer `site/public/forge/editor/lines.js`. Deux cas :

- **`conveyor_placement` vrai** : le chemin est un L à un coude. Le premier segment suit l'axe où le glissé est le plus long, le second termine. Chaque bloc prend la rotation qui regarde la case suivante ; le dernier garde celle de son segment.
- **sinon** : une ligne droite sur l'axe dominant, du départ à l'arrivée, espacée de `size` cases.

Les rotations sont comptées comme le jeu les compte, dans le sens antihoraire depuis l'est : `0` est, `1` nord, `2` ouest, `3` sud. `render.js` porte déjà la constante `DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]]`, l'importer plutôt qu'en écrire une deuxième.

- [ ] **Étape 4 : Lancer les tests**

```bash
node --test "tests/js/editor/lines.test.js"
```

Attendu : les 6 tests passent.

- [ ] **Étape 5 : Commit**

```bash
git add site/public/forge/editor/lines.js tests/js/editor/lines.test.js
git commit -m "feat(edition): un glisse trace une ligne, en L sur les bandes"
```

---

### Tâche 5 : `camera.js`, où l'on regarde

**Files:**
- Create: `site/public/forge/editor/camera.js`
- Test: `tests/js/editor/camera.test.js`

**Interfaces:**
- Produces: `createCamera({ scale = 24, x = 0, y = 0 })` avec `camera.toTile(px, py, viewport)`, `camera.toScreen(tx, ty, viewport)`, `camera.zoomAt(factor, px, py, viewport)`, `camera.pan(dx, dy)`, `camera.frame(box, viewport)`. `viewport` vaut `{ width, height }` en pixels CSS.

- [ ] **Étape 1 : Écrire le test qui échoue**

Créer `tests/js/editor/camera.test.js` :

```javascript
/**
 * Ou l on regarde, et quelle case est sous le curseur.
 *
 * Teste seul parce que c est exactement l endroit ou vivent les erreurs d une case : une
 * conversion fausse d un demi pixel pose le bloc a cote de la ou le joueur l a vu, et rien
 * a l ecran ne dit pourquoi.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createCamera } from "../../../site/public/forge/editor/camera.js";

const vue = { width: 800, height: 600 };

test("le centre de la vue est la ou la camera regarde", () => {
  const camera = createCamera({ scale: 20, x: 10, y: 5 });
  assert.deepEqual(camera.toTile(400, 300, vue), { x: 10, y: 5 });
});

test("aller a l ecran et revenir rend la meme case", () => {
  const camera = createCamera({ scale: 17, x: -3, y: 8 });
  for (const [tx, ty] of [[0, 0], [-3, 8], [40, -12], [63, 63]]) {
    const { px, py } = camera.toScreen(tx, ty, vue);
    assert.deepEqual(camera.toTile(px, py, vue), { x: tx, y: ty });
  }
});

test("l ecran monte quand la carte descend", () => {
  // Le canvas compte ses pixels vers le bas, le jeu compte ses tuiles vers le haut.
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  const bas = camera.toScreen(0, -1, vue);
  const haut = camera.toScreen(0, 1, vue);
  assert.ok(bas.py > haut.py, "l axe vertical est a l endroit, il devrait etre inverse");
});

test("zoomer garde sous le curseur la case qui y etait", () => {
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  const avant = camera.toTile(650, 120, vue);
  camera.zoomAt(2, 650, 120, vue);
  assert.deepEqual(camera.toTile(650, 120, vue), avant);
});

test("le zoom est borne des deux cotes", () => {
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  for (let i = 0; i < 40; i++) camera.zoomAt(2, 400, 300, vue);
  assert.ok(camera.scale <= 64, `zoom parti a ${camera.scale}`);
  for (let i = 0; i < 80; i++) camera.zoomAt(0.5, 400, 300, vue);
  assert.ok(camera.scale >= 4, `zoom parti a ${camera.scale}`);
});

test("recadrer met la boite entiere dans la vue", () => {
  const camera = createCamera({ scale: 64, x: 0, y: 0 });
  camera.frame({ left: 0, bottom: 0, width: 60, height: 40 }, vue);
  const coin = camera.toScreen(0, 0, vue);
  const loin = camera.toScreen(59, 39, vue);
  for (const p of [coin, loin]) {
    assert.ok(p.px >= 0 && p.px <= vue.width, `${p.px} hors de la vue`);
    assert.ok(p.py >= 0 && p.py <= vue.height, `${p.py} hors de la vue`);
  }
});
```

- [ ] **Étape 2 : Lancer le test pour vérifier qu'il échoue**

```bash
node --test "tests/js/editor/camera.test.js"
```

Attendu : ÉCHEC, module introuvable.

- [ ] **Étape 3 : Écrire l'implémentation**

Créer `site/public/forge/editor/camera.js`. `camera.x` et `camera.y` sont la tuile au centre de la vue, `camera.scale` le nombre de pixels par tuile, borné entre 4 et 64. L'axe vertical s'inverse : `py` croît vers le bas, `ty` croît vers le haut. `toTile` arrondit vers le bas après conversion, jamais avec `Math.round`, sinon la moitié d'une tuile déborde sur sa voisine.

- [ ] **Étape 4 : Lancer les tests**

```bash
node --test "tests/js/editor/camera.test.js"
```

Attendu : les 6 tests passent.

- [ ] **Étape 5 : Commit**

```bash
git add site/public/forge/editor/camera.js tests/js/editor/camera.test.js
git commit -m "feat(edition): la camera, et quelle case est sous le curseur"
```

---

### Tâche 6 : `render.js` accepte une caméra et met ses calques en cache

**Files:**
- Modify: `site/public/forge/render.js` (la fonction `draw`, à partir de la ligne 296)
- Test: `tests/js/editor/render-camera.test.js`

**Interfaces:**
- Consumes: `createCamera` de la tâche 5.
- Produces: `draw(canvas, tiles, sizeOf, roleOf, options)` accepte deux options de plus, `camera` et `viewport`. Quand `camera` est donné, la boîte englobante ne décide plus ni de la taille du canvas ni de l'échelle. `draw` rend en plus `{ scale, box, missing }` comme aujourd'hui.

- [ ] **Étape 1 : Écrire le test qui échoue**

Créer `tests/js/editor/render-camera.test.js`. `draw` a besoin d'un canvas, que Node n'a pas ; le test porte donc sur la fonction pure qui décide du cadrage, extraite pour l'occasion :

```javascript
/**
 * Ce que la camera change au cadrage, teste sans navigateur.
 *
 * `draw` a besoin d un canvas et Node n en a pas. Ce qui se teste, et qui est ce qui casse,
 * est la decision de cadrage : quelle zone de la carte tombe dans la vue.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { viewportBox } from "../../../site/public/forge/render.js";
import { createCamera } from "../../../site/public/forge/editor/camera.js";

test("sans camera, le cadrage reste celui du rapport", () => {
  const box = viewportBox({ tight: { left: 2, bottom: 3, width: 10, height: 8 }, apron: 0 });
  assert.deepEqual(box, { left: 2, bottom: 3, width: 10, height: 8 });
});

test("le pourtour s ouvre autour de la boite", () => {
  const box = viewportBox({ tight: { left: 0, bottom: 0, width: 4, height: 4 }, apron: 2 });
  assert.deepEqual(box, { left: -2, bottom: -2, width: 8, height: 8 });
});

test("avec une camera, le cadrage vient de la vue et non du contenu", () => {
  const camera = createCamera({ scale: 20, x: 0, y: 0 });
  const box = viewportBox({
    tight: { left: 0, bottom: 0, width: 2, height: 2 },
    apron: 0, camera, viewport: { width: 800, height: 600 },
  });
  // 800 / 20 = 40 tuiles de large, centrees sur zero.
  assert.equal(box.width, 40);
  assert.equal(box.height, 30);
  assert.equal(box.left, -20);
});
```

- [ ] **Étape 2 : Lancer le test pour vérifier qu'il échoue**

```bash
node --test "tests/js/editor/render-camera.test.js"
```

Attendu : ÉCHEC, `viewportBox` n'est pas exporté.

- [ ] **Étape 3 : Extraire le cadrage et brancher la caméra**

Dans `render.js`, sortir de `draw` le calcul de `box` (aujourd'hui lignes 305 à 312) dans une fonction exportée `viewportBox({ tight, apron, camera, viewport })`, puis l'appeler depuis `draw`. Quand `camera` est absent, le comportement ne change pas d'un pixel : c'est ce que vérifient les deux premiers tests.

Quand `camera` est présent, `draw` ne redimensionne plus le canvas sur le contenu : il prend `viewport`, garde `camera.scale` comme échelle, et ne dessine que les tuiles qui tombent dans la boîte.

- [ ] **Étape 4 : Mesurer avant de mettre en calques**

Le plan prévoyait ici deux canvas hors écran, un pour le sol et un pour les blocs, repeints
seulement quand leur version change. **Reporté après mesure**, décision prise le 27/08/2026.

Le repère invoqué était le tableau de bord de `mindustry-ai`, qui a rencontré ce mur et l'a
résolu ainsi. Mais il repeint jusqu'à 65 000 tuiles réparties sur six parties simultanées,
là où un schéma est plafonné à 64 × 64, soit 4 096 cases dont seules les occupées portent un
sprite. Écrire un cache pour un problème qu'on n'a pas mesuré, c'est ajouter deux états à
tenir cohérents contre une lenteur supposée.

La mesure se fait donc en tâche 7, quand le plateau existe : compter le temps d'un `draw`
sur une schématique dense pendant un tracé. Au-dessus de 8 ms par image, on met en calques
et on l'écrit ici. En dessous, on ne le fait pas et on l'écrit aussi.

- [ ] **Étape 5 : Vérifier que le rapport n'a pas bougé**

```bash
npm test
```

Attendu : les 227 tests d'origine passent, dont ceux de `render.test.js`, plus les 3 nouveaux.

Puis à la main : servir le site et analyser une schématique.

```bash
cd site/public && python -m http.server 8181
```

Ouvrir `http://localhost:8181/`, coller une schématique, vérifier que l'image est identique à ce qu'elle était : mêmes sprites, mêmes anneaux, même hachure de fond, même taille.

- [ ] **Étape 6 : Commit**

```bash
git add site/public/forge/render.js tests/js/editor/render-camera.test.js
git commit -m "feat(rendu): une camera optionnelle, et des calques en cache"
```

---

### Tâche 7 : Le squelette du mode, et la bascule

Premier moment où quelque chose s'affiche. À la fin de cette tâche on peut entrer en édition, se déplacer, zoomer, poser un bloc, le casser, annuler.

**Files:**
- Create: `site/public/forge/editor/mount.js`
- Modify: `site/public/index.html`
- Modify: `site/public/forge/forge.css`

**Interfaces:**
- Consumes: `createBoard`, `canPlace`, `createCamera`, `draw`.
- Produces: `mountEditor({ host, board, catalogue, onAnalyse })` rend `{ destroy(), board }`.

- [ ] **Étape 1 : Écrire le squelette**

Créer `site/public/forge/editor/mount.js` : crée le plateau, la caméra, le canvas, et branche les événements.

- Molette : `camera.zoomAt`.
- Clic milieu ou espace + glisser : `camera.pan`.
- Clic gauche : `canPlace`, puis `board.apply({ place: [plan] })`.
- Clic droit : `board.apply({ remove: [tuile] })`, et `event.preventDefault()` sur `contextmenu`, sinon le menu du navigateur s'ouvre à chaque casse.
- `ctrl+Z` et `ctrl+Y`.
- Fantôme du bloc en main redessiné à chaque `pointermove`, en vert ou en rouge, avec la raison du refus sous le curseur.

- [ ] **Étape 2 : Brancher la bascule dans `index.html`**

Deux boutons dans l'en-tête du rapport, `Analyser` et `Éditer`. Le second remplace le contenu de `#out` par le plateau et appelle `mountEditor`. Le premier relance `run()` sur `board.tiles`, **sans détruire le plateau** : revenir en édition et faire ctrl+Z doit encore marcher.

Ajouter sur l'accueil, dans la rangée de boutons à côté d'`Analyser`, un bouton « Construire depuis zéro » qui monte l'éditeur sur un plateau vide.

- [ ] **Étape 3 : Vérifier à la main**

```bash
cd site/public && python -m http.server 8181
```

Liste de contrôle, chaque ligne vérifiée dans le navigateur :

- [ ] « Construire depuis zéro » ouvre un plateau vide plein écran
- [ ] La molette zoome, et la case sous le curseur ne bouge pas pendant le zoom
- [ ] Clic milieu glissé déplace la vue
- [ ] Un clic gauche pose un convoyeur là où le fantôme était, pas à côté
- [ ] Un clic droit le retire, et le menu contextuel du navigateur ne s'ouvre pas
- [ ] `ctrl+Z` défait, `ctrl+Y` refait
- [ ] Analyser sort du mode et affiche le rapport de ce qui vient d'être construit
- [ ] Éditer y revient, et `ctrl+Z` marche encore

- [ ] **Étape 4 : Commit**

```bash
git add site/public/forge/editor/mount.js site/public/index.html site/public/forge/forge.css
git commit -m "feat(edition): le mode, la bascule, poser casser annuler"
```

---

### Tâche 8 : Le rail, la palette et la barre d'état

**Files:**
- Create: `site/public/forge/editor/ui.js`
- Modify: `site/public/forge/editor/mount.js`, `site/public/forge/forge.css`

**Interfaces:**
- Produces: `mountRail({ host, catalogue, onPick, onTab })` rend `{ setHeld(name), setSize(box), setHint(text), destroy() }`.

- [ ] **Étape 1 : Écrire le rail**

Un rail de 280 px : deux onglets `BÂTIR` et `SOL`, une recherche, les catégories du jeu en icônes, la grille de blocs, et le panneau « en main » avec le nom, la rotation et le coût de construction.

Les catégories viennent du champ `category` ajouté en tâche 1, le filtre de planète du champ `planet`. Aucune liste de blocs n'est écrite à la main : une deuxième copie de la donnée du jeu est exactement ce que ce dépôt passe son temps à éviter.

- [ ] **Étape 2 : La barre d'état et la jauge de taille**

En bas, une ligne contextuelle qui dit les gestes du moment. En haut, `22 × 14 / 64 × 64` avec une barre qui se remplit et vire au rouge au contact du bord.

- [ ] **Étape 3 : Vérifier à la main**

- [ ] Les catégories montrent bien les blocs de cette catégorie, et rien d'autre
- [ ] Le filtre Serpulo / Erekir sépare correctement les deux jeux de blocs
- [ ] La recherche trouve un bloc par son nom français comme par son nom interne
- [ ] Cliquer un bloc le met en main, et le panneau affiche son coût
- [ ] La jauge suit la boîte pendant qu'on construit
- [ ] `échap` repose le bloc en main

- [ ] **Étape 4 : Commit**

```bash
git add site/public/forge/editor/ui.js site/public/forge/editor/mount.js site/public/forge/forge.css
git commit -m "feat(edition): le rail, la palette du jeu et la jauge de taille"
```

---

### Tâche 9 : Le glissé, le remplacement et la pipette

**Files:**
- Modify: `site/public/forge/editor/mount.js`

- [ ] **Étape 1 : Brancher `lineOf` sur le glissé**

`pointerdown` mémorise la case de départ, `pointermove` recalcule l'aperçu avec `lineOf`, `pointerup` applique tout **en un seul `board.apply`**, donc en une seule entrée d'historique. Les blocs de la ligne que `canPlace` refuse sont dessinés en rouge et ne sont pas posés ; le reste passe.

- [ ] **Étape 2 : La rotation**

`R` tourne le bloc en main d'un quart de tour, shift+molette aussi. La flèche du jeu est dessinée sur le fantôme quand le bloc a `rotate`.

- [ ] **Étape 3 : La casse en rectangle**

Clic droit glissé dessine un rectangle rouge et retire d'un coup tous les blocs dont l'empreinte le touche.

- [ ] **Étape 4 : La pipette**

`Q` ou clic milieu sur un bloc posé le reprend en main avec sa rotation et sa configuration. Le clic milieu déplace aussi la vue : c'est un appui sans glissé qui prend, un appui avec glissé qui déplace.

- [ ] **Étape 5 : Vérifier à la main**

- [ ] Glisser sur dix cases pose dix convoyeurs orientés dans le sens du glissé
- [ ] Un glissé en diagonale fait un coude, et le convoyeur du coude tourne
- [ ] Un glissé de foreuses les espace de deux cases sans les chevaucher
- [ ] Un seul `ctrl+Z` défait toute la ligne
- [ ] Poser un convoyeur titane sur un convoyeur le remplace
- [ ] Poser une presse sur un convoyeur refuse et dit pourquoi
- [ ] Clic droit glissé efface une zone
- [ ] `Q` sur un convoyeur tourné le reprend avec sa rotation

- [ ] **Étape 6 : Commit**

```bash
git add site/public/forge/editor/mount.js
git commit -m "feat(edition): tracer une ligne, remplacer, reprendre un bloc"
```

---

### Tâche 10 : `selection.js`, la sélection et le presse-papiers

**Files:**
- Create: `site/public/forge/editor/selection.js`
- Modify: `site/public/forge/editor/mount.js`
- Test: `tests/js/editor/selection.test.js`

**Interfaces:**
- Produces: `inBox(tiles, box, sizeOf)`, `translate(tiles, dx, dy)`, `rotateBy(tiles, quarters, catalogue)`, `flip(tiles, axis, catalogue)`.

- [ ] **Étape 1 : Écrire le test qui échoue**

Créer `tests/js/editor/selection.test.js` :

```javascript
/**
 * Ce qu on fait d un groupe de blocs une fois qu il est selectionne.
 *
 * Tourner une selection n est pas tourner chaque bloc sur place : les positions tournent
 * aussi, autour du coin de la boite. Les confondre donne une selection qui explose des le
 * premier quart de tour.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { flip, inBox, rotateBy, translate }
  from "../../../site/public/forge/editor/selection.js";
import { loadCatalogue } from "../helpers.js";

const known = loadCatalogue();
const bande = (x, y, rotation = 0) => ({ x, y, block: "conveyor", rotation });
const sizeOf = (name) => known.blocks[name]?.size || 1;

test("la selection prend ce que la boite couvre, et rien d autre", () => {
  const tiles = [bande(0, 0), bande(5, 5), bande(2, 2)];
  const prise = inBox(tiles, { left: 0, bottom: 0, width: 3, height: 3 }, sizeOf);
  assert.equal(prise.length, 2);
});

test("deplacer deplace tout du meme pas", () => {
  const bouge = translate([bande(0, 0), bande(1, 0)], 3, -2);
  assert.deepEqual(bouge.map((t) => [t.x, t.y]), [[3, -2], [4, -2]]);
});

test("un quart de tour tourne les positions et les blocs ensemble", () => {
  // Une bande qui va vers l est, tournee d un quart, va vers le nord.
  const tourne = rotateBy([bande(0, 0), bande(1, 0)], 1, known);
  assert.equal(tourne[0].rotation, 1);
  assert.equal(tourne[1].rotation, 1);
  // Les deux etaient cote a cote horizontalement, elles sont l une sur l autre.
  assert.notEqual(tourne[0].x === tourne[1].x, false);
});

test("quatre quarts de tour rendent la selection de depart", () => {
  const depart = [bande(0, 0), bande(3, 1, 2), bande(1, 4, 3)];
  let tourne = depart;
  for (let i = 0; i < 4; i++) tourne = rotateBy(tourne, 1, known);
  const cle = (t) => `${t.x},${t.y},${t.block},${t.rotation}`;
  assert.deepEqual(tourne.map(cle).sort(), depart.map(cle).sort());
});

test("un miroir retourne les positions et retourne les bandes avec", () => {
  const mire = flip([bande(0, 0, 0), bande(1, 0, 0)], "x", known);
  // Une bande qui allait vers l est va vers l ouest.
  assert.equal(mire[0].rotation, 2);
});

test("un miroir deux fois rend la selection de depart", () => {
  const depart = [bande(0, 0, 1), bande(2, 3, 0)];
  const cle = (t) => `${t.x},${t.y},${t.block},${t.rotation}`;
  assert.deepEqual(flip(flip(depart, "x", known), "x", known).map(cle).sort(),
                   depart.map(cle).sort());
});
```

- [ ] **Étape 2 : Lancer le test pour vérifier qu'il échoue**

```bash
node --test "tests/js/editor/selection.test.js"
```

Attendu : ÉCHEC, module introuvable.

- [ ] **Étape 3 : Écrire l'implémentation**

Créer `site/public/forge/editor/selection.js`. Les positions tournent autour du coin bas gauche de la boîte de la sélection, et la rotation de chaque bloc s'ajoute modulo 4, seulement si le bloc a `rotate`. Pour le miroir, la rotation se reflète : sur l'axe X, `0` devient `2` et `2` devient `0`, le nord et le sud ne bougent pas.

- [ ] **Étape 4 : Brancher sur le mode**

Ctrl+glisser dessine la sélection. Une barre flottante apparaît à côté : copier, coller, tourner, miroir, supprimer. `ctrl+C` écrit la sélection dans le presse-papiers système au format `.msch` avec `toBase64` de `schematic.js`, `ctrl+V` lit le presse-papiers et colle avec `fromBase64`. Un collage qui ferait dépasser 64 × 64 est refusé en entier, jamais tronqué.

- [ ] **Étape 5 : Lancer les tests, puis vérifier à la main**

```bash
npm test
```

- [ ] Ctrl+glisser dessine une sélection
- [ ] Tourner la sélection ne la fait pas exploser
- [ ] `ctrl+C` puis coller dans le jeu donne bien la structure
- [ ] Copier depuis le jeu puis `ctrl+V` la colle sur le plateau

- [ ] **Étape 6 : Commit**

```bash
git add site/public/forge/editor/selection.js site/public/forge/editor/mount.js \
        tests/js/editor/selection.test.js
git commit -m "feat(edition): selectionner, tourner, et parler au presse-papiers"
```

---

### Tâche 11 : L'onglet sol

**Files:**
- Modify: `site/public/forge/editor/ui.js`, `site/public/forge/editor/mount.js`
- Modify: `site/public/index.html` (retirer les cartes « Poser un bloc » et « Le sol »)

- [ ] **Étape 1 : Les outils du sol**

Sous l'onglet `SOL` : crayon à taille réglable, rectangle, pot de peinture par zone contiguë, gomme, pipette. Trois listes, sols, minerais et murs, chacune filtrée depuis le catalogue par `floor`, `overlay` et `wall`.

- [ ] **Étape 2 : La transparence automatique**

Passer sur `SOL` fait fondre les blocs à 35 %, revenir sur `BÂTIR` les rend opaques. Le curseur de réglage manuel reste, et ce qu'il règle survit à la bascule.

- [ ] **Étape 3 : Retirer les cartes du rapport**

Supprimer de `index.html` les cartes « Poser un bloc » et « Le sol », et le code qui les branche : palette, recherche, pinceau, taille, curseur de transparence, effacement du sol. Le panneau « Un bloc » du rapport garde la lecture et le marquage des entrées et sorties, et perd « Tourner » et « Retirer ce bloc », qui vivent maintenant dans le mode.

Supprimer aussi les variables devenues orphelines (`placing`, `brush`). Ne rien laisser traîner.

- [ ] **Étape 4 : Vérifier à la main**

- [ ] Peindre du minerai sous une foreuse change le débit annoncé par le rapport
- [ ] Le pot de peinture remplit une zone fermée sans déborder
- [ ] Poser un mur sur une case empêche d'y bâtir, et le dit
- [ ] Une foreuse refuse de se poser sur de la pierre nue et l'explique
- [ ] Une foreuse se pose sans rien dire là où aucun sol n'est peint
- [ ] Le rapport ne contient plus aucune carte d'édition

- [ ] **Étape 5 : Lancer les tests et commit**

```bash
npm test
git add site/public/forge/editor/ui.js site/public/forge/editor/mount.js site/public/index.html
git commit -m "feat(edition): l onglet sol, ses outils et sa transparence"
```

---

### Tâche 12 : Les configurations de blocs

**Files:**
- Modify: `site/public/forge/editor/mount.js`, `site/public/forge/editor/ui.js`

- [ ] **Étape 1 : Le choix d'un objet**

Cliquer un trieur, un trieur inverse ou un déchargeur posé ouvre la liste des objets du catalogue. Le choix va dans `tile.config`, que `schematic.js` sait déjà écrire.

- [ ] **Étape 2 : Le choix d'une cible**

Cliquer un pont ou un mass driver posé passe en attente de cible ; le clic suivant sur un bloc à portée écrit le lien. Le trait est dessiné, comme `render.js` le fait déjà pour les ponts du rapport.

- [ ] **Étape 3 : Vérifier à la main**

- [ ] Un trieur configuré en cuivre, exporté, rouvert, est toujours configuré en cuivre
- [ ] Le même, collé dans le jeu, y arrive configuré
- [ ] Un lien de pont hors de portée est refusé et le dit

- [ ] **Étape 4 : Commit**

```bash
git add site/public/forge/editor/mount.js site/public/forge/editor/ui.js
git commit -m "feat(edition): configurer un trieur, lier un pont"
```

---

### Tâche 13 : Le sol survit à l'enregistrement

Aujourd'hui le sol vit dans une variable de la page. Une schématique gardée puis rouverte a perdu son terrain, donc ses foreuses redeviennent « au mieux, sur une tache pleine ». Tout le travail des tâches 11 et 3 s'évapore au rechargement sans cette tâche.

**Files:**
- Create: `site/database/migrations/2026_08_27_000000_add_ground_to_schematics_table.php`
- Modify: `site/app/Models/Schematic.php`, `site/app/Http/Controllers/SchematicController.php`
- Modify: `site/public/index.html` (envoyer et relire le sol)
- Test: `site/tests/Feature/` (suivre les tests existants du contrôleur)

- [ ] **Étape 1 : La migration**

```php
Schema::table('schematics', function (Blueprint $table) {
    /* Le sol sur lequel la schematique a ete concue. Il ne fait pas partie du format du
       jeu, qui ne stocke que des blocs, mais sans lui une foreuse redevient "au mieux,
       sur une tache pleine" : la figure que le sol peint avait precisement supprimee. */
    $table->json('ground')->nullable();
});
```

- [ ] **Étape 2 : Le faire passer par le contrôleur**

Ajouter `ground` aux champs validés de `store` et `update`, et au JSON rendu par `read`. La validation borne la taille : au plus 4 096 cases, ce qui est exactement 64 × 64.

- [ ] **Étape 3 : Le brancher côté page**

`index.html` envoie `ground` en gardant, et le relit en rouvrant.

- [ ] **Étape 4 : Vérifier**

```bash
cd site && php artisan migrate && php artisan test
```

Puis à la main : peindre du sol, garder, recharger la page, rouvrir, vérifier que le sol est là et que le débit de la foreuse est le même qu'avant.

- [ ] **Étape 5 : Commit**

```bash
git add site/database/migrations site/app site/public/index.html site/tests
git commit -m "feat(schematiques): garder le sol avec la schematique"
```

---

### Tâche 14 : Le brouillon, le tactile et l'aide

**Files:**
- Modify: `site/public/forge/editor/mount.js`, `site/public/forge/editor/ui.js`

- [ ] **Étape 1 : Le brouillon local**

À chaque geste, écrire le plateau dans `localStorage` sous une clé unique. À l'ouverture, s'il y a un brouillon, proposer « reprendre » ou « repartir de zéro ». Ne jamais restaurer sans demander : écraser silencieusement le travail de quelqu'un est pire que de perdre un brouillon.

- [ ] **Étape 2 : Le tactile**

Appui pose, appui long casse, deux doigts déplacent et zooment, un bouton flottant tourne quand un bloc est en main.

- [ ] **Étape 3 : Le panneau d'aide**

Le bouton `?` de la barre d'état ouvre la liste des raccourcis. Une liste, pas une documentation.

- [ ] **Étape 4 : Vérifier à la main**

- [ ] Construire, recharger la page, le brouillon est proposé et se reprend intact
- [ ] Sur un téléphone, ou avec l'émulation tactile du navigateur, on peut poser, casser, déplacer et zoomer
- [ ] `?` liste tous les raccourcis que le mode utilise vraiment

- [ ] **Étape 5 : Lancer les tests et commit**

```bash
npm test
git add site/public/forge/editor/
git commit -m "feat(edition): le brouillon, le tactile et la liste des raccourcis"
```

---

### Tâche 15 : Fermer le chantier

- [ ] **Étape 1 : Passer toute la suite**

```bash
npm test
cd site && php artisan test
```

Attendu : aucun échec des deux côtés.

- [ ] **Étape 2 : Mettre `docs/todo.md` à jour**

Cocher « L'éditeur » dans la section corrigée, en disant ce qu'il fait maintenant plutôt qu'en laissant la ligne d'avant, qui décrit un éditeur à trois boutons.

- [ ] **Étape 3 : Rebaser sur le tronc**

L'autre session travaille sur `restart/place-de-marche` et a touché `tools/build_catalogue.py` et `bench/src/mindustryforge/DumpBlocks.java`, les deux fichiers de la tâche 1. Le conflit est attendu et se règle à la main.

```bash
git fetch
git rebase restart/place-de-marche
npm test
```

- [ ] **Étape 4 : Ouvrir la demande de tirage**

```bash
git push -u origin feat/mode-edition
gh pr create --fill
```

---

## Auto-relecture

**Couverture du cahier des charges.** Chaque section de `docs/plan-edition.md` a sa tâche : l'interface en 7, 8 et 14 ; les douze mécaniques de pose en 7, 9, 10 et 12 ; le sol et ses règles en 3 et 11 ; la limite de 64 en 2 et 3 ; les champs du catalogue en 1 ; la caméra en 6 ; la colonne `ground` en 13.

**Écart assumé avec le cahier des charges.** Le `tools.js` annoncé devient `lines.js`, `selection.js` et `camera.js`. Trois algorithmes sans rapport dans un fichier auraient été un fichier que personne ne tient en tête.

**Ce que ce plan ne teste pas automatiquement.** `ui.js` et `mount.js` touchent le navigateur et le dépôt n'a pas de harnais de test navigateur. Leur vérification est une liste de contrôle à cocher à la main, écrite dans chaque tâche. En introduire un pour ce chantier serait un deuxième chantier.

**Un risque, nommé.** La tâche 1 régénère `bench/data/blocks.json` avec un serveur Mindustry réel. La chaîne a été vérifiée avant d'écrire ce plan : le dump régénéré est identique octet pour octet à celui qui est versionné, donc le diff ne portera que sur les champs ajoutés. Si ce n'est pas le cas au moment de le faire, c'est que le greffon a changé entre temps, et il faut s'arrêter plutôt que committer un catalogue différent.
