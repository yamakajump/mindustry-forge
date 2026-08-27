# Direction artistique

Ce que la marque est, où chaque fichier sert, et ce qu'on ne fait pas avec.

Rien ici n'est une refonte. Le site avait déjà une palette juste et la police du jeu ; il
n'avait pas de marque, pas d'icône valide et pas de vignette de partage. C'est ce trou-là
qui est bouché.

## Le signe

Un **F construit comme un tronçon de convoyeur**. La hampe est l'entrée, le bras du haut
sort par une pointe. Un joueur de Mindustry reconnaît le geste avant de lire la lettre, et
un lecteur qui ne connaît pas le jeu lit quand même un F.

```
site/public/brand/mark-plain.svg     la géométrie, écrite à la main. LA source.
site/public/brand/mark.svg           le signe sur sa plaque, cadrage large
site/public/brand/logo.svg           le lock-up complet, deux teintes
site/public/brand/logo-mono.svg      le même, en currentColor
```

**`mark-plain.svg` est le seul fichier de cette liste qu'on modifie.** Tout le reste, y
compris `mark.svg`, est régénéré par `tools/build_brand.py` qui lit ses chemins. Recopier
la géométrie ailleurs donnerait deux dessins à maintenir, et le second finirait par
différer du premier sans que rien ne le signale.

### La règle de grille

Le signe est dessiné sur une grille de 32 unités, **et toutes ses coordonnées sont
paires**. À 16 pixels, deux unités valent exactement un pixel : le trait tombe sur la
grille de l'écran et ne bave pas. Une coordonnée impaire introduite dans
`mark-plain.svg` rend le favicon flou à la taille où il est le plus vu, et c'est
invisible tant qu'on regarde le SVG en grand.

Épaisseur du trait : 4 unités partout, hampe comme bras. Le débord de la pointe au-dessus
de la ligne de capitale est de 2 unités, et il est voulu : sans lui le signe paraît plus
petit que le texte à côté de lui.

### Ce qu'on n'en fait pas

- **Pas de remplacement du texte du `<header>` par une image.** `.brand` est utilisé à
  deux endroits, `header .brand` et `.editor-bar .brand`, et la barre de l'éditeur
  redéfinit sa taille à 17px. Le signe se pose **en ligne** avec `mark-plain.svg` en
  `currentColor` et une hauteur en `em` : il suit la couleur et la taille de son voisin
  sans qu'on ait à s'en occuper.
- Pas de rotation, pas de miroir, pas de dégradé dans le signe.
- Pas d'ambre sur fond clair sans plaque : `#ffd37f` sur blanc donne un rapport de
  contraste d'environ 1,5. C'est pour ça que la plaque sombre existe, et pourquoi elle
  n'est pas décorative.
- Air minimal autour du signe : la largeur de sa hampe, soit 4 unités de sa propre grille.

## La palette

Elle vient du jeu et elle ne change pas. Un joueur reconnaît ces couleurs avant de lire
le nom du site.

| Jeton | Valeur | Ce que c'est |
|---|---|---|
| `--bg` | `#12161b` | le fond, et la plaque du signe |
| `--panel` | `#1b2027` | l'en-tête et les cartes |
| `--raised` | `#232932` | ce qui se clique |
| `--edge` | `#2f3742` | tous les liserés |
| `--ink` | `#e9edf3` | le texte |
| `--dim` | `#9aa4b2` | le texte secondaire |
| `--accent` | `#ffd37f` | la marque, et une seule chose par écran |
| `--good` `--bad` `--warn` | `#84d98b` `#ff8b8b` `#ffbe6b` | des états, jamais de la décoration |

### Treize couleurs qui devraient être des jetons et n'en sont pas

`forge.css` s'ouvre sur cette phrase :

> *deux copies d'une palette est comment un site finit par avoir deux jaunes légèrement
> différents*

Et le fichier porte **13 littéraux hexadécimaux répétés 22 fois hors du `:root`**. Le
plus utilisé, `#e0b45f`, apparaît quatre fois. Le fichier contredit son propre principe.

Proposition, **à appliquer par la voie qui possède `forge.css`, pas ici** :

```css
/* Ajouts au bloc :root existant. Aucune valeur nouvelle : ce sont les couleurs deja
   ecrites en dur dans le fichier, nommees la ou elles auraient du l'etre. Le rendu est
   identique au pixel pres, par construction. */
--accent-strong: #e0b45f;   /* le lisere d'un bouton primaire        (4 occurrences) */
--accent-soft:   #ffdd9c;   /* ce meme bouton, survole               (2 occurrences) */
--on-accent:     #241d0c;   /* le texte pose sur de l'ambre          (4 occurrences) */
--accent-veil:   #2f2a1c;   /* un fond ambre a tres faible opacite   (3 occurrences) */
--raised-hover:  #2b323c;   /* ce qui se clique, survole                          */
--stage:         #0e1116;   /* le fond du plateau ou vit le plan     (2 occurrences) */
--bad-panel:     #2a1c1c;   /* le fond d'un message d'erreur         (2 occurrences) */
--discord-hover: #6a76f5;   /* le bouton Discord, survole                         */
```

Ce n'est pas une décision visuelle et ça ne demande pas de validation esthétique : c'est
un remplacement mécanique qui laisse le site rigoureusement identique. Ce qu'il achète,
c'est qu'un futur ajustement de l'ambre se fasse à un endroit au lieu de quatorze.

## La typographie

`Forge` et `Forge Mono`, extraites du jar du jeu par `tools/build_fonts.py` et
sous-ensemblées à 10 et 37 ko.

**La police couvre tous les accents français.** Vérifié glyphe par glyphe sur les 202
glyphes du sous-ensemble : `é è ê ë à â ç û ù ü ô ö î ï œ É È À Ç « » ° ²`, aucun
manquant. L'absence d'accents dans les chaînes du site est donc une convention, pas une
contrainte technique, et rien n'empêche de la lever.

Les images de partage, elles, **portent leurs accents**. C'est assumé : « schematique »
sans accent dans la vignette d'un lien collé sur Discord se lit comme un encodage cassé,
et une première impression ne se rattrape pas. Une incohérence, si.

### Un point de licence à trancher, pas par nous

La police vient des assets du jeu. `tools/build_fonts.py` documente le raisonnement :
Anuke autorise l'usage des assets du jeu par les outils communautaires, et c'est le
terrain sur lequel tous les autres sites Mindustry se tiennent. Le dépôt est passé en
**AGPL-3.0** le 27/08/2026, et faire de cette police un **élément d'identité de marque**
n'est pas tout à fait le même usage que de s'en servir pour afficher du texte.

Ça ne bloque rien aujourd'hui, et le repli tient en une ligne de CSS. Mais c'est une
question pour Corentin, pas une question qu'une session tranche seule.

## Les fichiers, et à quoi chacun répond

| Fichier | Taille | Qui le demande |
|---|---|---|
| `favicon.ico` | 16 + 32 + 48 | ce qui tape `/favicon.ico` sans lire le `<head>` |
| `favicon.svg` | vectoriel | tout navigateur à jour |
| `apple-touch-icon.png` | 180 | l'écran d'accueil iOS |
| `icon-192.png` `icon-512.png` | `purpose: any` | le manifest |
| `icon-maskable-512.png` | `purpose: maskable` | Android, qui y découpe la forme de son choix |
| `og.jpg` `og-schematiques.jpg` | 1200 × 630 | Discord, Twitter, tout ce qui déplie un lien |
| `site.webmanifest` | — | l'installation sur téléphone |
| `brand/discord-icon.png` | 512 | l'icône de serveur |
| `brand/discord-banniere.jpg` | 960 × 540 | la bannière de serveur |
| `brand/apercu-produit.png` | 2144 × 1420 | le visuel produit, pour une page d'accueil ou un article |

Trois cadrages différents pour le même signe, parce que les systèmes ne rognent pas
pareil :

- **L'onglet** ne rogne rien, mais le signe n'y fait que 8 pixels de haut. Cadrage serré,
  76 % de la largeur, pas de liseré : à cette taille un liseré de 2 unités mange le
  contraste au lieu de donner un corps.
- **iOS** arrondit lui-même et ignore la transparence. Donc coins carrés et fond plein.
  Une icône déjà arrondie ressort avec un double arrondi et un liseré noir.
- **Android masquable** ne garantit que les 80 % centraux. Le signe descend à 46 % de la
  largeur, ce qui le laisse entier même dans le cercle le plus serré.

## Régénérer

```bash
python tools/build_brand.py
```

Reconstruit tout à partir de `mark-plain.svg`, de la police et de
`brand/fond-usine.png`. Aucun des fichiers produits ne se retouche à la main : une
retouche divergerait de sa source au passage suivant, sans que rien ne le dise.

**Deux fichiers font exception.**

`brand/apercu-produit.png` est une **capture réelle** du site en train d'analyser une
schématique, pas une illustration. Le plan photographié est construit par
`_da/demo.mjs`, qui utilise le même écrivain `.msch` que les tests, et les chiffres
affichés sont ceux que l'analyse calcule. Dessiner ce visuel aurait été plus rapide et
aurait produit une image annonçant un résultat que personne n'a mesuré, dans un dépôt
dont la deuxième règle est que les chiffres se prouvent.

`brand/fond-usine.png` est l'autre exception. C'est une sortie de modèle génératif,
produite une fois et versionnée telle quelle. Elle n'est pas régénérée à chaque
construction : une sortie de modèle n'est pas reproductible, et une marque dont
l'illustration change à chaque build n'est pas une marque. Elle est **versionnée en niveaux
de gris**, pas en couleur : `tritone()` commence par `convert("L")` et jette la couleur,
donc la garder coûtait 1,2 Mo pour une information qu'aucun code ne lit. Elle est ensuite
étalonnée
dans les trois tons du site par `tritone()`, parce qu'elle sortait bleu marine et orange,
et que deux jaunes qui se disputent valent moins qu'un seul.

## Ce qui reste ouvert

- **Les balises `<head>`** sont écrites dans `docs/da-balises-head.md` et **ne sont posées
  nulle part**. `layout.blade.php` et `index.html` sont tenus par une autre voie pendant
  que ce document s'écrit.
- **Le bloc `:root`** ci-dessus n'est pas appliqué, pour la même raison.
- **La carte sociale par schématique** : la page pousse aujourd'hui le rendu brut du plan
  en `og:image`. Ça fonctionne, mais Discord le letterbox et la vignette n'a ni titre ni
  marque. Une carte composée serait meilleure ; c'est du code serveur, pas un asset.
