# Where these fonts come from, and under what

Both are lifted out of the Mindustry jar by `tools/build_fonts.py`, subset to the glyphs
this site actually draws. The script states the position for the game's own assets, and it
is the same footing every other Mindustry site stands on.

That reasoning does not cover both files, which is why this note exists. It was written
after reading the `name` table of each file rather than after assuming.

| File | What it actually is | Licence |
|---|---|---|
| `forge.woff2` | Built with fontello, `Copyright (C) 2026 by original authors @ fontello.com`. The icon font Mindustry ships. | Anuke's assets position, as stated in `build_fonts.py`. |
| `forge-mono.woff2` | **Fira Code Medium 6.002**, `Copyright 2014-2021 The Fira Code Project Authors`. | **SIL Open Font License 1.1**, see `FiraCode-OFL.txt`. |

`forge-mono.woff2` is not Anuke's work. It is a third-party font the game redistributes,
and the OFL is generous about redistribution and subsetting: both are expressly allowed.
What it asks in return is that the copyright notice and the licence text travel with the
font. The notice survives subsetting inside the file's own `name` table; the licence text
did not travel, and `FiraCode-OFL.txt` next to it is what closes that.

Worth stating plainly, because this repository is AGPL-3.0 and a reader could reasonably
assume everything in it falls under that: these two files do not. A font is not covered by
the licence of the software that displays it.

Reading a `.woff2` needs `brotli` installed alongside `fontTools`, or the file looks
unreadable and one ends up guessing at its contents:

    python -c "from fontTools.ttLib import TTFont; \
      print(TTFont('forge-mono.woff2')['name'].getDebugName(0))"
