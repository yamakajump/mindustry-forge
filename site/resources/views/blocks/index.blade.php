@extends('layout')
@section('title', __('blocs.index.titre').' - Mindustry Forge')

@push('head')
<link rel="stylesheet" href="/forge/blocs.css">
<meta name="description" content="{{ __('blocs.index.sous_titre') }}
  {{ $total }} {{ __('blocs.index.blocs') }}, Mindustry {{ $gameVersion }}.">
@endpush

@section('body')
<h1 class="title">{{ __('blocs.index.titre') }}</h1>
<p class="sub">{{ __('blocs.index.sous_titre') }}
  {{ __('blocs.index.version') }} {{ $gameVersion }}, {{ $total }} {{ __('blocs.index.blocs') }}.</p>

{{-- Filtered on the server rather than by hiding tiles in JavaScript. The site is read on
     a phone mid-game, and shipping 254 tiles to hide 220 of them makes a player pay for the
     whole catalogue's bandwidth to look at one category. --}}
<form method="get" class="bloc-filters">
  <label for="categorie">{{ __('blocs.index.categorie') }}</label>
  <select name="categorie" id="categorie">
    <option value="">{{ __('blocs.index.toutes') }}</option>
    @foreach($allCategories as $key)
      <option value="{{ $key }}" @selected($chosen === $key)>{{ __('blocs.categorie.'.$key) }}</option>
    @endforeach
  </select>

  <label for="planete">{{ __('blocs.index.planete') }}</label>
  <select name="planete" id="planete">
    <option value="">{{ __('blocs.index.partout') }}</option>
    <option value="serpulo" @selected($planet === 'serpulo')>{{ __('blocs.planete.serpulo') }}</option>
    <option value="erekir" @selected($planet === 'erekir')>{{ __('blocs.planete.erekir') }}</option>
  </select>

  <button class="primary" type="submit">{{ __('blocs.index.filtrer') }}</button>
</form>

@if($categories === [])
  <div class="card"><p class="empty">{{ __('blocs.index.vide') }}</p></div>
@endif

@foreach($categories as $category => $blocks)
  <h2 class="bloc-cat">{{ __('blocs.categorie.'.$category) }} &middot;
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
