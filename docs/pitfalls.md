# Pitfalls

Traps a contributor to this codebase will hit, with the technical reason each one bites.

## Database

**MySQL reorders the keys of a JSON object, SQLite does not.** A test comparing an order
passes locally and breaks in CI. Production runs MySQL; the local suite runs SQLite in
memory.

**MySQL refuses to drop a unique index a foreign key depends on, SQLite accepts it**
because it rebuilds the table. A migration can therefore pass every local test and break
the deployment. The CI runs the migrations against MySQL for that reason.

## The development server

**`php artisan serve` prints "Server running" even when the port is already taken.** A
worktree isolates the repository, not the machine, and ports are shared. A second server
started on a busy port quietly reads a different checkout's application, with no warning,
so a page can look normal while every request is answered by the wrong tree: the root
returns 200, and only files that exist in one checkout and not the other return 404.

The reflex, in both directions: request a resource that only exists in your own tree
**before** measuring anything, and check a process's command line **before** killing a port.

```bash
netstat -ano | grep :8791            # who is listening
tasklist /FI "PID eq <pid>"          # is it mine
curl -s localhost:8791/my-own-marker # is it my tree
```

**The development server must send `no-store`**, otherwise the browser serves a stale file
and you debug code that is already fixed.

## Templates and pages

**A repeated `og:` tag is an array, not a replacement.** The layout set a default one and
each page pushed another: unfurlers take the first, so the generic card always won and
neither of the two share cards built that evening ever appeared. Nothing raises, the page
returns 200, and the only way to see it is to read the served HTML. A page now replaces
with `@section` instead of appending.

**`data-slug` is a contract, not a spare attribute.** `apercu.js` walks every
`[data-slug]` in the document, fetches that schematic's code and replaces the element's
content with a canvas. Putting the attribute on anything that is not a thumbnail panel
therefore deletes whatever was inside it, silently: a server-side test suite stays green
because it reads what the server sent, and the damage only happens in the browser
afterwards. Carry the slug under another name, and open the page to check.

**An escaped apostrophe in a Blade directive stops the compiler mid-file**, and the page
answers **200 while printing its own source**, `@stack` and `@include` included. No test
caught it. One does now: no `@yield` may appear in the served HTML.

## Game data

**`consumes_power` can be true with no consumption at all.** The graphite press is
mechanical in the game. Trust the presence of `power` and `power_out`, never the boolean.

**The `range` field of `blocks.json` mixes two units, and nothing says so.** It is in tiles
for bridges, beam nodes, plasma drills, mass drivers and overdrive projectors; in world
units, eight per tile, for every turret, repair point and shock tower. `DumpBlocks.java`
divides by eight in three places and copies the raw field elsewhere, because in the game
`ItemBridge.range` is an integer of tiles and `BaseTurret.range` a float of distance. The
number alone cannot settle it: a bridge's 4 and a repair point's 40 are plausible in either
unit. The real fix belongs in the dumper, which should write the unit next to the value.

**A block's throughput in the catalogue is a nominal ceiling, not a measurement.** It is
what the block would do fed at full rate, alone, with no bottleneck. The figure the rest of
the site presents as measured comes from the solver, feed and boost included, and is often
lower. A page displaying both the same way repeats the ranking-by-net-power mistake: it
presents as a measurement something that is not one, on the one site that sells
measurements.

**The catalogue dump is not reproducible byte for byte.** Two runs without touching the
code give eight lines of diff on `wave` and `tsunami`: the order of their liquid
`ammo_types` comes from iterating an arc `ObjectMap`, which depends on hashing and
therefore on the run. The content is identical after parsing. But in a 457 kB diff nobody
tells a reordering from a real change, and that is how a regeneration hides a regression.
The affected outputs are sorted at the source.

## Git

**During a merge, `git diff` against `origin/...` lies.** The trunk moves faster than a
merge-test-push cycle, so comparing against the remote branch just after a resolution
compares against a target that has already moved, and shows deletions that do not exist:
work that is actually still present reads as deleted. The right reference during a merge
is `MERGE_HEAD`, not `origin/<branch>`.

**A plain `diff` lies about two identical files on Windows.** A file written in a
checkout with CRLF line endings gets normalised to LF by git on commit, and comparing the
working copy against the committed one then reports every single line as different, even
when the only difference is the carriage returns. Normalise before concluding that content
diverged: `git show "origin/main:$f" | diff - <(tr -d '\r' < "$f")`.

**Checking that a branch is clean does not keep it clean.** `git log --oneline
origin/main..HEAD` being empty says nothing about the state a few minutes later if anything
else commits on that HEAD in between. Pushing `HEAD:refs/heads/<branch>` then carries
whatever landed since. Cut the branch from `origin/main`, and prefer a worktree over a
shared checkout.
