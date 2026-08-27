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
      @php($sprite = \App\Services\Sprites::block($name, 48))
      <a class="bloc-tile" href="/blocs/{{ $name }}">
        @if($sprite)
          <span class="sprite sprite-tile" style="{{ $sprite }}" aria-hidden="true"></span>
        @endif
        <span class="bloc-name">{{ $block->title() }}</span>
        <span class="bloc-id">{{ $name }}</span>
      </a>
    @endforeach
  </div>
@endforeach
@endsection
