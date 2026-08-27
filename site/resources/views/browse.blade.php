@extends('layout')
@section('title', 'Schematiques - Mindustry Forge')

@push('head')
  <script src="/forge/apercu.js" type="module" defer></script>
@endpush

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
        {{-- L'energie est une production comme une autre : chercher une schematique qui
             produit de l'energie, c'est chercher une centrale. --}}
        <option value="{{ $item }}" @selected($makes === $item)>{{
          $item === $powerKey ? 'energie' : $item }}</option>
      @endforeach
    </select>

    <label class="lead" for="tri" style="margin:0">Triees par</label>
    <select name="tri" id="tri">
      @foreach($orders as $key => $label)
        <option value="{{ $key }}" @selected($order === $key)>{{ $label }}</option>
      @endforeach
    </select>

    <label class="lead" for="bloc" style="margin:0">{{ __('vitrine.bloc.label') }}</label>
    <input name="bloc" id="bloc" list="blocs" value="{{ $holds }}"
           placeholder="{{ __('vitrine.bloc.exemple') }}" autocomplete="off">
    {{-- Les noms proposes viennent de ce que le catalogue contient vraiment, pas d'une
         liste tapee : un joueur choisit un nom qui existe au lieu de deviner comment il
         s'ecrit. Plafonne a deux cents, ce qui est dit dans le controleur plutot que
         laisse a decouvrir. --}}
    <datalist id="blocs">
      @foreach($blocks as $block)
        <option value="{{ $block }}"></option>
      @endforeach
    </datalist>

    <button class="primary" type="submit">Chercher</button>
  </div>

  @if($holds !== '')
    <p class="hint-line">{{ __('vitrine.bloc.filtrees') }}
      <strong>{{ $holds }}</strong>.
      <a href="{{ request()->fullUrlWithQuery(['bloc' => null]) }}">{{
        __('vitrine.bloc.enlever') }}</a></p>
  @elseif(request()->query('bloc'))
    {{-- Un nom qui n'est pas un bloc ne filtre rien, et le dire vaut mieux que rendre la
         liste entiere comme si de rien n'etait : une faute de frappe renverrait sinon une
         page plausible et fausse. --}}
    <p class="hint-line">{{ __('vitrine.bloc.inconnu') }}</p>
  @endif

  {{-- Sans item choisi, il n'y a rien contre quoi mesurer un rendement : classer
       quarante graphite/min devant vingt-cinq silicium/min reviendrait a decreter qu'un
       graphite vaut un silicium. Alors on ne le fait pas, on le dit, et on propose le
       seul geste qui rend le classement possible. --}}
  @if($makes === '')
    <p class="hint-line">Classees par date, faute de mieux. Choisis ce que tu cherches
      ci-dessus et le classement devient un vrai rendement&nbsp;: combien la schematique
      en sort, pour la place qu'elle prend.</p>
  @else
    <p class="hint-line">Classees sur ce qu'elles sortent en
      <strong>{{ $makes === $powerKey ? 'energie' : $makes }}</strong>, rapporte a leur
      taille. L'electricite qu'une schematique consomme ne la penalise pas&nbsp;: c'est un
      prerequis, indique sur sa page.</p>
  @endif

  {{-- Ce qui est mis a part, dit avec son compte et un lien pour le voir.

       Un catalogue qui annonce quinze mille schematiques et en sert quatorze mille sans un
       mot mentirait sur sa propre taille, ce qui est exactement la faute que ce depot a
       passe la journee a fermer. Le compte est donc affiche, et le lien defait le filtre :
       un lecteur peut etre en desaccord avec la regle et la contourner en un clic. --}}
  @if($creative)
    <p class="hint-line">{{ __('vitrine.creatif.affichees') }}
      <a href="{{ request()->fullUrlWithQuery(['creatif' => null]) }}">{{
        __('vitrine.creatif.remettre') }}</a></p>
  @elseif($setAside > 0)
    {{-- Le singulier a sa propre cle plutot qu'un « (s) ». Le compte reste hors de la
         chaine traduite : une cle manquante rendrait la cle sans substituer, et le nombre
         disparaitrait de la seule phrase qui existe pour le donner. --}}
    <p class="hint-line">{{ $setAside }} {{ __($setAside === 1
      ? 'vitrine.creatif.mise-a-part' : 'vitrine.creatif.mises-a-part') }}
      <a href="{{ request()->fullUrlWithQuery(['creatif' => 'oui']) }}">{{
        __('vitrine.creatif.montrer') }}</a></p>
  @endif
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
            {{-- Drawn in the browser from the schematic's own code. Nothing imported has a
                 stored preview, so this list was a grid of grey rectangles; a thumbnail
                 costs 3 ms once the sprite sheet is in cache, measured on eight of them.

                 Carrying the codes costs 44 kB on a page of 24, measured on the live
                 catalogue: a median of 1 kB and a largest of 8.7 kB. The cap is there for
                 the shape the column allows rather than for the shapes it holds, since a
                 single 512 kB schematic would otherwise arrive in a list nobody asked it
                 from. Past the cap the tile says what it always said. --}}
            @if(strlen($schematic->code) <= 16384)
              <div class="noimg" data-code="{{ $schematic->code }}">pas d'apercu</div>
            @else
              {{-- Past the cap the code is fetched instead of carried, and only once the
                   tile comes into view. The bound is what protects a list that asked for
                   none of this; a hole in the grid is not the price of keeping it. --}}
              <div class="noimg" data-slug="{{ $schematic->slug }}">pas d'apercu</div>
            @endif
          @endif
          <h3>{{ $schematic->displayName() }}</h3>
        </a>
        <p class="meta">
          {{-- Un robinet de bac a sable se dit ici aussi. Une vignette qui annonce
               999 971 energie/s est la meme phrase fausse que la page, en plus court et
               vue par plus de monde. --}}
          @if($schematic->creative())
            <span class="warn">{{ __('vitrine.creatif.etiquette') }}</span> &middot;
          @endif
          @if($schematic->fedBySandbox())
            <span class="warn">{{ __('schema.page.bac-a-sable-court') }}</span> &middot;
          @else
            @if($power > 0.5)
              <span class="good">{{ number_format($power, 0, ',', ' ') }} energie/s</span>
              <span class="hint-line">{{ __('schema.page.au-mieux') }}</span> &middot;
            @endif
            @foreach(array_slice($schematic->produces ?? [], 0, 2, true) as $item => $itemRate)
              {{ number_format($itemRate, 0, ',', ' ') }} {{ $item }}/min &middot;
            @endforeach
          @endif
          {{ $schematic->blocks }} blocs &middot; {{ $schematic->credit() }}
          {{-- Said in the list too, not only on the page. Somebody scrolling a hundred
               tiles should be able to tell what this site collected from what its members
               made, without opening anything. --}}
          @if($schematic->imported())
            &middot; <span class="from"
              title="Importee depuis {{ $schematic->sourceName() ?? $schematic->source }},
              non relue">importee</span>
          @endif
        </p>
      </article>
    @endforeach
  </div>
  {{ $schematics->links() }}
@endif
@endsection
