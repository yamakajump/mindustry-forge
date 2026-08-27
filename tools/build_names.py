# -*- coding: utf-8 -*-
"""Take the names the game already has, in the language the player reads.

    python tools/build_names.py            # French
    python tools/build_names.py fr en de   # several at once

The site showed `silicon-smelter` to a French reader, and the best it did anywhere was
`Silicon smelter`, an identifier with its dashes taken out. Writing four hundred and
twenty-eight names by hand would have been a week of work and a permanent source of
disagreement with the game.

There is nothing to write. Mindustry is translated by its own community and ships every
translation inside the jar, `assets/bundles/bundle_<locale>.properties`, keyed
`block.<name>.name`. `build_catalogue.py` already opens that jar and has never looked at
them. This is the same move as the sprite sheet: a generator that reads less than the jar
holds.

**The file is UTF-8**, which is worth stating because the opposite was believed here first.
A `.properties` file is latin-1 by the Java specification, so latin-1 was the natural guess
and it is wrong for this one: measured over all 3 038 lines, UTF-8 decodes with zero
replacement characters, while latin-1 turns `Créé` into `CrÃ©Ã©` on 1 568 of them. Guessing
would have generated four hundred names of mis-encoded French, which is the one defect this
repository's own conventions call out by name.
"""

from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JAR = ROOT / "mindustry-forge/assets-v159.7.jar"
CATALOGUE = ROOT / "site/public/forge/blocks.json"
#: A cote des dictionnaires d'interface et pas dedans. Le fichier n'en est pas un : c'est de
#: la donnee de jeu, generee, avec ses propres trous. Un test parcourt `forge/lang/*.json` en
#: exigeant que chaque langue porte les memes cles que le francais, et il a raison de le
#: faire ; y deposer ceci lui aurait appris une exception au lieu d'un rangement.
OUT = ROOT / "site/public/forge/noms"

#: `block.silicon-smelter.name = Fonderie de Silicium`, and the same shape for items and
#: liquids. Anything else in the bundle is interface text that belongs to the game.
LINE = re.compile(r"^(block|item|liquid)\.([a-z0-9-]+)\.name\s*=\s*(.+?)\s*$")

#: The bundles carry a dozen `\uXXXX` escapes, all of them in the private use area: they are
#: Mindustry's own icon glyphs, not accented letters. A name that ends up carrying one would
#: render as a blank box in a browser, which has no font for them.
ICON = re.compile(r"\\u[eEfF][0-9a-fA-F]{3}")


def bundle(archive: zipfile.ZipFile, locale: str) -> dict[tuple[str, str], str]:
    """Every name the game states, for one language."""
    inside = f"assets/bundles/bundle_{locale}.properties"
    if inside not in archive.namelist():
        raise SystemExit(f"le jar ne porte pas {inside}")

    names: dict[tuple[str, str], str] = {}
    for line in archive.read(inside).decode("utf-8").splitlines():
        found = LINE.match(line)
        if found:
            names[(found.group(1), found.group(2))] = ICON.sub("", found.group(3)).strip()
    return names


def build(locale: str) -> None:
    catalogue = json.loads(CATALOGUE.read_text(encoding="utf-8"))
    with zipfile.ZipFile(JAR) as archive:
        stated = bundle(archive, locale)

    names: dict[str, str] = {}
    missing: list[str] = []
    for family, section in (("block", "blocks"), ("item", "items"), ("liquid", "liquids")):
        for name in catalogue.get(section, {}):
            said = stated.get((family, name))
            if said:
                names[f"{family}.{name}"] = said
            else:
                missing.append(f"{family}.{name}")

    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{locale}.json"

    #: Sorted, like the rest of the dictionaries here: two lanes adding a key then collide
    #: line by line instead of file by file.
    out.write_text(json.dumps(dict(sorted(names.items())), ensure_ascii=False, indent=1)
                   + "\n", encoding="utf-8")

    print(f"   {out.relative_to(ROOT)}  {len(names)} noms, "
          f"{out.stat().st_size / 1024:.0f} ko")

    if missing:
        #: Said out loud rather than left to be discovered. For French these are `air`, three
        #: removed unit factories and thirteen ore floors, none of which the game names in
        #: any language: they fall back to their identifier and that is the right answer.
        print(f"   sans nom dans ce bundle : {len(missing)} -> {', '.join(missing[:4])}"
              + (" ..." if len(missing) > 4 else ""))


if __name__ == "__main__":
    for locale in sys.argv[1:] or ["fr"]:
        build(locale)
