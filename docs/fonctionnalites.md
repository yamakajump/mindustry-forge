# Ce qu'il y a à construire

Écrit le 27 août 2026. La liste sert à deux choses : décider quoi faire, et découper le
travail en chantiers qu'une session peut prendre seule sans marcher sur une autre.

Plusieurs sessions travaillent sur ce dépôt en même temps. Deux commits de la journée ont
embarqué le travail en cours d'une autre session par un `git add -A`. La colonne
**« ce que ça possède »** de chaque chantier n'est donc pas décorative : c'est ce qui rend
le parallélisme tenable. Un chantier ne modifie que ses fichiers. Quand il doit toucher un
fichier partagé, il le dit avant.

## Où on en est

Ce qui existe déjà, et que la concurrence n'a pas :

- Le moteur d'analyse, `site/public/forge/analyse.js`, et le banc qui le prouve contre un
  vrai serveur Mindustry. Écart maximum : trois pour cent.
- Le simulateur, `live.js` : le schéma tourne dans le navigateur, dessiné depuis le même
  moteur que le rapport.
- **L'éditeur**, `site/public/forge/editor/`, onze modules, mergé et déployé le 27/08 : les
  mécaniques de pose du jeu v159.7 relues dans sa source. Tracés, Bresenham, A\*,
  remplissage, ponts espacés et liés par la programmation dynamique du jeu, jonction au
  croisement, sélection déplaçable, presse-papiers `.msch` dans les deux sens, onglet sol.
  Trente-sept mécaniques auditées dans `docs/audit-pose.md`. **C'est le plus gros écart en
  notre faveur et il n'apparaît nulle part dans la nav.**
- Le décodage des processeurs, `logic.js` : le programme en clair et ses liens.
- La place de marché, côté données : origine, auteur, index de ce qui est produit, licence
  AGPL, migrations vérifiées sur MySQL en CI.

Ce qu'ils ont et qu'on n'a pas, relevé sur leur site le 27/08 :

| Eux | Adresse |
|---|---|
| Éditeur de logique | `/en/tools/logic` |
| Image vers affichage logique | `/en/tools/logic-display-generator` |
| Image vers toile | `/en/tools/canvas-generator` |
| Générateur de trieurs | `/en/tools/sorter-generator` |
| Générateur de carte | `/en/tools/map-generator` |
| Cartes | `/en/maps`, 8 245 entrées |
| Serveurs | `/en/servers`, 1 028 entrées |
| Posts | `/en/posts`, 124 entrées |
| Wiki | `/en/wiki` |

Notre surface publique tient en deux entrées de nav : « Analyser » et « Parcourir ». C'est
le déséquilibre à corriger.

## Le principe de tri

Trois catégories, et elles ne se valent pas.

**Ce que seul ce dépôt peut faire.** Tout ce qui découle du moteur et du banc. C'est là
qu'est la valeur, et c'est là qu'il faut mettre le meilleur du temps.

**La parité.** Les outils qu'ils ont, qu'on refait parce qu'un joueur qui doit aller sur
deux sites en choisit un, et ce ne sera pas le nouveau. Ces outils sont pour la plupart de
la manipulation de données sans mystère : une fois le format connu, c'est du travail droit.

**Ce qui attend son tour.** Cartes, serveurs, posts. Volume de données et modération, peu
de différenciation. À faire quand le reste tient.

---

# A. Ce que seul ce dépôt peut faire

## A1. Le collecteur

Ingérer les deux catalogues existants, throttlé, reprise sur incident, `.msch` brut stocké
à côté de ses métadonnées. Le schéma est prêt et attend : `source`, `source_id`, `author`,
`fetched_at`, `source_meta`, contrainte d'unicité qui rend l'ingestion idempotente.

L'analyse tourne sous Node avec `analyse.js` tel quel, ce qui ne crée pas de deuxième
implémentation. Orchestration en PHP côté artisan, arithmétique en JS.

Ingérer en `visibility = 'private'`. Collecter et publier sont deux gestes distincts, et
le second attend le message à `sharrlotte`.

- **Possède** : `site/app/Console/Commands/`, `tools/ingest.mjs`, une migration si besoin.
- **Dépend de** : rien, tout est en place.
- **Lire d'abord** : `docs/plan-place-de-marche.md`.

## A2. Le planificateur d'usine

« Je veux cent silicium par minute, dis-moi quoi construire. » L'analyse à l'envers : le
moteur sait ce qu'une usine produit, donc il sait ce qu'il faut pour produire une quantité.
Sortie : la liste des blocs, le coût de construction, l'énergie à fournir, et de préférence
une schématique posée qu'on copie dans le jeu.

Leur « ratio calculator » fait la division. Celui-ci sort un plan.

- **Possède** : un nouveau module dans `site/public/forge/`, sa page, ses tests JS.
- **Dépend de** : rien, le moteur porte déjà les recettes.

## A3. Le comparateur

Deux schématiques côte à côte : débits, coût, encombrement, énergie, goulot. Le seul site
capable de dire laquelle est meilleure avec des chiffres mesurés plutôt qu'avec une capture
d'écran.

- **Possède** : une route et une vue, plus un module de rendu partagé.
- **Dépend de** : la place de marché (fait).

## A4. La recherche par ce dont on dispose

« J'ai du charbon et de l'eau, montre ce que je peux faire tourner. » L'inverse du filtre
actuel : on cherche sur `needs` au lieu de `produces`.

La table `schematic_items` a été conçue pour ce qui est produit. Ce chantier a besoin de sa
symétrique, ou d'une colonne `sens` dans la même table. **À trancher avec le pilote avant
d'écrire la migration**, parce que ça touche un schéma que d'autres chantiers lisent.

- **Possède** : `BrowseController`, une migration.
- **Dépend de** : arbitrage schéma.

## A5. Le wiki des blocs

`blocks.json` porte 395 blocs avec leurs vrais chiffres, extraits du jeu par le banc, pas
recopiés d'un wiki. Une page par bloc : recette, débit, consommation, portée, ce qui
l'alimente, ce qu'il alimente, et les schématiques du catalogue qui l'utilisent.

Leur wiki est rédigé à la main. Celui-ci se régénère à chaque version du jeu.

**254 pages, pas 395.** Sur les 395 entrées, 141 sont marquées `hidden` : des blocs
internes, sols et superpositions, sans recette ni intérêt pour un joueur. Cent quarante et
une pages vides seraient du contenu mince, que le référencement punit au lieu d'ignorer.
Les 18 conditionnels (`sandboxOnly`, `debugOnly`, `campaignOnly`) sont publiés avec la
mention de leur condition.

- **Possède** : routes `/blocs`, ses vues, un service de lecture du catalogue.
- **Dépend de** : rien.

## A6. Le classement par coût

Classer par cuivre investi et pas seulement par bloc occupé. Deux usines de même débit ne
coûtent pas la même chose à construire, et c'est ce qui décide en début de partie.

- **Possède** : une migration (colonne de coût), `BrowseController`.
- **Dépend de** : à séquencer après A4 pour ne pas croiser deux migrations sur la même table.

## A8bis. Les liens d'un processeur qui ne portent pas

Un processeur déclare les blocs qu'il pilote. Rien ne vérifie qu'il les atteint, donc une
schématique peut être collée avec un lien mort sans que la page le dise, et le joueur
découvre en jeu que sa tourelle n'a jamais reçu d'ordre.

La règle du jeu est prouvée, lue dans le bytecode de `LogicBlock.validLink` en v159.7 :

```
dx² + dy²  <  (logic_range + taille_cible / 2)²
```

Euclidienne, **stricte** (un lien posé pile à la portée est refusé, même piège que le
propulseur de masse), entre centres de bâtiments, et le rayon reçoit la demi-taille de la
cible : un vault 3x3 est joignable une case et demie plus loin qu'un convoyeur.

Tout est en place : `centre()` d'`analyse.js` calcule déjà le bon centre, recoupé contre
`Block.offset` du jeu sur les tailles 1 à 5, et le catalogue porte `logic_range` en cases
depuis la normalisation des unités. C'est du travail droit.

**Ça vit dans l'analyse, pas dans l'éditeur de logique, et c'est mesuré.** Dans l'éditeur,
un lien n'est qu'un nom et deux décalages : pas de bloc, donc pas de taille, donc la
formule ne s'applique pas. Le nom vient de `LogicBlock.getLinkName`, qui coupe sur les
tirets et garde le dernier morceau, et la transformation est destructrice. Passée sur les
245 blocs constructibles : **32 des 114 noms de lien ne permettent pas de déduire la
taille**. `additive-reconstructor` fait 3x3 et `tetrative-reconstructor` fait 9x9, même nom.

Un avertissement de portée dans l'éditeur se tromperait donc sur les reconstructeurs, les
foreuses et les réacteurs. N'en afficher aucun est le bon choix : un avertissement qui crie
sur un montage qui marche, on l'éteint, et on éteint la colonne avec.

- **Possède** : `site/public/forge/logic.js`, la partie liens d'`analyse.js`, ses tests.
- **Dépend de** : rien, la normalisation des unités est faite.

## A7. Le vérificateur de tenue

`blast.js` modélise déjà le souffle d'une explosion et ce qu'il détruit. De là : « ton
réacteur tue-t-il ta base s'il fond ? », avec la carte des dégâts. Personne d'autre ne peut
répondre à ça.

- **Possède** : un module et une carte dans le rapport d'analyse.
- **Dépend de** : rien.

---

# B. Parité

## B1. Éditeur de logique

Leur outil le plus utilisé. Écrire du code de processeur Mindustry avec coloration,
autocomplétion des instructions, et export vers la configuration d'un processeur.

On a `logic.js` qui décode déjà un programme et ses liens : la moitié du chemin est faite,
il manque l'écriture et l'interface.

Ne pas écrire d'interpréteur. C'est tranché dans `docs/todo.md` §7, et la raison tient : le
mode de panne d'un interpréteur incomplet est silencieux.

- **Possède** : `site/public/forge/logic.js` et un nouveau module d'édition, sa page.
- **Attention** : `logic.js` vient d'être écrit par une autre session. Se coordonner.

## B2. Image vers affichage logique

Une image en entrée, le programme de processeur qui la dessine sur un afficheur en sortie.
Quantification des couleurs, `draw color` et `draw rect`, compression pour tenir dans la
limite d'instructions.

- **Possède** : un module et sa page.
- **Dépend de** : B1 pour le format de sortie.

## B3. Image vers toile

Même chose pour le bloc toile, qui stocke une image de 12 sur 12 en 8 couleurs dans sa
configuration. Format documenté dans `Canvas.java`.

- **Possède** : un module et sa page.

## B4. Générateur de trieurs

Une disposition de trieurs qui répartit un flux dans les proportions demandées. Chez eux
c'est de la géométrie. Chez nous, le moteur peut **vérifier** le résultat en le faisant
tourner, ce qu'ils ne peuvent pas.

- **Possède** : un module et sa page.

## B5. Générateur de carte

Le plus gros des cinq, et le moins lié au reste. Format `.msav`, génération de terrain,
minerais, points de départ.

- **Possède** : un module, sa page, et une extension de `schematic.js` pour le format carte.

---

# C. Le reste

## C1. Cartes, C2. Serveurs, C3. Posts et guides

Volume et modération, peu de différenciation. Les cartes ont un intérêt : le format `.msav`
partage sa structure avec `.msch`, et une carte analysée dirait des choses. À reprendre
quand A et B tiennent.

---

# D. La nav, parce qu'elle ne tient plus

Aujourd'hui : `Analyser | Parcourir | Mes schematiques | Discord`. Avec quinze chantiers
au-dessus, une barre plate devient une liste illisible.

Proposition, quatre entrées et un compte :

```
Mindustry Forge  Analyser  Editer  Schematiques ▾  Outils ▾  Blocs     [ compte ]

                                   Parcourir       Logique
                                   Les miennes     Affichage
                                   Comparer        Toile
                                   Publier         Trieurs
                                                   Planificateur
                                                   Carte
```

Ce qui guide le découpage :

**« Analyser » reste seul et en premier.** C'est le produit. Un joueur qui arrive avec une
schématique dans le presse-papier ne doit pas ouvrir un menu.

**« Editer » est le deuxième, et c'est le changement le plus rentable de toute cette
liste.** Onze modules d'éditeur sont en production et aucun lien ne mène dessus : la nav de
`index.html` sur le tronc ne contient que « Analyser » et « Parcourir ». On a construit ce
qu'ils n'ont pas et on ne le montre pas.

**« Outils » est un menu, pas une page.** Une page d'index d'outils est une page que
personne ne visite deux fois.

**Le compte reste à droite**, et la connexion Discord garde son bouton.

Sur mobile, un bouton qui déplie le tout. Pas de barre latérale : le site se lit sur
téléphone en jouant, et une barre latérale mange la largeur qui sert à l'aperçu.

- **Possède** : `site/resources/views/layout.blade.php`, la section `header` de
  `forge.css`, et `site/public/index.html` pour la nav de la page statique.
- **Attention** : ce chantier touche un fichier que tout le monde lit. À faire **tôt**, et
  seul, pour que les chantiers suivants branchent leur page dans une nav déjà stable.

---

# Où on en est, au soir du 27/08

Huit chantiers livrés dans la soirée, chacun vérifié vert sur le tronc avant que le suivant
ne soit fusionné. Le site est passé de deux entrées de navigation à cinq.

| Livré | Ce que ça change |
|---|---|
| **E** socle multilingue | huit domaines, français seul, deux tests qui refusent une clé absente ou un trou oublié |
| **D** la nav | l'éditeur enfin visible, une barre qui tient à 320 px |
| **A1** le collecteur | les deux catalogues, throttlé, reprise sans état |
| **A8** le débit potentiel | ce qu'une schématique ferait nourrie à fond, sans rien deviner |
| **A5** le wiki des blocs | 254 pages depuis les chiffres du jeu |
| **B1** l'éditeur de logique | grammaire désassemblée du jeu, deux oracles |
| **A8bis** les liens de processeur | ce qu'ils pilotent, et ce qu'ils ratent |
| la direction artistique | logo, favicons, carte de partage 1200x630 |
| le dumpeur | une seule unité de distance, et les compteurs de processeur |

## Ce qui tourne maintenant

| Voie | Chantier |
|---|---|
| `feat/dumpeur` | **la contradiction à l'écran** : brider au prorata de l'énergie, comme le jeu. Plus le `<=` de `speedUp`. |
| `feat/wiki-blocs` | **A2**, le planificateur d'usine |
| `feat/editeur-logique` | **B2**, image vers affichage logique |
| `feat/collecteur` | **A4**, la recherche par ce dont on dispose, plus les deux règles du combustible |
| `feat/i18n-nav` | les 91 chaînes en dur d'`index.html` |
| `feat/direction-artistique` | le branchement `<head>` et `:root`, et le neuvième jeton |

## Ce qui reste sans propriétaire

**La passe de conversion en anglais**, environ 910 commentaires. À faire à froid, quand
aucune voie n'écrit dans les fichiers concernés, ce qui n'est pas le cas ce soir. Attention :
`analyse.js` est haché par `EngineVersion`, donc reformuler un commentaire dedans marque
périmées toutes les analyses stockées.

**Les deux fichiers de banc morts**, `bench/test_bench.py` et
`bench/test_schematic_in_the_game.py`. Avant d'écrire une ligne, répondre à la vraie
question : un chemin de re-mesure en Python apporte-t-il quelque chose que `npm run oracle`
n'a pas ? Ce n'est pas évident.

**A3** le comparateur, **A6** le classement par coût, **A7** la tenue au souffle, **B3**
image vers toile, **B4** générateur de trieurs, **B5** générateur de carte, et tout **C**.

**Les cartes de partage des 254 fiches de bloc**, qui n'en poussent aucune.

# Ordre décidé le 27/08

Premier lot, quatre voies en parallèle, une worktree chacune :

| Voie | Chantier |
|---|---|
| `feat/i18n-nav` | **E puis D** : le socle multilingue, puis la nav qui s'en sert |
| `feat/wiki-blocs` | **A5** : une page par bloc, depuis les vrais chiffres du jeu |
| `feat/editeur-logique` | **B1** : l'éditeur de logique |
| `feat/collecteur` | **A1** : ingérer les deux catalogues |

E et D vont ensemble et passent devant : la nav est la première surface à traduire, et elle
sert à prouver le mécanisme. Les trois autres écrivent leurs chaînes suivant la convention
ci-dessus dès le premier jour, même si le module n'a pas encore atterri.

Le rendu animé continue dans le répertoire principal, il n'est pas dans ce lot.

Ensuite : **A2** (planificateur), **A7** (tenue au souffle), **A3** (comparateur), puis
**B2**, **B3**, **B4** qui dépendent de B1 ou lui ressemblent.

**A4** et **A6** touchent tous deux le schéma de la place de marché : l'un après l'autre,
jamais en même temps.

**B5** et tout **C** en dernier.

# E. Le socle multilingue

Demandé le 27/08 : le site doit pouvoir parler plusieurs langues. **Une seule langue est
livrée pour l'instant, le français.** Ce chantier ne traduit rien, il rend la traduction
possible sans réécrire le site une deuxième fois.

Il est transverse : il touche toute chaîne visible par un joueur. C'est pour ça qu'il passe
en premier avec la nav, et pas quand quatre voies auront écrit du texte en dur partout.

Deux moitiés, et la deuxième est celle qu'on oublie :

**Côté Laravel**, la localisation est native. `lang/fr/*.php`, `__('cle')` dans les vues,
la langue dans la session ou dans l'URL.

**Côté navigateur**, il n'y a rien. `analyse.js`, l'éditeur et le rapport sont pleins de
français en dur, et c'est là qu'est la moitié du texte du site. Il faut un petit module
`site/public/forge/i18n.js` avec un dictionnaire chargé en JSON, et une fonction `t()`. Pas
de dépendance : le besoin est de remplacer une clé par une chaîne, pas d'accorder des
pluriels en arabe.

**Les deux dictionnaires ne doivent pas diverger.** Un test qui compare les clés utilisées
au dictionnaire, et qui échoue quand une clé manque, sinon on découvre les trous en
production dans une langue qu'on ne lit pas.

## La convention, à suivre dès maintenant par toutes les voies

Même avant que ce chantier soit livré. Une chaîne écrite en dur aujourd'hui est une chaîne
à retrouver plus tard, et personne ne les retrouve toutes.

```php
// Blade et PHP
{{ __('vitrine.tri.best') }}
```

```js
// JavaScript
import { t } from "./i18n.js";
t("analyse.goulot.titre")
```

Nommage : `<domaine>.<ecran>.<element>`. Domaines : `nav`, `vitrine`, `schema`, `analyse`,
`edition`, `outils`, `blocs`, `compte`.

Le français reste écrit en clair dans `lang/fr/` et `forge/lang/fr.json`. Aucune autre
langue n'est ajoutée tant que le site bouge autant : traduire une interface qui change
toutes les semaines, c'est payer la traduction plusieurs fois.

- **Possède** : `site/lang/`, `site/public/forge/i18n.js`, `site/public/forge/lang/`,
  `site/config/app.php` pour la locale, plus un test de cohérence des clés.
- **Ordre** : avant la nav, et dans la même voie, parce que la nav est la première surface
  à passer par le mécanisme et qu'elle sert à le prouver.

# Qui tient quoi, au 27/08 en fin de journée

Relevé en demandant à chaque session, pas en devinant.

| Domaine | Tenu par | Fichiers |
|---|---|---|
| Rendu et animation | la voie `feat/animation` | `live.js`, `render.js`, `tools/build_sprites.py`, `atlas.json`, `atlas.png`, la partie dessin de `DumpBlocks.java` |
| Moteur de simulation | la même, tant qu'elle porte des comportements | `site/public/forge/engine/**` |
| Mode édition | terminé, plus personne | `site/public/forge/editor/`, `tests/js/editor/`, `docs/audit-pose.md`, `docs/plan-edition.md` |
| Place de marché, Laravel, déploiement | le pilote | `site/app/**`, vues Blade, migrations, `deployment/` |
| Socle multilingue puis nav | `feat/i18n-nav` | `site/lang/`, `i18n.js`, `layout.blade.php`, la nav de `index.html`, le header de `forge.css` |
| Wiki des blocs | `feat/wiki-blocs` | routes `/blocs`, ses vues, son service de catalogue, `schematic_blocks` |
| Éditeur de logique | `feat/editeur-logique` | `logic.js` et ses modules d'édition, sa page |
| Collecteur | `feat/collecteur` | `site/app/Console/Commands/`, son script Node |
| Direction artistique | `feat/direction-artistique` | logo, favicons, image OG, manifest. **Pas** `:root` ni le head tant que la nav est en cours |

Deux règles nées de la journée :

**`site/public/forge/blocks.json`, `bench/data/blocks.json`, `atlas.json` et `atlas.png`
sont des artefacts générés**, par `tools/build_catalogue.py` et `tools/build_sprites.py`.
Personne ne les édite à la main. La session qui change un générateur régénère.

## Un port par voie

Les collisions de ports ont coûté du temps à quatre voies dans la même soirée, dont une qui
a posé trois diagnostics faux avant le bon. Une worktree isole le dépôt, pas la machine, et
`php artisan serve` annonce « Server running » même quand le port est pris.

Le tableau ferme le problème par convention plutôt que par vigilance :

| Voie | Port |
|---|---|
| dépôt principal | 8770 |
| `feat/i18n-nav` | 8781 |
| `feat/wiki-blocs` | 8782 |
| `feat/editeur-logique` | 8783 |
| `feat/collecteur` | 8784 |
| `feat/direction-artistique` | 8785 |
| `feat/dumpeur` | 8786 |
| voie suivante | 8787, puis en montant |

Vérifier quand même avant de mesurer, parce qu'un port attribué peut avoir été pris par une
session fermée dont le processus survit :

```bash
netstat -ano | grep :87xx
curl -s localhost:87xx/une-ressource-qui-n-existe-que-chez-moi
```

## Les pièges déjà payés

Chacun a coûté du temps à quelqu'un. Les relire vaut mieux que les redécouvrir.

**MySQL réordonne les clés d'un objet JSON, SQLite non.** Un test qui compare un ordre
passe en local et casse en CI.

**Le serveur de développement doit envoyer `no-store`**, sinon le navigateur sert un
fichier périmé et on débogue du code déjà corrigé.

**Le répertoire du shell est réinitialisé après chaque commande** dans les sessions de
travail. Préfixer chaque commande par son `cd`. Un `cd` fait une seule fois renvoie la
commande suivante dans le répertoire principal partagé, ce qui est exactement ce que les
worktrees existent pour empêcher. Les chaînes `cd X && a && b` restent sûres, c'est un seul
shell.

**`php artisan serve` annonce « Server running » même quand le port est déjà pris.** Une
worktree isole le dépôt, pas la machine : les ports sont partagés par tout le monde. Une
session qui démarre sur un port occupé lit tranquillement l'application d'une autre sans
qu'aucun message ne l'en avertisse, et débogue un écran qui n'est pas le sien.

Ce n'est pas théorique : le 27/08 au soir, **quatre voies avaient un serveur sur le port
8791**, une seule tenait l'écoute, et elle servait un arbre antérieur. La racine répondait
200 et la page était normale ; seuls les fichiers qui n'existaient que chez la voie qui
mesurait rendaient 404.

Trois diagnostics ont été posés sur ce symptôme avant le bon, dont un affirmé comme un fait
établi et faux (« `artisan serve` ne voit pas un fichier créé après son démarrage » : non,
et redémarrer n'y change rien). Ce qui a tranché est un octet : le `favicon.ico` servi
faisait zéro octet là où les deux arbres soupçonnés en ont 2795.

Le réflexe, dans les deux sens : demander une ressource qui n'existe que chez soi **avant**
de mesurer quoi que ce soit, et vérifier la ligne de commande du processus **avant** de
tuer un port.

```bash
netstat -ano | grep :8791          # qui ecoute
tasklist /FI "PID eq <pid>"        # est-ce bien le mien
curl -s localhost:8791/ma-cle-a-moi  # est-ce bien mon arbre
```

**Le dump du catalogue n'est pas reproductible octet pour octet.** Deux lancements sans
toucher au code donnent huit lignes de diff sur `wave` et `tsunami` : l'ordre de leurs
`ammo_types` liquides vient de l'iteration d'une `ObjectMap` d'arc, qui depend du hachage
et donc du lancement. Le contenu est identique apres parsing. Mais dans un diff de 457 ko,
personne ne distingue un reordonnancement d'un vrai changement, et c'est comme ca qu'une
regeneration cache une regression. Les sorties concernees sont triees a la source.

**Pendant une fusion, `git diff` contre `origin/...` ment.** Le tronc bouge plus vite qu'un
cycle fusion-tests-push, donc comparer contre la branche distante juste après une
résolution compare contre une cible qui a déjà avancé, et affiche des suppressions qui
n'existent pas. Une voie a cru supprimer trente-quatre lignes du travail d'une autre. La
bonne référence pendant une fusion est `MERGE_HEAD`, pas `origin/<branche>`.

**Une balise `og:` repetee est un tableau, pas un remplacement.** Le layout en posait une
par defaut et chaque page en poussait une autre : les deplieurs prennent la premiere, donc
la carte generique gagnait toujours et **aucune des deux cartes de partage construites ce
soir ne s affichait**. Rien ne leve, la page rend 200, et la seule facon de le voir est de
lire le HTML servi. Une page remplace desormais par `@section` au lieu d ajouter.

**Une apostrophe echappee dans une directive Blade arrete le compilateur en plein fichier**,
et la page repond **200 en affichant son propre source**, `@stack` et `@include` compris.
Aucun test ne l attrapait. Il y en a un maintenant : aucun `@yield` ne doit sortir dans le
HTML.

**`consumes_power` peut valoir vrai sans aucune consommation.** La presse à graphite est
mécanique dans le jeu. Se fier à la présence de `power` et `power_out`, jamais au booléen.

**Le champ `range` de `blocks.json` mélange deux unités**, et rien ne le signale. Il est en
cases pour les ponts, les nœuds à faisceau, les foreuses à plasma, les propulseurs de masse
et les projecteurs de surcharge ; en unités monde, huit par case, pour toutes les tourelles,
les répareurs et les tours de choc. `DumpBlocks.java` divise par huit à trois endroits et
recopie le champ brut ailleurs, parce que dans le jeu `ItemBridge.range` est un entier de
cases et `BaseTurret.range` un flottant de distance. Le nombre seul ne permet pas de
trancher : le 4 d'un pont et le 40 d'un répareur sont plausibles dans les deux unités.

Le vrai correctif est dans le dumper, qui doit écrire l'unité à côté de la valeur ou tout
ramener en cases. **Personne ne tient le dumper depuis la fin de la voie rendu** : c'est un
petit chantier à part, à prendre par qui régénérera le catalogue.

**Le débit d'un bloc dans le catalogue est un plafond nominal, pas une mesure.** C'est ce
qu'il ferait alimenté à fond, seul, sans goulot. Le chiffre que le reste du site présente
comme mesuré vient du solveur, alimentation et boost compris, et il est souvent plus bas.
Une page qui affiche les deux de la même façon reproduit exactement l'erreur du classement
par énergie nette, corrigée le 27/08 : présenter comme une mesure ce qui n'en est pas une,
sur le seul site qui vend des mesures.

# L'état des branches

**Démêlé le 27/08 en fin de journée. La divergence décrite dans les versions précédentes de
ce document n'existe plus** : trois sessions l'ont signalée en lisant ces lignes, elles
avaient raison, et c'est exactement le service qu'on attend d'un document qui sert de
briefing.

Ce qui s'est passé : le tronc n'avait jamais reçu les douze commits de moteur (charges
utiles, mass driver, processeurs, assembleur, fret, souffle), et `feat/animation` n'avait
pas le mode édition. La PR #4 a réuni les deux.

L'état actuel, vérifié :

- `origin/restart/place-de-marche` est le tronc, à `5b389d9`, et il contient **tout** :
  moteur complet, rendu animé, mode édition, place de marché, licence.
- `feat/animation` pointe au même endroit. Il n'y a plus rien à fusionner.
- Le dossier principal est sur le tronc, arbre propre. C'est le dossier de référence : on y
  relit les PR, et c'est de là qu'on crée les voies suivantes.
- Les quatre voies du premier lot partent toutes de `5b389d9`.

## Comment on ouvre une voie

Une worktree par session, sans exception. Trois sessions ont partagé un seul répertoire le
27/08, donc un seul index et un seul HEAD : un `checkout` de l'une changeait la branche des
autres, et pendant un rebase, HEAD est passé en détaché pour tout le monde. Deux commits ont
embarqué le travail d'une session voisine pour cette raison, et **aucune discipline de
staging n'en protège**. Ce n'était pas de la négligence, c'était mécanique.

```bash
tools/nouvelle-voie.sh <nom-court> feat/<branche>
```

Le script monte la worktree, y recopie ce que git ne suit pas (`.env`, `vendor/`), crée une
base SQLite à elle, joue les migrations, et vérifie que les tests passent avant de rendre
la main. Une voie qui démarre rouge fait perdre son premier quart d'heure à la session.

Une session ne peut pas se déplacer elle-même dans une worktree : son répertoire est fixé à
l'ouverture. C'est donc le dossier qui décide, pas la session, et un terminal ouvert au
mauvais endroit se ferme et se rouvre plutôt qu'il ne se rattrape.

# Règles de coexistence

1. Un chantier ne modifie que les fichiers listés dans son « possède ».
2. `git add` fichier par fichier. Jamais `git add -A`.
3. Un fichier partagé (`layout.blade.php`, `forge.css`, `routes/web.php`, une migration sur
   `schematics`) se signale au pilote avant d'être touché.
4. Avant de committer : `git diff --stat`, et vérifier que tout vient bien de soi.
5. Les tests passent avant le commit : `php artisan test` dans `site/`, `npm test` à la
   racine.
