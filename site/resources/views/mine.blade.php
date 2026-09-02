{{-- The signed-in member's own schematics, published and unpublished together. Route GET
     /mes-schemas (behind auth), fed by SchematicController::mine.

     Scope: schematics. --}}
@extends('layout')
@section('title', 'Mes schémas - Mindustry Forge')

@push('head')
  <script src="/forge/manage.js" type="module" defer></script>
  {{-- The drawer. `data-slug` is its contract and the management card no longer claims it:
       it announces itself with `data-schema` since the day this script ate the whole card
       on the schematic page. --}}
  <script src="/forge/apercu.js" type="module" defer></script>
@endpush

@section('body')
<h1 class="title">Mes schémas</h1>
<p class="sub">Tout ce que tu as gardé. Publie ce que tu veux montrer, garde le reste.</p>

@if($schematics->isEmpty())
  <div class="card">
    <p class="empty">Rien encore. Analyse un schéma et garde-le depuis la page
      d'analyse.</p>
    <p class="row"><a class="button primary" href="/">Analyser un schéma</a></p>
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
            {{-- Drawn in the browser from the schematic's own code, exactly as the catalogue
                 does it. A stored preview is written when somebody saves their own work from
                 the analyser; anything imported has none, and this page showed every one of
                 them as an empty black panel saying "pas d'aperçu" - on the page where a
                 member looks for their own schematics and recognises them by their shape.

                 Same cap as the catalogue: past 16 kB the tile carries its slug and fetches
                 its own code once it comes into view. --}}
            @if(strlen($schematic->code) <= 16384)
              <div class="noimg" data-code="{{ $schematic->code }}">pas d'aperçu</div>
            @else
              <div class="noimg" data-slug="{{ $schematic->slug }}">pas d'aperçu</div>
            @endif
          @endif
          <h3>{{ $schematic->displayName() }}</h3>
        </a>
        <p class="meta">
          {{ $schematic->blocks }} {{ trans_choice('schema.unite.bloc-compte', $schematic->blocks) }}
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
