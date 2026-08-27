# Why there is a TrueType copy of the font here

`forge.ttf` is not a second typeface. It is the same subset as
`public/forge/fonts/forge.woff2`, unwrapped from its web container by
`tools/build_brand.py`, and it is regenerated with everything else so it cannot drift from
the one the browser loads.

It exists because the social cards are drawn server-side with GD, whose text comes from
FreeType, and FreeType reads TrueType and OpenType but not WOFF2. Nothing downloads this
file, which is why it sits in `resources/` and not in `public/`.

**Its licence is whatever `forge.woff2`'s is**, and that question is answered next to the
original in `public/forge/fonts/README.md`. Read that before treating this file as
covered by the repository's AGPL-3.0: a font is not covered by the licence of the software
that displays it.

Note that the source here is `forge.woff2` and **not** `forge-mono.woff2`, which is Fira
Code under the SIL Open Font License and carries its own obligations.
