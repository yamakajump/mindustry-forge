# Likes and favorites: design

Written 28 August 2026. This is the first of three related specs. It ships on its own and
the site is better with it and without the other two.

| Spec | What it adds |
|---|---|
| **1. This one** | A public like on a schematic, a private favourite, and the ordering that follows |
| 2. Folders | Nested collections with a name and an icon, shareable by link, likeable themselves |
| 3. Notes | A personal note attached to a schematic |

Folders are bigger than the other two put together, so they get their own spec rather than
a paragraph at the end of this one.

## What this adds

Two gestures on a schematic, deliberately separate:

- **J'aime**, public. A counter anyone can read, and a way to order the catalogue.
- **Favori**, private. A personal list, visible to nobody else.

They were nearly merged into one gesture. Two buttons side by side that mean almost the
same thing is a real cost, and one star would have been simpler. The pilot chose two, so
the wording has to carry the difference: one says "this is good", the other says "I want
to find this again". The page says which is which rather than leaving it to the icons.

## Data model

```
schematic_likes    user_id, schematic_id, created_at    unique(user_id, schematic_id)
favorites         user_id, schematic_id, created_at    unique(user_id, schematic_id)
schematics.likes   unsignedInteger default 0            indexed, for the ordering
```

Two flat tables rather than one polymorphic `likeable`. Spec 2 will want likes on folders,
and that will be a third flat table. Buying the abstraction now, to serve a need that has
not been specified yet, is paying to guess.

Both cascade on the deletion of the schematic and of the user, like every other table that
points at `schematics`.

### Why the counter is a column

`schematics.likes` is denormalised: it is incremented in the same transaction as the row
that causes it. The truth stays in `schematic_likes`, and the column is a cache of it.

The alternative is `COUNT(*) GROUP BY schematic_id` at every render. The listing already
joins `schematic_items` and reaches into `schematic_blocks`, and an ordering over an
aggregate cannot use an index: the whole catalogue would be counted to fill twenty-four
tiles. `schematics.views` is already a column for exactly this reason, so this is the
pattern of the repository rather than an invention.

The known cost of denormalising is drift. It is paid with `php artisan forge:recount-likes`,
which recomputes every counter from the join table, alongside the commands that already
exist for analysis and reindexing.

**A double click must not count twice.** The insert is guarded by the unique constraint,
and the counter only moves when a row was actually created. A test proves it.

### Nothing here enters the engine fingerprint

`EngineVersion` hashes what decides an answer about a schematic. A like decides nothing
about what a schematic produces, so no analysis goes stale and no re-measurement follows.
The check the repository asks for applies: the checksum of `blocks.json` must be identical
to the byte before and after this work.

## The ordering, and the threshold it waits for

`?tri=aimees` joins the five orderings of `BrowseController::ORDERS`.

It does not appear in the menu until **at least 24 schematics carry a like**. Twenty-four
is the size of a page: below that, the ranking cannot fill its own first screen, and a page
titled "les plus aimees" would list schematics on the strength of a zero they all share.
That is the defect this repository has written down six times, a correct number displayed
where it answers a different question, and a catalogue of 15,000 imported schematics that
nobody has liked yet is the perfect place for the seventh.

The count is `Schematic::where('likes', '>', 0)->count()`, an index-only scan, and it is
not cached. The repository removed a ten minute cache on this same page the day an index
made it pointless.

Below the threshold, `?tri=aimees` typed by hand falls back to `new`, exactly as `best` and
`output` fall back when no item is chosen. That mechanism exists (`NEEDS_AN_ITEM`) and is
extended rather than duplicated.

## Surfaces

### The schematic page, `/s/{slug}`

Two buttons, worded, not two bare icons. The like carries its count when it is above zero.
Pressing either is optimistic: the button moves at once and moves back if the request
fails, which is what `manage.js` already does for visibility.

### The catalogue tiles, `/schemas`

The count only, and only when it is above zero. No button on the tiles: forty-eight
controls on a page of twenty-four schematics is noise, and the gesture belongs where the
schematic is actually being looked at.

The count is read off the column the listing already selects, so **no query is added per
tile**. `BrowsePerformanceTest` must stay green without being relaxed.

### The favorites page, `/mes-favoris`

Paginated, newest addition first. Its tiles carry a remove control, because a list you
cannot take things out of is a trap.

It goes into `config/nav.php` under the "Schematiques" menu with `'auth' => true`, next to
"Les miennes". The header is written twice, in the Blade partial and by hand in
`public/index.html`, and `NavigationTest` compares both against the config: the entry lands
in all three or the test fails.

### Anonymous visitors

The buttons are shown, and for a visitor who is not signed in they are links to
`/auth/discord` carrying the current page as the return address. Hiding them would hide
that the feature exists; a login prompt is a smaller cost than an invisible button.

The API verbs sit behind `auth` and `throttle:60,1`.

## Routes

```
POST   /api/schematiques/{schematic}/aime      auth
DELETE /api/schematiques/{schematic}/aime      auth
POST   /api/schematiques/{schematic}/favori    auth
DELETE /api/schematiques/{schematic}/favori    auth
GET    /mes-favoris                            auth
```

The player-facing address is renamed to `/schemas` by session `mindustry-forge-7b`, with a
301 from the old one. The API keeps `schematiques`: a machine address carries no word a
player reads, and the Laravel model binding hangs off that exact segment.

French, like every other address on the site. `LikeController` and `FavoriteController`,
English, like every other class.

The browser side is one module, `site/public/forge/keep.js`, on the pattern of `manage.js`:
one listener for the page, the `XSRF-TOKEN` cookie, and every word it says on screen coming
from the dictionary rather than from the markup.

## Wording

New keys in `site/lang/fr/` and `site/public/forge/lang/`, under the existing domains:

```
schema.aime.bouton          J'aime
schema.aime.retirer         Je n'aime plus
schema.unite.jaime          j'aime          (the word next to the count, plural invariant)
schema.favori.ajouter       Garder en favori
schema.favori.retirer       Retirer des favoris
vitrine.tri.aimees          Les plus aimées
compte.favoris.titre        Mes favoris
compte.favoris.vide         Rien de gardé pour l'instant. Parcourir le catalogue.
```

**The count does not travel through a placeholder.** `{{ $n }} {{ __('schema.unite.jaime') }}`,
not `__('schema.aime.compte', ['n' => $n])`: when a key is missing Laravel renders the key
without substituting, the number disappears, and on a site that sells nothing but numbers a
silently missing number is worse than a missing word. `TranslationKeysTest` enforces this
for `.unite.` keys and will see the new one.

## Tests

Pest, `site/tests/Feature/`, one file per gesture.

- Liking twice creates one row and leaves the counter at one.
- Unliking removes the row, decrements, and never takes the counter below zero.
- An anonymous request is refused, and the page still renders for them.
- Deleting a schematic deletes its likes and its favorites.
- `forge:recount-likes` repairs a counter that has been tampered with.
- The ordering is absent from the menu with 23 liked schematics and present with 24.
- `?tri=aimees` below the threshold renders the date ordering and says so.
- A favourite list shows only its owner's rows, and another user's request to the page
  shows their own empty list rather than an error.
- `BrowsePerformanceTest` and `NavigationTest` stay green untouched.

## What stays out

Not in this spec, and not to be smuggled in:

- Folders, nesting, sharing, folder icons, folder likes. That is spec 2.
- Notes on a schematic. That is spec 3.
- Seeing **who** liked a schematic. A count answers the question the page asks; a list of
  names asks a new one, about what a person's likes say about them in public.
- Any use of likes in `best`, `output` or the default ordering. Popularity is not
  production, and mixing the two natures in one ranking is the fault this repository
  already repaired once on net power.
- Notifying an author that their schematic was liked.
