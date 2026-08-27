@extends('layout')
@section('title', __('schema.comparer.titre').' - Mindustry Forge')

@push('head')
<link rel="stylesheet" href="/forge/comparer.css">
@endpush

@php
  use App\Models\SchematicItem;
  use App\Support\Figure;
  $number = fn ($value) => Figure::short((float) $value);
  $sign = fn ($value) => $value > 0 ? '+' : ($value < 0 ? '-' : '');
@endphp

@section('body')
<h1 class="title">{{ __('schema.comparer.titre') }}</h1>
<p class="sub">{{ __('schema.comparer.sous-titre') }}</p>

<form method="get" class="card cmp-choix">
  <div class="row" style="margin:0">
    <label class="lead" for="a">{{ __('schema.comparer.gauche') }}</label>
    <input id="a" name="a" value="{{ $left?->slug }}" maxlength="16" spellcheck="false"
           placeholder="{{ __('schema.comparer.identifiant') }}">
    <label class="lead" for="b">{{ __('schema.comparer.droite') }}</label>
    <input id="b" name="b" value="{{ $right?->slug }}" maxlength="16" spellcheck="false"
           placeholder="{{ __('schema.comparer.identifiant') }}">
    <button class="primary" type="submit">{{ __('schema.comparer.comparer') }}</button>
  </div>
  <p class="hint-line">{{ __('schema.comparer.aide') }}</p>
</form>

@if(! $comparison)
  {{-- Arriver par le menu sans rien choisi est le cas courant, et une page vide serait une
       impasse. Douze recentes plutot que le catalogue entier : quinze mille options dans
       une liste deroulante ne sont pas un choix, ce sont des kilometres. --}}
  <div class="card">
    <h2>{{ __('schema.comparer.a-choisir') }}</h2>
    @if($recent->isEmpty())
      <p class="empty">{{ __('schema.comparer.rien-a-comparer') }}</p>
    @else
      <ul class="bloc-links">
        @foreach($recent as $one)
          <li><a href="/s/{{ $one->slug }}">{{ $one->name }}</a>
            <span class="cmp-de">{{ $one->slug }}</span></li>
        @endforeach
      </ul>
    @endif
  </div>
@else
  <div class="cmp-tetes">
    <div class="card">
      <h2>{{ __('schema.comparer.gauche') }}</h2>
      <p class="cmp-nom"><a href="/s/{{ $left->slug }}">{{ $left->name }}</a></p>
      <p class="meta">{{ $left->credit() }}</p>
    </div>
    <div class="card">
      <h2>{{ __('schema.comparer.droite') }}</h2>
      <p class="cmp-nom"><a href="/s/{{ $right->slug }}">{{ $right->name }}</a></p>
      <p class="meta">{{ $right->credit() }}</p>
    </div>
  </div>

  {{-- L'origine des chiffres avant les chiffres. Un plafond et une mesure ne se comparent
       pas, et la majorite du catalogue importe cette nuit sera au plafond faute de
       marquage : le taire reviendrait a presenter une estimation comme une mesure, ce qui
       est la seule chose que ce site vend. --}}
  @if($comparison->mixedKinds())
    <div class="card notice">
      <p>{{ __('schema.comparer.kinds-melanges') }}</p>
    </div>
  @elseif($comparison->anyCeiling())
    <div class="card notice">
      <p>{{ __('schema.comparer.plafond') }}</p>
    </div>
  @endif

  @if(! $comparison->comparable())
    {{-- Deux schematiques qui ne font pas la meme chose n'ont pas de vainqueur. Classer
         quarante graphite/min contre vingt-cinq silicium/min reviendrait a decreter qu'un
         graphite vaut un silicium, ce qui est faux et serait invisible. --}}
    <div class="card notice">
      <p>{{ __('schema.comparer.rien-en-commun') }}</p>
    </div>
  @endif

  @php($shared = $comparison->shared())
  @if($shared !== [])
    <div class="card">
      <h2>{{ __('schema.comparer.ce-quelles-font') }}</h2>
        <div class="line cmp-ligne cmp-entete">
          <span></span>
          <span class="cmp-val">{{ $left->name }}</span>
          <span class="cmp-val">{{ $right->name }}</span>
          <span class="cmp-ecart">{{ __('schema.comparer.ecart') }}</span>
        </div>

      @foreach($shared as $row)
        <div class="line cmp-ligne">
          <span>{{ $row['item'] === SchematicItem::POWER
            ? __('schema.comparer.energie') : $row['item'] }}</span>
          <span class="cmp-val">{{ $number($row['left']->rate) }}</span>
          <span class="cmp-val">{{ $number($row['right']->rate) }}</span>
          @if($row['comparable'])
            <span class="cmp-ecart {{ $row['gap'] > 0 ? 'good' : ($row['gap'] < 0 ? 'bad' : '') }}">
              {{ $sign($row['gap']) }}{{ $number(abs($row['gap'])) }}
            </span>
          @else
            <span class="cmp-ecart cmp-de">{{ __('schema.comparer.non-soustrait') }}</span>
          @endif
        </div>
      @endforeach
      <p class="hint-line">{{ __('schema.comparer.ecart-lecture') }}</p>
    </div>
  @endif

  @php($seul = array_values(array_filter($comparison->outputs(),
    fn ($row) => $row['left'] === null || $row['right'] === null)))
  @if($seul !== [])
    <div class="card">
      <h2>{{ __('schema.comparer.lune-pas-lautre') }}</h2>
      @foreach($seul as $row)
        <div class="line">
          <span>{{ $row['item'] === SchematicItem::POWER
            ? __('schema.comparer.energie') : $row['item'] }}</span>
          <span>{{ $row['left'] ? $left->name : $right->name }}
            &middot; {{ $number($row['left']?->rate ?? $row['right']->rate) }}</span>
        </div>
      @endforeach
    </div>
  @endif

  {{-- La place, l'emprise et le courant : les seuls axes ou moins vaut mieux sans qu'aucune
       ponderation soit necessaire. C'est pour ca qu'ils sont dits en ecart et pas en deux
       colonnes que le lecteur soustrait de tete. --}}
  @php($sizes = $comparison->sizes())
  @if($sizes !== [])
    <div class="card">
      <h2>{{ __('schema.comparer.la-place') }}</h2>
        <div class="line cmp-ligne cmp-entete">
          <span></span>
          <span class="cmp-val">{{ $left->name }}</span>
          <span class="cmp-val">{{ $right->name }}</span>
          <span class="cmp-ecart">{{ __('schema.comparer.ecart') }}</span>
        </div>

      @foreach($sizes as $row)
        <div class="line cmp-ligne">
          <span>{{ __($row['key']) }}</span>
          <span class="cmp-val">{{ $number($row['left']) }}</span>
          <span class="cmp-val">{{ $number($row['right']) }}</span>
          <span class="cmp-ecart {{ $row['gap'] < 0 ? 'good' : ($row['gap'] > 0 ? 'bad' : '') }}">
            {{ $sign($row['gap']) }}{{ $number(abs($row['gap'])) }}
          </span>
        </div>
      @endforeach
    </div>
  @endif

  @if($comparison->hasCost())
    <div class="card">
      <h2>{{ __('schema.comparer.le-cout') }}</h2>
        <div class="line cmp-ligne cmp-entete">
          <span></span>
          <span class="cmp-val">{{ $left->name }}</span>
          <span class="cmp-val">{{ $right->name }}</span>
          <span class="cmp-ecart">{{ __('schema.comparer.ecart') }}</span>
        </div>

      @foreach($comparison->cost() as $row)
        <div class="line cmp-ligne">
          <span>{{ $row['item'] }}</span>
          <span class="cmp-val">{{ $number($row['left']) }}</span>
          <span class="cmp-val">{{ $number($row['right']) }}</span>
          <span class="cmp-ecart {{ $row['gap'] < 0 ? 'good' : ($row['gap'] > 0 ? 'bad' : '') }}">
            {{ $sign($row['gap']) }}{{ $number(abs($row['gap'])) }}
          </span>
        </div>
      @endforeach
    </div>
  @endif

  @php($stops = $comparison->bottlenecks())
  @if($stops['left'] || $stops['right'])
    <div class="card">
      <h2>{{ __('schema.comparer.ce-qui-bloque') }}</h2>
      <div class="line">
        <span>{{ $left->name }}</span>
        <span>{{ $stops['left'] ?? __('schema.comparer.rien-ne-bloque') }}</span>
      </div>
      <div class="line">
        <span>{{ $right->name }}</span>
        <span>{{ $stops['right'] ?? __('schema.comparer.rien-ne-bloque') }}</span>
      </div>
    </div>
  @endif

  {{-- Et pas de verdict. Une schematique qui produit plus et coute trois fois plus cher
       n'est pas meilleure, c'est un autre marche, et le lecteur est le seul a savoir lequel
       il veut. Le site enonce chaque ecart et s'arrete la. --}}
  <p class="hint-line">{{ __('schema.comparer.pas-de-verdict') }}</p>
@endif
@endsection
