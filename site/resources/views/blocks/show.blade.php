@extends('layout')
@section('title', $block->title().' - Mindustry Forge')

@push('head')
<link rel="stylesheet" href="/forge/blocs.css">
<meta name="description" content="{{ $block->title() }} : {{ __('blocs.page.cout') }},
  {{ __('blocs.page.recette') }}, {{ __('blocs.page.energie') }}. Mindustry {{ $gameVersion }}.">
@endpush

@php
  use App\Services\BlockCatalogue;
  use App\Support\Figure;
  $number = fn ($value) => Figure::short((float) $value);
@endphp

@section('body')
<p class="sub"><a href="/blocs">{{ __('blocs.page.retour') }}</a></p>

<div class="bloc-head">
  @php($sprite = \App\Services\Sprites::block($block->name, 96))
  @if($sprite)
    <span class="sprite" style="{{ $sprite }}" aria-hidden="true"></span>
  @endif
  <div>
    <h1>{{ $block->title() }}</h1>
    <p class="bloc-id">{{ $block->name }}</p>
    <p class="chips">
      <span class="chip">{{ __('blocs.categorie.'.$block->category()) }}</span>
      <span class="chip">{{ $block->planet()
        ? __('blocs.planete.'.$block->planet())
        : __('blocs.planete.les_deux') }}</span>
      <span class="chip">{{ $block->kind() }}</span>
    </p>
  </div>
</div>

{{-- Un bloc de bac a sable ou de campagne a une page, avec sa condition dite a voix haute :
     un joueur qui l'a vu quelque part et vient chercher pourquoi il ne le trouve pas en
     partie merite une reponse, et la reponse est « oui, et seulement la ». --}}
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
        <div class="line"><span>{{ __('blocs.page.capacite_liquide') }}</span>
          <span>{{ $block->liquidCapacity() }}</span></div>
      @endif

      @if($block->itemsPerSecond())
        <div class="line"><span>{{ __('blocs.page.debit_transport') }}</span>
          <span>{{ $number($block->itemsPerSecond()) }}{{ __('blocs.unite.par_seconde') }}</span></div>
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

      {{-- Les faits d'une foreuse, et pas un debit invente. Ce qu'elle sort depend du
           nombre de cases de minerai sous elle, de la durete du minerai et de l'eau qu'on
           lui donne : c'est le solveur qui le calcule, et l'analyse qui le rapporte. --}}
      @if($block->drillSeconds())
        <div class="line"><span>{{ __('blocs.page.temps_forage') }}</span>
          <span>{{ $number($block->drillSeconds()) }} {{ __('blocs.unite.secondes') }}</span></div>
      @endif

      @if($block->drillTier())
        <div class="line"><span>{{ __('blocs.page.durete_max') }}</span>
          <span>{{ $block->drillTier() }}</span></div>
      @endif

      @if($block->liquidBoost())
        <div class="line"><span>{{ __('blocs.page.boost_liquide') }}</span>
          <span>&times;{{ $number($block->liquidBoost()) }}</span></div>
      @endif
    </div>

    @if($block->cost() !== [])
      <div class="card bloc-facts">
        <h2>{{ __('blocs.page.cout') }}</h2>
        {{-- Dans l'ordre du jeu, pas par quantite : un joueur compare cette liste au
             panneau qu'il a sous les yeux en partie, et trier autrement ferait diverger
             les deux sans que rien ne le signale. --}}
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
                'label' => $number($rate).__('blocs.unite.par_seconde').' '.$liquid])
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
              'label' => $number($rate).__('blocs.unite.par_seconde').' '.$liquid])
          @endforeach
        </p>

        @if($block->craftSeconds())
          <p class="hint-line">{{ __('blocs.page.duree') }}
            {{ $number($block->craftSeconds()) }} {{ __('blocs.unite.secondes') }}</p>
        @endif

        {{-- « au mieux », et jamais le chiffre nu.

             C'est un plafond nominal : ce que le bloc ferait alimente a fond, seul, sans
             goulot. Le reste du site affiche des chiffres qui sortent du solveur,
             alimentation et boost compris, et qui sont presque toujours plus bas. Laisser
             les deux se ressembler reviendrait a presenter une estimation comme une
             mesure, ce qui est exactement le probleme repare sur le classement par
             energie nette le 27/08. --}}
        @if($block->outputAtBest() !== [] || $block->outputLiquidAtBest() !== [])
          @foreach($block->outputAtBest() as $item => $rate)
            <div class="line">
              <span>@include('blocks.partials.thing', ['thing' => $item])</span>
              <span class="good">{{ __('blocs.page.au_mieux') }}
                {{ $number($rate) }}{{ __('blocs.unite.par_seconde') }}</span>
            </div>
          @endforeach
          @foreach($block->outputLiquidAtBest() as $liquid => $rate)
            <div class="line">
              <span>@include('blocks.partials.thing', ['thing' => $liquid])</span>
              <span class="good">{{ __('blocs.page.au_mieux') }}
                {{ $number($rate) }}{{ __('blocs.unite.par_seconde') }}</span>
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
          <div class="line"><span>{{ __('blocs.page.energie_produite') }}</span>
            <span class="good">{{ $number($block->powerOut()) }}
              {{ __('blocs.unite.energie_seconde') }}</span></div>
        @endif
        @if($block->powerIn())
          <div class="line"><span>{{ __('blocs.page.energie_consommee') }}</span>
            <span class="warn">{{ $number($block->powerIn()) }}
              {{ __('blocs.unite.energie_seconde') }}</span></div>
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
          <h2>{{ __('blocs.page.liquides_acceptes') }}</h2>
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

{{-- Les deux directions, qui sont ce qui separe une page de wiki d'une fiche de stats :
     d'ou vient ce qu'il mange, et a quoi sert ce qu'il sort. --}}
<div class="bloc-cols">
  @if($sources !== [])
    <div class="card">
      <h2>{{ __('blocs.page.alimente_par') }}</h2>
      <ul class="bloc-links">
        @foreach($sources as $thing => $where)
          <li>
            @include('blocks.partials.thing', ['thing' => $thing])
            {{-- Les deux, quand les deux existent. Le sable se fabrique au pulverisateur
                 *et* se ramasse au sol, et c'est le sol que fait un joueur sur neuf fois
                 sur dix : n'en montrer qu'un parce que l'autre est renseigne cacherait la
                 reponse courante derriere la reponse rare. --}}
            @if($where['made'] !== [])
              <span class="bloc-of">{{ __('blocs.page.se_fabrique_dans') }}</span>
              @include('blocks.partials.links', ['blocks' => $where['made']])
            @endif
            @if($where['mined'] !== [])
              <span class="bloc-of">{{ __('blocs.page.se_mine_sur') }}</span>
              @include('blocks.partials.links', ['blocks' => $where['mined']])
            @endif
            @if($where['made'] === [] && $where['mined'] === [])
              <span class="bloc-of">{{ __('blocs.page.sans_source') }}</span>
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
              <span class="bloc-of">{{ __('blocs.page.sans_debouche') }}</span>
            @endif
          </li>
        @endforeach
      </ul>
    </div>
  @endif
</div>

{{-- La question qu'aucun autre site Mindustry ne sait traiter, parce qu'aucun ne lit les
     schematiques qu'il heberge. Vide tant que le collecteur n'a pas tourne, et branchee
     des maintenant pour que la page se remplisse toute seule ce jour-la. --}}
<div class="card">
  <h2>{{ __('blocs.page.schematiques') }}</h2>
  @if($schematics->isEmpty())
    <p class="empty">{{ __('blocs.page.aucune_schematique') }}</p>
  @else
    <p class="hint-line">{{ $schematicCount }} {{ __('blocs.page.schematiques_compte') }}</p>
    <div class="grid">
      @foreach($schematics as $schematic)
        <article class="tile">
          <a href="/s/{{ $schematic->slug }}">
            <h3>{{ $schematic->name }}</h3>
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
