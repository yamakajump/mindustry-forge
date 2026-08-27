# Le mode édition

Demandé le 27/08/2026 : « toute la partie édition, le sol derrière, c'est super mal fait.
Faudrait faire un mode à part où tu passes en mode édition et tu reprends toutes les
mécaniques pour poser du jeu. Et un schéma ne peut pas dépasser une certaine taille, il
faut prendre ça en compte. » Puis, dans la foulée : « s'il n'y a aucun sol, tu peux poser
tout ce que tu veux ».

Écrit avant de coder, parce que « toutes les mécaniques du jeu » est une phrase courte qui
recouvre une douzaine de comportements précis, et qu'en implémenter dix sur douze au jugé
donne un éditeur qui trahit le joueur sur les deux qui manquent.

## Ce qui existe, et pourquoi ça ne va pas

L'édition n'est pas un mode : c'est trois cartes empilées dans la colonne de droite du
rapport d'analyse, entre « Goulot » et « Garder ». On édite au milieu de ses résultats.

Le détail de ce qui manque, lu dans `site/public/index.html` :

- **Poser est un clic simple**, et la rotation vaut toujours zéro (`rotation: 0` en dur,
  ligne 1020). Il faut poser, puis cliquer le bloc, puis « Tourner », par pas de 90°.
- **Une case occupée refuse en silence** (`if (placing && !hit)`). Rien ne se passe, rien
  n'est dit, et le remplacement d'un convoyeur par un convoyeur est impossible.
- **Pas de glissé.** Une ligne de trente convoyeurs se pose en trente clics, chacun suivi
  de trois clics pour l'orienter.
- **Pas d'annulation.** Une fausse manœuvre se répare à la main.
- **Aucune limite de taille**, alors que le jeu en a une et qu'elle est dure.
- **Le sol se peint à l'aveugle** sous les blocs, sauf à aller chercher un curseur de
  transparence dans une autre carte.
- **Le sol n'est enregistré nulle part.** Il vit dans une variable de la page. Une
  schématique gardée puis rouverte a perdu son terrain, donc ses foreuses redeviennent
  « au mieux, sur une tache pleine », ce que l'étape A du plan du sol avait précisément
  supprimé.
- **La palette est une liste plate de 253 pastilles.** Ce n'est pas une palette, c'est un
  annuaire.

## L'interface

Un écran. Le plateau prend toute la place, le reste tient dans un rail de 280 px à gauche
et deux barres fines.

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Mindustry Forge     [Analyser]│[Éditer]      22×14 / 64×64  ▰▰▰▱▱   ↶  ↷   │
├──────────────────────┬─────────────────────────────────────────────────────┤
│  ┌ BÂTIR ┬─ SOL ─┐   │                                                     │
│  ├───────┴───────┤   │                                                     │
│  │ ⌕ chercher    │   │                                                     │
│  ├───────────────┤   │                     le plateau                      │
│  │ catégories    │   │                                                     │
│  ├───────────────┤   │           grille · sol · blocs · fantôme            │
│  │ ▣ ▣ ▣ ▣ ▣     │   │                                                     │
│  │ ▣ ▣ ▣ ▣ ▣     │   │                                                     │
│  ├───────────────┤   │                                                     │
│  │ EN MAIN       │   │                                                     │
│  │  ▣ convoyeur ↑│   │                                                     │
│  │  1 cuivre     │   │                                                     │
│  └───────────────┘   │                                                     │
├──────────────────────┴─────────────────────────────────────────────────────┤
│ glisser tracer · R tourner · clic droit casser · ctrl+Z annuler        [?] │
└────────────────────────────────────────────────────────────────────────────┘
```

**Deux onglets plutôt qu'une pile de cartes.** Bâtir et peindre le sol sont deux
intentions, avec deux palettes et deux jeux d'outils. Les mélanger dans une colonne est
exactement ce qui rend la version actuelle illisible.

**Aucune barre d'outils dans `BÂTIR`.** Le jeu n'en a pas : un bloc en main pose, le clic
droit casse, ctrl+glisser sélectionne. Ajouter des boutons de mode serait inventer une
ergonomie que le joueur devrait désapprendre. `SOL` en a de vrais (crayon, rectangle, pot,
gomme, taille), parce que l'éditeur de carte du jeu en a aussi. L'asymétrie est voulue.

**La palette est rangée comme celle du jeu** : par catégorie, avec un filtre Serpulo /
Erekir et une recherche.

**La transparence devient automatique.** Passer sur `SOL` fait fondre les blocs à 35 %,
revenir sur `BÂTIR` les rend opaques. Le curseur reste, pour régler à la main. C'est ce
qui supprime la peinture à l'aveugle sans demander un geste de plus.

**Le refus se dit à l'endroit du refus.** Le fantôme passe en rouge et une ligne apparaît
sous le curseur : « il faut du minerai sous une foreuse », « 64 tuiles de large, le jeu
n'en accepte pas plus ». Pas de toast, pas de modale, pas de journal d'erreurs.

**La jauge de taille est permanente** en haut : `22 × 14 / 64 × 64`, une barre qui se
remplit et vire au rouge au contact du bord.

**La sélection porte ses propres boutons**, flottants à côté d'elle : copier, coller,
tourner, miroir, supprimer.

**Le brouillon se sauve tout seul** dans le navigateur, blocs et sol compris. Fermer
l'onglet après vingt minutes de construction ne doit rien coûter. Au retour, « reprendre »
ou « repartir de zéro ».

**Deux portes d'entrée** : un bouton « Construire depuis zéro » sur l'accueil, à côté
d'Analyser, et la bascule `Éditer` depuis n'importe quel rapport. On sort par `Analyser`,
qui relance le rapport sur ce qui vient d'être construit sans vider l'historique
d'annulation : revenir en édition et faire ctrl+Z doit encore marcher.

**Tactile** : appui pose, appui long casse, deux doigts déplacent et zooment, un bouton
flottant tourne. Ce ne sera pas le confort du bureau, mais rien ne sera cassé.

## Les mécaniques de pose

Toutes lues dans `DesktopInput`, `Placement` et `Build.validPlace` de la v159.7, la
version que ce dépôt épingle partout. Aucune ne vient d'un wiki.

| Mécanique | Ce que ça veut dire exactement |
|---|---|
| Bloc en main | Fantôme translucide au curseur, sprite réel, teinté vert ou rouge |
| Rotation | `R`, et shift+molette, avec la flèche du jeu. Seulement si `rotate` |
| Ligne | Le glissé trace. Les blocs à `conveyor_placement` (bandes, conduits, gaines) suivent un tracé en L à un coude, chaque segment orienté vers le suivant, d'après `Placement.calculateNodes`. Les autres se posent en ligne droite sur l'axe dominant, espacés de leur taille |
| Remplacer | Décidé par `BlockGroup` et par la taille, d'après `Block.canReplace`. Un convoyeur sur un convoyeur passe. Sinon refus motivé |
| Casser | Clic droit sur un bloc. Clic droit glissé casse un rectangle, avec l'aperçu rouge du jeu |
| Pipette | `Q` ou clic milieu reprend en main le bloc visé, avec sa rotation et sa configuration |
| Sélection | Ctrl+glisser, puis copier, coller, déplacer, supprimer, miroir horizontal et vertical, rotation à 90° de l'ensemble |
| Presse-papiers | `ctrl+C` met la sélection dans le presse-papiers système au format `.msch`, `ctrl+V` colle un code venu du jeu. `schematic.js` sait déjà lire et écrire ce format |
| Configurer | Trieur et déchargeur choisissent un objet ; ponts et mass drivers choisissent leur cible au clic, avec le trait dessiné. Ces configurations existent déjà dans le format et l'éditeur doit savoir les produire, sinon une schématique sortie d'ici est incomplète |
| Annuler | `ctrl+Z` et `ctrl+Y`, sur tout, sol compris. Un geste est une entrée d'historique : une ligne de trente convoyeurs s'annule d'un coup |
| Vue | Molette zoome, clic milieu ou espace+glisser déplace, une touche recadre |
| Limite | Un bloc qui ferait sortir la boîte englobante de 64×64 ne se pose pas |

La molette zoome au lieu de tourner, contrairement au jeu : sur une page web, une molette
qui ne défile ni ne zoome est un piège. La rotation garde `R`, et shift+molette pour ceux
qui ont le geste dans les doigts.

## Le sol, et ses règles

Trois couches empilées comme le jeu : sol, surcouche de minerai, mur. Outils : crayon à
taille réglable, rectangle, pot de peinture par zone contiguë, gomme, pipette.

**La règle qui commande toutes les autres, et qui est écrite en tête de `rules.js` : une
case sans sol peint n'a aucune règle.** Tant que rien n'est peint, on pose ce qu'on veut.
Les contraintes n'apparaissent qu'à mesure que le terrain est décrit. C'est la seule
version cohérente : autrement une toile vierge serait inconstructible, et coller une
schématique du jeu dans un éditeur vide deviendrait impossible.

Là où le sol existe, les règles du jeu s'appliquent, avec les champs déjà présents dans
`blocks.json` :

- Un mur statique (`wall`) : rien ne se construit dessus.
- Un liquide profond (`deep`) : seulement les blocs `floating`.
- Une foreuse : au moins une case de minerai sous elle qu'elle sait creuser, `tier` du
  bloc contre `hardness` de l'objet, en excluant `blocked_items`. C'est `Drill.canMine`.
- Une pompe : du liquide sous chacune de ses cases, et le même partout. C'est
  `Pump.canPlaceOn`.
- Une foreuse à faisceau : un mur porteur de minerai (`wall_ore`) dans sa ligne de mire,
  ce que `beamOf` sait déjà calculer dans `ground.js`.
- Un minerai ne se peint pas sur un sol liquide (`floor_liquid`), qui n'a pas de surface.
  Peint sur une case nue, il pose `stone` dessous, ce que la version actuelle fait déjà.

## La limite de 64 × 64

`Vars.maxSchematicSize = 64`, vérifié dans la source du jeu. C'est la boîte englobante du
schéma, murs des gros blocs compris, et c'est une limite dure : le jeu refuse au-delà.

L'éditeur la fait respecter **à la pose**, pas à l'enregistrement. Un bloc qui ferait
sortir la boîte ne se pose pas, le fantôme est rouge et dit pourquoi. On ne peut donc pas
fabriquer ici une schématique que le jeu refuserait.

Un import trop grand, lui, est signalé à l'ouverture et **jamais tronqué en silence**. Il
s'ouvre en lecture, il s'analyse, il ne s'édite pas tant qu'il dépasse.

## Ce que ça demande ailleurs

- **Quatre champs manquent au catalogue** : `category` (ranger la palette), `group` (le
  `BlockGroup` du jeu, sans lequel « ce bloc peut-il en remplacer un autre » n'est pas
  décidable), `planet` (filtrer Serpulo et Erekir) et `conveyor_placement` (le drapeau qui
  décide si un glissé trace en L ou en ligne droite). Ça touche
  `bench/src/mindustryforge/DumpBlocks.java` et `tools/build_catalogue.py`. Aucun des
  quatre ne se devine depuis les champs présents : `role` regroupe des blocs que le jeu
  sépare, et deviner ici donnerait un éditeur qui refuse des poses que le jeu accepte.
- **`render.js` gagne une caméra** : une origine et une échelle imposées, au lieu de les
  déduire de la boîte englobante, plus des calques mis en cache pour le sol et pour les
  blocs. Le fantôme et le curseur sont les seuls redessinés à chaque mouvement de souris.
  4 096 tuiles repeintes à chaque `pointermove` pendant un tracé, c'est le mur que le
  tableau de bord de `mindustry-ai` a déjà rencontré. Son comportement actuel pour le
  rapport ne change pas.
- **Une colonne `ground`** sur la table `schematics`, écrite et relue par
  `SchematicController`. Sans elle, tout le travail sur le terrain s'évapore au
  rechargement.
- **`index.html`** perd ses cartes « Poser un bloc » et « Le sol » : elles déménagent.

## Le découpage

Rien de tout ça ne rentre dans `index.html`, qui fait déjà 1 176 lignes. Un dossier
`site/public/forge/editor/` :

| Fichier | Ce qu'il sait, et rien d'autre |
|---|---|
| `state.js` | Les blocs posés, le sol, la boîte de 64×64, l'historique |
| `rules.js` | Une pose est-elle légale, et sinon pourquoi, en français affichable |
| `tools.js` | Pose, tracé de ligne, casse, sélection, pinceau, pot, pipette |
| `ui.js` | Rail, onglets, palette, barre d'état, raccourcis |
| `mount.js` | Branche le tout sur le canvas et sur la bascule Analyser / Éditer |

`rules.js` et `tools.js` sont du calcul pur, sans navigateur, donc testés dans le
`npm test` existant. Une règle de sol sans test n'est pas une règle, c'est une intention.

## Ce qui reste dehors, volontairement

Pas de simulation en direct dans l'éditeur : le rapport reste derrière `Analyser`. Pas de
couche unités. Pas d'édition à plusieurs. Pas de sauvegarde serveur au-delà de la colonne
`ground`.

## L'ordre

1. Le catalogue, parce que `rules.js` ne peut pas décider un remplacement sans `group`.
2. `state.js` et `rules.js`, avec leurs tests, sans une ligne d'interface.
3. La caméra et les calques dans `render.js`, vérifiés sur le rapport existant.
4. `mount.js` et le squelette : bascule, plateau, pan, zoom, poser, casser, annuler.
5. La palette et le rail.
6. Le tracé en ligne, le remplacement, la pipette.
7. La sélection et le presse-papiers.
8. L'onglet sol, ses outils, la transparence automatique.
9. Les configurations de blocs.
10. La colonne `ground`, le brouillon local, le tactile.

Le sol arrive en huitième et non en premier alors que c'est le mot de la demande, parce
qu'un pinceau sans caméra ni annulation est le pinceau d'aujourd'hui.
