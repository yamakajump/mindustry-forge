{{-- Which block a schematic has to contain, browsable rather than typed from memory.

     It was a bare text field with a `datalist`: you had to know that the reactor is called
     `thorium-reactor` before you could ask for it, and a player knows the sprite. The
     catalogue's own front page solves this with a grid, and its comment says why it does so
     on the server: shipping 254 tiles to hide 220 makes somebody on a phone pay for the
     whole catalogue to look at one category. That reasoning holds here, so the grid is not
     in this page.

     The field stays exactly what it was, and the grid is fetched the first time the panel
     is opened, 3.4 kB over the wire, then cached for a day. With no JavaScript the panel
     opens on the same field and the same `datalist` as before: nothing is lost, only the
     browsing is not gained. See `bloc-choix.js`.

     Expects: holds (the chosen block name, "" for none), blocks (the datalist's names). --}}
<details class="choix bloc-choix" data-bloc-choix>
  <summary>
    <span class="choix-quoi">{{ __('vitrine.bloc.label') }}</span>
    @if($holds !== '')
      <img class="icone" src="/icone/{{ \App\Support\Thing::family($holds) }}/{{ $holds }}.png?t=32"
           width="20" height="20" decoding="async" alt="">
    @endif
    <b>{{ $holds !== '' ? \App\Support\Thing::name($holds) : __('vitrine.bloc.aucun') }}</b>
    <span class="choix-changer">changer</span>
  </summary>

  <div class="choix-grille bloc-panneau">
    {{-- The control itself, and the only thing that posts. Everything below writes into
         it. --}}
    <input name="bloc" id="bloc" list="blocs" value="{{ $holds }}"
           placeholder="{{ __('vitrine.bloc.exemple') }}" autocomplete="off"
           aria-label="{{ __('vitrine.bloc.label') }}">
    <datalist id="blocs">
      @foreach($blocks as $block)
        <option value="{{ $block }}"></option>
      @endforeach
    </datalist>

    {{-- Filled by the script, and empty otherwise. Not `hidden`: an empty box says nothing,
         and the field above is already the whole control. --}}
    <div class="bloc-mondes-chips" data-mondes></div>
    <div class="bloc-familles" data-familles></div>
  </div>
</details>
