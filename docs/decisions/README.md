# Decisions

A design document records why a thing is the way it is. That reason stays true after the
code that carries it out has shipped, changed, or been abandoned, which is what separates
it from an execution plan: a plan is a list of steps for whoever is running them that day,
and it is not kept.

## What these are, and what they are not

Each document below describes an intention, not a live specification: none of them is
kept in sync with the code after it lands, and none is re-read when the code changes for
an unrelated reason. If a document here and the code disagree, **the code is the truth**.
Read a document for the reasoning behind a decision, not for a description of current
behaviour.

## Naming

`<date>-<subject>.md`, in the order the decisions were written. The word "design" is not
in the filename: everything in this directory is one.

## Index

| Document | What it decided |
|---|---|
| [2026-08-28-likes-and-favorites](2026-08-28-likes-and-favorites.md) | A public like on a schematic, a private favorite, and the ordering that follows from having both |
| [2026-08-28-folders](2026-08-28-folders.md) | Named, pictured collections of schematics, nestable and shareable by link, distinct from a favorite |
| [2026-08-28-notes](2026-08-28-notes.md) | Two separate notes, not one: a private note that follows a schematic everywhere, and a folder note that only makes sense inside one folder |
| [2026-08-28-folder-likes](2026-08-28-folder-likes.md) | The like gesture from the first document, applied to folders, plus the ranking that makes it worth having |
| [2026-08-28-home-page](2026-08-28-home-page.md) | Why the home page said "schematique" where the game says "schema", and why a showcase ranked by rate showed the same schematic six times |
| [2026-08-28-mode-edition-refonte](2026-08-28-mode-edition-refonte.md) | What a day of using the editor found wrong with it, traced to a cause rather than left as a symptom |

The algorithm behind ground rendering, extracted out of an execution plan for the design
above rather than out of a decision of its own, lives at
[`docs/ground-rendering.md`](../ground-rendering.md).
