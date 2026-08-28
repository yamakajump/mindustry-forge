#!/usr/bin/env bash
#
# Set up an isolated lane of work, for one session.
#
#     tools/nouvelle-voie.sh nav feat/nav
#
# Several sessions work on this repository at the same time. As long as they share one
# directory, they also share one git index and one HEAD: a `git checkout` in one changes
# the branch of the others, and a `git add` of a precise file stages what a neighbour wrote
# there in the meantime all the same. Two commits on 27 August carried another session's
# work for that reason, and no naming discipline would have avoided it.
#
# One worktree per lane makes the problem disappear instead of watching for it.
#
# What the script copies is what git does not track and the application needs: the `.env`,
# `vendor/` (ninety-two megabytes, a copy costs less than a `composer install`) and a fresh
# SQLite database of its own. Without those the lane does not start, and the session spends
# its first quarter of an hour finding that out.
set -euo pipefail

NOM="${1:-}"
BRANCHE="${2:-}"
# `origin/main` rather than `main`: the local branch is often behind, and a lane cut from
# it starts again from a state nobody has any more. The value used to be
# `origin/restart/place-de-marche`, deleted on 27/08/2026, so the script failed.
DEPUIS="${3:-origin/main}"

if [ -z "$NOM" ] || [ -z "$BRANCHE" ]; then
    echo "usage: tools/nouvelle-voie.sh <short-name> <branch> [starting-branch]" >&2
    echo "example: tools/nouvelle-voie.sh nav feat/nav" >&2
    exit 1
fi

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
CIBLE="$(dirname "$RACINE")/mindustry-forge-$NOM"

if [ -e "$CIBLE" ]; then
    echo "error: $CIBLE already exists" >&2
    exit 1
fi

echo "==> starting from $DEPUIS"
git -C "$RACINE" fetch --quiet origin

echo "==> worktree $CIBLE on $BRANCHE"
git -C "$RACINE" worktree add --quiet -b "$BRANCHE" "$CIBLE" "$DEPUIS"

echo "==> what git does not track"
cp "$RACINE/site/.env" "$CIBLE/site/.env"
cp -r "$RACINE/site/vendor" "$CIBLE/site/vendor"

# One database per lane. Sharing the root's would mean a migration tried in one lane broke
# the site in every other one, which is exactly the coupling being removed here.
: > "$CIBLE/site/database/database.sqlite"

echo "==> migrations and storage link"
( cd "$CIBLE/site" \
    && php artisan migrate --force --no-interaction >/dev/null \
    && php artisan storage:link --quiet >/dev/null 2>&1 || true )

echo "==> check"
( cd "$CIBLE/site" && php artisan test --quiet >/dev/null 2>&1 \
    && echo "    the tests pass" \
    || echo "    WARNING: the tests do not pass in the fresh lane" )

cat <<FIN

Lane ready.

  directory: $CIBLE
  branch:    $BRANCHE (cut from $DEPUIS)

Open a terminal in it, and work there as in an ordinary checkout. At the end:

  git push -u origin $BRANCHE
  gh pr create --fill

Once the lane is closed, remove it from the root:

  git worktree remove $CIBLE
FIN
