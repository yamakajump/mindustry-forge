# Audit des mécaniques de pose contre la source du jeu

Demandé le 27/08/2026 : « essaye de trouver tout ce qui se fait toi-même en analysant le
code du jeu, pour que ce soit pas moi qui te dise à chaque fois ».

Cet audit relit **toute** la pile de pose de Mindustry v159.7 et la compare à ce que
`site/public/forge/editor/` fait. Il est écrit après une correction humiliante : l'éditeur
posait ses lignes en coude en L, ce coude n'existe nulle part dans le jeu, et **les onze
tests qui le validaient étaient tous verts**. Des tests ne prouvent que la fidélité du code
à ce qu'on croyait ; seule la source prouve la fidélité au jeu.

Sources relues : `InputHandler.iterateLine`, `DesktopInput`, `Placement`, `Block`,
`Build.validPlace`, `Conveyor`, `ItemBridge`, `DirectionBridge`.

## Les gestes, d'après `DesktopInput`

| # | Mécanique | État | Note |
|---|---|---|---|
| 1 | Poser au clic, tracer au glissé | ✅ | |
| 2 | Échap repose le bloc en main | ✅ | |
| 3 | Casser au clic droit, une zone au glissé | ✅ | ne vérifie pas `breakable` |
| 4 | `R` tourne le bloc en main | ✅ | |
| 5 | **Tourner un bloc déjà posé** (`rotatePlaced`) | ❌ | tenir la touche au dessus d'un bloc le tourne sur place |
| 6 | Ctrl+glisser sélectionne | ✅ | |
| 7 | **Miroir au clavier** (`schematicFlipX/Y`) | ❌ | les boutons existent, les touches non |
| 8 | Maj = placement diagonal | ✅ | |
| 9 | Pipette au clic milieu | ⚠️ | ne rapporte pas la configuration (`copyConfig`) |
| 10 | **Configurer au clic** (`configurable`) | ⚠️ | seulement les ponts ; trieurs, sources, déchargeurs non |
| 11 | **Double-clic efface la config** (`clearOnDoubleTap`) | ❌ | |

## Les tracés, d'après `Placement`

| # | Mécanique | État | Note |
|---|---|---|---|
| 12 | `normalizeLine`, ligne droite sur l'axe dominant | ✅ | le tracé par défaut |
| 13 | `normalizeRectangle`, remplir une zone | ✅ | 139 blocs |
| 14 | `pathfindLine` sans diagonale, escalier de Bresenham | ✅ | |
| 15 | **`pathfindLine` en A\*** pour les convoyeurs | ❌ | contourne les obstacles au lieu de traverser |
| 16 | `upgradeLine`, suivre une chaîne existante | ✅ | |
| 17 | `calculateNodes`, ponts espacés de leur portée | ✅ | |
| 18 | `handlePlacementLine`, ponts liés au suivant | ✅ | |
| 19 | **`getReplacement` : jonction au croisement** | ❌ | une ligne qui coupe une ligne perpendiculaire pose une jonction |
| 20 | **`calculateBridges` : ponts automatiques** | ❌ | une ligne qui rencontre un obstacle le franchit toute seule |
| 21 | `isSidePlace`, garde-fou du précédent | ❌ | |

### Le détail de 19 et 20, parce que ce sont les deux qui se sentent

`Conveyor.getReplacement` remplace un convoyeur par une **jonction** quand trois conditions
tiennent ensemble : la ligne continue des deux côtés, la case porte déjà un convoyeur, et ce
convoyeur est perpendiculaire au nôtre. C'est ce qui fait qu'on trace à travers son usine
sans y penser.

`Conveyor.handlePlacementLine` appelle `Placement.calculateBridges`, qui est une
**programmation dynamique** sur la ligne. Elle arbitre trois coûts :

| Poser | Coût |
|---|---|
| un convoyeur | 3 |
| une jonction | 30 |
| un pont | 200, plus 5 par case vide enjambée |

Elle cherche le chemin le moins cher de bout en bout et remplace les segments retenus par
des ponts. C'est le « ultra optimisé pour penser à la place de l'utilisateur » : le jeu
décide pour toi s'il vaut mieux traverser en jonction ou sauter en pont.

Deux garde-fous avant de la lancer, et ils comptent : elle ne fait rien si la ligne n'est pas
orthogonale, ni si `isSidePlace` est vrai, c'est à dire si le premier bloc est posé de
travers par rapport au sens de la ligne.

## Les règles de pose, d'après `Build.validPlace` et `Block`

| # | Mécanique | État | Note |
|---|---|---|---|
| 22 | Boîte de 64 × 64 | ✅ | |
| 23 | Liquide profond, `floating`, `requiresWater`, `placeableLiquid` | ✅ | |
| 24 | `placeableOn` | ✅ | |
| 25 | Un mur ne porte rien | ✅ | |
| 26 | `Drill.canMine` | ✅ | |
| 27 | `Pump.canPlaceOn` | ✅ | |
| 28 | `Block.canReplace` | ✅ | ses six champs |
| 29 | ~~`breakable`~~ | ⛔ | **abandonné, mesuré** : le champ est déclaré sans valeur dans `Block` et n'y est jamais assigné, donc au moment du dump il vaut faux pour tout, convoyeur compris. Le sortir donnerait un éditeur où plus rien ne se casse. `privileged`, lui, est fiable, et c'est ce que les règles lisent |
| 30 | **`isPlaceable`, `buildVisibility`, `placeablePlayer`** | ❌ | la palette trie sur le coût, pas sur ce que le jeu propose |
| 31 | **`planRotation` et `lockRotation`** | ❌ | |
| 32 | **`ignoreLineRotation`** | ❌ | certains blocs ne doivent pas suivre le sens du glissé |

## Les schémas

| # | Mécanique | État | Note |
|---|---|---|---|
| 33 | `flipRotation` | ⚠️ | juste, sauf `invertFlip` qui inverse le miroir de certains blocs |
| 34 | Rotation d'une sélection | ✅ | |
| 35 | **`schematicPriority`** | ❌ | l'ordre d'écriture des blocs dans le fichier |
| 36 | Écriture des configurations (types 5 et 7) | ✅ | |
| 37 | **Liens de pylônes** (type 8, liste de positions) | ❌ | |

## Ce que le catalogue doit apprendre

Aucune de ces mécaniques ne se devine : chacune lit un champ que le jeu publie et que le
dump ne sort pas encore.

`junction_replacement`, `bridge_replacement`, `ignore_line_rotation`, `lock_rotation`,
`invert_flip`, `save_config`, `copy_config`, `configurable`, `clear_on_double_tap`,
`placeable_player`, `breakable`, `schematic_priority`, `build_visibility`, `offset`.

## L'ordre dans lequel je les fais

1. Les champs du catalogue, sans lesquels rien du reste n'est décidable.
2. **La jonction au croisement** (19) et **les ponts automatiques** (20). Ce sont les deux
   que le joueur sent immédiatement, et les deux que Corentin a nommés.
3. `breakable`, `isPlaceable` pour la palette, `ignoreLineRotation`, `lockRotation`,
   `invertFlip` : des règles courtes, chacune une ligne, chacune un test.
4. Configurer au clic pour tout ce qui est `configurable`, et la pipette qui rapporte la
   configuration.
5. Tourner un bloc posé, les miroirs au clavier, le double-clic qui efface.
6. Le A\* des convoyeurs, `schematicPriority`, les liens de pylônes.

Le A\* passe en dernier volontairement : il ne se déclenche qu'en mode diagonal, sur des
blocs qui ont `conveyorPlacement`, et il est le seul de la liste dont l'absence se remarque
à peine.
