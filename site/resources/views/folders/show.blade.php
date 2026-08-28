{{-- One folder's page, public or private depending on who is looking. Route GET
     /d/{folder}, fed by FolderController::show.

     Scope: folder, mine, ancestors, children, schematics, withheld, aime. --}}
@extends('layout')

@section('title', $folder->name.' - Mindustry Forge')
@section('og-title', $folder->name)
@section('og-description', $folder->description ?: $folder->name)

@push('head')
  @auth
    <script src="/forge/keep.js" type="module" defer></script>
    <script src="/forge/dossiers.js" type="module" defer></script>
  @endauth
@endpush

@section('body')
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

  @if($folder->visibility !== 'private')
    <div class="keep" data-kind="dossier" data-dossier="{{ $folder->slug }}">
      @auth
        <button type="button" data-aime aria-pressed="{{ $aime ? 'true' : 'false' }}">
          <span class="mot">{{ __($aime ? 'schema.aime.retirer' : 'schema.aime.bouton') }}</span>
        </button>
      @else
        <a class="bouton" href="/auth/discord">{{ __('schema.aime.bouton') }}</a>
      @endauth
      <span class="compte"{{ $folder->likes > 0 ? '' : ' hidden' }}>{{ $folder->likes }} {{ __('schema.unite.jaime') }}</span>
    </div>
  @endif

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
          <p class="meta">{{ $child->schematics_count }} {{ trans_choice('dossiers.unite.schemas', $child->schematics_count) }}</p>
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
      {{ trans_choice('dossiers.unite.schemas', $withheld) }}
      {{ trans_choice($mine ? 'dossiers.page.retires-proprietaire' : 'dossiers.page.retires-visiteur', $withheld) }}
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
            {{-- Separes : colles, les deux libelles se lisaient comme une seule phrase,
                 « Dire pourquoi il est la Retirer de ce dossier ». Ca ne se voit que sur
                 la page. --}}
            <p class="row-end">
            <button type="button" class="link" data-legender
                    data-dossier="{{ $folder->slug }}"
                    data-schema="{{ $schematic->slug }}"
                    data-note="{{ $schematic->pivot->note }}">{{ __('dossiers.gestion.legender') }}</button>
            &middot;
            <button type="button" class="link" data-retirer
                    data-dossier="{{ $folder->slug }}"
                    data-schema="{{ $schematic->slug }}">{{ __('dossiers.gestion.retirer-dici') }}</button>
            </p>
          @endif
        </article>
      @endforeach
    </div>

    {{ $schematics->links() }}
  @endif
@endsection
