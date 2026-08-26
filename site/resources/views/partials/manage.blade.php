{{-- Who can see a schematic, and getting rid of it. Shown wherever a schematic is, which
     is the page it lives on and the grid of one's own: managing a thing where you are
     looking at it beats a settings page you have to go and find. --}}
<div class="manage" data-slug="{{ $schematic->slug }}">
  <select aria-label="Qui peut la voir">
    @foreach(['private' => 'Privee', 'unlisted' => 'Par lien', 'public' => 'Publique'] as $value => $label)
      <option value="{{ $value }}" @selected($schematic->visibility === $value)>{{ $label }}</option>
    @endforeach
  </select>
  <button type="button" class="link danger" data-delete
          data-name="{{ $schematic->name }}"
          @if($gone ?? false) data-gone="{{ $gone }}" @endif>Supprimer</button>
  <p class="hint-line note" hidden></p>
</div>
