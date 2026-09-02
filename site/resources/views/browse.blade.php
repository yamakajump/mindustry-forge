{{-- The catalogue: every listed schematic, filterable and sortable. Route GET /schemas,
     fed by BrowseController::index. GET /mes-favoris renders this same view too, through
     the same controller with the favourites filter forced on, rather than a second listing
     page with its own query.

     Scope: schematics, winners, notes, makes, order, creative, setAside, orders, items,
     holds, blocks, powerKey, and more filter state BrowseController::index builds up. --}}
@extends('layout')
{{-- Named by its filter, so that `?produit=graphite` and `?bloc=router` are told apart
     in a list of search results. BrowseController::titles() builds it, and puts the item's
     name outside the translated phrase so a missing key cannot swallow it. --}}
@section('title', $pageTitle)
@if($pageSummary !== null)
  @section('og-description', $pageSummary)
@endif

@push('head')
  <script src="/forge/apercu.js" type="module" defer></script>
  {{-- Fetches nothing until the block picker is opened. --}}
  <script src="/forge/bloc-choix.js" type="module" defer></script>
  {{-- Acts only on an address that says nothing, so a shared link keeps its meaning. --}}
  <script src="/forge/classement.js" type="module" defer></script>
@endpush

@section('body')
<h1 class="title">Schémas</h1>
{{-- For hours the subtitle promised what the page does not deliver. "Every figure comes
     from the analysis" stayed true while suggesting a measurement, above twenty-four tiles
     that all carry "at best". A cap is never shown without saying that it is one, and that
     rule holds for the sentence heading the list as much as for a tile's own line. --}}
@if($order === 'declare')
  <p class="sub">Chaque chiffre vient de l'analyse du schéma lui-même, pas d'une
    étiquette tapée à la main. Ici ce sont des débits déclarés : ce que le plan fait
    branché comme un joueur l'a marqué, et non ce qu'il ferait alimenté à fond.</p>
@else
  <p class="sub">Chaque chiffre vient de l'analyse du schéma lui-même, pas d'une
    étiquette tapée à la main. Ce sont des plafonds : ce que le plan sortirait alimenté à
    fond, et non ce qu'il a été mesuré faisant.</p>
@endif

{{-- The ordering, as tabs rather than inside a dropdown.

     It is the command that shapes the page most, and it was the only one you had to open
     to find out what it offered. Six links show the six ways of ordering without a click,
     and each one keeps its own address.

     The three that compare production stay visible with no item chosen, marked rather than
     hidden: removing them would remove the reason they are missing, and a reader cannot
     ask for what is not shown. --}}
<nav class="tris" aria-label="Classer">
  @foreach($orders as $key => $label)
    @php $needsItem = in_array($key, ['best', 'dense', 'output'], true) && $makes === ''; @endphp
    <a class="tri @if($order === $key) on @endif @if($needsItem) gris @endif"
       href="{{ request()->fullUrlWithQuery(['tri' => $key, 'page' => null]) }}"
       @if($needsItem) title="{{ __('vitrine.contraintes.debit-sans-objet') }}" @endif
       @if($order === $key) aria-current="page" @endif>{{ $label }}</a>
  @endforeach
</nav>

{{-- What the search carries, and what removes it in one click.

     A page opened from a shared link applies constraints its reader never set, inside a
     panel that is folded shut. Without these chips, finding out why the list is short
     means opening the panel and reading six fields. --}}
@if($chips !== [])
  <div class="puces">
    <span class="puces-t">{{ __('vitrine.puces.titre') }}</span>
    @foreach($chips as $chip)
      <a class="puce" href="{{ request()->fullUrlWithQuery($chip['clear'] + ['page' => null]) }}"
         title="{{ __('vitrine.puces.retirer') }}">{{ $chip['label'] }} <b>&times;</b></a>
    @endforeach
    <a class="puce vide" href="{{ request()->fullUrlWithQuery($clearAll) }}">{{
      __('vitrine.puces.tout-effacer') }}</a>
  </div>
@endif

<form method="get" class="card">
  {{-- The product and the ordering are chosen by links, above. Carried here so that
       applying a constraint does not erase them: a form submits only its own fields, and
       a search that loses half its question while gaining a constraint is a page that is
       plausible and wrong. --}}
  <input type="hidden" name="produit" value="{{ $makes }}">
  <input type="hidden" name="tri" value="{{ $order }}">
  @if($creative)<input type="hidden" name="creatif" value="oui">@endif

  {{-- The search is a sentence, not a form.

       What this repository promises in its first line is "a hundred graphite a minute
       under thirty blocks". A row of labels and fields says the same thing and does not
       read: you have to assemble for yourself what the sentence gives at once. So the four
       clauses that matter are written out in words, with their fields inside them, and the
       rest folds away underneath.

       The product picker is a grid of links, so it lives outside the form as far as data
       goes: it is the hidden field above that submits it when a constraint is applied. --}}
  {{-- A div and not a paragraph.
       It held a `<details>`, and a `<p>` cannot: the parser closes the paragraph the moment
       it meets one, so the picker, the three clauses and the button were siblings after the
       `<p>`, not inside it. Every rule written for `.phrase > *` addressed one span, which
       is why the layout never held together and why the punctuation drifted wherever the
       line happened to end. Nothing in the markup said so and no test could see it. --}}
  <div class="phrase">
    <span class="ph-tete">{{ __('vitrine.phrase.je-cherche') }}</span>
    {{-- Produces what: a single control, and it is the one that carries the images.

         There were two, a row of pills and a dropdown, doing exactly the same thing.
         Corentin: "you are putting produces-what back in twice". The duplicate existed for
         a reason written down here: a native `<select>` carries no image in its `<option>`,
         and replacing it with a drawn list would have cost keyboard navigation, closing on
         Esc, the screen reader announcement, and the phone's native picker.

         What changed is that this grid is not a drawn list: it is links inside a
         `<details>`. The keyboard, the screen reader and Esc come from the browser and not
         from a script; every choice has an address that shares and indexes; and the page
         works without JavaScript. Only one real loss is left, type-ahead search, over some
         twenty entries that all fit on screen.

         The "contains what" field keeps its `datalist`, and for the opposite reason: two
         hundred block names do not fit in a grid, and typing is the only reasonable way in
         there. The boundary runs between twenty and two hundred, not between two tastes. --}}
    @if($items !== [])
      <details class="choisisseur">
        <summary>
          <span class="ch-quoi">Qui produit</span>
          @if($makes === '')
            <b>n'importe quoi</b>
          @else
            @if($makes !== $powerKey)
              <img class="icone" src="/icone/{{ \App\Support\Thing::family($makes) }}/{{ $makes }}.png?t=32"
                   width="22" height="22" decoding="async" alt="">
            @endif
            <b>{{ $makes === $powerKey ? 'énergie' : \App\Support\Thing::name($makes) }}</b>
          @endif
          <span class="ch-changer">changer</span>
        </summary>
    
        <div class="ch-grille">
          <a class="ch-case ch-tout @if($makes === '') on @endif"
             href="{{ request()->fullUrlWithQuery(['produit' => null, 'min' => null, 'page' => null]) }}"
             @if($makes === '') aria-current="page" @endif>n'importe quoi</a>
    
          @foreach($items as $item)
            {{-- The minimum rate goes away with the product: it is expressed in the unit of
                 the chosen item, so "at least 1000" would keep, for graphite, a number that
                 was about silicon. A figure that is right beside its question, in one
                 second. --}}
            <a class="ch-case @if($makes === $item) on @endif"
               href="{{ request()->fullUrlWithQuery(['produit' => $item, 'min' => null, 'page' => null]) }}"
               @if($makes === $item) aria-current="page" @endif>
              @if($item !== $powerKey)
                {{-- Power is neither an item nor a liquid: it has no sprite, and inventing
                     one for it would be drawing something the game does not draw. --}}
                <img class="icone" src="/icone/{{ \App\Support\Thing::family($item) }}/{{ $item }}.png?t=32"
                     width="24" height="24" loading="lazy" decoding="async" alt="">
              @else
                {{-- The same mark as everywhere else, rather than the emoji that used to
                     be here: a font's own glyph renders differently on every machine and
                     ignored the palette, so power was yellow on Windows, blue on a Mac and
                     never the site's amber. --}}
                <span class="ch-eclair">@include('partials.eclair', ['size' => 20])</span>
              @endif
              <span>{{ $item === $powerKey ? 'énergie' : \App\Support\Thing::name($item) }}</span>
            </a>
          @endforeach
        </div>
      </details>
    @endif
    {{-- One clause per field, and no punctuation between them.
         The sentence used to carry its own commas and a full stop, in spans. On screen it
         started with a comma on a line of its own, because the subject sits in a box above
         it, and ended with a full stop floating three pixels from the button. It also broke
         wherever the window happened to end, so the punctuation landed somewhere different
         at every width. A clause is a flex item that never breaks inside itself: the line
         wraps between clauses or not at all, and there is nothing left to orphan. --}}
    <span class="clause">
    <span class="ph-suite">{{ __('vitrine.phrase.au-moins') }}</span>
    <span class="champ"><input name="min" id="min" inputmode="numeric" autocomplete="off"
      value="{{ $atLeast ? rtrim(rtrim(number_format($atLeast, 2, '.', ''), '0'), '.') : '' }}"
      placeholder="100" aria-label="{{ __('vitrine.contraintes.au-moins') }}"></span>
    {{-- Per second, like every figure on the site now, and like the game itself. The
         column underneath still holds items per minute; the conversion is in the
         controller, next to the comparison. With no item chosen there is no unit to
         announce, and none is invented. --}}
    <span class="ph-unite">
      @if($makes === '')
        {{ __('vitrine.contraintes.unite.par-seconde') }}
      @elseif($makes === $powerKey)
        {{ __('vitrine.note.energie-seconde') }}
      @else
        {{ \App\Support\Thing::name($makes) }}/s
      @endif
    </span>
    </span>
    <span class="clause">
    <span class="ph-suite">{{ __('vitrine.phrase.qui-tient-dans') }}</span>
    <span class="champ court"><input name="large" id="large" inputmode="numeric"
      autocomplete="off" value="{{ $fitsWide ?: '' }}" placeholder="20"
      aria-label="{{ __('vitrine.contraintes.tient-dans') }}"></span>
    <span class="ph-x">&times;</span>
    <span class="champ court"><input name="haut" id="haut" inputmode="numeric"
      autocomplete="off" value="{{ $fitsTall ?: '' }}" placeholder="15"
      aria-label="{{ __('vitrine.contraintes.tient-dans') }}"></span>
    <span class="ph-unite">{{ __('vitrine.contraintes.unite.tuiles') }}</span>
    </span>
    <span class="clause">
    <span class="ph-suite">{{ __('vitrine.phrase.sur') }}</span>
    @include('partials.choix', [
      'nom' => 'planete',
      'titre' => __('vitrine.contraintes.planete'),
      'valeur' => $planet,
      'vide' => __('vitrine.contraintes.peu-importe'),
      'options' => collect($planets)->map(fn ($world) => [
        'valeur' => $world, 'libelle' => ucfirst($world), 'famille' => null,
      ])->all(),
    ])
    </span>

    <button class="primary" type="submit">{{ __('vitrine.contraintes.chercher') }}</button>
  </div>

  {{-- The constraints, folded away but never hidden: the panel opens by itself as soon as
       a constraint is active, or a reader arriving from a shared link would see a filtered
       list without seeing what filtered it. A `<details>` rather than a panel in
       JavaScript: it opens, closes and announces itself to the screen reader without a
       line of script, and every combination keeps an address that shares and indexes. --}}
  <details class="contraintes" @if($fitsWide || $fitsTall || $atLeast || $atMostBlocks || $selfPowered || $measured || $planet) open @endif>
    <summary>{{ __('vitrine.contraintes.titre') }}</summary>

    <div class="row">
      {{-- What it has to contain, at two granularities, because both questions get asked
           and only one of them could be. "A schematic with a turret in it" had no way in:
           the field takes one identifier, and somebody looking for a turret does not have
           one in mind. The family is a real filter on the server; the block is the field
           this row always had, now inside something you can browse. --}}
      @include('partials.choix', [
        'nom' => 'type',
        'titre' => __('vitrine.bloc.type'),
        'valeur' => $type,
        'vide' => __('vitrine.bloc.type-peu-importe'),
        'videCourt' => __('vitrine.contraintes.peu-importe'),
        'options' => collect(\App\Services\BlockCatalogue::CATEGORY_KEYS)
          ->map(fn ($cle, $famille) => [
            'valeur' => $famille, 'libelle' => __($cle), 'famille' => null,
          ])->values()->all(),
      ])

      @include('partials.bloc-choix', ['holds' => $holds, 'blocks' => $blocks])

      <label class="lead" for="blocs">{{ __('vitrine.contraintes.au-plus') }}</label>
      <input name="blocs" id="blocs" class="mini" inputmode="numeric" autocomplete="off"
             value="{{ $atMostBlocks ?: '' }}" placeholder="60">
      <span class="hint-line" style="margin:0">{{ __('vitrine.contraintes.unite.blocs') }}</span>
    </div>

    <div class="row">
      {{-- What has to be brought to it, the site's question the other way round.

           The same picker as "produces what", for the same reason: a player recognises
           pyratite by its sprite before they read the word, and this used to be twenty
           lines of text in the browser's own list widget, matching nothing else on the
           page. It is not a copy of that picker: this one is radio buttons, so it posts
           with the form rather than applying on click, which is what a constraint inside a
           folded panel should do. --}}
      @include('partials.choix', [
        'nom' => 'consomme',
        'titre' => __('vitrine.contraintes.consomme'),
        'valeur' => $eats,
        'vide' => __('vitrine.contraintes.consomme-rien'),
        'videCourt' => __('vitrine.contraintes.peu-importe'),
        'options' => collect($eatsOnOffer)->map(fn ($need) => [
          'valeur' => $need,
          'libelle' => \App\Support\Thing::name($need),
          'famille' => \App\Support\Thing::family($need),
        ])->all(),
      ])

      <label class="coche"><input type="checkbox" name="autonome" value="oui"
        @checked($selfPowered)> {{ __('vitrine.contraintes.autonome') }}</label>
      <label class="coche"><input type="checkbox" name="verifie" value="oui"
        @checked($measured)> {{ __('vitrine.contraintes.verifie') }}</label>

    </div>

    {{-- What is mine, offered to signed-in members only: a filter that always comes back
         empty is worse than a missing filter.

         Three checkboxes in the same panel as the rest, and that is the whole point: "my
         favourites that fit in 12x12 and put out silicon" is a search like any other. A
         separate favourites page would have had nothing to filter on. --}}
    @if($signedIn)
      <div class="row">
        <span class="lead">{{ __('vitrine.a-moi.titre') }}</span>
        <label class="coche"><input type="checkbox" name="favoris" value="oui"
          @checked($favorites)> {{ __('vitrine.a-moi.favoris') }}</label>
        <label class="coche"><input type="checkbox" name="aimes" value="oui"
          @checked($liked)> {{ __('vitrine.a-moi.aimes') }}</label>
        <label class="coche"><input type="checkbox" name="miens" value="oui"
          @checked($mine)> {{ __('vitrine.a-moi.miens') }}</label>
      </div>
      @if($favorites || $liked || $mine)
        {{-- Said, and not only done: without this sentence, a player finding a sandbox plan
             in their favourites would think the catalogue's filter is broken. --}}
        <p class="hint-line">{{ __('vitrine.a-moi.tout-garde') }}</p>
      @endif
    @endif

    @if($fitsWide || $fitsTall)
      <p class="hint-line">{{ __('vitrine.contraintes.sans-rotation') }}</p>
    @endif
    @if($atLeast && $makes === '')
      <p class="hint-line">{{ __('vitrine.contraintes.debit-sans-objet') }}</p>
    @endif
  </details>

  @if($holds !== '')
    <p class="hint-line">{{ __('vitrine.bloc.filtrees') }}
      <strong>{{ $holds }}</strong>.
      <a href="{{ request()->fullUrlWithQuery(['bloc' => null]) }}">{{
        __('vitrine.bloc.enlever') }}</a></p>
  @elseif(request()->query('bloc'))
    {{-- A name that is not a block filters nothing, and saying so beats rendering the whole
         list as if nothing had happened: otherwise a typo would return a page that is
         plausible and wrong. --}}
    <p class="hint-line">{{ __('vitrine.bloc.inconnu') }}</p>
  @endif

  {{-- With no item chosen there is nothing to measure a yield against: ranking forty
       graphite/min ahead of twenty-five silicon/min would amount to declaring that one
       graphite is worth one silicon. So the page does not do it, it says so, and it offers
       the one move that makes the ranking possible. --}}
  @if($makes === '')
    <p class="hint-line">Classés par date, faute de mieux. Choisis ce que tu cherches
      ci-dessus et le classement devient un vrai rendement&nbsp;: combien le schéma
      en sort, pour la place qu'il prend.</p>
  @else
    {{-- What kind of figure it is gets said with the figure, never after. That is the
         condition under which the catalogue is allowed to search on caps: naming them is
         not mixing them with measurements. --}}
    @if($order === 'declare')
      {{-- The same rule under the other ordering. Letting the caps sentence head a list
           ordered on declared rates would be the exact fault that sentence exists to
           prevent: a correct text, above figures that answer something else. --}}
      <p class="hint-line">Classés sur ce qu'ils sortent en
        <strong>{{ $makes === $powerKey ? 'énergie' : \App\Support\Thing::name($makes) }}</strong>
        branchés comme un joueur les a marqués. Un débit déclaré et non une mesure&nbsp;: le
        calcul est exact, le branchement est la parole de celui qui l'a marqué, et son nom
        est sur la fiche.</p>
    @else
    <p class="hint-line">Classés sur ce qu'ils pourraient sortir en
      <strong>{{ $makes === $powerKey ? 'énergie' : \App\Support\Thing::name($makes) }}</strong>,
      alimentés à fond, rapporté à leur taille. Un plafond et non un relevé&nbsp;: un
      schéma arraché d'une base n'a pas la foreuse qui l'alimentait, donc ce qu'il
      fait vraiment dépend de la vôtre. L'électricité qu'il consomme ne le pénalise
      pas&nbsp;: c'est un prérequis, indiqué sur sa page.</p>
    @endif
  @endif

  {{-- What is set aside, said with its count and a link to see it.

       A catalogue announcing fifteen thousand schematics and serving fourteen thousand
       without a word would be lying about its own size, which is exactly the fault this
       repository spent the day closing. So the count is shown, and the link undoes the
       filter: a reader can disagree with the rule and get around it in one click. --}}
  @if($creative)
    <p class="hint-line">{{ __('vitrine.creatif.affichees') }}
      <a href="{{ request()->fullUrlWithQuery(['creatif' => null]) }}">{{
        __('vitrine.creatif.remettre') }}</a></p>
  @elseif($setAside > 0)
    {{-- The singular has its own key rather than an "(s)". The count stays outside the
         translated string: a missing key would render the key without substituting, and
         the number would disappear from the only sentence that exists to give it. --}}
    <p class="hint-line">{{ $setAside }} {{ __($setAside === 1
      ? 'vitrine.creatif.mise-a-part' : 'vitrine.creatif.mises-a-part') }}
      <a href="{{ request()->fullUrlWithQuery(['creatif' => 'oui']) }}">{{
        __('vitrine.creatif.montrer') }}</a></p>
  @endif
</form>

@if($schematics->isEmpty())
  {{-- The empty state answers the question that was asked, and not the catalogue's.

       "Nothing published matches, analyse a schematic and publish it" is right under a
       catalogue search and wrong under my favourites: I have nothing to publish, I have
       simply kept nothing yet, and the page was sending me off to analyse a plan to fix
       that. An exact sentence, set where something else is being asked. --}}
  <div class="card">
    @if($favorites)
      <p class="empty">{{ __('vitrine.vide.favoris') }}</p>
      <p class="row"><a class="button primary" href="/schemas">{{
        __('vitrine.vide.parcourir') }}</a></p>
    @elseif($liked)
      <p class="empty">{{ __('vitrine.vide.aimes') }}</p>
      <p class="row"><a class="button primary" href="/schemas">{{
        __('vitrine.vide.parcourir') }}</a></p>
    @elseif($mine)
      <p class="empty">{{ __('vitrine.vide.miens') }}</p>
      <p class="row"><a class="button primary" href="/">{{ __('vitrine.vide.analyser') }}</a></p>
    @elseif($chips !== [])
      {{-- Filtered and empty: it is not the catalogue that is short of schematics, it
           is the search that is too tight. Sending the reader off to analyse and publish
           a plan answered a question nobody had asked. --}}
      <p class="empty">{{ __('vitrine.vide.rien-ne-correspond') }}</p>
      <p class="row"><a class="button primary"
        href="{{ request()->fullUrlWithQuery($clearAll) }}">{{
        __('vitrine.vide.tout-effacer') }}</a></p>
    @else
      <p class="empty">{{ __('vitrine.vide.catalogue') }}</p>
      <p class="row"><a class="button primary" href="/">{{ __('vitrine.vide.analyser') }}</a></p>
    @endif
  </div>
@else
  {{-- What is held for comparison, said and cancellable.

       Without this sentence, a reader coming back to the page from a shared link would see
       every tile offering "this one" without knowing against what. --}}
  @if($held !== null)
    <p class="compare-en-cours">
      {{ __('vitrine.comparer.retenu') }}
      <strong>{{ $held->displayName() }}</strong>.
      {{ __('vitrine.comparer.choisis-le-second') }}
      <a href="{{ request()->fullUrlWithQuery(['comparer' => null]) }}">{{
        __('vitrine.comparer.annuler') }}</a>
    </p>
  @endif

  {{-- Which one wins at what, before the grid.

       A list that only ranks leaves the whole comparison to the reader. Four questions
       rather than one, because "the best" is not a question: the player with a hole in
       their base, the player counting their copper and the player after raw throughput are
       not asking the same thing, and a single ranking cannot answer all three. That one
       schematic wins two of them is an answer, not a defect. --}}
  @if($winners !== [])
    <div class="verdicts">
      @foreach($winners as $win)
        <div class="verdict">
          <span class="v-question">{{ $win['question'] }}</span>
          <a class="v-nom" href="/s/{{ $win['schematic']->slug }}">{{
            $win['schematic']->displayName() }}</a>
          <span class="v-chiffre">{{ $win['figure'] }}</span>
        </div>
      @endforeach
    </div>
  @endif

  <div class="grid">
    @foreach($schematics as $schematic)
      @php
        $preview = \Illuminate\Support\Facades\Storage::disk('public')
            ->exists("apercus/{$schematic->slug}.png");
        $power = $schematic->power_made - $schematic->power_used;
      @endphp
      <article class="tile">
        <a href="/s/{{ $schematic->slug }}">
          @if($preview)
            <img src="{{ asset("storage/apercus/{$schematic->slug}.png") }}" alt="" loading="lazy">
          @else
            {{-- Drawn in the browser from the schematic's own code. Nothing imported has a
                 stored preview, so this list was a grid of grey rectangles; a thumbnail
                 costs 3 ms once the sprite sheet is in cache, measured on eight of them.

                 Carrying the codes costs 44 kB on a page of 24, measured on the live
                 catalogue: a median of 1 kB and a largest of 8.7 kB. The cap is there for
                 the shape the column allows rather than for the shapes it holds, since a
                 single 512 kB schematic would otherwise arrive in a list nobody asked it
                 from. Past the cap the tile says what it always said. --}}
            @if(strlen($schematic->code) <= 16384)
              <div class="noimg" data-code="{{ $schematic->code }}">pas d'aperçu</div>
            @else
              {{-- Past the cap the code is fetched instead of carried, and only once the
                   tile comes into view. The bound is what protects a list that asked for
                   none of this; a hole in the grid is not the price of keeping it. --}}
              <div class="noimg" data-slug="{{ $schematic->slug }}">pas d'aperçu</div>
            @endif
          @endif
          <h3>{{ $schematic->displayName() }}</h3>
        </a>
        <p class="meta">
          {{-- A sandbox tap is said here too. A thumbnail announcing 999 971 power/s is the
               same false sentence as the page, shorter and seen by more people. --}}
          @if($schematic->creative())
            <span class="warn">{{ __('vitrine.creatif.etiquette') }}</span> &middot;
          @endif
          @if($schematic->fedBySandbox())
            <span class="warn">{{ __('schema.page.bac-a-sable-court') }}</span> &middot;
          @else
            @if($power > 0.5)
              <span class="good">@include('partials.eclair', ['size' => 14]) {{
                number_format($power, 0, ',', ' ') }} {{ __('schema.unite.energie-seconde') }}</span>
              <span class="hint-line">{{ __('schema.page.au-mieux') }}</span> &middot;
            @endif
            {{-- The cap, because the cap is what the page ranks on: showing the measurement
                 under a ranking made on something else would make the tile say something
                 other than the list that filed it. And it is named as such, every time. --}}
            {{-- The unit follows the thing and not the column. `schematic_items.rate`
                 carries two of them without its name saying so: items are per minute there,
                 power per second. Writing "60 power/min" was the exact mistake another pass
                 had just warned me about, and I made it anyway. --}}
            @php $montre = $order === 'declare'
       ? \App\Models\SchematicItem::DECLARE
       : \App\Models\SchematicItem::PLAFOND; @endphp
            @foreach(array_slice($schematic->chiffresMontres($montre), 0, 2, true) as $item => $chiffre)
              {{ \App\Models\SchematicItem::debitAffiche($item, $chiffre['rate']) }}
              {{ $item === $powerKey
                  ? __('schema.unite.energie-seconde')
                  : \App\Support\Thing::name($item).'/s' }}
              {{-- Each of the two quantities names itself. Leaving the measurement silent
                   would make it read as the cap on the tile next to it, on a page that
                   ranks on caps. --}}
              <span class="hint-line">{{ match($chiffre['kind']) {
                  \App\Models\SchematicItem::PLAFOND => __('schema.page.au-mieux'),
                  \App\Models\SchematicItem::DECLARE => __('schema.page.declaree'),
                  default => __('schema.page.mesuree'),
              } }}</span>
              &middot;
            @endforeach
          @endif
          {{-- The dimensions, without which a ranking by area would show a lower rate above
               a higher one with nothing to explain it.

               Dropped when they are zero rather than printed as "0x0": an entry analysed by
               too old an engine has no width, and "0x0" reads as a measurement when it is
               an absence. --}}
          @if($schematic->width > 0 && $schematic->height > 0)
            {{-- The dimensions alone. There was a rectangle drawn beside them, at a scale
                 shared across the page so that two plans could be compared by eye. The
                 scale came from the widest entry in the list, so one 127-tile schematic
                 collapsed every other drawing to two or three pixels, and even at its best
                 a 16-pixel block of flat colour said nothing that "15x14" did not say
                 beside it more precisely. --}}
            <strong>{{ $schematic->width }}&times;{{ $schematic->height }}</strong> &middot;
          @endif
          {{ $schematic->blocks }} {{ trans_choice('schema.unite.bloc-compte', $schematic->blocks) }} &middot; {{ $schematic->credit() }}
          {{-- Said in the list too, not only on the page. Somebody scrolling a hundred
               tiles should be able to tell what this site collected from what its members
               made, without opening anything. --}}
          @if($schematic->imported())
            &middot; <span class="from"
              title="Importé depuis {{ $schematic->sourceName() ?? $schematic->source }},
              non relu">importé</span>
          @endif
        </p>
        {{-- The conclusion and the number it rests on, always together. Never "this one is
             good", always "the most efficient by area, 2.3 times this list's median": a
             reader can disagree with the second, which is the only honest way of writing
             the first. --}}
        {{-- The first click holds, the second compares. A link and not a checkbox: a
             checkbox does nothing without a script, and a link keeps an address per
             step. --}}
        @if($held === null)
          <a class="t-comparer" href="{{ request()->fullUrlWithQuery([
              'comparer' => $schematic->slug, 'page' => null]) }}">{{
            __('vitrine.comparer.retenir') }}</a>
        @elseif($held->slug !== $schematic->slug)
          <a class="t-comparer on" href="/comparer?a={{ $held->slug }}&amp;b={{ $schematic->slug }}">{{
            __('vitrine.comparer.avec-celui-ci') }}</a>
        @else
          <span class="t-comparer tenu">{{ __('vitrine.comparer.tenu') }}</span>
        @endif

        @if(($notes[$schematic->id] ?? []) !== [])
          <ul class="remarques">
            @foreach($notes[$schematic->id] as $note)
              <li class="r-{{ $note['tone'] }}">
                <b>{{ $note['title'] }}</b>
                <span>{{ $note['because'] }}</span>
              </li>
            @endforeach
          </ul>
        @endif
      </article>
    @endforeach
  </div>
  {{ $schematics->links() }}
@endif
@endsection
