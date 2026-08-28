@extends('layout')

@section('title', $folder->name.' - Mindustry Forge')
@section('og-title', $folder->name)
@section('og-description', $folder->description ?: $folder->name)

@section('body')
<main>
  @if($ancestors !== [])
    <nav class="fil" aria-label="{{ __('dossiers.page.les-miens') }}">
      @foreach($ancestors as $up)
        <a href="/d/{{ $up->slug }}">{{ $up->name }}</a> /
      @endforeach
    </nav>
  @endif

  <h1 class="title">
    @if($folder->icon)
      <img src="/icone/{{ $folder->icon }}.png?t=32" alt="" width="32" height="32">
    @endif
    {{ $folder->name }}
  </h1>

  @if($folder->description)
    <p class="sub">{{ $folder->description }}</p>
  @endif

  @if($children->isNotEmpty())
    <h2>{{ __('dossiers.page.sous-dossiers') }}</h2>
    <div class="dossiers">
      @foreach($children as $child)
        <article class="dossier">
          <a href="/d/{{ $child->slug }}">
            @if($child->icon)
              <img src="/icone/{{ $child->icon }}.png?t=32" alt="" width="32" height="32">
            @endif
            <h3>{{ $child->name }}</h3>
          </a>
          <p class="meta">{{ $child->schematics_count }} {{ __('dossiers.unite.schemas') }}</p>
        </article>
      @endforeach
    </div>
  @endif

  <h2>{{ __('dossiers.page.contenu') }}</h2>

  {{-- Deux phrases pour deux questions. A un visiteur : ce que la page ne montre pas. Au
       proprietaire : que ce qu'il a partage est en partie invisible, ce qu'il ne peut
       apprendre nulle part ailleurs. Sans ca, un dossier de douze se lit comme un dossier
       de quatre et personne ne sait pourquoi. --}}
  @if($withheld > 0)
    <p class="hint-line">
      {{ $withheld }}
      {{ __('dossiers.unite.schemas') }}
      {{ $mine ? __('dossiers.page.retires-proprietaire') : __('dossiers.page.retires-visiteur') }}
    </p>
  @endif

  @if($schematics->isEmpty())
    <p class="hint-line">{{ __('dossiers.page.rien-dedans') }}</p>
  @else
    <div class="tiles">
      @foreach($schematics as $schematic)
        <article class="tile">
          <a href="/s/{{ $schematic->slug }}"><h3>{{ $schematic->displayName() }}</h3></a>
          <p class="meta">
            {{ $schematic->blocks }} blocs
            @if($schematic->likes > 0)
              &middot; {{ $schematic->likes }} {{ __('schema.unite.jaime') }}
            @endif
          </p>
          @if($schematic->pivot->note)
            {{-- Avec {{ }} et jamais {!! !!} : c'est le seul endroit de ce chantier ou du
                 contenu ecrit par quelqu'un est montre a quelqu'un d'autre. --}}
            <p class="legende">{{ $schematic->pivot->note }}</p>
          @endif
          @if($mine)
            <button type="button" class="link" data-legender
                    data-dossier="{{ $folder->slug }}"
                    data-schema="{{ $schematic->slug }}"
                    data-note="{{ $schematic->pivot->note }}">{{ __('dossiers.gestion.legender') }}</button>
            <button type="button" class="link" data-retirer
                    data-dossier="{{ $folder->slug }}"
                    data-schema="{{ $schematic->slug }}">{{ __('dossiers.gestion.retirer-dici') }}</button>
          @endif
        </article>
      @endforeach
    </div>

    @include('partials.pages', ['paginator' => $schematics])
  @endif
</main>
@endsection
