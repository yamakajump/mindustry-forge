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

{{-- Un nom, ou une adresse. Le champ ne demandait qu'un identifiant : dix caracteres lus
     dans la liste juste en dessous, retenus, recopies, deux fois. C'etait demander au
     lecteur le travail de la machine, et la liste prouvait que le site savait deja de
     quelles schematiques il parlait. La valeur reste ce qui a ete tape, pas le slug
     trouve, sinon corriger sa recherche demande de la retaper entiere. --}}
<form method="get" class="card cmp-choix">
  <div class="row" style="margin:0">
    <label class="lead" for="a">{{ __('schema.comparer.gauche') }}</label>
    <input id="a" name="a" value="{{ $asked['a'] }}" maxlength="120" spellcheck="false"
           placeholder="{{ __('schema.comparer.identifiant') }}">
    <label class="lead" for="b">{{ __('schema.comparer.droite') }}</label>
    <input id="b" name="b" value="{{ $asked['b'] }}" maxlength="120" spellcheck="false"
           placeholder="{{ __('schema.comparer.identifiant') }}">
    <button class="primary" type="submit">{{ __('schema.comparer.comparer') }}</button>
  </div>
  <p class="hint-line">{{ __('schema.comparer.aide') }}</p>

  {{-- Ce qu'un nom a trouve. Repondre a une recherche par un formulaire vide se lit comme
       « cette schematique n'existe pas », alors que ce qui s'est passe est qu'on ne l'a
       jamais cherchee. --}}
  @foreach(['a' => $asked['a'], 'b' => $asked['b']] as $side => $term)
    @if($matches[$side] !== null)
      <div class="cmp-trouve">
        <h3>{{ __('schema.comparer.trouvees') }} &mdash;
          {{ $side === 'a' ? __('schema.comparer.gauche') : __('schema.comparer.droite') }}</h3>
        @if($matches[$side]->isEmpty())
          <p class="empty">{{ __('schema.comparer.rien-trouve') }}</p>
        @else
          <ul class="cmp-liste">
            @foreach($matches[$side] as $one)
              <li>
                <a href="?a={{ $side === 'a' ? $one->slug : ($left?->slug ?? $asked['a']) }}&b={{ $side === 'b' ? $one->slug : ($right?->slug ?? $asked['b']) }}">{{ $one->displayName() }}</a>
                {{-- Huit resultats appelles « Silicon » sont huit lignes identiques : ce
                     qui les distingue est leur taille et leur auteur, et sans ca le
                     choix se fait au hasard. --}}
                {{-- La taille seulement quand elle est connue : une schematique de zero
                     bloc n'existe pas, et l'ecrire serait affirmer a la place de se taire
                     sur une ligne que l'analyse n'a pas encore reprise. --}}
                <span class="cmp-de">@if($one->blocks > 0){{ $one->blocks }}
                  {{ __('schema.comparer.blocs') }}, @endif
                  {{ __('schema.comparer.par') }} {{ $one->credit() }}</span>
              </li>
            @endforeach
          </ul>
        @endif
      </div>
    @endif
  @endforeach
</form>

@php
  // Ne pas proposer huit schematiques au hasard sous huit resultats de recherche. Qui a
  // tape un nom a deja choisi ce qu'il cherche ; la liste generique n'est alors qu'une
  // deuxieme liste a lire. Elle reste quand la recherche n'a rien rendu, parce que la
  // page a encore quelque chose d'utile a offrir.
  $trouve = collect($matches)->filter()->contains(fn ($found) => $found->isNotEmpty());
@endphp

{{-- Deux questions distinctes, et les melanger a casse la page une fois : la liste
     generique depend de la recherche, la comparaison ne depend que d'avoir les deux
     schematiques. Une seule condition pour les deux envoyait le @else afficher une
     comparaison dont les deux cotes etaient nuls. --}}
@if(! $comparison)
@if(! $trouve)
  {{-- Arriver par le menu sans rien choisi est le cas courant, et une page vide serait une
       impasse. Huit recentes plutot que le catalogue entier : quinze mille options dans
       une liste deroulante ne sont pas un choix, ce sont des kilometres. --}}
  <div class="card">
    <h2>{{ __('schema.comparer.a-choisir') }}</h2>
    @if($recent->isEmpty())
      <p class="empty">{{ __('schema.comparer.rien-a-comparer') }}</p>
    @else
      {{-- Sa propre classe et pas celle du wiki des blocs : deux pages qui partagent une
           forme ne partagent pas un selecteur, sinon un reglage fait pour l'une deplace
           l'autre sans que personne le voie. --}}
      {{-- Chaque ligne remplit un cote au lieu de quitter la page. Elle menait a `/s/`,
           donc cliquer une proposition dans le selecteur emmenait ailleurs et il fallait
           revenir avec l'identifiant en tete. --}}
      <ul class="cmp-liste">
        @foreach($recent as $one)
          <li>
            <a href="/s/{{ $one->slug }}">{{ $one->displayName() }}</a>
            <span class="cmp-de">
              <a href="?a={{ $one->slug }}&b={{ $right?->slug ?? $asked['b'] }}">{{ __('schema.comparer.mettre-a-gauche') }}</a>
              &middot;
              <a href="?a={{ $left?->slug ?? $asked['a'] }}&b={{ $one->slug }}">{{ __('schema.comparer.mettre-a-droite') }}</a>
            </span>
          </li>
        @endforeach
      </ul>
    @endif
  </div>
@endif
@else
  <div class="cmp-tetes">
    <div class="card">
      <h2>{{ __('schema.comparer.gauche') }}</h2>
      <p class="cmp-nom"><a href="/s/{{ $left->slug }}">{{ $left->displayName() }}</a></p>
      <p class="meta">{{ $left->credit() }}</p>
    </div>
    <div class="card">
      <h2>{{ __('schema.comparer.droite') }}</h2>
      <p class="cmp-nom"><a href="/s/{{ $right->slug }}">{{ $right->displayName() }}</a></p>
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
          <span class="cmp-val">{{ $left->displayName() }}</span>
          <span class="cmp-val">{{ $right->displayName() }}</span>
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
          <span>{{ $row['left'] ? $left->name : $right->displayName() }}
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
          <span class="cmp-val">{{ $left->displayName() }}</span>
          <span class="cmp-val">{{ $right->displayName() }}</span>
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
          <span class="cmp-val">{{ $left->displayName() }}</span>
          <span class="cmp-val">{{ $right->displayName() }}</span>
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
        <span>{{ $left->displayName() }}</span>
        <span>{{ $stops['left'] ?? __('schema.comparer.rien-ne-bloque') }}</span>
      </div>
      <div class="line">
        <span>{{ $right->displayName() }}</span>
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
