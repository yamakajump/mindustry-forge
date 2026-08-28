{{-- One block's page: what feeds it, what it feeds, and which public schematics on this
     site actually use it. Route GET /blocs/{name}, fed by BlockController::show.

     Scope: block, sources, destinations, schematics, schematicCount, ores, gameVersion. --}}
@extends('layout')
@section('title', $block->title().' - Mindustry Forge')

{{-- The block's own thumbnail, rather than the site's generic one. Two hundred and fifty
     four pages unfurled into the same picture, so every block link looked like every other
     one. --}}
@section('og-type', 'article')
@section('og-title', $block->title())
@section('og-description', $block->title().' : '.__('blocs.page.cout').', '.__('blocs.page.recette').', '.__('blocs.page.energie').'. Mindustry '.$gameVersion)
@section('og-alt', $block->title())
@section('og-image', url("/blocs/{$block->name}/carte.jpg"))

@push('head')
<link rel="stylesheet" href="/forge/blocs.css">
@endpush

@php
  use App\Services\BlockCatalogue;
  use App\Support\Figure;
  $number = fn ($value) => Figure::short((float) $value);
@endphp

@section('body')
<p class="sub bloc-retour"><a href="/blocs">{{ __('blocs.page.retour') }}</a></p>

<div class="bloc-head">
  {{-- `t=64` here and not 32: the sprite of a two-tile block is 64 pixels in the game, so
       at 96 on screen the 64 source carries detail the 32 one does not. On the index
       thumbnails, shown at 48, 32 is enough and weighs half as much. --}}
  <img class="icone bloc-portrait" src="/icone/bloc/{{ $block->name }}.png?t=64"
       width="96" height="96" decoding="async" alt="">
  <div>
    <h1>{{ $block->title() }}</h1>
    <p class="bloc-id">{{ $block->name }}</p>
    <p class="chips">
      <span class="chip">{{ __(BlockCatalogue::categoryKey($block->category())) }}</span>
      <span class="chip">{{ __(BlockCatalogue::planetKey($block->planet())) }}</span>
      <span class="chip">{{ $block->kind() }}</span>
    </p>
  </div>
</div>

{{-- A sandbox or campaign block gets a page, with its condition said out loud. A player who
     saw one somewhere and came looking for why it is missing from their build menu deserves
     an answer, and the answer is "yes, and only there". --}}
@if($block->isConditional())
  <div class="card notice">
    <p>{{ __('blocs.page.conditionnel') }} <code>{{ $block->visibility() }}</code></p>
  </div>
@endif

<div class="bloc-cols">
  <div>
    <div class="card bloc-facts">
      <h2>{{ __('blocs.page.fiche') }}</h2>

      <div class="line"><span>{{ __('blocs.page.taille') }}</span>
        <span>{{ $block->size() }} &times; {{ $block->size() }}</span></div>

      @if($block->health())
        <div class="line"><span>{{ __('blocs.page.resistance') }}</span>
          <span>{{ $number($block->health()) }} {{ __('blocs.unite.points') }}</span></div>
      @endif

      @if($block->buildSeconds())
        <div class="line"><span>{{ __('blocs.page.construction') }}</span>
          <span>{{ $number($block->buildSeconds()) }} {{ __('blocs.unite.secondes') }}</span></div>
      @endif

      @if($block->itemCapacity())
        <div class="line"><span>{{ __('blocs.page.capacite') }}</span>
          <span>{{ $block->itemCapacity() }}</span></div>
      @endif

      @if($block->liquidCapacity())
        <div class="line"><span>{{ __('blocs.page.capacite-liquide') }}</span>
          <span>{{ $block->liquidCapacity() }}</span></div>
      @endif

      @if($block->itemsPerSecond())
        <div class="line"><span>{{ __('blocs.page.debit-transport') }}</span>
          <span>{{ $number($block->itemsPerSecond()) }}{{ __('blocs.unite.par-seconde') }}</span></div>
      @endif

      @if($block->rangeInTiles())
        <div class="line"><span>{{ __('blocs.page.portee') }}</span>
          <span>{{ $number($block->rangeInTiles()) }} {{ __('blocs.unite.cases') }}</span></div>
      @endif

      @if($block->laserRange())
        <div class="line"><span>{{ __('blocs.page.portee') }}</span>
          <span>{{ $number($block->laserRange()) }} {{ __('blocs.unite.cases') }}</span></div>
      @endif

      @if($block->maxNodes())
        <div class="line"><span>{{ __('blocs.page.liens') }}</span>
          <span>{{ $block->maxNodes() }}</span></div>
      @endif

      @if($block->drillTier())
        <div class="line"><span>{{ __('blocs.page.durete-max') }}</span>
          <span>{{ $block->drillTier() }}</span></div>
      @endif

      @if($block->liquidBoost())
        <div class="line"><span>{{ __('blocs.page.boost-liquide') }}</span>
          <span>&times;{{ $number($block->liquidBoost()) }}</span></div>
      @endif
    </div>

    {{-- What a drill can pull up, ore by ore, and never one figure for all of them. The
         hardness term is the difference between six hundred ticks and twelve hundred and
         fifty, so a single number would be right for sand and wrong for everything else.
         Still not a throughput: how many tiles of ore lie under it is a property of where
         it was placed, which is the analysis's answer and not this page's. --}}
    @if($ores !== [])
      <div class="card bloc-facts">
        <h2>{{ __('blocs.page.forage') }}</h2>
        @foreach($ores as $ore => $seconds)
          <div class="line">
            <span>@include('blocks.partials.thing', ['thing' => $ore])</span>
            <span>{{ $number($seconds) }} {{ __('blocs.unite.secondes') }}</span>
          </div>
        @endforeach
        <p class="hint-line">{{ __('blocs.page.forage-note') }}</p>
      </div>
    @endif

    @if($block->cost() !== [])
      <div class="card bloc-facts">
        <h2>{{ __('blocs.page.cout') }}</h2>
        {{-- In the game's order, not by quantity. A player compares this list against the
             panel in front of them in game, and sorting it any other way would make the two
             disagree with nothing to say so. --}}
        @foreach(BlockCatalogue::inGameOrder($block->cost()) as $item => $amount)
          <div class="line">
            <span>@include('blocks.partials.thing', ['thing' => $item])</span>
            <span>{{ $number($amount) }}</span>
          </div>
        @endforeach
      </div>
    @endif
  </div>

  <div>
    @if($block->isCrafter())
      <div class="card">
        <h2>{{ __('blocs.page.recette') }}</h2>

        @if($block->inputs() !== [] || $block->inputLiquids() !== [])
          <p class="bloc-flow">
            <span class="bloc-of">{{ __('blocs.page.entree') }}</span>
            @foreach($block->inputs() as $item => $amount)
              @include('blocks.partials.thing', [
                'thing' => $item, 'label' => $number($amount).' '.$item])
            @endforeach
            @foreach($block->inputLiquids() as $liquid => $rate)
              @include('blocks.partials.thing', [
                'thing' => $liquid,
                'label' => $number($rate).__('blocs.unite.par-seconde').' '.$liquid])
            @endforeach
          </p>
        @endif

        <p class="bloc-flow">
          <span class="bloc-of">{{ __('blocs.page.sortie') }}</span>
          @foreach($block->outputs() as $item => $amount)
            @include('blocks.partials.thing', [
              'thing' => $item, 'label' => $number($amount).' '.$item])
          @endforeach
          @foreach($block->outputLiquids() as $liquid => $rate)
            @include('blocks.partials.thing', [
              'thing' => $liquid,
              'label' => $number($rate).__('blocs.unite.par-seconde').' '.$liquid])
          @endforeach
        </p>

        @if($block->craftSeconds())
          <p class="hint-line">{{ __('blocs.page.duree') }}
            {{ $number($block->craftSeconds()) }} {{ __('blocs.unite.secondes') }}</p>
        @endif

        {{-- "At best", and never the bare figure.

             This is a nominal ceiling: what the block would do fed perfectly, alone, with
             nothing in its way. Everything else this site prints comes out of the solver,
             feed and boost included, and is almost always lower. Letting the two look alike
             would be presenting an estimate as a measurement, which is exactly the fault
             repaired on the net-power ranking on 27/08. --}}
        @if($block->outputAtBest() !== [] || $block->outputLiquidAtBest() !== [])
          @foreach($block->outputAtBest() as $item => $rate)
            <div class="line">
              <span>@include('blocks.partials.thing', ['thing' => $item])</span>
              <span class="good">{{ __('blocs.page.au-mieux') }}
                {{ $number($rate) }}{{ __('blocs.unite.par-seconde') }}</span>
            </div>
          @endforeach
          @foreach($block->outputLiquidAtBest() as $liquid => $rate)
            <div class="line">
              <span>@include('blocks.partials.thing', ['thing' => $liquid])</span>
              <span class="good">{{ __('blocs.page.au-mieux') }}
                {{ $number($rate) }}{{ __('blocs.unite.par-seconde') }}</span>
            </div>
          @endforeach
          <p class="hint-line">{{ __('blocs.page.plafond') }}</p>
        @endif
      </div>
    @endif

    @if($block->powerIn() || $block->powerOut())
      <div class="card bloc-facts">
        <h2>{{ __('blocs.page.energie') }}</h2>
        @if($block->powerOut())
          <div class="line"><span>{{ __('blocs.page.energie-produite') }}</span>
            <span class="good">{{ $number($block->powerOut()) }}
              {{ __('blocs.unite.energie-seconde') }}</span></div>
        @endif
        @if($block->powerIn())
          <div class="line"><span>{{ __('blocs.page.energie-consommee') }}</span>
            <span class="warn">{{ $number($block->powerIn()) }}
              {{ __('blocs.unite.energie-seconde') }}</span></div>
        @endif
      </div>
    @endif

    @if($block->ammo() !== [] || $block->drinks() !== [])
      <div class="card">
        @if($block->ammo() !== [])
          <h2>{{ __('blocs.page.munitions') }}</h2>
          <p class="chips">
            @foreach($block->ammo() as $item)
              <span class="chip">@include('blocks.partials.thing', ['thing' => $item])</span>
            @endforeach
          </p>
        @endif
        @if($block->drinks() !== [])
          <h2>{{ __('blocs.page.liquides-acceptes') }}</h2>
          <p class="chips">
            @foreach($block->drinks() as $liquid)
              <span class="chip">{{ $liquid }}</span>
            @endforeach
          </p>
        @endif
      </div>
    @endif
  </div>
</div>

{{-- The two directions, which are what separates a wiki page from a stat sheet: where what
     it eats comes from, and what what it makes is good for. --}}
<div class="bloc-cols">
  @if($sources !== [])
    <div class="card">
      <h2>{{ __('blocs.page.alimente-par') }}</h2>
      <ul class="bloc-links">
        @foreach($sources as $thing => $where)
          <li>
            @include('blocks.partials.thing', ['thing' => $thing])
            {{-- Both, when both exist. Sand is made in a pulveriser *and* picked up off the
                 ground, and the ground is what nine players out of ten do: showing only one
                 because the other is filled in would hide the common answer behind the rare
                 one. --}}
            @if($where['made'] !== [])
              <span class="bloc-of">{{ __('blocs.page.se-fabrique-dans') }}</span>
              @include('blocks.partials.links', ['blocks' => $where['made']])
            @endif
            @if($where['mined'] !== [])
              <span class="bloc-of">{{ __('blocs.page.se-mine-sur') }}</span>
              @include('blocks.partials.links', ['blocks' => $where['mined']])
            @endif
            @if($where['made'] === [] && $where['mined'] === [])
              <span class="bloc-of">{{ __('blocs.page.sans-source') }}</span>
            @endif
          </li>
        @endforeach
      </ul>
    </div>
  @endif

  @if($destinations !== [])
    <div class="card">
      <h2>{{ __('blocs.page.alimente') }}</h2>
      <ul class="bloc-links">
        @foreach($destinations as $thing => $takers)
          <li>
            @include('blocks.partials.thing', ['thing' => $thing])
            @if($takers !== [])
              @include('blocks.partials.links', ['blocks' => $takers])
            @else
              <span class="bloc-of">{{ __('blocs.page.sans-debouche') }}</span>
            @endif
          </li>
        @endforeach
      </ul>
    </div>
  @endif
</div>

{{-- The question no other Mindustry site can answer, because none of them ever reads the
     schematics it hosts. Empty until the ingestion pass has run, and wired up now so that
     the page fills itself in on the day it does. --}}
<div class="card">
  <h2>{{ __('blocs.page.schematiques') }}</h2>
  @if($schematics->isEmpty())
    <p class="empty">{{ __('blocs.page.aucune-schematique') }}</p>
  @else
    <p class="hint-line">{{ $schematicCount }} {{ __('blocs.page.schematiques-compte') }}</p>
    <div class="grid">
      @foreach($schematics as $schematic)
        <article class="tile">
          <a href="/s/{{ $schematic->slug }}">
            <h3>{{ $schematic->displayName() }}</h3>
          </a>
          <p class="meta">
            {{ $schematic->held }} {{ __('blocs.page.exemplaires') }}
            &middot; {{ $schematic->blocks }} blocs &middot; {{ $schematic->credit() }}
          </p>
        </article>
      @endforeach
    </div>
  @endif
</div>
@endsection
