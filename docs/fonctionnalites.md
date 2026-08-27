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

`blocks.json` porte 253 blocs avec leurs vrais chiffres, extraits du jeu par le banc, pas
recopiés d'un wiki. Une page par bloc : recette, débit, consommation, portée, ce qui
l'alimente, ce qu'il alimente, et les schématiques du catalogue qui l'utilisent.

Leur wiki est rédigé à la main. Celui-ci se régénère à chaque version du jeu.

- **Possède** : routes `/blocs`, ses vues, un service de lecture du catalogue.
- **Dépend de** : rien.

## A6. Le classement par coût

Classer par cuivre investi et pas seulement par bloc occupé. Deux usines de même débit ne
coûtent pas la même chose à construire, et c'est ce qui décide en début de partie.

- **Possède** : une migration (colonne de coût), `BrowseController`.
- **Dépend de** : à séquencer après A4 pour ne pas croiser deux migrations sur la même table.

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

Deux règles nées de la journée :

**`site/public/forge/blocks.json`, `bench/data/blocks.json`, `atlas.json` et `atlas.png`
sont des artefacts générés**, par `tools/build_catalogue.py` et `tools/build_sprites.py`.
Personne ne les édite à la main. La session qui change un générateur régénère.

**Deux pièges relevés par la voie édition**, qui coûteront une demi-journée à qui les
redécouvre : MySQL réordonne les clés d'un objet JSON et SQLite non, donc un test qui
compare un ordre passe en local et casse en CI ; et le serveur de développement doit
envoyer `no-store`, sinon le navigateur sert un fichier périmé et on débogue du code déjà
corrigé.

# L'état des branches, qu'il faut démêler avant de distribuer

- `origin/restart/place-de-marche` est le tronc. Il contient l'éditeur **et** tout le
  travail de place de marché, ramassés ensemble par le squash de la PR #3.
- `feat/animation` porte le rendu et douze commits de moteur. Elle est partie du tronc
  avant ce merge, donc elle ne l'a pas.
- Le dossier de travail principal est **actuellement sur `feat/animation`**, avec du
  travail non commité de la voie rendu.

Rien n'est perdu et rien n'est cassé, mais le tronc et la voie rendu ont divergé d'un
merge. Plus on attend, plus la réunion coûte. À faire dans un worktree séparé pour ne pas
arracher le sol sous la session qui édite, et pas pendant qu'elle régénère le catalogue.

# Règles de coexistence

1. Un chantier ne modifie que les fichiers listés dans son « possède ».
2. `git add` fichier par fichier. Jamais `git add -A`.
3. Un fichier partagé (`layout.blade.php`, `forge.css`, `routes/web.php`, une migration sur
   `schematics`) se signale au pilote avant d'être touché.
4. Avant de committer : `git diff --stat`, et vérifier que tout vient bien de soi.
5. Les tests passent avant le commit : `php artisan test` dans `site/`, `npm test` à la
   racine.
