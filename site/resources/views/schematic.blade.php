@extends('layout')
@section('title', $schematic->displayName().' - Mindustry Forge')


@php
  $preview = \Illuminate\Support\Facades\Storage::disk('public')
      ->exists("apercus/{$schematic->slug}.png")
      ? asset("storage/apercus/{$schematic->slug}.png") : null;
  $made = collect($schematic->produces ?? [])
      ->map(fn ($rate, $item) => number_format($rate, 0, ',', ' ')." {$item}/min")
      ->values();
  $power = $schematic->power_made - $schematic->power_used;
  /* Le resume part dans la balise `description`, dans l'`og:title` et sur la carte
     sociale : c'est la forme du chiffre qui voyage le plus loin, et la seule qu'un lecteur
     voit sans avoir ouvert la page. */
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
@endpush

@section('body')
<div class="split">
  {{-- A stored preview when the author's browser uploaded one while saving, and the plan
       drawn here otherwise. Nothing imported has a stored preview: that PNG is made by the
       browser of whoever saves their own work, and an import never goes down that path.
       Drawing it from the code costs one sprite sheet and 126 ms, and needs nothing
       backfilled for the fifteen thousand pages that had an empty panel. --}}
  <div class="stage"
       @unless($preview) data-code="{{ $schematic->code }}" @endunless>
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

    {{-- Where it came from, said plainly on the page rather than kept in the database.
         Most of this catalogue was posted somewhere else by somebody else, and a site that
         hides that is passing off other people's work as its own listing. It also sets
         expectations honestly: nothing here was checked by hand, the analysis is this
         engine's reading of a string it was handed, and a schematic can perfectly well be
         broken, half-finished or out of date at the source. Better said here than
         discovered in-game. --}}
    @if($schematic->imported())
      <div class="card notice">
        <h2>Schematique importee</h2>
        <p>
          Recuperee sur
          @if($schematic->sourceUrl())
            <a href="{{ $schematic->sourceUrl() }}" rel="noopener nofollow"
               target="_blank">{{ $schematic->sourceName() ?? $schematic->source }}</a>,
          @else
            {{ $schematic->sourceName() ?? $schematic->source }},
          @endif
          ou {{ $schematic->credit() }} l'a publiee. Elle ne vient pas d'ici et
          personne ne l'a relue&nbsp;: elle peut etre incomplete, cassee, ou faite pour
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

    {{-- Un robinet de bac a sable est dit, jamais chiffre.

         `power-source` rend 999 999,94 energie par seconde, ce qui est la facon dont le jeu
         ecrit « autant que tu veux ». Une fois la consommation soustraite, la page a affiche
         479 999 971 en vert, presente comme ce qu'il restait pour le reste de la base. Le
         calcul etait juste et la phrase etait fausse, sur un site dont l'argument est qu'on
         peut verifier ses chiffres au lieu de les croire.

         Ce qu'elle produit reste lisible dans l'analyse. C'est la presentation qui change :
         un infini n'est pas un dimensionnement, et il ne doit pas en avoir l'air. --}}
    @if($schematic->fedBySandbox())
      <div class="card"><h2>Sortie</h2>
        <div class="line"><span class="warn">{{ __('schema.page.bac-a-sable') }}</span>
          <span>{{ implode(', ', $schematic->sandboxTaps()) }}</span></div>
        <p class="hint-line">{{ __('schema.page.bac-a-sable-aide') }}</p>
      </div>
    @elseif($power > 0.5 || $made->isNotEmpty())
      <div class="card"><h2>Sortie</h2>
        @if($power > 0.5)
          <div class="line"><span>Energie nette</span>
            <span class="num good">{{ number_format($power, 0, ',', ' ') }} / s</span></div>
        @endif
        @foreach($schematic->produces ?? [] as $item => $itemRate)
          <div class="line"><span>{{ $item }}</span>
            <span class="num">{{ number_format($itemRate, 1, ',', ' ') }} / min</span></div>
        @endforeach
      </div>
    @endif

    {{-- Ce qu'il faut lui amener pour qu'elle tourne.
         L'electricite y figure au meme titre que le charbon, et c'est nouveau : la page
         ne parlait d'energie que lorsqu'il y en avait en trop, donc une chaine a silicium
         qui reclame six cents energie/s n'en disait pas un mot. Un joueur qui la colle
         dans un coin non alimente la regardait ne rien faire sans savoir pourquoi.
         Ce n'est pas un defaut de la schematique : une base a du courant, ou on tire un
         fil. C'est un prerequis, et il se dit. --}}
    @if($schematic->needs || $schematic->powerNeeded() > 0.5)
      <div class="card"><h2>Il lui faut</h2>
        @if($schematic->powerNeeded() > 0.5)
          <div class="line"><span>electricite</span>
            <span class="num warn">{{
              number_format($schematic->powerNeeded(), 0, ',', ' ') }} / s</span></div>
        @endif
        @foreach($schematic->needs ?? [] as $item => $needRate)
          <div class="line"><span>{{ $item }}</span>
            <span class="num">{{ number_format($needRate, 0, ',', ' ') }} / min</span></div>
        @endforeach
        @if($schematic->powerNeeded() > 0.5)
          <p class="hint-line">
            @if($schematic->fedBySandbox())
              {{ __('schema.page.bac-a-sable-courant') }}
            @elseif($schematic->powerSpare() > 0.5)
              Elle produit plus de courant qu'elle n'en consomme, donc elle s'alimente
              seule et il lui en reste
              {{ number_format($schematic->powerSpare(), 0, ',', ' ') }} / s pour le reste
              de ta base.
            @else
              Elle ne fabrique pas son courant&nbsp;: il faudra la brancher sur ton reseau,
              sinon elle reste a l'arret. Ce n'est pas compte contre elle dans les
              classements.
            @endif
          </p>
        @endif
      </div>
    @endif

    @if($schematic->managedBy(auth()->user()))
      <div class="card"><h2>Gerer</h2>
        @include('partials.manage', ['gone' => '/mes-schematiques'])
        <p class="hint-line">
          @if($schematic->user_id !== auth()->id())
            Tu vois ces boutons parce que tu tiens la vitrine, pas parce que la
            schematique est a toi.
          @else
            Privee, personne d'autre ne la voit. Par lien, elle marche pour qui l'a et
            reste hors de la vitrine. Publique, elle est dans la vitrine et classee avec
            les autres.
          @endif
        </p>
      </div>
    @endif

    <div class="card"><h2>Prendre la schematique</h2>
      <textarea id="code" readonly rows="3">{{ $schematic->code }}</textarea>
      <div class="row">
        <button class="primary" id="copy" type="button">Copier</button>
        <a class="button" href="/?s={{ $schematic->slug }}">{{
          $schematic->managedBy(auth()->user()) ? 'Modifier' : 'Analyser chez moi' }}</a>
      </div>
      <p class="hint-line">Colle-la dans Mindustry avec ctrl+v.</p>
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
