@extends('layout')
@section('title', 'Mes schematiques - Mindustry Forge')

@section('body')
<h1 class="title">Mes schematiques</h1>
<p class="sub">Tout ce que tu as garde. Publie ce que tu veux montrer, garde le reste.</p>

@if($schematics->isEmpty())
  <div class="card">
    <p class="empty">Rien encore. Analyse une schematique et garde-la depuis la page
      d'analyse.</p>
    <p class="row"><a class="button primary" href="/">Analyser une schematique</a></p>
  </div>
@else
  <div class="grid">
    @foreach($schematics as $schematic)
      <article class="tile">
        <a href="/s/{{ $schematic->slug }}">
          @php $preview = \Illuminate\Support\Facades\Storage::disk('public')
                 ->exists("apercus/{$schematic->slug}.png") @endphp
          @if($preview)
            <img src="{{ asset("storage/apercus/{$schematic->slug}.png") }}" alt="" loading="lazy">
          @else
            <div class="noimg">pas d'apercu</div>
          @endif
          <h3>{{ $schematic->name }}</h3>
        </a>
        <p class="meta">
          {{ $schematic->blocks }} blocs
          @if($schematic->power_made > 0.5)
            &middot; {{ number_format($schematic->power_made - $schematic->power_used, 0, ',', ' ') }} energie/s
          @endif
          &middot; {{ $schematic->public ? 'publique' : 'privee' }}
        </p>
      </article>
    @endforeach
  </div>
  {{ $schematics->links() }}
@endif
@endsection
