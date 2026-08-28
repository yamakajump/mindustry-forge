"""What a floor's numbered art means, shared by the scripts that read it.

Both `build_sprites.py`, which packs the atlas, and `build_sols.py`, which writes
`sols.json`, need to agree on which floor kinds carry numbered art that is not a texture
variant. One definition, imported by both, is what makes that agreement a fact rather than
a hope: two lists that must match with nothing checking they do is exactly the kind of
defect this repository refuses to leave in place.
"""

from __future__ import annotations

from collections.abc import Container, Iterator

#: Floor kinds whose numbered sprites are not texture variants of one picture. A
#: `RuneOverlay` or `CharacterOverlay` tile has one glyph per number, picked by the block's
#: configuration rather than by the game at random, and the game draws the same glyph on
#: every tile of a given configuration. Packing all of them as `floor/<name>#<n>` and then
#: choosing among them per tile with a position hash, the way `grass1..3` are chosen, would
#: scatter unrelated glyphs across a painted patch instead of drawing the one configured.
NOT_TEXTURE_VARIANTS = {"RuneOverlay", "CharacterOverlay"}


def variant_names(name: str, art: Container[str], floors: Container[str]) -> Iterator[str]:
    """The numbered sprites that are texture variants of `name`, in the game's order.

    The game ships `grass1`, `grass2`, `grass3` and picks one per tile, so a floor's variants
    are found by counting up from 1 until the art runs out. What that enumeration must not do
    is walk into another floor's name.

    `metal-tiles-1` is the case that exists, and it is the only one in the catalogue today:
    `metal-tiles-11`, `metal-tiles-12` and `metal-tiles-13` are three separate floors, and all
    three match `f"{name}{n}"` for n of 1, 2 and 3. Counted as variants they gave
    `metal-tiles-1` three of them, which sent the renderer down its `count > 1` path and drew a
    patch of it as a random mix of three visibly different floors, never once drawing
    `metal-tiles-1` itself.

    A candidate that names a floor stops the enumeration rather than being skipped over. The
    numbering has to stay contiguous: the browser finds a floor's variants by asking the atlas
    for `#1`, `#2`, `#3` until one is missing, so a gap in the middle hides everything past it
    anyway, and hiding it silently is worse than stopping.
    """
    n = 1
    while (candidate := f"{name}{n}") in art:
        if candidate in floors:
            return
        yield candidate
        n += 1
