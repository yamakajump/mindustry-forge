{{-- The mark for power, drawn rather than fetched.

     Every item and every liquid on this site is shown with the game's own sprite, served by
     `/icone/{family}/{name}.png`. Power has no sprite to serve: it is neither an item nor a
     liquid, so `Thing::family` files it under `bloc` and resolves to a picture that does not
     exist, and the atlas the analyser draws with holds power *blocks* (nodes, sources) and
     no icon. The game keeps its own in its UI sprites, which this repository does not dump.

     So it is the game's own glyph, lifted out of `assets/fonts/icon.ttf` where it is named
     `power_`, and turned into a path with `fontTools` - the same family of tool
     `build_fonts.py` already uses on the two typefaces this site ships. Not a drawing that
     resembles it: the outline is the game's, to the unit, centred in a square box because
     both places that use it lay it out square.

     Two copies of that path: this one, and `BOLT` in `public/index.html`, which cannot see
     a Blade partial. `NavigationTest` holds the two together, the way it already holds the
     two headers.

     `currentColor` on purpose: the same mark sits on an amber "produit" line and on a grey
     one, and an `<img>` would follow neither. --}}
<svg class="eclair" viewBox="0 0 1043 1043" aria-hidden="true"
     width="{{ $size ?? 18 }}" height="{{ $size ?? 18 }}"
     fill="currentColor" stroke="none"><path d="M652.13 105 261.13 474 522.13 625 392.13 938 782.13 568 522.13 418ZM652.13 0Q695.13 0 725.13 31Q755.13 62 756.13 105Q756.13 127 746.13 149L653.13 373L835.13 478Q878.13 503 885.13 555Q892.13 607 853.13 644L463.13 1014Q432.13 1043 391.13 1043Q335.13 1043 305.13 996Q275.13 949 296.13 898L391.13 670L210.13 565Q166.13 540 158.13 489Q150.13 438 190.13 399L580.13 29Q611.13 0 652.13 0Z"/></svg>
