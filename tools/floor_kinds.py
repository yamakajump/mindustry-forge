"""What a floor's numbered art means, shared by the scripts that read it.

Both `build_sprites.py`, which packs the atlas, and `build_sols.py`, which writes
`sols.json`, need to agree on which floor kinds carry numbered art that is not a texture
variant. One definition, imported by both, is what makes that agreement a fact rather than
a hope: two lists that must match with nothing checking they do is exactly the kind of
defect this repository refuses to leave in place.
"""

from __future__ import annotations

#: Floor kinds whose numbered sprites are not texture variants of one picture. A
#: `RuneOverlay` or `CharacterOverlay` tile has one glyph per number, picked by the block's
#: configuration rather than by the game at random, and the game draws the same glyph on
#: every tile of a given configuration. Packing all of them as `floor/<name>#<n>` and then
#: choosing among them per tile with a position hash, the way `grass1..3` are chosen, would
#: scatter unrelated glyphs across a painted patch instead of drawing the one configured.
NOT_TEXTURE_VARIANTS = {"RuneOverlay", "CharacterOverlay"}
