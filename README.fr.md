[English](README.md) | **Français**

<p align="center">
  <img src="site/public/brand/depot-entete.jpg" alt="Mindustry Forge" width="900">
</p>

# Mindustry Forge

**Colle une schématique. Sache ce qu'elle fait vraiment.**

Tous les calculateurs Mindustry du web répondent à la même question : combien de machines
pour un ratio propre. C'est de l'arithmétique, et quatre sites la font déjà. Aucun d'eux ne
regardera *ta* disposition, sur *ton* filon, pour te dire qu'elle sort 47,3 graphite à la
minute parce que la deuxième presse est alimentée 61 % du temps.

Celui-ci le fait, puis te dit où déplacer les blocs.

En ligne sur **[mindustryforge.com](https://mindustryforge.com)**.

<p align="center">
  <img src="docs/captures/rapport-analyse.png" width="900"
       alt="L'analyseur sur une vraie schématique : le plan dessiné depuis le code collé, 240 graphite à la minute, et un puits à objets branché sur rien.">
</p>

<p align="center">
  <em>Une vraie schématique du catalogue, analysée dans le navigateur. Elle sort 240 graphite
  à la minute, et l'un de ses 23 blocs est un puits à objets connecté à rien.</em>
</p>

## Pourquoi tu peux vérifier les chiffres au lieu de les croire

Tous les autres outils calculent leurs chiffres à la main et te demandent d'y croire. Ce
dépôt livre un banc qui **fait tourner le vrai jeu** : un serveur Mindustry headless, un
monde figé, un nombre de secondes figé, la schématique estampillée dedans, et un décompte de
ce qui en sort.

L'analyseur n'est donc pas la source de vérité. C'est une approximation rapide de la vérité,
et le banc est ce qui la tient en respect. Une disposition dont la sortie calculée contredit
sa sortie mesurée est un bug ici, pas une affaire d'opinion.

```
npm run oracle          # rejoue chaque scénario enregistré contre sa mesure
```

**Écart maximum : 0,00 %, sur 164 scénarios enregistrés** (27 août 2026). Deux d'entre eux
n'ont jamais été mesurés, et le disent au lieu de passer en silence.

**Ça tourne à chaque poussée.** Le rejeu ne demande ni serveur ni jeu, seulement les mesures
déjà enregistrées, donc l'intégration continue le fait en quelques secondes et fait échouer
la construction au-delà de deux pour cent. C'est une barrière, pas une ligne de journal.
`node tools/gap.mjs` tourne à côté sans barrière, pour que le chiffre ci-dessous atterrisse
dans le compte rendu de chaque passage plutôt que dans la mémoire de quelqu'un.

Personne d'autre ne peut faire cette promesse, parce que personne d'autre n'a le banc.

## Ce dont ce dépôt est honnête

Le moteur est prouvé. **Le rapport que le joueur lit est calculé par autre chose**, et les
deux ne s'accordent pas encore. C'est écrit ici plutôt que laissé à trouver par un lecteur.

- `site/public/forge/engine/**` avance le jeu tic par tic, et bride une machine selon le
  courant qu'elle reçoit vraiment. C'est ce que le banc mesure, et ce que la vue animée fait
  tourner.
- `site/public/forge/analyse.js` résout un état stationnaire par flot maximum. Le courant
  n'entre jamais dans la résolution, donc le goulot qu'il rapporte y est aveugle.

**Celui qu'on montre au joueur est le second. Celui qui est prouvé contre le jeu est le
premier.** Une disposition à trente énergie par seconde près peut donc s'entendre dire que
tout tourne à plein régime.

L'écart est mesuré, pas estimé :

```
node tools/gap.mjs
```

```
88 scénarios comparés, sur 164 enregistrés    (27 août 2026)
  d'accord à 20 % près                  49
  le débit est faux                     27
  bon débit, mauvais contenant          12
```

Poser le rapport sur le moteur change tous les chiffres du site d'un coup, donc c'est du
travail annoncé plutôt que du travail silencieux. `docs/todo.md` le porte.

## Ça tourne sur ta machine

L'analyse est du JavaScript et se passe dans ton navigateur. Rien n'est envoyé, une base que
tu n'as pas publiée reste à toi, et la page coûte la même chose à héberger que dix ou dix
mille personnes s'en servent.

Ça règle la moitié d'une question que ce dépôt n'arrête pas de se poser : il y a exactement
une implémentation de l'analyse, dans un seul langage. Une deuxième, dans un autre langage,
pour une ligne de commande ou un serveur, serait une deuxième chose à avoir tort.

## Chaque bloc, avec les chiffres du jeu lui-même

<p align="center">
  <img src="docs/captures/fiche-bloc.png" width="900"
       alt="La page du four à silicium : encombrement, résistance, coût de construction, recette, énergie, et ce qui peut l'alimenter.">
</p>

<p align="center">
  <em>Les débits d'une page de bloc sont des plafonds nominaux, et la page le dit. Ce qu'un
  bloc fait dans une vraie schématique est mesuré par l'analyse, et c'est presque toujours
  moins.</em>
</p>

## Essayer

L'analyseur est une page statique et n'a besoin d'aucun serveur à lui :

```bash
cd site/public && python -m http.server 8770
```

Puis ouvre <http://127.0.0.1:8770/> et colle une schématique. N'importe quel serveur de
fichiers statiques fera l'affaire. Ouvrir le HTML directement depuis le disque est la seule
chose qui ne marche pas : un navigateur refuse un import de module par `file://`.

Ça te donne l'analyseur, et l'éditeur avec : le bouton *Bâtir de zéro* l'ouvre sans quitter
la page. Ce que ça ne te donne pas, c'est tout ce qui a une adresse à soi. `/editer`,
`/blocs`, `/comparer` et les outils sont des routes, pas des fichiers, et un serveur statique
répond 404 pour toutes, en même temps que les comptes, la sauvegarde et le catalogue public.
Il faut pour ça l'application Laravel ci-dessous.

## Faire tourner le site entier

```bash
cd site
composer install
cp .env.example .env && php artisan key:generate
touch database/database.sqlite          # voir plus bas
php artisan migrate
php artisan storage:link
php artisan serve --port=8770
```

Le fichier de base vide n'est ni facultatif ni évident. `.env.example` choisit SQLite, et
`php artisan migrate` sur un clone neuf s'arrête sur `Database file at path [...] does not
exist`. Laravel propose de le créer quand tu es devant une invite et échoue simplement quand
tu n'y es pas, ce qui est le cas de tout script et de tout job d'intégration continue. Sous
Windows sans shell POSIX, utilise `New-Item database/database.sqlite`.

Toute la séquence ci-dessus a été lancée sur un clone neuf le 27 août 2026, et
`php artisan test` passe au bout.

La connexion Discord se configure dans `.env` :

```
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
```

Crée l'application sur <https://discord.com/developers/applications>, avec
`http://127.0.0.1:8770/auth/discord/callback` comme URI de redirection.

Sous Windows, PHP est livré sans magasin de certificats et tout appel HTTPS sortant échoue
sur `unable to get local issuer certificate`. Le correctif est le paquet de certificats, pas
de désactiver la vérification :

```bash
curl -o C:/php/extras/cacert.pem https://curl.se/ca/cacert.pem
```

```ini
; puis dans php.ini
curl.cainfo = "C:\php\extras\cacert.pem"
openssl.cafile = "C:\php\extras\cacert.pem"
```

## Tests

```bash
npm test                     # l'analyse, lancée exactement comme la page la lance
cd site && php artisan test  # l'application
python -m pytest tests/ -q   # les formats de fichier. Ne lance aucun jeu, malgré le banc à côté
```

Comptes au 27 août 2026 : 565, 141 et 8. Ils seront faux demain, et c'est pour ça qu'ils
portent une date.

Utilise `npm test` plutôt qu'un motif à toi. `node --test "tests/js/*.test.js"` a l'air
équivalent et saute silencieusement chaque sous-dossier, soit 196 des 565.

## Ce qu'il y a où

| | |
|---|---|
| `site/public/forge/` | l'analyse : lit un `.msch`, construit le graphe de flux, trouve le goulot |
| `site/public/forge/engine/` | la simulation tic par tic, la moitié que le banc prouve |
| `site/public/forge/editor/` | l'éditeur, avec les mécaniques de pose du jeu |
| `site/public/index.html` | la page, qui ne porte aucun calcul |
| `site/app/`, `site/routes/` | ce à quoi un serveur sert vraiment : se souvenir, et laisser partager |
| `bench/` | fait tourner le vrai jeu et mesure la même schématique |
| `tests/js/` | l'analyse, lancée exactement comme la page la lance |
| `tools/` | l'oracle, l'écart, et les générateurs du catalogue et des sprites |
| `docs/` | le plan, ce qui est fait, ce qui reste, et les défauts qu'on connaît par leur nom |

## Le format `.msch` n'est pas deviné

`site/public/forge/schematic.js` implémente la disposition de `Schematics.write` et de
`TypeIO` de Mindustry v159.7, la version épinglée partout dans ce dépôt. Lire un format sur
un wiki est la façon dont un outil finit par ne plus être d'accord avec le jeu sur ce que le
joueur vient de coller.

## Contribuer

[`CONTRIBUTING.md`](CONTRIBUTING.md) dit ce sur quoi ce projet est strict, pour que tu puisses
décider avant d'écrire du code si les règles te conviennent. La conduite est dans
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md), et les vulnérabilités passent par le signalement
privé de GitHub plutôt que par une issue : [`SECURITY.md`](SECURITY.md).

`docs/fonctionnalites.md` est le plan : ce qui existe, ce qui se construit, et qui tient quoi.
`docs/todo.md` nomme les défauts connus, y compris celui du dessus.

Deux règles gouvernent le dépôt, et les deux sont dans `CLAUDE.md` :

**Une seule implémentation de l'analyse.** Une deuxième, dans un autre langage, serait une
deuxième chose à avoir tort.

**Les chiffres se prouvent contre le jeu, pas contre nous.** Si l'analyse et le banc
divergent, c'est un bug ici. Ne jamais ajuster une constante pour faire passer un test sans
avoir vérifié ce que dit le banc.

## Licence

AGPL-3.0. Le texte complet est dans [`LICENSE`](LICENSE).

La GPL aurait suffi pour un logiciel qu'on installe : elle se déclenche à la distribution
d'un binaire. Ici le produit est un service web et personne ne distribue rien, donc sous GPL
n'importe qui pourrait héberger une copie fermée et améliorée en privé de ce moteur sans
jamais rien rendre. L'AGPL ajoute la seule clause qui compte pour ce projet : faire tourner
le code sur un serveur accessible publiquement oblige à en publier la source.

Ce qui est partagé, c'est le moteur d'analyse et le banc qui le vérifie. C'est la partie
difficile, et c'est celle dont la communauté Mindustry n'a aucune autre copie.

Les schématiques ne sont pas couvertes par cette licence. Elles appartiennent à leurs
auteurs, et celles collectées ailleurs portent leur origine dans la base et sur leur page.
