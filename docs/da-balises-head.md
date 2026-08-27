# Les balises `<head>`, prêtes à coller

Écrit pour la voie `feat/i18n-nav`, qui possède `layout.blade.php` et le `<header>` de
`index.html` pendant que ce document est écrit. Rien ici n'a été posé dans ces deux
fichiers : les blocs sont à intégrer par la voie qui les tient, ou par la voie
`feat/direction-artistique` dans une petite PR de branchement une fois la refonte de la nav
fusionnée.

**Tous les fichiers pointés existent** sur `feat/direction-artistique`. Poser ces balises
avant que cette branche soit fusionnée donne des 404 sur le favicon et une vignette vide
dans Discord.

## Ce que ça répare

Le site a aujourd'hui **trois états d'icône différents et un lien mort** :

| Où | Aujourd'hui |
|---|---|
| `site/public/favicon.ico` | 0 octet, référencé nulle part |
| `layout.blade.php:7` | `<link rel="icon" href="/favicon.svg">`, fichier **absent** → 404 à chaque chargement |
| `site/public/index.html:7` | une **autre** icône, en data-URI, dessin différent |

Donc les pages Laravel et la page statique n'ont pas la même icône, et l'une des deux
n'en a aucune.

## Bloc pour `site/resources/views/layout.blade.php`

Remplace la ligne `<link rel="icon" href="/favicon.svg">`. À poser après `<title>` et
**avant** `@stack('head')`, pour qu'une page puisse écraser `og:title` et compagnie.

```blade
{{-- L'icone, en trois formats parce que trois familles de clients la demandent
     differemment : le .ico pour ce qui tape /favicon.ico sans lire le head, le SVG pour
     tout navigateur a jour, le PNG carre pour l'ecran d'accueil iOS. --}}
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#1b2027">

{{-- La vignette d'un lien partage. Valeurs par defaut : une page qui a mieux a dire les
     ecrase depuis son propre @push('head'), et la derniere balise gagne. --}}
<meta property="og:site_name" content="Mindustry Forge">
<meta property="og:locale" content="fr_FR">
<meta property="og:type" content="website">
<meta property="og:title" content="@yield('title', 'Mindustry Forge')">
<meta property="og:description" content="Colle une schematique Mindustry, sache ce qu'elle produit vraiment et ou elle coince.">
<meta property="og:url" content="{{ url()->current() }}">
<meta property="og:image" content="{{ asset('og.jpg') }}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Mindustry Forge - colle une schematique, sache ou elle coince">
<meta name="twitter:card" content="summary_large_image">
<meta name="description" content="Colle une schematique Mindustry, sache ce qu'elle produit vraiment et ou elle coince.">
```

**`asset('og.jpg')` ne rend une adresse absolue que si `APP_URL` est juste.** Un
`og:image` relatif n'est pas resolu par Discord ni par Twitter : la vignette est
simplement absente, sans erreur nulle part. Verifier `APP_URL=https://mindustryforge.com`
en production.

## Bloc pour `site/public/index.html`

Remplace la ligne `<link rel="icon" href="data:image/svg+xml,...">`. Cette page est
statique : pas de Blade, donc les adresses sont ecrites en dur et **absolues**.

```html
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#1b2027">

<meta name="description" content="Colle une schematique Mindustry, sache ce qu'elle produit vraiment et ou elle coince.">
<meta property="og:site_name" content="Mindustry Forge">
<meta property="og:locale" content="fr_FR">
<meta property="og:type" content="website">
<meta property="og:title" content="Forge - analyser une schematique Mindustry">
<meta property="og:description" content="Colle une schematique Mindustry, sache ce qu'elle produit vraiment et ou elle coince.">
<meta property="og:url" content="https://mindustryforge.com/">
<meta property="og:image" content="https://mindustryforge.com/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Mindustry Forge - colle une schematique, sache ou elle coince">
<meta name="twitter:card" content="summary_large_image">
```

**Un piege connu, laisse tel quel volontairement** : `index.html` est servie a deux
adresses, `/` et `/editer`. Son `og:url` annonce donc `/` meme quand on partage
`/editer`. Un lien vers l'editeur partage dans Discord affichera la vignette de
l'analyseur. Ce n'est pas grave et c'est reparable d'une ligne le jour ou l'editeur
merite sa propre vignette, mais c'est a savoir avant de le decouvrir.

## Deux corrections a faire pendant qu'on y est

**`schematic.blade.php` ligne 30** porte `<meta name="theme-color" content="#ffd37f">`.
Le chrome du navigateur mobile passe donc en ambre vif sur les pages de schematique, et
sur celles-la seulement. Avec le texte blanc que le systeme y pose, c'est illisible, et
c'est incoherent avec le reste du site. À remplacer par `#1b2027`, ou a supprimer
puisque le layout le porte deja.

**`schematic.blade.php` n'a pas de repli d'image.** Quand `apercus/{slug}.png` n'existe
pas, la page ne pousse aucun `og:image` et le lien partage n'affiche aucune vignette. Le
bloc du layout ci-dessus fournit `og.jpg` par defaut, donc ce trou se bouche tout seul
une fois le layout a jour, a condition de laisser le `@push` de la page **apres** le
bloc du layout dans l'ordre de rendu, ce qui est deja le cas.

## Ce qui n'est pas dans ces blocs, et pourquoi

Pas de `<meta name="msapplication-*">`, pas de `browserconfig.xml`, pas de
`mstile-*.png` : les tuiles Windows sont mortes avec Internet Explorer et les vignettes
epinglees de l'ancien Edge.

Pas de `<link rel="mask-icon">` non plus : c'etait pour l'onglet epingle de Safari, que
Safari 15 a remplace par le SVG normal.

Pas de `apple-touch-icon-precomposed`, pas de declinaison par taille : iOS choisit le
`apple-touch-icon` unique et le redimensionne, et il n'y a plus d'appareil qui reclame
les 76, 120 ou 152 pixels separement depuis iOS 8.
