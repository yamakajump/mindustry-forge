{{-- A thing from the game, with its icon.

     Served one at a time by `/icone/{family}/{name}.png`, about a kilobyte, rather than by
     the whole 1,311 kB sheet laid down as a background.

     The family is asked of the catalogue rather than written out as a list: what is in
     `items` is an item, what is in `liquids` is a liquid. The eleven liquids do have a
     sprite, filed under the items prefix; the previous version of this template showed them
     as bare text, on the strength of a search for a `liquid/` prefix that does not exist.

     `alt` empty because the name is written right next to it: a screen reader announcing
     "sand sand" is worse than one that says nothing. --}}
<span class="bloc-thing">
  <img class="icone" src="/icone/{{ \App\Support\Thing::family($thing) }}/{{ $thing }}.png?t=32"
       width="18" height="18" loading="lazy" decoding="async" alt="">
  {{ $label ?? \App\Support\Thing::name($thing) }}
</span>
