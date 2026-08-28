@extends('layout')

@section('title', __('dossiers.page.galerie').' - Mindustry Forge')

@section('body')
<main>
  <h1 class="title">{{ __('dossiers.page.galerie') }}</h1>

  @if($folders->isEmpty())
    {{-- Repond et le dit, plutot que d'etre absente. Refuser de lier une page n'est pas la
         meme chose que la cacher. --}}
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
            {{ $folder->schematics_count }} {{ __('dossiers.unite.schemas') }}
            @if($folder->children_count > 0)
              &middot; {{ $folder->children_count }} {{ __('dossiers.unite.sous-dossiers') }}
            @endif
            {{-- Pas de vignettes ici : vingt-quatre dossiers feraient quatre-vingt-seize
                 dessins sur une page, et la carte Discord les porte deja. --}}
            @if($folder->likes > 0)
              &middot; {{ $folder->likes }} {{ __('schema.unite.jaime') }}
            @endif
          </p>
        </article>
      @endforeach
    </div>

    {{ $folders->links() }}
  @endif
</main>
@endsection
