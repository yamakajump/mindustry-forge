# Likes and favorites

The first of three related specs. It ships on its own and the site is better with it and
without the other two.

| Spec | What it adds |
|---|---|
| **1. This one** | A public like on a schematic, a private favorite, and the ordering that follows |
| 2. Folders | Nested collections with a name and an icon, shareable by link, likeable themselves |
| 3. Notes | A personal note attached to a schematic |

Folders are bigger than the other two put together, so they get their own spec rather than
a paragraph at the end of this one.

## What this adds

Two gestures on a schematic, deliberately separate:

- **J'aime**, public. A counter anyone can read, and a way to order the catalogue.
- **Favori**, private. A personal list, visible to nobody else.

Two buttons side by side that mean almost the same thing is a real cost, and one star
would have been simpler than two. Keeping both means the wording has to carry the
difference: one says "this is good", the other says "I want to find this again". The page
says which is which rather than leaving it to the icons.

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

`?tri=aimes` joins the five orderings of `BrowseController::ORDERS`.

It does not appear in the menu until **at least 24 schematics carry a like**. Twenty-four
is the size of a page: below that, the ranking cannot fill its own first screen, and a page
titled "les plus aimés" would list schematics on the strength of a zero they all share. A
correct number displayed where it answers a different question is exactly the shape of
defect a catalogue of 15,000 imported, mostly unliked schematics invites.

The count is `Schematic::query()->listed()->where('likes', '>', 0)->count()`, an index-only
scan, and it is not cached: the index already makes a cache pointless.

Below the threshold, `?tri=aimes` typed by hand falls back to `new`, exactly as `best` and
`output` fall back when no item is chosen. That mechanism exists (`NEEDS_AN_ITEM`) and is
extended rather than duplicated.

Unlike `best` and `output`, this ordering needs no chosen item. "Liked" is a single
quantity, comparable between any two schematics. Ranking 40 graphite a minute against 25
silicon a minute would be declaring that one graphite is worth one silicon, which is false
and invisible; one like is worth one like.

The ordering lives in `BrowseController`, alongside the catalogue's other orderings and
filters, rather than as a query specific to this feature. The threshold and the reason for
it travel with the ordering, because that is what survives a refactor badly: the number 24
without the sentence explaining it is a number the next person deletes.

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

### The favorites, `/mes-favoris`, which is the catalogue with a filter

A page of its own, with a listing query of its own, would be a second implementation of
"list some schematics" beside the catalogue's. The cost of that does not show at first; it
shows once the catalogue can filter by planet, by footprint and by minimum output, and the
favorites page can do none of it. Someone with eighty favorites could not find the one
that fits in 12x12.

So `/mes-favoris` is a route that renders `BrowseController` with `favoris=oui` already
armed, and `aimes=oui` exists beside it. One query, one tile, and the favorites inherit
every filter that gets built later, including the ones nobody has thought of.

**The division of responsibility.** `BrowseController` and `browse.blade.php` own the
ordering, the two filters and the count on a tile, in their entirety. This spec owns the
tables, the models, the API verbs, `keep.js`, the buttons on a schematic's page and
`RecountLikes`.

Four things the filter must not inherit from the catalogue:

1. **The creative schematics set aside by default must come back.** The catalogue puts them
   aside for a good reason, and applying that reason to a private list is the repository's
   signature defect wearing a new face: a rule that is right for "the catalogue" answering
   a different question when the question is "what was kept". What was kept is seen
   again, whatever it is.
2. **A favorite whose author has since made it private drops out of the list, and the page
   says how many it removed.** Not showing ghosts is right; removing them silently reads as
   the site losing things.
3. **Neither filter is offered to a visitor who is not signed in.** A filter that always
   returns nothing is worse than a filter that is absent. `config/nav.php` already has the
   `'auth' => true` mechanism.
4. **The expected order under `favoris=oui` is none of the catalogue's**: it is the order
   they were kept in. That is an ordering of its own, `garde`, over `favorites.created_at`,
   which means nothing under any other filter. An asymmetry, and it is said out loud in the
   code rather than discovered.

The navigation entry goes into `config/nav.php` under the schematics menu with
`'auth' => true` and `'ready' => true`: `ready` is the repository's own mechanism for an
entry whose page is not built yet, and it is the difference between a menu item and a
404. The header is written twice,
in the Blade partial and by hand in `public/index.html`, and `NavigationTest` compares
both against the config: the entry lands in all three or the suite fails.

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
GET    /mes-favoris                            auth   (BrowseController)
```

The player-facing catalogue address is `/schemas`, with a 301 from the older
`/schematiques`. The API keeps `schematiques`: a machine address carries no word a player
reads, and the Laravel model binding hangs off that exact segment.

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
```

`/mes-favoris` reuses `BrowseController` rather than a page of its own, so it carries no
title or empty-state key: the sort label "Les plus aimés" is a literal string in
`BrowseController::ORDERS`, alongside every other sort label, none of which go through
`site/lang/`.

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
- `BrowsePerformanceTest` and `NavigationTest` stay green untouched.

These belong with the ordering and the filter, in `BrowseController`'s own tests:

- The ordering is absent from the menu with 23 liked schematics and present with 24.
- `?tri=aimes` below the threshold renders the date ordering and says so.
- `favoris=oui` shows only its owner's rows, and an empty list rather than an error.
- `favoris=oui` shows a creative schematic that was kept, which the catalogue sets aside.

## What stays out

Not in this spec, and not to be smuggled in:

- Folders, nesting, sharing, folder icons, folder likes. That is spec 2.
- Notes on a schematic. That is spec 3.
- Seeing **who** liked a schematic. A count answers the question the page asks; a list of
  names asks a new one, about what a person's likes say about them in public.
- Any use of likes in `best`, `output` or the default ordering. Popularity is not
  production, and mixing the two natures in one ranking is the same fault as ranking by
  net power: a number that answers a different question than the one the ranking asks.
- Notifying an author that their schematic was liked.
