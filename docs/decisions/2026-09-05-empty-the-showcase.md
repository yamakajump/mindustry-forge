# Take the collected catalogue off the wall

## Why

The showcase holds 15 533 public schematics. Every one of them was scraped: 12 584 from
mindustry-tool, 2 949 from mindustryschematics. Exactly one schematic in the database was
put there by a person on this site, and it is private.

Nobody chose any of it. It was collected to have something to show, and what it shows is
that the site can hold fifteen thousand rows, which is not the thing worth showing. The
analyser's argument is that it reads *your* layout and tells you where it jams; a catalogue
of somebody else's scrapes says nothing about that, and it is the first thing a visitor
meets.

The counter-argument was reach, and the numbers do not support it. The site has one
account, no likes, no favourites, no folders, no notes and no contributions. Emptying the
showcase costs nobody their work, because nobody has done any in it yet. The domain is not
in Search Console either, so the traffic those pages bring cannot be measured from here;
what can be said is that it is being traded for a showcase whose contents were picked.

## What was decided

The collected catalogue comes off the wall, and the shelf keeps it. `hidden_at` is set on
every schematic with no account behind it: `Schematic::listed()` already reads that column,
so one write removes them from the showcase, the block pages, the comparison, the home page
and the sitemap together, while every row stays and every page still answers for a
moderator.

The showcase stays in the navigation and reads as empty, with the sentences it already has
for that. It fills up again the day schematics are published that somebody picked.

## What was deliberately not done

**Nothing was deleted, and no `Withdrawal` was recorded.** `forge:retirer` is the command
for a takedown request: it deletes and it tells the collector never to fetch that schematic
again, which is a promise made to an author. Reusing it here would have written fifteen
thousand permanent refusals to answer a question about editorial taste, and there is no
command that undoes those.

**The contribution system was left standing.** Players proposing where a schematic plugs in
is a feature of a catalogue, and there is no catalogue for the moment, so the card has
nothing to appear on. Removing the code would cost a large diff to delete something that is
already invisible, and the day the showcase fills up again the question comes back with it.

**The collector was left alone.** Nothing schedules it, so nothing refills on its own, and
`forge:collecter` remains the way to bring a source back if that is ever wanted. Note that
it inserts what it finds as public: a future run would put new schematics on the wall
without asking, and `forge:decrocher` is what takes them off again.

## The way back

There is no screen for it. The moderation queue is built from reports, and these carry
none, so a hidden catalogue would otherwise be a state with no exit. Hence:

```bash
php artisan forge:decrocher --raison="catalogue remis a zero"   # take it down
php artisan forge:decrocher <slug> --rendre                     # one back up
php artisan forge:decrocher --rendre --raison="catalogue remis a zero"   # all of them
```

The bulk restore matches on the reason, and refuses to run without one. A schematic hidden
after a takedown request carries a reason of its own, and a `--rendre` that swept it up
would undo, silently, the one promise `SECURITY.md` makes out loud.
