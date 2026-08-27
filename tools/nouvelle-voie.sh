#!/usr/bin/env bash
#
# Monter une voie de travail isolée, pour une session.
#
#     tools/nouvelle-voie.sh nav feat/nav
#
# Plusieurs sessions travaillent sur ce dépôt en même temps. Tant qu'elles partagent un
# seul répertoire, elles partagent aussi un seul index git et un seul HEAD : un `git
# checkout` de l'une change la branche des autres, et un `git add` d'un fichier précis
# indexe quand même ce qu'une voisine y a écrit entre-temps. Deux commits du 27 août ont
# embarqué le travail d'une autre session pour cette raison, et aucune discipline de
# nommage ne l'aurait évité.
#
# Un worktree par voie fait disparaître le problème au lieu de le surveiller.
#
# Ce que le script recopie est ce que git ne suit pas et dont l'application a besoin :
# le `.env`, `vendor/` (quatre-vingt-douze mégaoctets, une copie coûte moins qu'un
# `composer install`) et une base SQLite neuve à elle. Sans ça, la voie ne démarre pas et
# la session passe son premier quart d'heure à le découvrir.
set -euo pipefail

NOM="${1:-}"
BRANCHE="${2:-}"
DEPUIS="${3:-origin/restart/place-de-marche}"

if [ -z "$NOM" ] || [ -z "$BRANCHE" ]; then
    echo "usage: tools/nouvelle-voie.sh <nom-court> <branche> [branche-de-depart]" >&2
    echo "exemple: tools/nouvelle-voie.sh nav feat/nav" >&2
    exit 1
fi

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
CIBLE="$(dirname "$RACINE")/mindustry-forge-$NOM"

if [ -e "$CIBLE" ]; then
    echo "erreur : $CIBLE existe deja" >&2
    exit 1
fi

echo "==> depart depuis $DEPUIS"
git -C "$RACINE" fetch --quiet origin

echo "==> worktree $CIBLE sur $BRANCHE"
git -C "$RACINE" worktree add --quiet -b "$BRANCHE" "$CIBLE" "$DEPUIS"

echo "==> ce que git ne suit pas"
cp "$RACINE/site/.env" "$CIBLE/site/.env"
cp -r "$RACINE/site/vendor" "$CIBLE/site/vendor"

# Une base par voie. Partager celle de la racine ferait qu'une migration essayée dans une
# voie casserait le site de toutes les autres, ce qui est exactement le genre de couplage
# qu'on est en train de supprimer.
: > "$CIBLE/site/database/database.sqlite"

echo "==> migrations et lien de stockage"
( cd "$CIBLE/site" \
    && php artisan migrate --force --no-interaction >/dev/null \
    && php artisan storage:link --quiet >/dev/null 2>&1 || true )

echo "==> verification"
( cd "$CIBLE/site" && php artisan test --quiet >/dev/null 2>&1 \
    && echo "    les tests passent" \
    || echo "    ATTENTION : les tests ne passent pas dans la voie neuve" )

cat <<FIN

Voie prete.

  dossier : $CIBLE
  branche : $BRANCHE (partie de $DEPUIS)

Ouvrir un terminal dedans, et y travailler comme dans un depot normal. Au bout :

  git push -u origin $BRANCHE
  gh pr create --fill

Quand la voie est fermee, la retirer depuis la racine :

  git worktree remove $CIBLE
FIN
