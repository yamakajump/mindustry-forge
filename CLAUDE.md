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

## ⚖️ Le défaut qui revient : un chiffre juste, à côté de sa question

Six fois le 27/08/2026, sous six visages différents, le même défaut. À chaque fois un
nombre **exact**, calculé correctement, affiché à l'endroit qui pose une autre question.

| Ce qui était juste | La question posée | Ce que ça donnait |
|---|---|---|
| le courant net | « laquelle produit le plus » | une usine classée derrière une schématique vide |
| le plafond d'énergie | « combien elle mesure » | 480 mégawatts sur un plan que personne ne peut poser |
| le débit d'un robinet de bac à sable | « que produit ce plan » | 36 millions d'eau par minute |
| le plafond, rangé en mesure | « celles qui produisent le plus » | 3 364 schématiques classées sur ce qu'elles ne font pas |
| la position relative d'un lien | « quel bloc relier » | une carte de cases vides |
| le rapport d'aspect du panneau | « quelle taille faire le dessin » | des plans écrasés, d'autres hors cadre |

Aucun n'était une erreur de calcul, et **aucun n'aurait été trouvé par un test qui vérifie
un nombre**. Ils se voient en lisant la phrase autour, ou en ouvrant la page.

**La règle** : avant d'afficher un chiffre, dire à voix haute la question à laquelle la
surface prétend répondre. Si le chiffre répond à une question voisine, il est faux à cet
endroit-là même s'il est vrai partout ailleurs. Un plafond ne s'affiche jamais sans dire
qu'il en est un.

**Et le corollaire, qui a coûté le sixième cas.** Une voie qui avait passé la journée à
mesurer le travail des autres et à avoir raison trois fois a dessiné un carré à côté d'un
fichier qu'elle avait elle-même écrit, qui disait disque. Sa conclusion :

> Les trois fois où j'ai eu raison, je mesurais le travail d'un autre. Là où j'ai eu tort,
> c'était le mien, et je n'ai rien mesuré du tout.

Ce n'est pas de mesurer qu'on oublie. C'est de se mesurer soi.

## 🔖 Ce qui entre dans l'empreinte du moteur, et ce qui n'y entre pas

`EngineVersion` hache les sources de l'analyse et estampille le résultat dans chaque ligne,
pour qu'un chiffre périmé soit trouvable. La frontière a été fausse dans les deux sens le
même jour :

**Trop étroite.** Elle ne couvrait que `public/forge`, pas `tools/ingest.mjs`, qui décide
lesquels des champs calculés atteignent une colonne. Un champ produit puis jeté par le tamis
laissait quinze mille lignes se lire à jour alors que le plafond d'objet n'existait dans
aucune. Le catalogue est passé de 2 % à 64 % de couverture le jour où le tamis est entré
dans l'empreinte.

**Trop large.** Y ajouter un registre de couleurs, qui ne change aucun chiffre, aurait
périmé les quinze mille analyses et relancé une re-mesure complète pour de la présentation.

**La règle** : ce qui décide une réponse va dans le fichier haché, ce qui décide comment une
page se lit n'y va pas. Un registre de couleurs vit dans son propre fichier, à côté.

**Et le contrôle qui va avec, parce que la règle seule est une intention** : comparer la
somme de contrôle de `blocks.json` avant et après le changement. Identique à l'octet près
veut dire zéro analyse périmée. Une intention écrite au présent se lit comme une mesure,
et ce dépôt a déjà payé ça une fois.

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

**La règle a été écrite, puis ignorée le lendemain.** Le 28/08/2026, la page des commits de
`main` montrait quinze sujets d'affilée en français, dont `fix(vitrine): dire dans le
sous-titre que ce sont des plafonds`, posté après la décision. Personne n'avait décidé de
passer outre : les règles globales de la machine disent d'écrire les commits en français, et
c'est cette phrase-là qui a été suivie, parce qu'elle arrive dans le contexte avant celle-ci.

D'où la formulation qui suit, à lire au moment où on tape le message, pas au moment où on
lit la section sur la langue : **la langue d'un commit se choisit sur le public du dépôt, pas
sur la langue de la conversation en cours.** Ce dépôt est public, donc anglais, y compris
quand tout le reste de la session se passe en français. Une session qui hésite regarde
`git log --oneline -20` : si les sujets récents sont en français, ils datent d'avant la
décision et ne servent pas de modèle.

L'historique déjà écrit ne se réécrit pas : `main` est publique, et les 88 pull requests
fusionnées sont des permaliens que rien ne justifie de casser pour de la cosmétique.

### Le reste

- Commits conventionnels, **en anglais**, sujet à l'impératif, 50 caractères max. Idem pour
  le titre et la description de la pull request.
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
