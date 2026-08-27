# mindustry-forge

Colle une schematique Mindustry, sache ce qu'elle produit vraiment et où elle
coince. Site public : **https://mindustryforge.com**

## Le tronc est `main`, et il n'y en a qu'un

Tout vit sur **`main`** : c'est la branche par défaut du dépôt public, celle que
`deploy.sh` met en production, et celle que la CI surveille.

Ça n'a pas toujours été vrai. Le travail a vécu des semaines sur
`restart/place-de-marche` pendant que `main` montrait le projet d'avant le restart, et le
27/08/2026 quelqu'un ouvrant la page GitHub voyait 161 commits de retard, des dossiers
disparus et aucune licence. Les deux branches ont été réunies et l'ancienne supprimée.

**La leçon vaut plus que le fait**, parce qu'elle a coûté une affirmation fausse dans la
même journée : pendant les vingt minutes où les deux branches ont coexisté, une correction
de CI a atterri sur l'une et des images sur l'autre, et les deux ont été annoncées comme
faites. Personne n'avait menti, chacun avait regardé sa branche. **Aucun test ne tourne sur
la différence entre deux branches.** S'il faut un jour en refaire une longue, elle se
réunit tôt et souvent, pas à la fin.

Les workflows `tests.yml` et `verify-catalogue.yml` datent d'avant le restart et
référencent des chemins disparus (`forge/server_setup.py`, `gradlew`). Ne pas s'y fier. La
CI qui compte est `site.yml`, et elle lance désormais l'oracle.

## 🧭 Les deux règles du dépôt

**Une seule implémentation de l'analyse.** Elle est dans
`site/public/forge/analyse.js`, en JavaScript, et tourne dans le navigateur du
visiteur. Une deuxième version, dans un autre langage, pour la ligne de commande
ou pour un backend, serait une deuxième chose à avoir tort. Ne pas en écrire.

**Les chiffres se prouvent contre le jeu, pas contre nous.** `bench/` lance un
vrai serveur Mindustry headless sur un monde figé, y estampille la schematique
et compte ce qui sort. Si l'analyse et la mesure divergent, c'est un bug ici, pas
une affaire d'opinion. Ne jamais ajuster une constante pour faire passer un test
sans avoir vérifié ce que dit le banc.

Le format `.msch` est implémenté d'après `Schematics.write` et `TypeIO` de
Mindustry v159.7, la version épinglée partout dans ce dépôt. Lire ce format
depuis un wiki est la façon dont un outil finit par ne plus être d'accord avec
le jeu sur ce que le joueur a collé.

## 🚀 Commandes

```bash
# L'analyseur, le coeur du depot
npm test

# Le banc, qui tient les chiffres contre le vrai jeu
npm run oracle             # rejoue chaque scenario enregistre, ecart attendu 0,00 %
npm run oracle:measure     # re-mesure dans un vrai serveur, demande le jar

# Les formats de fichier seulement. Ne lance aucun jeu, malgre son nom.
python -m pytest tests/ -q

# L'application Laravel
cd site
vendor/bin/pint            # style (--test pour vérifier sans corriger)
php artisan test           # tests Pest, base SQLite en mémoire
php artisan serve --port=8770

# Déploiement (demander avant, c'est la prod)
ssh codwingz-apps "bash /var/www/mindustry-forge/deployment/deploy.sh"
```

## 🏗️ Ce qu'il y a où

| | |
|---|---|
| `site/public/forge/` | l'analyse : lit un `.msch`, construit le graphe de flux, trouve le goulot |
| `site/public/index.html` | la page, qui ne porte aucun calcul |
| `site/app/`, `site/routes/` | ce à quoi un serveur sert vraiment : se souvenir, et laisser partager |
| `bench/` | fait tourner le vrai jeu et mesure la même schematique |
| `tests/js/` | l'analyse, exécutée exactement comme la page l'exécute |
| `deployment/` | tout ce qui décrit le serveur de production |

## 🔒 Déploiement : le dépôt est la vérité

`deployment/` contient le vhost nginx, le pool PHP-FPM et les unités systemd.
`deploy.sh` les recopie sur le serveur à chaque passage.

**Ne jamais éditer `/etc/nginx/sites-available/mindustryforge` ni
`/etc/php/8.3/fpm/pool.d/mforge.conf` en SSH direct** : la modification serait
écrasée au déploiement suivant, sans prévenir. Modifier le fichier du dépôt.

`install-server.sh` reconstruit la machine depuis zéro. Le tenir à jour : c'est
la seule chose qui sépare une panne matérielle d'une réinstallation de mémoire.

**Ce site cohabite avec le panel de facturation de CodWingz**, qui porte des
factures légales opposables. D'où le compte système `mforge`, le pool PHP-FPM
dédié et la base séparée. Ne rien mutualiser entre les deux.

Piège coûteux : ajouter un pool PHP-FPM demande un `systemctl restart`, pas un
`reload`. Un reload réutilise les sockets hérités, le nouveau pool n'apparaît
jamais, et aucun message d'erreur ne le signale.

## 📏 Conventions

### La langue : anglais dans le dépôt, français sur le site

**Tout ce qu'un contributeur lit est en anglais** : le code, ses commentaires, les messages
de commit, les descriptions de pull request, et les documents de `docs/`. Le dépôt part en
open source, et un projet dont les commits et la documentation sont dans une langue que
son lecteur ne parle pas est un projet qu'il ne reprend pas.

**Tout ce qu'un joueur lit reste en français**, et vit dans `site/lang/` et
`site/public/forge/lang/`. Le site s'adresse d'abord à des joueurs francophones ; les
autres langues viendront, et le socle multilingue est là pour ça.

La frontière est nette et elle passe entre les deux publics, pas entre deux fichiers.

Décidé le 27/08/2026. Le code était déjà entièrement en anglais ; ce qui change est le
reste. La conversion de l'existant, environ 910 commentaires, se fait **à froid**, quand
aucune voie n'écrit dans les fichiers concernés. Attention : `analyse.js` est haché par
`EngineVersion`, donc reformuler un commentaire dedans marque périmées toutes les analyses
stockées, et déclenche une re-mesure du catalogue entier.

Les accents s'écrivent, dans les deux langues. La police les porte, c'est vérifié, et du
français sans accents est du français mal écrit.

### Le reste

- Commits conventionnels, sujet à l'impératif, 50 caractères max.
- Le corps du commit explique *pourquoi*, pas *quoi* : le diff dit déjà quoi.
- Pas de tiret cadratin (—), nulle part.
- Les clés de traduction s'écrivent `<domaine>.<écran>.<élément>`, en kebab-case, **jamais
  assemblées à l'exécution** : une clé collée au rendu est une clé qu'aucun contrôle ne
  voit, et c'est vérifié mécaniquement.
- **Une unité ne passe pas par un placeholder.** Quand une clé manque, Laravel rend la clé
  sans substituer, donc `__('blocs.unite.points', ['n' => 160])` affiche
  `blocs.unite.points` et **le 160 disparaît**. Perdre un mot est un défaut d'affichage ;
  perdre un chiffre, sur un site qui ne vend que des chiffres, c'est perdre l'information.
  Écrire `{{ $n }} {{ __('blocs.unite.points') }}`, qui dégrade en `160 blocs.unite.points`.

  **La ligne passe là où la disparition est silencieuse.** Dure pour les quantités et les
  unités, où le nombre est toute l'information et où son absence ne se voit pas. Libre pour
  les phrases, où un mot manquant se remarque et où figer l'ordre nombre-puis-mot casserait
  la traduction. Le test l'applique aux clés `.unite.`, parce que ni PHP ni JS ne disent
  statiquement qu'une variable est un nombre, et qu'un test qui devine devient capricieux
  puis se fait désactiver.

## 🚧 Plusieurs sessions travaillent souvent sur ce dépôt en parallèle

Avant de committer, vérifier que le diff ne contient que son propre travail :

```bash
git diff --stat        # est-ce que tout ça vient bien de moi ?
git add <fichiers>     # jamais `git add -A` à l'aveugle
```

Un `git add -A` pendant qu'une autre session édite `analyse.js` embarque son
travail à moitié fini dans un commit qui ne le mentionne pas.

## 🤫 Ce qui ne doit jamais entrer dans le dépôt

`site/.env` (clé applicative, identifiants Discord, mot de passe de la base) est
gitignoré, et le mot de passe de la base ne vit que dans
`/root/.mforge-db-pass` sur le serveur. Ne jamais recopier l'un ou l'autre dans
un fichier versionné, une issue ou un commentaire.
