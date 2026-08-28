# Folders: design

Written 28 August 2026. The second of four related specs, and much the largest.

| Spec | What it adds | State |
|---|---|---|
| 1. Likes and favorites | A public like, a private favorite, the ordering that follows | designed, waiting on a rename to land |
| **2. This one** | Folders: named, pictured, nested, and shareable by link | designed |
| 3. Notes | A personal note on a schematic, and on why it is in a folder | not written |
| 4. Liking a folder | The same gesture as spec 1, on folders, and a ranking of them | not written |

Spec 4 is separated from this one on purpose. Liking a folder is spec 1's pattern applied
to a second table, so it is nearly free once folders exist, and putting it last costs
nothing while letting this document be about the hard part. It is not an abandonment: "a
good pack, said so publicly" is the point of sharing them at all.

## What this adds

A folder is a named, pictured collection of schematics that somebody assembled on purpose,
can nest inside another, and can hand to other people with a link.

The reason to build it: the catalogue answers "what makes graphite fastest". It cannot
answer "what should I build first", which is a question a person answers for another
person, by assembling a dozen plans in an order they thought about. That is a folder.

Not a synonym for the favorites of spec 1. A favorite is one gesture, private, undirected.
A folder is a thing somebody made.

**One word, not two.** "Dossier" everywhere, in the code and on the page. A shared folder is
a public folder, not a "pack". Two words for one object is how a feature ends up with two
half-documented halves, and the pilot uses both words interchangeably in speech, which is
exactly the signal to pick one in writing.

## Data model

```
folders        id, user_id, parent_id (null), slug (unique, 16), name, icon (null),
               description (null), visibility, created_at, updated_at
               index(user_id, parent_id)

folder_items   id, folder_id, schematic_id, created_at
               unique(folder_id, schematic_id)
               index(folder_id, created_at)
```

`parent_id` is a self reference, null at the root. `visibility` reuses the three values of
`Schematic` verbatim (`private`, `unlisted`, `public`) rather than inventing a parallel
vocabulary: the constants exist, the wording on the page exists, and a second scale would
mean explaining twice why "par lien" is not "publique".

A schematic can sit in any number of folders, including somebody else's. That is the whole
feature: the same graphite plan belongs in "pack debutant" and in "chaine silicium".

`folder_items` carries no `position`. Ordering by hand is a drag-and-drop interface, an
integer to renumber on every move, and a decision about what happens when two browsers
reorder at once. Nothing in the request needs it, so it is not built. If it is wanted
later, it is one column and one endpoint, and it is far cheaper to add than to remove.

## Depth: a tree, navigated one level at a time

The pilot asked for folders inside folders, so this is a tree, not two fixed levels.

The cost of a tree is paid almost entirely by the **interface**, not by the model. A
sidebar showing the whole tree with drag and drop needs recursive queries, materialised
paths and cycle handling everywhere. Navigating **one folder at a time**, the way a file
explorer does, needs one query for the children and one walk up the parents for the
breadcrumb, both bounded. So: a real tree in the database, no tree widget on screen.

Two guards, and they are guards rather than design:

- **A folder cannot be moved into its own descendant.** Walking up the new parent's chain
  and refusing if the moved folder appears is bounded by the depth limit below. Without
  this, a folder and its child point at each other and both vanish from every listing,
  which reads as data loss and is not recoverable by the person who caused it.
- **Depth is capped at 5.** Not because five is meaningful, but because a breadcrumb deeper
  than that is unreadable on a phone and no human assembling schematics will reach it. The
  cap exists so a pathological move has a wall, and it is stated in the error rather than
  silently truncating.

## The picture: a block from the game, never an uploaded file

A folder's `icon` is a name from the catalogue, stored as `block/thorium-reactor` or
`item/graphite`, and rendered by the `IconController` that already exists at
`/icone/{family}/{name}.png`.

Not an upload. An upload means storage, a size limit, a format check, a moderation queue
for whatever people put in it, and a stranger's image rendered on a page this site is
responsible for. All of that, so a folder can have a picture.

The catalogue already holds several hundred blocks, items and liquids, all drawn in the
game's own style, all already served at two sizes. A folder called "chaine silicium"
wearing the silicon icon looks like it belongs to Mindustry, which an uploaded PNG never
will. The name is validated against `BlockCatalogue` exactly as the `bloc` filter of the
catalogue is: a name that is not in it is refused, not stored and rendered as a broken
image.

No colour in this spec. If a colour register arrives later it lives in its own file, away
from anything `EngineVersion` hashes, as the repository already requires.

## Sharing

`visibility` on the folder, the same three values as a schematic, and the link is shown on
the page the way `partials/manage.blade.php` already shows a schematic's.

**A folder's visibility does not depend on its parent's.** A public folder inside a private
one is reachable by its own address and simply does not appear in the navigation of
somebody who cannot see the parent. The alternative, inheriting from the parent, creates a
rule nobody can guess from the screen: "your public pack does not work, because of a folder
you are not looking at". Every folder answers for itself.

### What a public folder shows of a schematic the visitor cannot see

Some of what somebody collects is private, or belongs to an author who later made it
private. A public folder listing them would leak names and figures; hiding them silently
would make a folder of twelve read as a folder of four, with no explanation.

So: they are not listed, and **the page says how many it withheld**. Counted on the
filtered query before the exclusion, never as the difference of two totals, on the pattern
`setAside` already sets in `BrowseController`.

**And the owner sees the same page the visitors see**, plus a line saying which of their
schematics only they can see. Somebody who shares a folder of twelve and does not know that
eight of them are invisible has been let down by the interface, not by the visitors.

## Surfaces

| Address | What it is |
|---|---|
| `/mes-dossiers` | one's own folders, root level, `auth` |
| `/d/{slug}` | one folder: its children, then its schematics |
| `/d/{slug}/carte.jpg` | what Discord shows when the link above is pasted |
| `POST\|PATCH\|DELETE /api/dossiers[/{folder}]` | making, renaming, repicturing, moving, deleting |
| `POST\|DELETE /api/dossiers/{folder}/schemas/{schematic}` | putting one in, taking one out |

`/d/` by parity with `/s/` for a schematic. The API stays under `/api/dossiers`, French like
every other address on the site.

**The card is not optional.** Sharing happens in Discord, and a link with no preview does
not get clicked. The mechanism exists: `Services/Cards/Card.php` with `SchematicCard` and
`BlockCard` beside it, and a `FolderCard` joins them. It carries the name, the icon, the
count of schematics, and four thumbnails.

Deleting a folder deletes its rows in `folder_items` and **promotes its children to its
parent** rather than deleting them. A recursive delete behind one button is how somebody
loses a month of collecting to a misclick; the confirmation says how many folders and
schematics are involved either way.

## Coordination

Nothing here touches `BrowseController` or `browse.blade.php`, which belong to session
`mindustry-forge-30`, and nothing here touches `analyse.js`, so **`EngineVersion` does not
move and no stored analysis goes stale**. Checked the same way: the checksum of
`blocks.json` identical to the byte.

It does touch `config/nav.php` and the hand-written header in `public/index.html`, which
spec 1 also touches. Whichever lands second adds its entry beside the other's;
`NavigationTest` catches an entry that reaches two of the three places.

Implementation waits on spec 1, because a folder page reuses the tile and the count that
spec 1 puts there, and on the "schema" rename, like everything else this week.

## Tests

- A folder cannot be moved into its own descendant, and the refusal says why.
- Depth beyond 5 is refused at creation and at move.
- A schematic can sit in two folders at once, and removing it from one leaves the other.
- A public folder does not list a private schematic, and says how many it withheld.
- The owner's view of their own public folder shows the same list plus the warning.
- A private folder is a 404 for everybody else, and an unlisted one is not in any listing
  but answers on its address.
- Deleting a folder promotes its children and deletes only its own `folder_items`.
- An icon name that is not in the catalogue is refused.
- `NavigationTest` and the `.unite.` placeholder rule stay green.

## What stays out

- **Liking a folder, and any ranking of folders.** Spec 4, and it inherits spec 1's
  threshold rule: no ranking of folders before there are enough liked folders to fill a
  page of one.
- **Notes**, on a schematic or on why it is in a folder. Spec 3.
- **Hand ordering** inside a folder, and any drag and drop.
- **Collaborative folders**, several people editing one. A different feature, with
  permissions of its own.
- **Copying somebody else's folder into your own.** Wanted, probably, but it is a question
  about what a copy means when the original changes, and that deserves its own paragraph
  rather than a line here.
