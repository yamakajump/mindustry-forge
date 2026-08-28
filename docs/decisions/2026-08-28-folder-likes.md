# Liking a folder

The fourth and last of the related specs, and the one that pays for the three before it.

Folders exist so people can hand each other a dozen plans in an order somebody thought
about. Without a way to say "this one is good", every folder is worth the same until it has
been opened, and nobody opens the fortieth.

## What this adds

Spec 1's gesture, on a second object, plus the listing that makes it useful:

- **J'aime** on a folder, public, counted.
- `/dossiers`, the public folders, orderable.

No favorite on a folder. A favorite exists to find something again, and a folder is already
a place things are found: keeping a folder inside a folder is what nesting is for. Two
mechanisms for "put it where it can be reached again" would leave the reader choosing
between them for no reason.

## Data model

```
folder_likes    user_id, folder_id, created_at    unique(user_id, folder_id)
folders.likes   unsignedInteger default 0         indexed
```

Deliberately the third flat table rather than the polymorphic `likeable` that spec 1
declined to build early. The bet made there is settled here: two flat tables plus a third
cost less than one abstraction plus its migration, and each one is readable on its own.

`forge:recount-likes` grows a second pass rather than gaining a sibling command. Two
commands doing the same repair on two tables is one command somebody forgets to run.

## The ordering, and the same threshold rule

`/dossiers` offers "Les plus aimés", and it is **not offered until at least a page's worth
of folders carry a like**, derived from the paginator's page size rather than written as a
literal, following the same rule the catalogue uses for its own "les plus aimés" ordering.

The reason is the same one, and it will bite harder here. There will be perhaps forty
public folders in the first month against fifteen thousand schematics. A ranking over forty
rows all tied on zero is not a smaller version of the catalogue's problem; it is the same
problem where the top of the page is the whole page.

**And the second threshold, which is this spec's own.** `/dossiers` itself does not go into
the navigation until public folders exist at all. An empty gallery reachable from the menu
teaches every visitor, once, that the feature is dead. The `'ready' => false` flag in
`config/nav.php` is exactly this mechanism, and spec 1 already uses it for `/mes-favoris`.

An empty `/dossiers` reached by its address still answers, and says there are none yet.
Refusing to link it is not the same as hiding it.

## What a folder listing shows

The name, the icon, the count of schematics, the author, and the count of likes when it is
above zero. Not four thumbnails: the card for Discord carries those and is generated on
demand, while a page of twenty-four folders would generate ninety-six.

**A folder whose schematics are all invisible to the visitor shows as what it is**, with its
count of withheld items from spec 2, rather than as an empty folder. A folder that reads as
empty is a folder nobody clicks, and the owner never learns why.

## Surfaces

```
POST   /api/dossiers/{folder}/aime    auth, throttle:60,1
DELETE /api/dossiers/{folder}/aime    auth, throttle:60,1
GET    /dossiers                      public
```

The button is spec 1's, on spec 1's module: `keep.js` already listens for `[data-aime]`,
reads a slug from the enclosing box and posts optimistically. It gains a way to know which
of the two endpoints to call, from a `data-kind` on the box, and nothing else. A second
module for the same gesture on a different noun is a second thing to fix when the gesture
is wrong.

## Tests

- Liking a folder twice counts once, and unliking never goes below zero.
- `forge:recount-likes` repairs both counters in one run.
- The ordering is absent below the threshold and present at it.
- `/dossiers` is absent from the navigation while no public folder exists.
- `/dossiers` reached directly with none says so and does not error.
- A private folder never appears in `/dossiers`, whoever asks.
- `keep.js` posts to the folder endpoint under `data-kind="dossier"` and to the schematic
  one otherwise.

## What stays out

- A favorite on a folder, for the reason given above.
- Any mixing of folder likes and schematic likes in one number or one ranking. They count
  different objects, and a combined score would be the net power mistake wearing a fourth
  face.
- Trending, "hot", or any time-weighted ranking. That is a formula, and a formula needs
  data to be tuned against. There is none yet.
