@extends('layout')
@section('title', $schematic->name.' - Mindustry Forge')

@php
  $preview = \Illuminate\Support\Facades\Storage::disk('public')
      ->exists("apercus/{$schematic->slug}.png")
      ? asset("storage/apercus/{$schematic->slug}.png") : null;
  $made = collect($schematic->produces ?? [])
      ->map(fn ($rate, $item) => number_format($rate, 0, ',', ' ')." {$item}/min")
      ->values();
  $power = $schematic->power_made - $schematic->power_used;
  $summary = trim(collect([
      $power > 0.5 ? number_format($power, 0, ',', ' ').' energie/s' : null,
      $made->take(2)->implode(', ') ?: null,
      "{$schematic->blocks} blocs",
  ])->filter()->implode(' - '));
@endphp

@push('head')
  @if($schematic->managedBy(auth()->user()))
    <script src="/forge/manage.js" type="module" defer></script>
  @endif
  {{-- What a Discord message unfurls into. The picture and the figure together are the
       whole point: a link that shows what a schematic does gets clicked, a link that shows
       a domain name does not. --}}
  <meta property="og:title" content="{{ $schematic->name }}">
  <meta property="og:description" content="{{ $summary }}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="{{ url()->current() }}">
  <meta name="theme-color" content="#ffd37f">
  @if($preview)
    <meta property="og:image" content="{{ $preview }}">
    <meta name="twitter:card" content="summary_large_image">
  @endif
@endpush

@section('body')
<div class="split">
  <div class="stage">
    @if($preview)
      <img src="{{ $preview }}" alt="Apercu de {{ $schematic->name }}">
    @else
      <p class="empty">Pas d'apercu enregistre.</p>
    @endif
  </div>

  <div>
    <h1 class="title">{{ $schematic->name }}</h1>
    <p class="sub">
      par {{ $schematic->user->name }} &middot;
      {{ $schematic->width }}x{{ $schematic->height }} &middot;
      {{ $schematic->blocks }} blocs &middot;
      {{ $schematic->views }} vues
      @unless($schematic->verified)
        &middot; <span title="Chiffres calcules par le navigateur, pas encore rejoues
        sur un vrai serveur">chiffres non verifies</span>
      @endunless
    </p>

    @if($schematic->description)
      <p class="desc">{{ $schematic->description }}</p>
    @endif

    @if($power > 0.5 || $made->isNotEmpty())
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

    @if($schematic->needs)
      <div class="card"><h2>Il lui faut</h2>
        @foreach($schematic->needs as $item => $needRate)
          <div class="line"><span>{{ $item }}</span>
            <span class="num">{{ number_format($needRate, 0, ',', ' ') }} / min</span></div>
        @endforeach
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
