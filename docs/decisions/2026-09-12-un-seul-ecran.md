# One screen for a schematic

This replaces `2026-09-12-deux-adresses-un-schema.md`, written the same day, which decided
to keep both screens and align their wording. That decision was overruled by the person who
had asked for it: "you will not keep that screen, the other one is much better."

## What was decided

`/s/<slug>` keeps its address and serves **the analyser**. The page it used to serve is
deleted. `/?s=<slug>`, which was how a stored schematic was opened while there were two
screens, answers a permanent redirect to `/s/<slug>`.

## Why the earlier decision was wrong

It rested on one claim, that the schematic's page had to be server rendered to be found and
to unfurl, and that claim conflated two things that are not the same: **a page rendered by
the server** and **the figures being in the HTML**.

A crawler and a Discord unfurler read the `<head>` and never run a line of the body. The
title, the description carrying "8,00 metaglass/s - 20 blocs", the canonical and the card
image are all head tags, and a route can render those into a static document without
rendering anything else. `HomeController` had been injecting into `public/index.html` at a
marker comment since the showcase existed; there was a pattern for this in the repository
and the decision did not use it.

So the objection was solvable rather than decisive, and what was left was a straight
comparison: which of two screens does more for a reader. The analyser carries the verdict,
the marking, the simulation and the editor. The other carried a summary of figures the
analyser also gives, under different headings, one click away.

## What it costs, stated rather than discovered later

**The body is no longer in the indexable HTML.** Google runs JavaScript, later and less
reliably than it reads markup, and this is roughly five thousand pages. That is a real bet
on search, not a detail. It was put to the person deciding, in those words, before the work
started.

What is not lost: the head, so the Discord unfurl is unchanged, and that is the channel that
actually brings readers today.

## How it is done

Two holes in `public/index.html`, filled by `SchematicController::show`.

`<!--TETE-->` … `<!--/TETE-->` takes the whole head between the markers, replaced rather than
added to: a page that kept the analyser's own `og:url` would unfurl every schematic as the
home page. `partials/tete-schema.blade.php` writes it, and adds `noindex` for anything not on
the wall, because a schematic shared by link is meant for whoever was given the link.

`<!--FICHE-->` takes `partials/fiche.blade.php`: who may see it, the note only its reader
sees, like and favourite, the code to take away, the markings other players offered, and the
credit a collected schematic carries. Those are the cards about a schematic as an object
somebody keeps. None of them describes what the plan does, because the analyser answers that,
and answering it twice under two headings is what made one schematic read as two screens.

Rendered by Blade and injected, rather than rebuilt in JavaScript: every one already had its
tests and its wiring in `keep.js`, `manage.js` and `notes.js`, and a second copy of five
working things is five more to keep in step. Injection also fails soft, which is the reason
`HomeController` uses it: served from a static file server the markers stay inert comments
and the page still works.

## The trap this sprung, which was waiting

The document is now served at three depths: `/`, `/editer`, and `/s/<slug>`. Every relative
reference in it resolved against the document and asked for `/s/<slug>/forge/bilan.js`. The
first load was a blank report, a picture that never drew, and one line in the console:
`SyntaxError: Unexpected token '<'`, which is a browser being handed the 404 page where it
expected a module.

Seventeen references in the page, and two defaults inside modules, `loadCatalogue` and
`loadSprites`. `apercu.js` had carried a note over its own copy of that constant for weeks -
"the analyser gets away with a relative base because it is served at the root; nothing else
here is" - and the note was right until the day it was not.

**Anything under `public/` that this document reaches is written absolute.**
