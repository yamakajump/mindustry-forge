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

  /* Le nom du jeu et son image, pas l'identifiant anglais. La page affichait
     `blast-compound` a un joueur francophone, sous une image qu'elle avait deja les moyens
     de servir : la vitrine et le wiki des blocs tirent tous les deux de `/icone/`. */
  $thing = fn ($item) => $item === SchematicItem::POWER
      ? __('schema.comparer.energie') : Thing::name($item);

  /* Ce qu'il faut a un panneau pour dessiner son plan. Le code voyage dans la page tant
     qu'il est petit, comme sur la vitrine ; au-dela le panneau le demande lui-meme, et
     seulement quand il approche de l'ecran. Un seul schema de 512 ko n'a rien a faire dans
     une page qui en montre dix. Le seuil est celui de la vitrine, mesure a 44 ko pour
     vingt-quatre tuiles sur le catalogue en ligne. */
  $porte = 16384;
  $planned = fn ($schematic) => strlen((string) $schematic->code) <= $porte
      ? 'data-code="'.e($schematic->code).'"'
      : 'data-slug="'.e($schematic->slug).'"';
@endphp

@section('body')
<h1 class="title">{{ __('schema.comparer.titre') }}</h1>
<p class="sub">{{ __('schema.comparer.sous-titre') }}</p>

{{-- Les deux cotes, cote a cote, et leur plan dessine des qu'ils sont remplis.

     C'etait deux champs de texte au-dessus d'une liste de noms : une page dont le sujet
     entier est deux images n'en montrait aucune, a aucun moment. Le mot de Corentin :
     « tu ne vois pas les schemas, c'est pas du tout intuitif ».

     Reste un formulaire GET, et un seul. Choisir dans la liste deroulante est un lien vers
     cette meme adresse, donc le retour arriere marche, une comparaison se colle dans un fil
     Discord, et la page fonctionne entierement sans JavaScript : le champ et son bouton font
     ce qu'ils ont toujours fait. Le script n'ajoute que les resultats pendant la frappe. --}}
<form method="get" class="cmp-arene" id="cmp-arene">
  @foreach(['a' => $left, 'b' => $right] as $side => $chosen)
    @if($side === 'b')
      {{-- Entre les deux, parce que c'est entre les deux que le geste a lieu. Un lien et
           non un bouton : il a une adresse, donc le clavier et le lecteur d'ecran l'ont
           gratuitement, et il marche sans script. --}}
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
        {{-- Le chiffre reste hors de la chaine traduite : une cle manquante rendrait la cle
             sans substituer, et c'est le nombre qui disparaitrait, pas le mot. --}}
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
          {{-- La valeur reste ce qui a ete tape et pas le slug trouve : corriger sa
               recherche demanderait sinon de la retaper entiere. --}}
          <input id="{{ $side }}" name="{{ $side }}" value="{{ $asked[$side] }}" maxlength="120"
                 spellcheck="false" autocomplete="off" role="combobox" aria-expanded="false"
                 aria-controls="cmp-liste-{{ $side }}" aria-autocomplete="list"
                 placeholder="{{ __('schema.comparer.cherche') }}">
          <button class="primary" type="submit">{{ __('schema.comparer.comparer') }}</button>
        </div>

        {{-- Ce qu'un nom a trouve, rendu par le serveur. Le script le remplace pendant la
             frappe, mais sans lui c'est encore cette liste-la qui repond, et repondre a une
             recherche par un formulaire vide se lit comme « ce schema n'existe pas » alors
             que ce qui s'est passe est qu'on ne l'a jamais cherche. --}}
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
                    {{-- La taille seulement quand elle est connue : un schema de zero bloc
                         n'existe pas, et l'ecrire serait affirmer a la place de se taire sur
                         une ligne que l'analyse n'a pas encore reprise. --}}
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

{{-- Seulement tant qu'il reste un champ ou taper. Les deux cotes remplis, la page n'a plus
     de boite de recherche, et une phrase qui explique quoi y taper flotte au-dessus d'une
     comparaison sans rien a quoi se rattacher. --}}
@if(! $left || ! $right)
  <p class="hint-line cmp-aide">{{ __('schema.comparer.aide') }}</p>
@endif

@php
  // Ne pas proposer huit schemas au hasard sous huit resultats de recherche. Qui a tape un
  // nom a deja choisi ce qu'il cherche ; la liste generique n'est alors qu'une deuxieme
  // liste a lire. Elle reste quand la recherche n'a rien rendu, parce que la page a encore
  // quelque chose d'utile a offrir.
  $trouve = collect($matches)->filter()->contains(fn ($found) => $found->isNotEmpty());
@endphp

{{-- Deux questions distinctes, et les melanger a casse la page une fois : la liste
     generique depend de la recherche, la comparaison ne depend que d'avoir les deux
     schemas. Une seule condition pour les deux envoyait le @else afficher une comparaison
     dont les deux cotes etaient nuls. --}}
@if(! $comparison)
  @if(! $trouve)
    {{-- Arriver par le menu sans rien choisi est le cas courant, et une page vide serait une
         impasse. Huit recents plutot que le catalogue entier : quinze mille options dans une
         liste deroulante ne sont pas un choix, ce sont des kilometres.

         Avec leur plan, et c'est tout le changement : huit lignes de texte appelees
         « Silicon » sont huit lignes identiques, huit plans ne le sont jamais. --}}
    <h2 class="cmp-titre">{{ __('schema.comparer.a-choisir') }}</h2>
    @if($recent->isEmpty())
      <p class="empty">{{ __('schema.comparer.rien-a-comparer') }}</p>
    @else
      <div class="grid cmp-propositions">
        @foreach($recent as $one)
          <article class="tile">
            {{-- Le plan mene a la page du schema, les deux boutons remplissent un cote.
                 La liste menait a `/s/` et rien d'autre, donc cliquer une proposition dans
                 le selecteur emmenait ailleurs et il fallait revenir avec l'identifiant en
                 tete. --}}
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

  {{-- L'origine des chiffres avant les chiffres. Un plafond et une mesure ne se comparent
       pas, et la majorite du catalogue est au plafond faute de marquage : le taire
       reviendrait a presenter une estimation comme une mesure, ce qui est la seule chose que
       ce site vend. --}}
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
    {{-- Deux schemas qui ne font pas la meme chose n'ont pas de vainqueur. Classer quarante
         graphite/min contre vingt-cinq silicium/min reviendrait a decreter qu'un graphite
         vaut un silicium, ce qui est faux et serait invisible. --}}
    <div class="card notice">
      <p>{{ __('schema.comparer.rien-en-commun') }}</p>
    </div>
  @endif

  {{-- Qui est qui, colle en haut de l'ecran.

       Les tableaux repetaient les deux noms dans chacun de leurs en-tetes, tronques a la
       largeur d'une colonne de chiffres. Des qu'on descendait dans les ecarts, les plans
       etaient sortis de l'ecran et il ne restait que « Thor 5.37 e... » contre « 7 plast
       (4... » pour se souvenir de quel cote on regardait. Une seule barre, qui suit, et les
       colonnes des cartes en dessous s'alignent dessus. --}}
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
          /* La barre n'existe que sur une ligne comparable : meme objet, meme nature de
             chiffre. Elle est la proportion des deux valeurs entre elles et rien d'autre,
             jamais d'une ligne a la suivante. Un graphite et un silicium sur une meme
             echelle serait le score global que cette page refuse de calculer. */
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

  {{-- La place, l'emprise et le courant : les seuls axes ou moins vaut mieux sans qu'aucune
       ponderation soit necessaire. C'est pour ca qu'ils sont dits en ecart et pas en deux
       colonnes que le lecteur soustrait de tete. --}}
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

  {{-- Et pas de verdict. Un schema qui produit plus et coute trois fois plus cher n'est pas
       meilleur, c'est un autre marche, et le lecteur est le seul a savoir lequel il veut. Le
       site enonce chaque ecart et s'arrete la. --}}
  <p class="hint-line">{{ __('schema.comparer.pas-de-verdict') }}</p>
@endif
@endsection
