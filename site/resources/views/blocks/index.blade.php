{{-- The block wiki's front page: every block in the game, grouped and filterable by
     planet. Route GET /blocs, fed by BlockController::index.

     Scope: categories, chosen, planet, counts, allCategories, total, gameVersion. --}}
@extends('layout')
@section('title', __('blocs.index.titre').' - Mindustry Forge')

@push('head')
<link rel="stylesheet" href="/forge/blocs.css">
<meta name="description" content="{{ __('blocs.index.sous-titre') }}
  {{ $total }} {{ __('blocs.index.blocs') }}, Mindustry {{ $gameVersion }}.">
@endpush

@section('body')
<h1 class="title">{{ __('blocs.index.titre') }}</h1>
<p class="sub">{{ __('blocs.index.sous-titre') }}
  {{ __('blocs.index.version') }} {{ $gameVersion }}, {{ $total }} {{ __('blocs.index.blocs') }}.</p>

{{-- Filtered on the server rather than by hiding tiles in JavaScript. The site is read on
     a phone mid-game, and shipping 254 tiles to hide 220 of them makes a player pay for the
     whole catalogue's bandwidth to look at one category. --}}
<form method="get" class="bloc-filters">
  <label for="categorie">{{ __('blocs.index.categorie') }}</label>
  <select name="categorie" id="categorie">
    <option value="">{{ __('blocs.index.toutes') }}</option>
    @foreach($allCategories as $key)
      <option value="{{ $key }}" @selected($chosen === $key)>{{
        __(\App\Services\BlockCatalogue::categoryKey($key)) }}</option>
    @endforeach
  </select>

  <button class="primary" type="submit">{{ __('blocs.index.filtrer') }}</button>
</form>

{{-- Le monde en tete, et en gros.

     On joue Serpulo ou Erekir, jamais les deux a la fois, et les deux arbres ne partagent
     presque rien : melanges, les 254 blocs mettent un convoyeur a cote d'une gaine
     renforcee. Ce choix etait une entree parmi d'autres dans une liste deroulante, reglee
     sur « les deux » ; c'est la premiere question qu'un joueur se pose, donc elle passe
     devant les autres.

     Des liens et non des boutons : chaque monde a son adresse, elle se partage et
     s'indexe, et la page marche sans JavaScript. Les comptes sont dits parce qu'un choix
     qui retire cent blocs doit annoncer combien il retire. --}}
<nav class="bloc-mondes" aria-label="{{ __('blocs.index.planete') }}">
  @foreach([\App\Http\Controllers\BlockController::DEFAULT_PLANET, 'erekir'] as $monde)
    <a href="?planete={{ $monde }}{{ $chosen ? '&categorie='.$chosen : '' }}"
       class="bloc-monde @if($planet === $monde) on @endif"
       @if($planet === $monde) aria-current="page" @endif>
      <span class="bloc-monde-nom">{{ __(\App\Services\BlockCatalogue::planetKey($monde)) }}</span>
      <span class="bloc-monde-compte">{{ $counts[$monde] }} {{ __('blocs.index.blocs') }}</span>
    </a>
  @endforeach
  <a href="?planete=tout{{ $chosen ? '&categorie='.$chosen : '' }}"
     class="bloc-monde @if($planet === '') on @endif"
     @if($planet === '') aria-current="page" @endif>
    <span class="bloc-monde-nom">{{ __('blocs.index.partout') }}</span>
    <span class="bloc-monde-compte">{{ $counts['tout'] }} {{ __('blocs.index.blocs') }}</span>
  </a>
</nav>

@if($categories === [])
  <div class="card"><p class="empty">{{ __('blocs.index.vide') }}</p></div>
@endif

@foreach($categories as $category => $blocks)
  <h2 class="bloc-cat">{{ __(\App\Services\BlockCatalogue::categoryKey($category)) }} &middot;
    {{ count($blocks) }} {{ __('blocs.index.blocs') }}</h2>

  <div class="bloc-grid">
    @foreach($blocks as $name => $block)
      <a class="bloc-tile" href="/blocs/{{ $name }}">
        {{-- Une image par bloc plutot que la feuille entiere en fond.

             Mesure sur cette page : elle telechargeait 1 393 ko, dont 1 311 pour `atlas.png`,
             soit 94 % du poids pour montrer 254 vignettes. Chaque icone servie a l'unite pese
             environ un kilooctet, et `loading="lazy"` fait que seules celles a l'ecran
             partent : personne ne regarde 254 vignettes a la fois.

             `t=32` et pas 64 : ces sprites sont nativement en 32 pixels, et `pixelated`
             agrandit sans rien perdre. Demander 64 doublerait le poids pour les memes pixels. --}}
        <img class="icone bloc-tile-image" src="/icone/bloc/{{ $name }}.png?t=32"
             width="48" height="48" loading="lazy" decoding="async" alt="">
        <span class="bloc-name">{{ $block->title() }}</span>
        <span class="bloc-id">{{ $name }}</span>
      </a>
    @endforeach
  </div>
@endforeach
@endsection
