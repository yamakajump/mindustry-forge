{{-- The mark for power, drawn rather than fetched.

     Every item and every liquid on this site is shown with the game's own sprite, served by
     `/icone/{family}/{name}.png`. Power has no sprite to serve: it is neither an item nor a
     liquid, so `Thing::family` files it under `bloc` and resolves to a picture that does not
     exist, and the atlas the analyser draws with holds power *blocks* (nodes, sources) and
     no icon. The game keeps its own in its UI sprites, which this repository does not dump.

     So it is a path, and there are two copies of it: this one, and `BOLT` in
     `public/index.html`, which cannot see a Blade partial. `EclairTest` holds the two
     together, the way `MarkTest` holds the three copies of the brand.

     `currentColor` on purpose: the same mark sits on an amber "produit" line and on a grey
     one, and an `<img>` would follow neither. --}}
<svg class="eclair" viewBox="0 0 24 24" aria-hidden="true"
     width="{{ $size ?? 18 }}" height="{{ $size ?? 18 }}"
     fill="currentColor" stroke="none"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>
