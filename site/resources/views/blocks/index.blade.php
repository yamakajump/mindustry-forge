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

{{-- The world at the top, and in large type.

     You play Serpulo or Erekir, never both at once, and the two trees share almost
     nothing: mixed together, the 254 blocks put a conveyor next to a reinforced conduit.
     That choice used to be one entry among others in a dropdown, set to "both"; it is the
     first question a player asks, so it comes ahead of the others.

     Links and not buttons: each world has its own address, it shares and indexes, and the
     page works without JavaScript. The counts are said because a choice that removes a
     hundred blocks has to announce how many it removes. --}}
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
        {{-- One image per block rather than the whole sheet as a background.

             Measured on this page: it used to download 1,393 kB, of which 1,311 for
             `atlas.png`, that is 94 % of the weight to show 254 thumbnails. Each icon
             served on its own weighs about a kilobyte, and `loading="lazy"` means only the
             ones on screen go out: nobody looks at 254 thumbnails at once.

             `t=32` and not 64: these sprites are natively 32 pixels, and `pixelated`
             enlarges them without losing anything. Asking for 64 would double the weight
             for the same pixels. --}}
        <img class="icone bloc-tile-image" src="/icone/bloc/{{ $name }}.png?t=32"
             width="48" height="48" loading="lazy" decoding="async" alt="">
        <span class="bloc-name">{{ $block->title() }}</span>
        <span class="bloc-id">{{ $name }}</span>
      </a>
    @endforeach
  </div>
@endforeach
@endsection
