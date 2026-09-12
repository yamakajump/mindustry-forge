# Two addresses for one schematic

The request behind this decision: "there are several displays so it is really weird,
refactor that", and then, when asked whether the workshop should get an address of its own:
"make the decision yourself, I think you are just as well placed to know what is good."

A schematic is reachable at two addresses and they are not alike:

| | |
|---|---|
| `/s/<slug>` | Laravel, server rendered, indexed, what a Discord link unfurls into |
| `/?s=<slug>` | the analyser, a static page, with that schematic loaded into it |

## What was decided

**`/?s=<slug>` stays.** No third address, no redirect, no `/s/<slug>/analyser`.

## Why

**It is a destination, not an address people pass around.** What gets pasted into a Discord
thread is `/s/<slug>`: it unfurls into a card with a picture and a figure, and the other one
unfurls into the analyser's own generic preview. A reader reaches the workshop by pressing
"Ouvrir ce schéma", and the shape of the address they land on costs them nothing.

**Changing a public address is not free and the gain is cosmetic.** Links already exist in
Discord threads. A redirect would have to carry the query string for ever, which is the
defect `SchemaRedirectTest` exists for and which this repository has logged six times:
`Route::redirect` drops everything after the `?` and answers 200 with a plausible result to
a question nobody asked. Adding another redirect to make an address prettier is buying that
risk for nothing.

**Serving both would be worse than either.** Two live addresses for one page is the
duplication complained about, made real in the index: it needs a canonical, and a canonical
nobody maintains is how a site teaches a crawler to pick the wrong one.

**And it is reversible.** Keeping the query form commits to nothing. A path form can be
added later, at any time, with the old links still working. Adding it today commits to a
second address for ever.

## What the complaint actually was, and what was done about it

Not the address. Three things, all of them fixed rather than renamed:

- The two pages **called the same facts different names**: "Sortie" and "Il lui faut" here,
  "Ce qu'il sort" and "Ce qu'il faut lui amener" there. One schematic, four headings. They
  now share the wording, through the dictionary rather than as literals.
- They **contradicted each other**: the schematic's page printed "au mieux 8 verre / s" for
  a plan the analyser called jammed, because `bloque` was computed and never stored.
- The analyser **never said where its plan had come from**. Opening somebody's schematic
  put its analysis on screen with no name, no link, no way back; the only route to the page
  was inside the save card and only for a reader who owned it. For everybody else the two
  screens were unrelated, which is what made them read as several displays of nothing in
  particular. There is a line under the title now, on every schematic opened from a link.

## What would change this

A player sharing `/?s=` rather than `/s/` in a thread, often enough to notice. That is the
signal that the workshop has become something people point at rather than somewhere they
are sent, and it is the day the address is worth making readable.

The analyser is deliberately **not** merged into `/s/`, and that is a separate decision with
its own reason: it would load the engine and the 1.28 MB sprite atlas onto the page whose
job is to be found and to open fast, and it would take the figure out of the indexable HTML.
Two renderings of one fact is the price of that; saying the same thing is what matters.
