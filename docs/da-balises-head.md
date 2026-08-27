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

## Côté serveur : deux ajouts au vhost

`deployment/nginx/` appartient au pilote, rien n'y a été touché. Voici ce qui manque,
constaté en lisant le fichier.

**Les assets de marque ne portent aucune durée de cache.** Le vhost donne `expires 1h` à
`/forge/` et rien d'autre. Donc `og.jpg`, les six icônes, le manifest et tout
`/brand/` sont revalidés à chaque visite. Ce sont des fichiers qui ne changent
qu'au déploiement.

```nginx
# L'identite visuelle : des fichiers qui ne bougent qu'au deploiement, et que chaque
# service qui deplie un lien retelecharge. Le vhost ne leur donnait aucune duree de vie,
# donc le navigateur les revalidait a chaque visite.
location ~* ^/(favicon\.(ico|svg)|apple-touch-icon\.png|icon-\d+\.png|icon-maskable-\d+\.png|og(-[a-z]+)?\.jpg|site\.webmanifest)$ {
    expires 7d;
    add_header Cache-Control "public";
    try_files $uri =404;
}

location ^~ /brand/ {
    expires 30d;
    add_header Cache-Control "public";
    try_files $uri =404;
}
```

Sept jours et pas plus pour les icônes : elles sont référencées par une adresse sans
empreinte, donc une durée longue rendrait un changement de logo invisible pendant des
semaines chez ceux qui ont déjà visité le site. `/brand/` peut aller plus loin, personne
ne le charge dans une page.

**Le type MIME de `.webmanifest` n'est pas garanti.** À vérifier sur le serveur plutôt
qu'à supposer :

```bash
grep -r "webmanifest" /etc/nginx/mime.types
```

Si la ligne est absente, nginx sert le fichier en `application/octet-stream`. Les
navigateurs sont tolérants là-dessus aujourd'hui, mais ça se corrige d'un bloc :

```nginx
types { application/manifest+json webmanifest; }
```

## Un piège à ajouter à la liste des pièges déjà payés

**`php artisan serve` ne voit pas un fichier statique créé après son démarrage.** Un
`favicon.svg` posé dans `site/public/` pendant que le serveur tourne répond 404, avec
un `X-Powered-By: PHP` et un `Cache-Control: no-cache, private` dans la réponse, c'est-à-dire
que la requête est partie dans Laravel au lieu d'être servie comme un fichier. Le fichier
est pourtant bien là. Redémarrer le serveur suffit.

Coûté une demi-heure de fausse piste ici : on cherche une erreur de configuration nginx,
un `.htaccess`, un problème de droits, alors que le serveur de développement a simplement
une vue périmée de son propre dossier public.
