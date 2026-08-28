"""Take the game's own typefaces and make them light enough for a web page.

    python tools/build_fonts.py

Mindustry has a face of its own, and reading a tool for the game in a system sans-serif is
the single loudest way of saying "this was made by someone who was not really thinking
about the game". The jar carries `font.woff` already, so there is nothing to approximate.

What there is to do is make it small. The shipped file is 3.5 megabytes because it covers
every script the game is translated into; a page in French needs Latin, digits and
punctuation. Subsetting takes it under a tenth of that, and WOFF2 halves it again.

Licensing, stated rather than assumed: Mindustry's code is GPL-3, and Anuke allows the
game's assets to be used by community tools and fan sites. That is the same footing every
other Mindustry site stands on, including the one this borrows its shape from. If that ever
changes the fallback is one line of CSS.

That reasoning holds for the icon font and not for the other one, which this file used to
miss. `monospace.woff` is **Fira Code Medium**, `Copyright 2014-2021 The Fira Code Project
Authors`, under the **SIL Open Font License 1.1**. Anuke redistributes it; he did not write
it, so his position on his own assets says nothing about it.

The OFL allows redistribution and subsetting outright. What it asks is that the copyright
notice and the licence text travel with the font. Subsetting keeps the notice, inside the
file's own `name` table. The licence text is `site/public/forge/fonts/FiraCode-OFL.txt`,
and `fonts/README.md` next to it says which file is which.

Read the `name` table before trusting any of this a second time; it took one command and
it contradicted what everyone here had assumed.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

JAR = Path("mindustry-forge/assets-v159.7.jar")
OUT = Path("site/public/forge/fonts")

#: Everything a French page can put on screen, plus the few symbols the analysis uses.
#: Named rather than taken as a whole face: the shipped file covers every language the game
#: is translated into, which is 3.5 megabytes for a page that needs Latin.
KEEP = (
    "U+0020-007E,"      # ASCII
    "U+00A0-00FF,"      # accented Latin, which French needs and English does not
    "U+0152-0153,"      # oe
    "U+2013-2014,U+2018-201D,U+2026,"   # dashes, quotes, ellipsis
    "U+00D7,U+00B7,U+2192,U+2212"       # times, middle dot, arrow, minus
)

FACES = {
    "forge": "assets/fonts/font.woff",
    "forge-mono": "assets/fonts/monospace.woff",
}


def main() -> None:
    archive = zipfile.ZipFile(JAR)
    OUT.mkdir(parents=True, exist_ok=True)

    for name, path in FACES.items():
        with archive.open(path) as handle:
            raw = handle.read()

        font = TTFont(io.BytesIO(raw))
        options = subset.Options()
        options.layout_features = ["*"]
        options.desubroutinize = True
        options.notdef_outline = True
        options.flavor = "woff2"

        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=subset.parse_unicodes(KEEP))
        subsetter.subset(font)

        target = OUT / f"{name}.woff2"
        font.flavor = "woff2"
        font.save(target)
        print(f"  {name:12s} {len(raw) // 1024:5d} kB  ->  {target.stat().st_size // 1024:4d} kB")


if __name__ == "__main__":
    main()
