{{-- Two schematics side by side. Route GET /comparer, fed by CompareController::index.
     Both slots come from query parameters, so the page renders with neither, one, or both
     filled in.

     Scope: left, right, asked, comparison, matches, recent. --}}
@extends('layout')
@section('title', __('schema.comparer.titre').' - Mindustry Forge')

@push('head')
<link rel="stylesheet" href="/forge/comparer.css">
<script src="/forge/comparer.js" type="module" defer></script>
@endpush

@php
  use App\Models\SchematicItem;
  use App\Support\Figure;
  use App\Support\Thing;

  $number = fn ($value) => Figure::short((float) $value);
  $sign = fn ($value) => $value > 0 ? '+' : ($value < 0 ? '-' : '');

  /* The game's name and its image, not the English identifier. The page was showing
     `blast-compound` to a French-speaking player, under an image it already had the means
     to serve: the catalogue and the block wiki both pull from `/icone/`. */
  $thing = fn ($item) => $item === SchematicItem::POWER
      ? __('schema.comparer.energie') : Thing::name($item);

  /* What a panel needs to draw its plan. The code travels inside the page while it is
     small, as on the catalogue; past that the panel asks for it itself, and only once it
     comes near the screen. A single 512 kB schematic has no business in a page showing ten
     of them. The threshold is the catalogue's, measured at 44 kB for twenty-four tiles on
     the live listing. */
  $porte = 16384;
  $planned = fn ($schematic) => strlen((string) $schematic->code) <= $porte
      ? 'data-code="'.e($schematic->code).'"'
      : 'data-slug="'.e($schematic->slug).'"';
@endphp

@section('body')
<h1 class="title">{{ __('schema.comparer.titre') }}</h1>
<p class="sub">{{ __('schema.comparer.sous-titre') }}</p>

{{-- The two sides, side by side, with their plan drawn as soon as they are filled in.

     It used to be two text fields above a list of names: a page whose entire subject is
     two pictures showed neither, at any point. Corentin's words: "you cannot see the
     schematics, it is not intuitive at all".

     What is left is a GET form, and only one. Picking from the dropdown is a link to that
     same address, so the back button works, a comparison pastes into a Discord thread, and
     the page works entirely without JavaScript: the field and its button do what they have
     always done. The script only adds the results while you type. --}}
<form method="get" class="cmp-arene" id="cmp-arene">
  @foreach(['a' => $left, 'b' => $right] as $side => $chosen)
    @if($side === 'b')
      {{-- Between the two, because between the two is where the gesture happens. A link
           and not a button: it has an address, so the keyboard and the screen reader get
           it for free, and it works without a script. --}}
      <div class="cmp-milieu">
        @if($asked['a'] !== '' || $asked['b'] !== '')
          <a class="cmp-echanger" href="?a={{ $asked['b'] }}&b={{ $asked['a'] }}"
             title="{{ __('schema.comparer.echanger') }}"
             aria-label="{{ __('schema.comparer.echanger') }}">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M4 8h14M15 5l3 3-3 3M20 16H6M9 13l-3 3 3 3"/>
            </svg>
          </a>
        @endif
      </div>
    @endif

    @php
      $other = $side === 'a' ? ($right?->slug ?? $asked['b']) : ($left?->slug ?? $asked['a']);
      $role = $side === 'a' ? __('schema.comparer.gauche') : __('schema.comparer.droite');
    @endphp

    <div class="cmp-cote {{ $chosen ? 'pris' : 'vide' }}" data-cote="{{ $side }}"
         data-autre="{{ $other }}">
      <p class="cmp-role">
        <span class="cmp-pastille {{ $side }}" aria-hidden="true">{{ strtoupper($side) }}</span>
        {{ $role }}
        @if($chosen)
          <a class="cmp-enlever"
             href="?a={{ $side === 'a' ? '' : $other }}&b={{ $side === 'b' ? '' : $other }}">{{
            __('schema.comparer.enlever') }}</a>
        @endif
      </p>

      @if($chosen)
        <div class="cmp-scene" {!! $planned($chosen) !!}>
          <p class="empty">{{ __('schema.comparer.dessin') }}</p>
        </div>
        <p class="cmp-nom"><a href="/s/{{ $chosen->slug }}">{{ $chosen->displayName() }}</a></p>
        {{-- The figure stays outside the translated string: a missing key would render the
             key without substituting, and it is the number that would disappear, not the
             word. --}}
        <p class="meta">{{ __('schema.comparer.par') }} {{ $chosen->credit() }}
          @if($chosen->blocks > 0)
            &middot; {{ $chosen->blocks }} {{ __('schema.comparer.blocs') }}
          @endif
          &middot; {{ $chosen->width }}x{{ $chosen->height }}</p>
        <input type="hidden" name="{{ $side }}" value="{{ $chosen->slug }}">
      @else
        <div class="cmp-scene creuse">
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none"
               stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <circle cx="11" cy="11" r="6"/><path d="M15.5 15.5 20 20"/>
          </svg>
          <p class="empty">{{ __('schema.comparer.vide') }}</p>
        </div>
        <div class="cmp-champ">
          <label class="cmp-cache" for="{{ $side }}">{{ $role }}</label>
          {{-- The value stays what was typed and not the slug that was found: otherwise
               correcting a search would mean typing the whole thing again. --}}
          <input id="{{ $side }}" name="{{ $side }}" value="{{ $asked[$side] }}" maxlength="120"
                 spellcheck="false" autocomplete="off" role="combobox" aria-expanded="false"
                 aria-controls="cmp-liste-{{ $side }}" aria-autocomplete="list"
                 placeholder="{{ __('schema.comparer.cherche') }}">
          <button class="primary" type="submit">{{ __('schema.comparer.comparer') }}</button>
        </div>

        {{-- What a name found, rendered by the server. The script replaces it while you
             type, but without the script this is still the list that answers, and
             answering a search with an empty form reads as "this schematic does not exist"
             when what happened is that nobody ever looked for it. --}}
        <div class="cmp-resultats" id="cmp-liste-{{ $side }}" role="listbox"
             aria-label="{{ __('schema.comparer.trouves') }}">
          @if($matches[$side] !== null)
            @if($matches[$side]->isEmpty())
              <p class="empty cmp-vain">{{ __('schema.comparer.rien-trouve') }}</p>
            @else
              @foreach($matches[$side] as $one)
                <a class="cmp-resultat" role="option" aria-selected="false"
                   href="?a={{ $side === 'a' ? $one->slug : $other }}&b={{ $side === 'b' ? $one->slug : $other }}">
                  <span class="cmp-mini" {!! $planned($one) !!}></span>
                  <span class="cmp-resultat-texte">
                    <span class="cmp-resultat-nom">{{ $one->displayName() }}</span>
                    {{-- The size only when it is known: a zero-block schematic does not
                         exist, and writing one would be asserting instead of staying
                         silent on a row the analysis has not gone over yet. --}}
                    <span class="cmp-resultat-de">@if($one->blocks > 0){{ $one->blocks }}
                      {{ __('schema.comparer.blocs') }} &middot; @endif{{
                      __('schema.comparer.par') }} {{ $one->credit() }}</span>
                  </span>
                </a>
              @endforeach
            @endif
          @endif
        </div>
      @endif
    </div>
  @endforeach
</form>

{{-- Only while a field is left to type into. With both sides filled, the page has no
     search box any more, and a sentence explaining what to type into it floats above a
     comparison with nothing to attach itself to. --}}
@if(! $left || ! $right)
  <p class="hint-line cmp-aide">{{ __('schema.comparer.aide') }}</p>
@endif

@php
  // Do not offer eight random schematics under eight search results. Whoever typed a name
  // has already chosen what they are looking for; the generic list is then only a second
  // list to read. It stays when the search returned nothing, because the page still has
  // something useful to offer.
  $trouve = collect($matches)->filter()->contains(fn ($found) => $found->isNotEmpty());
@endphp

{{-- Two distinct questions, and mixing them broke the page once: the generic list depends
     on the search, the comparison only depends on having both schematics. A single
     condition for both sent the @else off to render a comparison whose two sides were
     null. --}}
@if(! $comparison)
  @if(! $trouve)
    {{-- Arriving from the menu with nothing chosen is the common case, and an empty page
         would be a dead end. Eight recent ones rather than the whole catalogue: fifteen
         thousand options in a dropdown are not a choice, they are miles of scrolling.

         With their plan, and that is the whole change: eight lines of text all called
         "Silicon" are eight identical lines, eight plans never are. --}}
    <h2 class="cmp-titre">{{ __('schema.comparer.a-choisir') }}</h2>
    @if($recent->isEmpty())
      <p class="empty">{{ __('schema.comparer.rien-a-comparer') }}</p>
    @else
      <div class="grid cmp-propositions">
        @foreach($recent as $one)
          <article class="tile">
            {{-- The plan leads to the schematic's page, the two buttons fill a side.
                 The list led to `/s/` and nothing else, so clicking a suggestion in the
                 picker took you somewhere else and you had to come back with the
                 identifier in your head. --}}
            <a href="/s/{{ $one->slug }}" title="{{ __('schema.comparer.ouvrir') }}">
              <span class="noimg" {!! $planned($one) !!}></span>
              <h3>{{ $one->displayName() }}</h3>
            </a>
            <p class="meta">@if($one->blocks > 0){{ $one->blocks }}
              {{ __('schema.comparer.blocs') }} &middot; @endif{{
              __('schema.comparer.par') }} {{ $one->credit() }}</p>
            <p class="cmp-vers">
              <a href="?a={{ $one->slug }}&b={{ $right?->slug ?? $asked['b'] }}"
                 aria-label="{{ $one->displayName() }} {{ __('schema.comparer.mettre-a-gauche') }}">
                <span class="cmp-pastille a" aria-hidden="true">A</span>
                {{ __('schema.comparer.mettre-a-gauche') }}</a>
              <a href="?a={{ $left?->slug ?? $asked['a'] }}&b={{ $one->slug }}"
                 aria-label="{{ $one->displayName() }} {{ __('schema.comparer.mettre-a-droite') }}">
                <span class="cmp-pastille b" aria-hidden="true">B</span>
                {{ __('schema.comparer.mettre-a-droite') }}</a>
            </p>
          </article>
        @endforeach
      </div>
    @endif
  @endif
@else

  {{-- Where the figures come from, before the figures. A cap and a measurement do not
       compare, and most of the catalogue sits at the cap for want of marking: keeping
       quiet about it would amount to presenting an estimate as a measurement, and a
       measurement is the one thing this site sells. --}}
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
    {{-- Two schematics that do not do the same thing have no winner. Ranking forty
         graphite/min against twenty-five silicon/min would amount to declaring that one
         graphite is worth one silicon, which is false and would be invisible. --}}
    <div class="card notice">
      <p>{{ __('schema.comparer.rien-en-commun') }}</p>
    </div>
  @endif

  {{-- Who is who, stuck to the top of the screen.

       The tables repeated both names in every one of their headers, truncated to the width
       of a column of figures. As soon as you went down into the gaps, the plans had left
       the screen and all that was left was "Thor 5.37 e..." against "7 plast (4..." to
       remember which side you were looking at. One single bar, which follows, and the
       columns of the cards below line up on it. --}}
  <div class="cmp-collant">
    <div class="cmp-ligne">
      <span class="cmp-quoi"></span>
      <span class="cmp-val a">
        <span class="cmp-nom-court">{{ $left->displayName() }}</span>
        <span class="cmp-pastille a" aria-hidden="true">A</span>
      </span>
      <span class="cmp-val b">
        <span class="cmp-pastille b" aria-hidden="true">B</span>
        <span class="cmp-nom-court">{{ $right->displayName() }}</span>
      </span>
      <span class="cmp-ecart">{{ __('schema.comparer.ecart') }}</span>
    </div>
  </div>

  @php
    $shared = $comparison->shared();
  @endphp
  @if($shared !== [])
    <div class="card">
      <h2>{{ __('schema.comparer.ce-quils-font') }}</h2>
      @foreach($shared as $row)
        @php
          /* The bar only exists on a comparable row: same item, same kind of figure. It is
             the proportion of the two values against each other and nothing else, never
             from one row to the next. A graphite and a silicon on the same scale would be
             the overall score this page refuses to compute. */
          $top = max((float) $row['left']->rate, (float) $row['right']->rate);
          $part = fn ($rate) => $top > 0 ? round(($rate / $top) * 100) : 0;
        @endphp
        <div class="cmp-ligne @if($row['comparable']) barree @endif">
          <span class="cmp-quoi">
            @if($row['item'] !== SchematicItem::POWER)
              <img class="icone" src="/icone/{{ Thing::family($row['item']) }}/{{ $row['item'] }}.png?t=32"
                   width="18" height="18" loading="lazy" decoding="async" alt="">
            @endif
            {{ $thing($row['item']) }}
          </span>
          <span class="cmp-val a" style="--part: {{ $part((float) $row['left']->rate) }}%">{{
            $number($row['left']->rate) }}</span>
          <span class="cmp-val b" style="--part: {{ $part((float) $row['right']->rate) }}%">{{
            $number($row['right']->rate) }}</span>
          @if($row['comparable'])
            <span class="cmp-ecart {{ $row['gap'] > 0 ? 'good' : ($row['gap'] < 0 ? 'bad' : '') }}">
              {{ $sign($row['gap']) }}{{ $number(abs($row['gap'])) }}
            </span>
          @else
            <span class="cmp-ecart cmp-muet">{{ __('schema.comparer.non-soustrait') }}</span>
          @endif
        </div>
      @endforeach
      <p class="hint-line">{{ __('schema.comparer.ecart-lecture') }}</p>
    </div>
  @endif

  @php
    $seul = array_values(array_filter($comparison->outputs(),
        fn ($row) => $row['left'] === null || $row['right'] === null));
  @endphp
  @if($seul !== [])
    <div class="card">
      <h2>{{ __('schema.comparer.lun-pas-lautre') }}</h2>
      @foreach($seul as $row)
        <div class="line">
          <span class="cmp-quoi">
            @if($row['item'] !== SchematicItem::POWER)
              <img class="icone" src="/icone/{{ Thing::family($row['item']) }}/{{ $row['item'] }}.png?t=32"
                   width="18" height="18" loading="lazy" decoding="async" alt="">
            @endif
            {{ $thing($row['item']) }}
          </span>
          <span>
            <span class="cmp-pastille {{ $row['left'] ? 'a' : 'b' }}" aria-hidden="true">{{
              $row['left'] ? 'A' : 'B' }}</span>
            {{ $row['left'] ? $left->displayName() : $right->displayName() }}
            &middot; <span class="num">{{ $number($row['left']?->rate ?? $row['right']->rate) }}</span>
          </span>
        </div>
      @endforeach
    </div>
  @endif

  {{-- Space, footprint and current: the only axes where less is better with no weighting
       needed. That is why they are given as a gap and not as two columns the reader
       subtracts in their head. --}}
  @php
    $sizes = $comparison->sizes();
  @endphp
  @if($sizes !== [])
    <div class="card">
      <h2>{{ __('schema.comparer.la-place') }}</h2>
      @foreach($sizes as $row)
        @php
          $top = max($row['left'], $row['right']);
          $part = fn ($value) => $top > 0 ? round(($value / $top) * 100) : 0;
        @endphp
        <div class="cmp-ligne barree">
          <span class="cmp-quoi">{{ __($row['key']) }}</span>
          <span class="cmp-val a" style="--part: {{ $part($row['left']) }}%">{{
            $number($row['left']) }}</span>
          <span class="cmp-val b" style="--part: {{ $part($row['right']) }}%">{{
            $number($row['right']) }}</span>
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
      @foreach($comparison->cost() as $row)
        @php
          $top = max($row['left'], $row['right']);
          $part = fn ($value) => $top > 0 ? round(($value / $top) * 100) : 0;
        @endphp
        <div class="cmp-ligne barree">
          <span class="cmp-quoi">
            <img class="icone" src="/icone/{{ Thing::family($row['item']) }}/{{ $row['item'] }}.png?t=32"
                 width="18" height="18" loading="lazy" decoding="async" alt="">
            {{ Thing::name($row['item']) }}
          </span>
          <span class="cmp-val a" style="--part: {{ $part($row['left']) }}%">{{
            $number($row['left']) }}</span>
          <span class="cmp-val b" style="--part: {{ $part($row['right']) }}%">{{
            $number($row['right']) }}</span>
          <span class="cmp-ecart {{ $row['gap'] < 0 ? 'good' : ($row['gap'] > 0 ? 'bad' : '') }}">
            {{ $sign($row['gap']) }}{{ $number(abs($row['gap'])) }}
          </span>
        </div>
      @endforeach
    </div>
  @endif

  @php
    $stops = $comparison->bottlenecks();
  @endphp
  @if($stops['left'] || $stops['right'])
    <div class="card">
      <h2>{{ __('schema.comparer.ce-qui-bloque') }}</h2>
      @foreach(['a' => [$left, $stops['left']], 'b' => [$right, $stops['right']]] as $side => $pair)
        @php
          [$who, $block] = $pair;
        @endphp
        <div class="line cmp-arret">
          <span class="cmp-quoi">
            <span class="cmp-pastille {{ $side }}" aria-hidden="true">{{ strtoupper($side) }}</span>
            {{ $who->displayName() }}</span>
          <span class="cmp-quoi cmp-goulot">
            @if($block)
              <img class="icone" src="/icone/{{ Thing::family($block) }}/{{ $block }}.png?t=32"
                   width="18" height="18" loading="lazy" decoding="async" alt="">
              <a href="/blocs/{{ $block }}">{{ Thing::name($block) }}</a>
            @else
              {{ __('schema.comparer.rien-ne-bloque') }}
            @endif
          </span>
        </div>
      @endforeach
    </div>
  @endif

  {{-- And no verdict. A schematic that produces more and costs three times as much is not
       better, it is a different trade, and the reader is the only one who knows which
       trade they want. The site states every gap and stops there. --}}
  <p class="hint-line">{{ __('schema.comparer.pas-de-verdict') }}</p>
@endif
@endsection
