{{-- The public folder gallery, everyone's shared folders in one list. Route GET /dossiers,
     fed by FolderController::index. Distinct from folders/mine.blade.php, which is the
     signed-in member's own folders at /mes-dossiers.

     Scope: folders, orders, order. --}}
@extends('layout')

@section('title', __('dossiers.page.galerie').' - Mindustry Forge')

@section('body')
  <h1 class="title">{{ __('dossiers.page.galerie') }}</h1>

  @if($folders->isEmpty())
    {{-- It answers and says so, rather than being missing. Refusing to link to a page is
         not the same thing as hiding it. --}}
    <p class="hint-line">{{ __('dossiers.page.galerie-vide') }}</p>
  @else
    <form method="get" class="card">
      <label for="tri">{{ __('dossiers.page.trier') }}</label>
      <select id="tri" name="tri" onchange="this.form.submit()">
        @foreach($orders as $key => $label)
          <option value="{{ $key }}" @selected($order === $key)>{{ $label }}</option>
        @endforeach
      </select>
      <noscript><button type="submit">{{ __('dossiers.page.appliquer') }}</button></noscript>
    </form>

    <div class="dossiers">
      @foreach($folders as $folder)
        <article class="dossier">
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
            {{-- No thumbnails here: twenty-four folders would make ninety-six drawings on
                 one page, and the Discord card already carries them. --}}
            @if($folder->likes > 0)
              &middot; {{ $folder->likes }} {{ __('schema.unite.jaime') }}
            @endif
          </p>
        </article>
      @endforeach
    </div>

    {{ $folders->links() }}
  @endif
@endsection
