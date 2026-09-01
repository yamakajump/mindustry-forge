{{-- A single schematic's public page, and also what a pasted /s/ link unfurls into on
     Discord. Route GET /s/{schematic}, fed by SchematicController::show.

     Scope: schematic, aime, favori, note, folders, inFolders. The last four are only
     meaningful when a member is signed in; SchematicController::show leaves them null or
     empty for an anonymous visitor. --}}
@extends('layout')
@section('title', $schematic->displayName().' - Mindustry Forge')


@php
  $preview = \Illuminate\Support\Facades\Storage::disk('public')
      ->exists("apercus/{$schematic->slug}.png")
      ? asset("storage/apercus/{$schematic->slug}.png") : null;
  $made = collect($schematic->produces ?? [])
      ->map(fn ($rate, $item) => \App\Models\SchematicItem::debitAffiche($item, $rate)." {$item}/s")
      ->values();
  $power = $schematic->power_made - $schematic->power_used;
  /* The summary goes into the `description` tag, into `og:description` and into the social
     card's alt text: it is the form of the figure that travels furthest, and the only one a
     reader sees without having opened the page. `og:title` is the name, not this. */
  $tap = $schematic->fedBySandbox();
  $summary = trim(collect([
      $tap ? __('schema.page.bac-a-sable-court') : null,
      ! $tap && $power > 0.5 ? number_format($power, 0, ',', ' ').' energie/s' : null,
      $tap ? null : ($made->take(2)->implode(', ') ?: null),
      "{$schematic->blocks} blocs",
  ])->filter()->implode(' - '));
@endphp
{{-- Declared rather than appended, so the head holds one of each. The picture and the
     figure together are the whole point: a link that shows what a schematic does gets
     clicked, a link that shows a domain name does not. --}}
@section('og-type', 'article')
@section('og-title', $schematic->displayName())
@section('og-description', $summary)
@section('og-alt', $schematic->displayName().' - '.$summary)
@section('og-image', url("/s/{$schematic->slug}/carte.jpg"))

@push('head')
  @if($schematic->managedBy(auth()->user()))
    <script src="/forge/manage.js" type="module" defer></script>
  @endif
  @unless($preview)
    <script src="/forge/apercu.js" type="module" defer></script>
  @endunless
  {{-- Here rather than in the layout: the two buttons exist only on this page, and only
       for somebody signed in. An anonymous visitor gets a link to Discord, which needs no
       script at all. --}}
  @auth
    <script src="/forge/keep.js" type="module" defer></script>
    <script src="/forge/dossiers.js" type="module" defer></script>
    <script src="/forge/notes.js" type="module" defer></script>
  @endauth
@endpush

@section('body')
<div class="split">
  {{-- A stored preview when the author's browser uploaded one while saving, and the plan
       drawn here otherwise. Nothing imported has a stored preview: that PNG is made by the
       browser of whoever saves their own work, and an import never goes down that path.
       Drawing it from the code costs one sprite sheet and 126 ms, and needs nothing
       backfilled for the fifteen thousand pages that had an empty panel. --}}
  {{-- `data-marks` carries what the author said goes in and comes out. Stored with every
       schematic since the first day and read back by nobody until now, which is what made a
       described plan and an untouched one look the same. Only on the drawn path: a stored
       preview is a PNG and cannot take a mark. --}}
  <div class="stage"
       @unless($preview)
         data-code="{{ $schematic->code }}"
         @if($marked !== []) data-marks="{{ json_encode($marked) }}" @endif
       @endunless>
    @if($preview)
      <img src="{{ $preview }}" alt="Apercu de {{ $schematic->displayName() }}">
    @else
      <p class="empty">Dessin du plan...</p>
    @endif
  </div>

  <div>
    <h1 class="title">{{ $schematic->displayName() }}</h1>
    <p class="sub">
      par {{ $schematic->credit() }} &middot;
      {{ $schematic->width }}x{{ $schematic->height }} &middot;
      {{ $schematic->blocks }} blocs &middot;
      {{ $schematic->views }} vues
      @unless($schematic->verified)
        &middot; <span title="Chiffres calcules par le navigateur, pas encore rejoues
        sur un vrai serveur">chiffres non verifies</span>
      @endunless
    </p>

    {{-- The two gestures, named rather than left to two icons: a filled heart against an
         empty heart does not tell somebody nobody ever explained it to the difference
         between "this is good" and "I want to find it again".

         The count only shows above zero. "0 likes" under a schematic nobody has opened yet
         answers "how many people liked it" on a page where the reader is asking whether it
         is any good, and it reads as a verdict. --}}
    {{-- `data-schema` and not `data-slug`: in this repository, `data-slug` is apercu.js's
         contract, and it takes every element carrying one for a tile whose code it has to
         fetch so it can draw the plan. It replaced these two buttons with a canvas, on the
         real page, while the eleven tests were all going green. --}}
    <div class="keep" data-schema="{{ $schematic->slug }}">
      @auth
        <button type="button" data-aime aria-pressed="{{ $aime ? 'true' : 'false' }}">
          <span class="mot">{{ __($aime ? 'schema.aime.retirer' : 'schema.aime.bouton') }}</span>
        </button>
        <button type="button" data-favori aria-pressed="{{ $favori ? 'true' : 'false' }}">
          <span class="mot">{{ __($favori ? 'schema.favori.retirer' : 'schema.favori.ajouter') }}</span>
        </button>
        {{-- Beside the buttons and not inside them: inside the button, the page showed
             "Like  3 likes", the same word twice three pixels apart. No test sees that,
             only opening the page does. --}}
        <span class="compte"{{ $schematic->likes > 0 ? '' : ' hidden' }}>{{ $schematic->likes }} {{ __('schema.unite.jaime') }}</span>
        @if($folders->isNotEmpty())
          {{-- Checkboxes and not a dropdown: a schematic goes into several folders at once,
               which is the whole point, and a `select` would say the opposite. --}}
          <details class="ranger">
            <summary>{{ __('dossiers.gestion.ajouter-ici') }}</summary>
            <div class="menu-list">
              @foreach($folders as $folder)
                <label>
                  <input type="checkbox" data-ranger
                         data-dossier="{{ $folder->slug }}"
                         data-schema="{{ $schematic->slug }}"
                         @checked(in_array($folder->slug, $inFolders, true))>
                  {{ $folder->name }}
                </label>
              @endforeach
            </div>
            <p class="hint-line note" hidden></p>
          </details>
        @endif
      @else
        {{-- Shown rather than hidden, and as a link rather than a button: a button a
             visitor never sees is a feature whose existence they never learn about, and a
             link works without a line of JavaScript. --}}
        <a class="bouton" href="/auth/discord">{{ __('schema.aime.bouton') }}</a>
        @if($schematic->likes > 0)
          <span class="compte">{{ $schematic->likes }} {{ __('schema.unite.jaime') }}</span>
        @endif
      @endauth
    </div>

    @auth
      @include('partials.note')
    @endauth

    {{-- Where it came from, said plainly on the page rather than kept in the database.
         Most of this catalogue was posted somewhere else by somebody else, and a site that
         hides that is passing off other people's work as its own listing. It also sets
         expectations honestly: nothing here was checked by hand, the analysis is this
         engine's reading of a string it was handed, and a schematic can perfectly well be
         broken, half-finished or out of date at the source. Better said here than
         discovered in-game. --}}
    @if($schematic->imported())
      <div class="card notice">
        <h2>Schéma importé</h2>
        <p>
          Recuperee sur
          @if($schematic->sourceUrl())
            <a href="{{ $schematic->sourceUrl() }}" rel="noopener nofollow"
               target="_blank">{{ $schematic->sourceName() ?? $schematic->source }}</a>,
          @else
            {{ $schematic->sourceName() ?? $schematic->source }},
          @endif
          ou {{ $schematic->credit() }} l'a publié. Il ne vient pas d'ici et
          personne ne l'a relu&nbsp;: il peut etre incomplet, cassé, ou fait pour
          une version du jeu qui n'est plus la notre.
        </p>
        <p>
          Les chiffres ci-dessous sont ce que l'analyse en deduit, pas une promesse de
          l'auteur.
          @if($schematic->verified)
            Celui-la a ete rejoue sur un vrai serveur.
          @else
            Ils n'ont pas encore ete rejoues sur un vrai serveur.
          @endif
        </p>
        @if($schematic->fetched_at)
          <p class="hint-line">Recuperee le {{ $schematic->fetched_at->format('d/m/Y') }}.</p>
        @endif
      </div>
    @endif

    @if($schematic->description)
      <p class="desc">{{ $schematic->description }}</p>
    @endif

    {{-- A sandbox tap is said, never given a figure.

         `power-source` returns 999,999.94 power per second, which is how the game writes
         "as much as you want". Once consumption was subtracted, the page showed
         479,999,971 in green, presented as what was left for the rest of the base. The
         arithmetic was right and the sentence was wrong, on a site whose whole argument is
         that you can check its figures instead of believing them.

         What it produces stays readable in the analysis. What changes is the presentation:
         an infinity is not a sizing, and it must not look like one. --}}
    @if($schematic->fedBySandbox())
      <div class="card"><h2>Sortie</h2>
        <div class="line"><span class="warn">{{ __('schema.page.bac-a-sable') }}</span>
          <span>{{ implode(', ', $schematic->sandboxTaps()) }}</span></div>
        <p class="hint-line">{{ __('schema.page.bac-a-sable-aide') }}</p>
      </div>
    @elseif($power > 0.5 || $made->isNotEmpty())
      <div class="card"><h2>Sortie</h2>
        {{-- "At best", because the column comes from `analysis['potential']`: it is what
             the layout would do fed at full rate, not what it was measured doing. The same
             word the comparison page already uses, and for the same reason: a cap is never
             shown without saying that it is one. --}}
        @if($power > 0.5)
          <div class="line"><span>{{ __('schema.page.energie-plafond') }}</span>
            <span class="num good">{{ number_format($power, 0, ',', ' ') }} / s</span></div>
        @endif
        @foreach($schematic->produces ?? [] as $item => $itemRate)
          {{-- Named the way the block wiki names it, from the game's own French bundle. It
               printed the identifier, so this page said "copper" three cards above another
               that says "Cuivre". --}}
          <div class="line"><span>@include('blocks.partials.thing', ['thing' => $item])</span>
            <span class="num">{{ \App\Models\SchematicItem::debitAffiche($item, $itemRate) }} {{
              __('schema.unite.par-seconde') }}</span></div>
        @endforeach
      </div>
    @endif

    {{-- What it costs to place.

         The figure comes from the analysis, which gets it from `Block.requirements`: it is
         what the game takes out of the core, to the unit. Filed in the order of the game's
         own item ids, the order a player reads on every panel, and not alphabetically,
         which would put beryllium at the head of a Serpulo build.

         The icon is decorative: the name is written next to it, and a screen reader saying
         "copper copper" teaches nobody anything. --}}
    @if($schematic->cost() !== [])
      <div class="card"><h2>{{ __('schema.page.cout') }}</h2>
        @foreach($schematic->cost() as $item => $amount)
          <div class="line">
            <span><img class="icone" src="/icone/objet/{{ $item }}.png?t=32"
                       width="16" height="16" alt="" loading="lazy"> {{
              \App\Support\Thing::name($item) }}</span>
            <span class="num">{{ number_format($amount, 0, ',', ' ') }}</span></div>
        @endforeach
        <p class="hint-line">{{ __('schema.page.cout-aide') }}</p>
      </div>
    @endif

    {{-- What has to be brought to it for it to run.
         Power appears here on the same footing as coal, and that is new: the page only
         spoke of power when there was some to spare, so a silicon chain demanding six
         hundred power/s said not a word about it. A player pasting it into an unpowered
         corner watched it do nothing without knowing why. That is not a defect of the
         schematic: a base has current, or you run a wire to it. It is a prerequisite, and
         it gets said. --}}
    @if($schematic->needs || $schematic->powerNeeded() > 0.5)
      <div class="card"><h2>Il lui faut</h2>
        @if($schematic->powerNeeded() > 0.5)
          {{-- The mark and the word from the dictionary. It said "electricite", written
               into the markup and without its accent, on a site whose own rule is that a
               player-facing string lives in `site/lang/` and that accents are written. --}}
          <div class="line"><span>@include('partials.eclair') {{ __('schema.unite.energie') }}</span>
            <span class="num warn">{{
              number_format($schematic->powerNeeded(), 0, ',', ' ') }} / s</span></div>
        @endif
        @foreach($schematic->needs ?? [] as $item => $needRate)
          <div class="line"><span>@include('blocks.partials.thing', ['thing' => $item])</span>
            <span class="num">{{ \App\Models\SchematicItem::debitAffiche($item, $needRate) }} {{
              __('schema.unite.par-seconde') }}</span></div>
        @endforeach
        @if($schematic->powerNeeded() > 0.5)
          <p class="hint-line">
            @if($schematic->fedBySandbox())
              {{ __('schema.page.bac-a-sable-courant') }}
            @elseif($schematic->powerSpare() > 0.5)
              Il produit plus de courant qu'il n'en consomme, donc il s'alimente
              seul et il lui en reste
              {{ number_format($schematic->powerSpare(), 0, ',', ' ') }} / s pour le reste
              de ta base.
            @else
              Il ne fabrique pas son courant&nbsp;: il faudra le brancher sur ton réseau,
              sinon il reste à l'arrêt. Ce n'est pas compté contre lui dans les
              classements.
            @endif
          </p>
        @endif
      </div>
    @endif

    @if($schematic->managedBy(auth()->user()))
      <div class="card"><h2>Gerer</h2>
        @include('partials.manage', ['gone' => '/mes-schemas'])
        <p class="hint-line">
          @if($schematic->user_id !== auth()->id())
            Tu vois ces boutons parce que tu tiens la vitrine, pas parce que le
            schéma est a toi.
          @else
            Privé, personne d'autre ne le voit. Par lien, il marche pour qui l'a et
            reste hors de la vitrine. Public, il est dans la vitrine et classé avec
            les autres.
          @endif
        </p>
      </div>
    @endif

    <div class="card"><h2>Prendre le schéma</h2>
      <textarea id="code" readonly rows="3">{{ $schematic->code }}</textarea>
      <div class="row">
        <button class="primary" id="copy" type="button">Copier</button>
        <a class="button" href="/?s={{ $schematic->slug }}">{{
          $schematic->managedBy(auth()->user()) ? 'Modifier' : 'Analyser chez moi' }}</a>

        {{-- The move starts here, not from an empty page. Nobody reaches the comparison
             page with two identifiers in mind: you are on a schematic and you wonder how
             it stands. So one side is already filled in and only one is left to pick. --}}
        @if($schematic->visibility === \App\Models\Schematic::PUBLIC)
          <a class="button" href="/comparer?a={{ $schematic->slug }}">{{
            __('schema.comparer.comparer-avec') }}</a>
        @endif

        {{-- To the logic editor, and only when there is something there to open. The count
             comes from the analysis already stored, so the page decodes nothing to find it
             out: of the ninety-six measured schematics in the catalogue, six in ten have no
             processor at all, and a dead button on six pages in ten teaches the reader to
             stop reading that row. --}}
        @if (data_get($schematic->analysis, 'logic.processors', 0) > 0)
          <a class="button" href="/outils/logique?s={{ $schematic->slug }}">
            Ouvrir la logique</a>
        @endif
      </div>
      <p class="hint-line">Colle-le dans Mindustry avec ctrl+v.</p>
    </div>
  </div>
</div>

<script>
document.getElementById("copy").addEventListener("click", async (e) => {
  await navigator.clipboard.writeText(document.getElementById("code").value);
  e.target.textContent = "Copie";
  setTimeout(() => { e.target.textContent = "Copier"; }, 1600);
});
</script>
@endsection
