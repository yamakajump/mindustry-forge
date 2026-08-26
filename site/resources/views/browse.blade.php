@extends('layout')
@section('title', 'Schematiques - Mindustry Forge')

@section('body')
<h1 class="title">Schematiques</h1>
<p class="sub">Chaque chiffre vient de l'analyse de la schematique elle-meme, pas d'une
  etiquette tapee a la main.</p>

<form method="get" class="card">
  <div class="row" style="margin:0">
    <label class="lead" for="produit" style="margin:0">Qui produit</label>
    <select name="produit" id="produit">
      <option value="">n'importe quoi</option>
      @foreach($items as $item)
        <option value="{{ $item }}" @selected($makes === $item)>{{ $item }}</option>
      @endforeach
    </select>

    <label class="lead" for="tri" style="margin:0">Triees par</label>
    <select name="tri" id="tri">
      @foreach($orders as $key => $label)
        <option value="{{ $key }}" @selected($order === $key)>{{ $label }}</option>
      @endforeach
    </select>

    <button class="primary" type="submit">Chercher</button>
  </div>
</form>

@if($schematics->isEmpty())
  <div class="card">
    <p class="empty">Rien de publie qui corresponde. Analyse une schematique et publie-la.</p>
    <p class="row"><a class="button primary" href="/">Analyser une schematique</a></p>
  </div>
@else
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
            <div class="noimg">pas d'apercu</div>
          @endif
          <h3>{{ $schematic->name }}</h3>
        </a>
        <p class="meta">
          @if($power > 0.5)
            <span class="good">{{ number_format($power, 0, ',', ' ') }} energie/s</span> &middot;
          @endif
          @foreach(array_slice($schematic->produces ?? [], 0, 2, true) as $item => $itemRate)
            {{ number_format($itemRate, 0, ',', ' ') }} {{ $item }}/min &middot;
          @endforeach
          {{ $schematic->blocks }} blocs &middot; {{ $schematic->user->name }}
        </p>
      </article>
    @endforeach
  </div>
  {{ $schematics->links() }}
@endif
@endsection
