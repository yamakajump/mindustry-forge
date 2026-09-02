{{-- The signed-in member's own folders. Route GET /mes-dossiers (behind auth), fed by
     FolderController::mine. Distinct from folders/index.blade.php, which is the public
     gallery of everyone's shared folders at /dossiers.

     Scope: folders, icons. --}}
@extends('layout')

@section('title', __('dossiers.page.les-miens').' - Mindustry Forge')

@push('head')
  <script src="/forge/dossiers.js" type="module" defer></script>
@endpush

@section('body')
  <h1 class="title">{{ __('dossiers.page.les-miens') }}</h1>

  {{-- The form is a real form, not a button that opens a dialog: without JavaScript it
       does nothing, but it reads, fills in and announces itself to the screen reader as
       what it is. --}}
  <form class="card creer-dossier" data-creer>
    <h2>{{ __('dossiers.gestion.creer') }}</h2>
    {{-- One row, each control under its own label.
         Stacked, they were three block-level elements with no rhythm between them: a text
         field a thousand pixels wide for a name of two words, then a label, a dropdown and
         a button sharing a line for no reason but the order they were written in. The card
         held three controls and looked like three unrelated ones. --}}
    <div class="rangee">
      <div class="champ-bloc">
        <label for="nom">{{ __('dossiers.gestion.nom') }}</label>
        <input id="nom" name="nom" type="text" maxlength="80" required>
      </div>

      {{-- The same picker as the catalogue's filters, and for the same reason: this is a
           list of the game's items, offered as their own names in a browser dropdown while
           every other surface on the site draws them. The value it posts keeps its
           `objet/` prefix, which is what the icon endpoint wants. --}}
      <div class="champ-bloc">
        @include('partials.choix', [
          'nom' => 'icone',
          'titre' => __('dossiers.gestion.icone'),
          'valeur' => '',
          'vide' => __('dossiers.gestion.sans-icone'),
          'options' => collect($icons)->map(fn ($item) => [
            'valeur' => 'objet/'.$item,
            'libelle' => \App\Support\Thing::name($item),
            'famille' => 'objet',
            'icone' => $item,
          ])->all(),
        ])
      </div>

      <button class="primary" type="submit">{{ __('dossiers.gestion.creer') }}</button>
    </div>
    <p class="hint-line note" hidden></p>
  </form>

  @if($folders->isEmpty())
    <p class="hint-line">{{ __('dossiers.page.vide') }} {{ __('dossiers.page.creer-premier') }}</p>
  @endif

  <div class="dossiers">
    @foreach($folders as $folder)
      <article class="dossier" data-dossier="{{ $folder->slug }}">
        <a href="/d/{{ $folder->slug }}">
          @if($folder->icon)
            <img src="/icone/{{ $folder->icon }}.png?t=32" alt="" width="32" height="32">
          @endif
          <h3>{{ $folder->name }}</h3>
        </a>
        <p class="meta">
          {{ $folder->schematics_count }} {{ trans_choice('dossiers.unite.schemas', $folder->schematics_count) }}
          @if($folder->children_count > 0)
            &middot; {{ $folder->children_count }} {{ trans_choice('dossiers.unite.sous-dossiers', $folder->children_count) }}
          @endif
        </p>
        <p class="row-end">
          <button type="button" class="link" data-renommer
                  data-nom="{{ $folder->name }}">{{ __('dossiers.gestion.renommer') }}</button>
          <button type="button" class="link danger" data-supprimer>{{ __('dossiers.gestion.supprimer') }}</button>
        </p>
      </article>
    @endforeach
  </div>

  {{ $folders->links() }}
@endsection
