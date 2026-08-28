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

{{-- Qui produit : une seule commande, et c'est celle qui porte les images.

     Il y en avait deux, une rangee de pastilles et un deroulant, qui faisaient exactement la
     meme chose. Corentin : « tu remets produit quoi en doublon ». Le doublon existait pour
     une raison ecrite ici : un `<select>` natif ne porte pas d'image dans ses `<option>`, et
     le remplacer par une liste dessinee aurait coute la navigation au clavier, la fermeture
     par Echap, l'annonce au lecteur d'ecran et le selecteur natif du telephone.

     Ce qui a change, c'est que cette grille n'est pas une liste dessinee : ce sont des liens
     dans un `<details>`. Le clavier, le lecteur d'ecran et Echap viennent du navigateur, pas
     d'un script ; chaque choix a une adresse qui se partage et s'indexe ; et la page marche
     sans JavaScript. Il ne reste qu'une seule perte reelle, la recherche par frappe, sur une
     vingtaine d'entrees qui tiennent toutes a l'ecran.

     Le champ « qui contient » garde son `datalist`, lui, et pour la raison inverse : deux
     cents noms de blocs ne tiennent pas dans une grille, et la frappe y est le seul acces
     raisonnable. La frontiere passe entre vingt et deux cents, pas entre deux gouts. --}}
@if($items !== [])
  <details class="choisisseur">
    <summary>
      <span class="ch-quoi">Qui produit</span>
      @if($makes === '')
        <b>n'importe quoi</b>
      @else
        @if($makes !== $powerKey)
          <img class="icone" src="/icone/{{ \App\Support\Thing::family($makes) }}/{{ $makes }}.png?t=32"
               width="22" height="22" decoding="async" alt="">
        @endif
        <b>{{ $makes === $powerKey ? 'énergie' : \App\Support\Thing::name($makes) }}</b>
      @endif
      <span class="ch-changer">changer</span>
    </summary>

    <div class="ch-grille">
      <a class="ch-case ch-tout @if($makes === '') on @endif"
         href="{{ request()->fullUrlWithQuery(['produit' => null, 'min' => null, 'page' => null]) }}"
         @if($makes === '') aria-current="page" @endif>n'importe quoi</a>

      @foreach($items as $item)
        {{-- Le debit minimum part avec le produit : il est exprime dans l'unite de l'objet
             choisi, donc « au moins 1000 » garde pour du graphite un nombre qui parlait du
             silicium. Un chiffre juste a cote de sa question, en une seule seconde. --}}
        <a class="ch-case @if($makes === $item) on @endif"
           href="{{ request()->fullUrlWithQuery(['produit' => $item, 'min' => null, 'page' => null]) }}"
           @if($makes === $item) aria-current="page" @endif>
          @if($item !== $powerKey)
            {{-- L'energie n'est ni un objet ni un liquide : elle n'a pas de sprite, et lui en
                 inventer un serait dessiner quelque chose que le jeu ne dessine pas. --}}
            <img class="icone" src="/icone/{{ \App\Support\Thing::family($item) }}/{{ $item }}.png?t=32"
                 width="24" height="24" loading="lazy" decoding="async" alt="">
          @else
            <span class="ch-eclair" aria-hidden="true">&#9889;</span>
          @endif
          <span>{{ $item === $powerKey ? 'énergie' : \App\Support\Thing::name($item) }}</span>
        </a>
      @endforeach
    </div>
  </details>
@endif

{{-- Le classement, en onglets plutot que dans un deroulant.

     C'est la commande la plus structurante de la page et elle etait la seule qu'il fallait
     ouvrir pour savoir ce qu'elle offrait. Six liens montrent les six facons de classer sans
     un clic, et chacune garde son adresse.

     Les trois qui comparent des productions restent visibles sans objet choisi, marques
     plutot que caches : les enlever ferait disparaitre la raison pour laquelle ils manquent,
     et un lecteur ne peut pas demander ce qu'il ne voit pas. --}}
<nav class="tris" aria-label="Classer">
  @foreach($orders as $key => $label)
    @php $needsItem = in_array($key, ['best', 'dense', 'output'], true) && $makes === ''; @endphp
    <a class="tri @if($order === $key) on @endif @if($needsItem) gris @endif"
       href="{{ request()->fullUrlWithQuery(['tri' => $key, 'page' => null]) }}"
       @if($needsItem) title="{{ __('vitrine.contraintes.debit-sans-objet') }}" @endif
       @if($order === $key) aria-current="page" @endif>{{ $label }}</a>
  @endforeach
</nav>

<form method="get" class="card">
  {{-- Le produit et le classement sont choisis par des liens, au-dessus. Reportes ici pour
       qu'appliquer une contrainte ne les efface pas : un formulaire ne renvoie que ses
       propres champs, et une recherche qui perd la moitie de sa question en gagnant une
       contrainte est une page plausible et fausse. --}}
  <input type="hidden" name="produit" value="{{ $makes }}">
  <input type="hidden" name="tri" value="{{ $order }}">
  @if($creative)<input type="hidden" name="creatif" value="oui">@endif

  <div class="row" style="margin:0">
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

  {{-- Les contraintes, repliees mais jamais cachees : le panneau s'ouvre de lui-meme des
       qu'une contrainte est active, sinon un lecteur arrivant par un lien partage verrait
       une liste filtree sans voir par quoi. Un `<details>` plutot qu'un panneau en
       JavaScript : il s'ouvre, se ferme et s'annonce au lecteur d'ecran sans une ligne de
       script, et chaque combinaison garde une adresse qui se partage et s'indexe. --}}
  <details class="contraintes" @if($fitsWide || $fitsTall || $atLeast || $atMostBlocks || $selfPowered || $measured || $planet) open @endif>
    <summary>{{ __('vitrine.contraintes.titre') }}</summary>

    <div class="row">
      <label class="lead" for="large">{{ __('vitrine.contraintes.tient-dans') }}</label>
      {{-- `inputmode` plutot que `type=number` : les fleches et la molette d'un champ
           numerique modifient une recherche par accident, et le clavier du telephone est le
           meme dans les deux cas. --}}
      <input name="large" id="large" class="mini" inputmode="numeric" autocomplete="off"
             value="{{ $fitsWide ?: '' }}" placeholder="20">
      <span class="mini-x">&times;</span>
      <input name="haut" id="haut" class="mini" inputmode="numeric" autocomplete="off"
             value="{{ $fitsTall ?: '' }}" placeholder="15">
      <span class="hint-line" style="margin:0">{{ __('vitrine.contraintes.unite.tuiles') }}</span>

      <label class="lead" for="min" style="margin-left:10px">{{ __('vitrine.contraintes.au-moins') }}</label>
      <input name="min" id="min" class="mini2" inputmode="numeric" autocomplete="off"
             value="{{ $atLeast ? rtrim(rtrim(number_format($atLeast, 2, '.', ''), '0'), '.') : '' }}"
             placeholder="100">
      {{-- L'unite suit la chose et non la colonne : les objets sont par minute, l'energie
           par seconde. Sans objet choisi il n'y a pas d'unite a annoncer, et on n'en invente
           pas une. --}}
      <span class="hint-line" style="margin:0">
        @if($makes === '')
          {{ __('vitrine.contraintes.unite.par-minute') }}
        @elseif($makes === $powerKey)
          energie/s
        @else
          {{ \App\Support\Thing::name($makes) }}/min
        @endif
      </span>

      <label class="lead" for="blocs" style="margin-left:10px">{{ __('vitrine.contraintes.au-plus') }}</label>
      <input name="blocs" id="blocs" class="mini" inputmode="numeric" autocomplete="off"
             value="{{ $atMostBlocks ?: '' }}" placeholder="60">
      <span class="hint-line" style="margin:0">{{ __('vitrine.contraintes.unite.blocs') }}</span>
    </div>

    <div class="row">
      <label class="lead" for="planete">{{ __('vitrine.contraintes.planete') }}</label>
      <select name="planete" id="planete">
        <option value="">{{ __('vitrine.contraintes.planete-peu-importe') }}</option>
        @foreach($planets as $world)
          <option value="{{ $world }}" @selected($planet === $world)>{{ ucfirst($world) }}</option>
        @endforeach
      </select>

      <label class="coche"><input type="checkbox" name="autonome" value="oui"
        @checked($selfPowered)> {{ __('vitrine.contraintes.autonome') }}</label>
      <label class="coche"><input type="checkbox" name="verifie" value="oui"
        @checked($measured)> {{ __('vitrine.contraintes.verifie') }}</label>

      <button class="primary" type="submit">{{ __('vitrine.contraintes.chercher') }}</button>
    </div>

    @if($fitsWide || $fitsTall)
      <p class="hint-line">{{ __('vitrine.contraintes.sans-rotation') }}</p>
    @endif
    @if($atLeast && $makes === '')
      <p class="hint-line">{{ __('vitrine.contraintes.debit-sans-objet') }}</p>
    @endif
  </details>

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
      alimentés à fond, rapporté à leur taille. Un plafond et non un relevé&nbsp;: un
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
          {{-- Les dimensions, sans quoi un classement a la surface montrerait un debit
               plus faible au-dessus d'un plus fort sans rien pour l'expliquer.

               Tues quand elles valent zero plutot qu'affichees en « 0x0 » : une entree
               analysee par un moteur trop ancien n'a pas de largeur, et « 0x0 » se lit comme
               une mesure alors que c'est une absence. --}}
          @if($schematic->width > 0 && $schematic->height > 0)
            <strong>{{ $schematic->width }}&times;{{ $schematic->height }}</strong> &middot;
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
