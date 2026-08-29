{{-- Who can see a schematic, its link, and getting rid of it.

     A native dropdown sat in the middle of a page whose every other control is a chunky
     bordered button, and it showed. Three buttons say the same thing, say it without being
     opened, and look like the rest of the site. --}}
{{-- `data-schema` and not `data-slug`, for the reason spelled out over the like buttons in
     `schematic.blade.php`: `data-slug` is apercu.js's contract, and it takes every element
     carrying one for a tile whose plan it must draw, then `replaceChildren`s a canvas into
     it. It had already eaten those two buttons once; it was eating this whole card, so
     nobody could change a schematic's visibility or delete it from its own page. --}}
<div class="manage {{ ($compact ?? false) ? 'compact' : '' }}"
     data-schema="{{ $schematic->slug }}" data-url="{{ url("/s/{$schematic->slug}") }}">
  <div class="seg" role="group" aria-label="{{ __('schema.gestion.qui-peut-voir') }}">
    @foreach([
      'private' => 'schema.gestion.privee',
      'unlisted' => 'schema.gestion.par-lien',
      'public' => 'schema.gestion.publique',
    ] as $value => $key)
      <button type="button" data-visibility="{{ $value }}"
              @class(['on' => $schematic->visibility === $value])
              aria-pressed="{{ $schematic->visibility === $value ? 'true' : 'false' }}"
      >{{ __($key) }}</button>
    @endforeach
  </div>

  {{-- The link itself, rather than leaving it to be fished out of the address bar. It is
       the whole point of "par lien". --}}
  <div class="share" @if($schematic->visibility === 'private') hidden @endif>
    <input type="text" readonly value="{{ url("/s/{$schematic->slug}") }}"
           aria-label="{{ __('schema.gestion.lien') }}" data-link>
    <button type="button" data-copy>{{ __('schema.gestion.copier') }}</button>
  </div>

  <div class="row-end">
    <button type="button" class="danger" data-delete
            data-name="{{ $schematic->name }}"
            @if($gone ?? false) data-gone="{{ $gone }}" @endif>{{ __('schema.gestion.supprimer') }}</button>
  </div>
  <p class="hint-line note" hidden></p>
</div>
