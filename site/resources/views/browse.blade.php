@extends('layout')
@section('title', 'Schémas - Mindustry Forge')

@push('head')
  <script src="/forge/apercu.js" type="module" defer></script>
@endpush

@section('body')
<h1 class="title">Schémas</h1>
{{-- Le sous-titre a promis pendant des heures ce que la page ne tient pas. « Chaque
     chiffre vient de l'analyse » restait vrai et laissait croire a un releve, au-dessus de
     vingt-quatre tuiles qui portent toutes « au mieux ». Un plafond ne s'affiche jamais
     sans dire qu'il en est un, et cette regle vaut pour la phrase qui coiffe la liste
     autant que pour la ligne d'une tuile. --}}
<p class="sub">Chaque chiffre vient de l'analyse du schéma lui-meme, pas d'une
  etiquette tapee a la main. Ce sont des plafonds : ce que le plan sortirait alimente a
  fond, et non ce qu'il a ete mesure faisant.</p>

{{-- Les objets les plus produits, en images.

     Corentin : « dans les deroulements c'est pas intuitif, il n'y a pas les icones ». Il a
     raison, et un `<select>` natif ne porte pas d'image dans ses `<option>` : c'est une
     limite du controle, pas un oubli.

     Le remplacer par une liste dessinee aurait coute la navigation au clavier, la recherche
     par frappe, la fermeture par Echap, l'annonce au lecteur d'ecran et le selecteur natif du
     telephone, le tout sur le controle de recherche principal du site. Le compte ne tombait
     pas juste.

     Cette rangee donne les images sans rien retirer. Ce sont des liens : clavier et lecteur
     d'ecran gratuits, chaque filtre a une adresse qui se partage et s'indexe, et la page
     marche sans JavaScript. Le deroulant reste dessous pour tout ce qui n'est pas dans les
     plus produits. --}}
@if($items !== [])
  <nav class="vitrine-pastilles" aria-label="Qui produit">
    <a href="{{ request()->fullUrlWithQuery(['produit' => null, 'page' => null]) }}"
       class="vitrine-pastille @if($makes === '') on @endif"
       @if($makes === '') aria-current="page" @endif>n'importe quoi</a>

    @foreach($items as $item)
      <a href="{{ request()->fullUrlWithQuery(['produit' => $item, 'page' => null]) }}"
         class="vitrine-pastille @if($makes === $item) on @endif"
         @if($makes === $item) aria-current="page" @endif>
        @if($item !== $powerKey)
          {{-- L'energie n'est ni un objet ni un liquide : elle n'a pas de sprite, et lui en
               inventer un serait dessiner quelque chose que le jeu ne dessine pas. --}}
          <img class="icone" src="/icone/{{ \App\Support\Thing::family($item) }}/{{ $item }}.png?t=32"
               width="18" height="18" loading="lazy" decoding="async" alt="">
        @endif
        {{ $item === $powerKey ? 'energie' : \App\Support\Thing::name($item) }}
      </a>
    @endforeach
  </nav>
@endif

<form method="get" class="card">
  <div class="row" style="margin:0">
    <label class="lead" for="produit" style="margin:0">Qui produit</label>
    <select name="produit" id="produit">
      <option value="">n'importe quoi</option>
      @foreach($items as $item)
        {{-- L'energie est une production comme une autre : chercher un schéma qui
             produit de l'energie, c'est chercher une centrale.

             Le nom vient du jeu et non de l'identifiant : ce deroulant affichait
             `blast-compound` et `phase-fabric` a un joueur francophone. --}}
        <option value="{{ $item }}" @selected($makes === $item)>{{
          $item === $powerKey ? 'energie' : \App\Support\Thing::name($item) }}</option>
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
    <p class="hint-line">Classés par date, faute de mieux. Choisis ce que tu cherches
      ci-dessus et le classement devient un vrai rendement&nbsp;: combien le schéma
      en sort, pour la place qu'il prend.</p>
  @else
    {{-- La nature du chiffre est dite avec le chiffre, jamais apres. C'est la condition a
         laquelle la vitrine a le droit de chercher sur des plafonds : les nommer n'est pas
         les melanger a des mesures. --}}
    <p class="hint-line">Classés sur ce qu'ils pourraient sortir en
      <strong>{{ $makes === $powerKey ? 'energie' : \App\Support\Thing::name($makes) }}</strong>,
      alimentés a fond, rapporte a leur taille. Un plafond et non un releve&nbsp;: un
      schéma arraché d'une base n'a pas la foreuse qui l'alimentait, donc ce qu'il
      fait vraiment depend de la votre. L'electricite qu'il consomme ne le penalise
      pas&nbsp;: c'est un prerequis, indique sur sa page.</p>
  @endif

  {{-- Ce qui est mis a part, dit avec son compte et un lien pour le voir.

       Un catalogue qui annonce quinze mille schémas et en sert quatorze mille sans un
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
    <p class="empty">Rien de publie qui corresponde. Analyse un schéma et publie-le.</p>
    <p class="row"><a class="button primary" href="/">Analyser un schéma</a></p>
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
            {{-- Le plafond, parce que c'est sur lui que la page classe : montrer la mesure
                 sous un classement fait sur autre chose ferait dire a la tuile autre chose
                 que la liste qui l'a rangee. Et il est nomme comme tel, chaque fois. --}}
            {{-- L'unite suit la chose et non la colonne. `schematic_items.rate` en porte deux
                 sans que son nom le dise : les objets y sont par minute, l'energie par
                 seconde. Ecrire « 60 energie/min » etait la faute exacte contre laquelle une
                 autre voie venait de me mettre en garde, et je l'ai faite quand meme. --}}
            @foreach(array_slice($schematic->chiffresMontres(), 0, 2, true) as $item => $chiffre)
              {{ number_format($chiffre['rate'], 0, ',', ' ') }}
              {{ $item === $powerKey
                  ? 'energie/s'
                  : \App\Support\Thing::name($item).'/min' }}
              {{-- Chacune des deux grandeurs se nomme. Laisser la mesure muette la ferait
                   lire comme le plafond de la tuile d'a cote, sur une page qui classe sur
                   les plafonds. --}}
              <span class="hint-line">{{ $chiffre['kind'] === \App\Models\SchematicItem::PLAFOND
                  ? __('schema.page.au-mieux')
                  : __('schema.page.mesuree') }}</span>
              &middot;
            @endforeach
          @endif
          {{ $schematic->blocks }} blocs &middot; {{ $schematic->credit() }}
          {{-- Said in the list too, not only on the page. Somebody scrolling a hundred
               tiles should be able to tell what this site collected from what its members
               made, without opening anything. --}}
          @if($schematic->imported())
            &middot; <span class="from"
              title="Importé depuis {{ $schematic->sourceName() ?? $schematic->source }},
              non relu">importé</span>
          @endif
        </p>
      </article>
    @endforeach
  </div>
  {{ $schematics->links() }}
@endif
@endsection
