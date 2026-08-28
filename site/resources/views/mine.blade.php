{{-- The signed-in member's own schematics, published and unpublished together. Route GET
     /mes-schemas (behind auth), fed by SchematicController::mine.

     Scope: schematics. --}}
@extends('layout')
@section('title', 'Mes schémas - Mindustry Forge')

@push('head')
  <script src="/forge/manage.js" type="module" defer></script>
@endpush

@section('body')
<h1 class="title">Mes schémas</h1>
<p class="sub">Tout ce que tu as garde. Publie ce que tu veux montrer, garde le reste.</p>

@if($schematics->isEmpty())
  <div class="card">
    <p class="empty">Rien encore. Analyse un schéma et garde-le depuis la page
      d'analyse.</p>
    <p class="row"><a class="button primary" href="/">Analyser un schéma</a></p>
  </div>
@else
  <div class="grid">
    @foreach($schematics as $schematic)
      <article class="tile" data-slug="{{ $schematic->slug }}">
        <a href="/s/{{ $schematic->slug }}">
          @php $preview = \Illuminate\Support\Facades\Storage::disk('public')
                 ->exists("apercus/{$schematic->slug}.png") @endphp
          @if($preview)
            <img src="{{ asset("storage/apercus/{$schematic->slug}.png") }}" alt="" loading="lazy">
          @else
            <div class="noimg">pas d'apercu</div>
          @endif
          <h3>{{ $schematic->displayName() }}</h3>
        </a>
        <p class="meta">
          {{ $schematic->blocks }} {{ __('schema.unite.blocs') }}
          @if($schematic->power_made > 0.5)
            &middot; @if($schematic->fedBySandbox()){{ __('schema.page.bac-a-sable-court') }}@else{{ number_format($schematic->power_made - $schematic->power_used, 0, ',', ' ') }} {{ __('schema.unite.energie-seconde') }}@endif
          @endif
          {{-- The count is read from the column the list already selects: not a
               `withCount`, which would make one query per tile. And no button here, the
               gesture belongs to the page where the schematic is really being looked
               at. --}}
          @if($schematic->likes > 0)
            &middot; {{ $schematic->likes }} {{ __('schema.unite.jaime') }}
          @endif
        </p>
        @include('partials.manage', ['compact' => true])
        <p class="meta"><a href="/?s={{ $schematic->slug }}">Modifier</a></p>
      </article>
    @endforeach
  </div>
  {{ $schematics->links() }}

@endif
@endsection
