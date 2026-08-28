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
@if($order === 'declare')
  <p class="sub">Chaque chiffre vient de l'analyse du schéma lui-meme, pas d'une
    etiquette tapee a la main. Ici ce sont des débits déclarés : ce que le plan fait
    branché comme un joueur l'a marqué, et non ce qu'il ferait alimenté à fond.</p>
@else
  <p class="sub">Chaque chiffre vient de l'analyse du schéma lui-meme, pas d'une
    etiquette tapee a la main. Ce sont des plafonds : ce que le plan sortirait alimente a
    fond, et non ce qu'il a ete mesure faisant.</p>
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

{{-- Ce que la recherche porte, et de quoi le retirer d'un clic.

     Une page ouverte depuis un lien partage applique des contraintes que son lecteur n'a pas
     posees, dans un panneau qui est replie. Sans ces puces, savoir pourquoi la liste est
     courte demande d'ouvrir le panneau et de lire six champs. --}}
@if($chips !== [])
  <div class="puces">
    <span class="puces-t">{{ __('vitrine.puces.titre') }}</span>
    @foreach($chips as $chip)
      <a class="puce" href="{{ request()->fullUrlWithQuery($chip['clear'] + ['page' => null]) }}"
         title="{{ __('vitrine.puces.retirer') }}">{{ $chip['label'] }} <b>&times;</b></a>
    @endforeach
    <a class="puce vide" href="{{ request()->fullUrlWithQuery([
        'large' => null, 'haut' => null, 'min' => null, 'blocs' => null,
        'planete' => null, 'autonome' => null, 'verifie' => null, 'bloc' => null,
        'page' => null]) }}">{{ __('vitrine.puces.tout-effacer') }}</a>
  </div>
@endif

<form method="get" class="card">
  {{-- Le produit et le classement sont choisis par des liens, au-dessus. Reportes ici pour
       qu'appliquer une contrainte ne les efface pas : un formulaire ne renvoie que ses
       propres champs, et une recherche qui perd la moitie de sa question en gagnant une
       contrainte est une page plausible et fausse. --}}
  <input type="hidden" name="produit" value="{{ $makes }}">
  <input type="hidden" name="tri" value="{{ $order }}">
  @if($creative)<input type="hidden" name="creatif" value="oui">@endif

  {{-- La recherche est une phrase, pas un formulaire.

       Ce que ce depot promet en premiere ligne est « cent graphite par minute sous trente
       blocs ». Une suite d'etiquettes et de champs dit la meme chose et ne se lit pas : il
       faut assembler soi-meme ce que la phrase donne d'un coup. Les quatre propositions qui
       comptent sont donc ecrites en toutes lettres, avec leurs champs dedans, et le reste se
       replie dessous.

       Le choisisseur de produit est une grille de liens, donc il vit hors du formulaire au
       sens des donnees : c'est le champ cache ci-dessus qui le renvoie quand on applique une
       contrainte. --}}
  <p class="phrase">
    {{ __('vitrine.phrase.je-cherche') }}
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
    @endif<span class="ph-virgule">,</span>
    <span class="ph-suite">{{ __('vitrine.phrase.au-moins') }}</span>
    <span class="champ"><input name="min" id="min" inputmode="numeric" autocomplete="off"
      value="{{ $atLeast ? rtrim(rtrim(number_format($atLeast, 2, '.', ''), '0'), '.') : '' }}"
      placeholder="100" aria-label="{{ __('vitrine.contraintes.au-moins') }}"></span>
    {{-- L'unite suit la chose et non la colonne : les objets sont par minute, l'energie par
         seconde. Sans objet choisi il n'y a pas d'unite a annoncer, et on n'en invente pas. --}}
    <span class="ph-unite">
      @if($makes === '')
        {{ __('vitrine.contraintes.unite.par-minute') }}
      @elseif($makes === $powerKey)
        {{ __('vitrine.note.energie-seconde') }}
      @else
        {{ \App\Support\Thing::name($makes) }}/min
      @endif
    </span><span class="ph-virgule">,</span>
    <span class="ph-suite">{{ __('vitrine.phrase.qui-tient-dans') }}</span>
    <span class="champ court"><input name="large" id="large" inputmode="numeric"
      autocomplete="off" value="{{ $fitsWide ?: '' }}" placeholder="20"
      aria-label="{{ __('vitrine.contraintes.tient-dans') }}"></span>
    <span class="ph-x">&times;</span>
    <span class="champ court"><input name="haut" id="haut" inputmode="numeric"
      autocomplete="off" value="{{ $fitsTall ?: '' }}" placeholder="15"
      aria-label="{{ __('vitrine.contraintes.tient-dans') }}"></span>
    <span class="ph-unite">{{ __('vitrine.contraintes.unite.tuiles') }}</span><span class="ph-virgule">,</span>
    <span class="ph-suite">{{ __('vitrine.phrase.sur') }}</span>
    <span class="champ"><select name="planete" id="planete"
      aria-label="{{ __('vitrine.contraintes.planete') }}">
      <option value="">{{ __('vitrine.contraintes.planete-peu-importe') }}</option>
      @foreach($planets as $world)
        <option value="{{ $world }}" @selected($planet === $world)>{{ ucfirst($world) }}</option>
      @endforeach
    </select></span><span class="ph-point">.</span>

    <button class="primary" type="submit">{{ __('vitrine.contraintes.chercher') }}</button>
  </p>

  {{-- Les contraintes, repliees mais jamais cachees : le panneau s'ouvre de lui-meme des
       qu'une contrainte est active, sinon un lecteur arrivant par un lien partage verrait
       une liste filtree sans voir par quoi. Un `<details>` plutot qu'un panneau en
       JavaScript : il s'ouvre, se ferme et s'annonce au lecteur d'ecran sans une ligne de
       script, et chaque combinaison garde une adresse qui se partage et s'indexe. --}}
  <details class="contraintes" @if($fitsWide || $fitsTall || $atLeast || $atMostBlocks || $selfPowered || $measured || $planet) open @endif>
    <summary>{{ __('vitrine.contraintes.titre') }}</summary>

    <div class="row">
      <label class="lead" for="bloc">{{ __('vitrine.bloc.label') }}</label>
      {{-- Un `datalist` et non une grille d'images, a l'inverse du produit : deux cents noms
           de blocs ne tiennent pas dans une grille, et la frappe y est le seul acces
           raisonnable. La frontiere passe entre vingt et deux cents. --}}
      <input name="bloc" id="bloc" list="blocs" value="{{ $holds }}"
             placeholder="{{ __('vitrine.bloc.exemple') }}" autocomplete="off">
      <datalist id="blocs">
        @foreach($blocks as $block)
          <option value="{{ $block }}"></option>
        @endforeach
      </datalist>

      <label class="lead" for="blocs" style="margin-left:10px">{{ __('vitrine.contraintes.au-plus') }}</label>
      <input name="blocs" id="blocs" class="mini" inputmode="numeric" autocomplete="off"
             value="{{ $atMostBlocks ?: '' }}" placeholder="60">
      <span class="hint-line" style="margin:0">{{ __('vitrine.contraintes.unite.blocs') }}</span>
    </div>

    <div class="row">
      {{-- Ce qu'il faut lui amener, l'autre sens de la question du site.

           Un `<select>` ici et une grille d'images pour « qui produit » : la difference n'est
           pas un oubli. Le produit est la question principale de la page et se choisit avant
           tout le reste ; celle-ci est une contrainte de second rang, dans un panneau replie,
           et un deroulant natif y garde la frappe au clavier et le selecteur du telephone
           pour un cout d'ecran nul. --}}
      <label class="lead" for="consomme">{{ __('vitrine.contraintes.consomme') }}</label>
      <select name="consomme" id="consomme">
        <option value="">{{ __('vitrine.contraintes.consomme-rien') }}</option>
        @foreach($eatsOnOffer as $need)
          <option value="{{ $need }}" @selected($eats === $need)>{{
            \App\Support\Thing::name($need) }}</option>
        @endforeach
      </select>

      <label class="coche"><input type="checkbox" name="autonome" value="oui"
        @checked($selfPowered)> {{ __('vitrine.contraintes.autonome') }}</label>
      <label class="coche"><input type="checkbox" name="verifie" value="oui"
        @checked($measured)> {{ __('vitrine.contraintes.verifie') }}</label>

    </div>

    {{-- Ce qui est a moi, offert aux seuls connectes : un filtre qui rend toujours vide
         est pire qu'un filtre absent.

         Trois cases dans le meme panneau que le reste, et c'est tout l'interet : « mes
         favoris qui tiennent dans 12x12 et sortent du silicium » est une recherche comme
         une autre. Une page de favoris a part n'aurait su filtrer sur rien. --}}
    @if($signedIn)
      <div class="row">
        <span class="lead">{{ __('vitrine.a-moi.titre') }}</span>
        <label class="coche"><input type="checkbox" name="favoris" value="oui"
          @checked($favorites)> {{ __('vitrine.a-moi.favoris') }}</label>
        <label class="coche"><input type="checkbox" name="aimes" value="oui"
          @checked($liked)> {{ __('vitrine.a-moi.aimes') }}</label>
        <label class="coche"><input type="checkbox" name="miens" value="oui"
          @checked($mine)> {{ __('vitrine.a-moi.miens') }}</label>
      </div>
      @if($favorites || $liked || $mine)
        {{-- Dit, et pas seulement fait : sans cette phrase, un joueur qui retrouve dans ses
             favoris un plan de bac a sable croirait que le filtre du catalogue est casse. --}}
        <p class="hint-line">{{ __('vitrine.a-moi.tout-garde') }}</p>
      @endif
    @endif

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
    @if($order === 'declare')
      {{-- La meme regle sous l'autre tri. Laisser la phrase des plafonds coiffer une liste
           classee sur des debits declares serait la faute exacte que la phrase existe pour
           empecher : un texte juste, au-dessus de chiffres qui repondent a autre chose. --}}
      <p class="hint-line">Classés sur ce qu'ils sortent en
        <strong>{{ $makes === $powerKey ? 'energie' : \App\Support\Thing::name($makes) }}</strong>
        branchés comme un joueur les a marqués. Un débit déclaré et non une mesure&nbsp;: le
        calcul est exact, le branchement est la parole de celui qui l'a marqué, et son nom
        est sur la fiche.</p>
    @else
    <p class="hint-line">Classés sur ce qu'ils pourraient sortir en
      <strong>{{ $makes === $powerKey ? 'energie' : \App\Support\Thing::name($makes) }}</strong>,
      alimentés à fond, rapporté à leur taille. Un plafond et non un relevé&nbsp;: un
      schéma arraché d'une base n'a pas la foreuse qui l'alimentait, donc ce qu'il
      fait vraiment depend de la votre. L'electricite qu'il consomme ne le penalise
      pas&nbsp;: c'est un prerequis, indique sur sa page.</p>
    @endif
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
  {{-- Lequel gagne sur quoi, avant la grille.

       Une liste qui se contente de classer laisse toute la comparaison au lecteur. Quatre
       questions plutot qu'une, parce que « le meilleur » n'en est pas une : celui qui a un
       trou dans sa base, celui qui compte son cuivre et celui qui veut du debit brut ne
       demandent pas la meme chose, et un seul classement ne peut pas repondre aux trois.
       Qu'un meme schema en gagne deux est une reponse, pas un defaut. --}}
  {{-- Ce qui est retenu pour la comparaison, dit et annulable.

       Sans cette phrase, un lecteur revenu sur la page par un lien partage verrait chaque
       tuile proposer « celui-ci » sans savoir contre quoi. --}}
  @if($held !== null)
    <p class="compare-en-cours">
      {{ __('vitrine.comparer.retenu') }}
      <strong>{{ $held->displayName() }}</strong>.
      {{ __('vitrine.comparer.choisis-le-second') }}
      <a href="{{ request()->fullUrlWithQuery(['comparer' => null]) }}">{{
        __('vitrine.comparer.annuler') }}</a>
    </p>
  @endif

  @if($winners !== [])
    <div class="verdicts">
      @foreach($winners as $win)
        <div class="verdict">
          <span class="v-question">{{ $win['question'] }}</span>
          <a class="v-nom" href="/s/{{ $win['schematic']->slug }}">{{
            $win['schematic']->displayName() }}</a>
          <span class="v-chiffre">{{ $win['figure'] }}</span>
        </div>
      @endforeach
    </div>
  @endif

  @php
    // L'echelle est celle de la page, pas celle de la tuile : deux silhouettes ne se
    // comparent que si elles partagent leur facteur. Le plus grand cote affiche vaut 26 px.
    $widest = max(1, $schematics->max(fn ($s) => max($s->width, $s->height)) ?? 1);
    $scale = 26 / $widest;
  @endphp
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
            @php $montre = $order === 'declare'
       ? \App\Models\SchematicItem::DECLARE
       : \App\Models\SchematicItem::PLAFOND; @endphp
            @foreach(array_slice($schematic->chiffresMontres($montre), 0, 2, true) as $item => $chiffre)
              {{ number_format($chiffre['rate'], 0, ',', ' ') }}
              {{ $item === $powerKey
                  ? 'energie/s'
                  : \App\Support\Thing::name($item).'/min' }}
              {{-- Chacune des deux grandeurs se nomme. Laisser la mesure muette la ferait
                   lire comme le plafond de la tuile d'a cote, sur une page qui classe sur
                   les plafonds. --}}
              <span class="hint-line">{{ match($chiffre['kind']) {
                  \App\Models\SchematicItem::PLAFOND => __('schema.page.au-mieux'),
                  \App\Models\SchematicItem::DECLARE => __('schema.page.declaree'),
                  default => __('schema.page.mesuree'),
              } }}</span>
              &middot;
            @endforeach
          @endif
          {{-- Les dimensions, sans quoi un classement a la surface montrerait un debit
               plus faible au-dessus d'un plus fort sans rien pour l'expliquer.

               Tues quand elles valent zero plutot qu'affichees en « 0x0 » : une entree
               analysee par un moteur trop ancien n'a pas de largeur, et « 0x0 » se lit comme
               une mesure alors que c'est une absence. --}}
          @if($schematic->width > 0 && $schematic->height > 0)
            {{-- L'encombrement dessine a cote de son chiffre, a une echelle commune a la
                 page : deux plans se comparent alors a l'oeil, ce qu'un couple de nombres ne
                 permet pas. Le rapport est respecte au pixel pres, largeur et hauteur
                 multipliees par le meme facteur : un rectangle dessine en carre serait un
                 dessin qui contredit le nombre pose juste a cote. --}}
            {{-- Le dessin et son chiffre dans une seule boite insecable.

                 Separes, la ligne se coupait entre les deux : le rectangle finissait colle au
                 debit de la ligne du dessus et le « 14x7 » partait a la suivante. Un dessin
                 juste, pose a cote d'un autre nombre que le sien, ce qui est la faute de ce
                 depot dans sa version graphique. --}}
            <span class="taille">
              <span class="silh" aria-hidden="true"><span class="silh-r" style="width:{{
                round($schematic->width * $scale, 1) }}px;height:{{
                round($schematic->height * $scale, 1) }}px"></span></span>
              <strong>{{ $schematic->width }}&times;{{ $schematic->height }}</strong>
            </span> &middot;
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
        {{-- La conclusion et le nombre qui la fonde, toujours colles. Jamais « celui-ci est
             bien », toujours « le plus rentable a la surface, 2,3 fois la mediane de cette
             liste » : un lecteur peut etre en desaccord avec le second, ce qui est la seule
             facon honnete d'ecrire le premier. --}}
        {{-- Le premier clic retient, le second compare. Un lien et non une case : une case
             sans script ne fait rien, et un lien garde une adresse par etape. --}}
        @if($held === null)
          <a class="t-comparer" href="{{ request()->fullUrlWithQuery([
              'comparer' => $schematic->slug, 'page' => null]) }}">{{
            __('vitrine.comparer.retenir') }}</a>
        @elseif($held->slug !== $schematic->slug)
          <a class="t-comparer on" href="/comparer?a={{ $held->slug }}&amp;b={{ $schematic->slug }}">{{
            __('vitrine.comparer.avec-celui-ci') }}</a>
        @else
          <span class="t-comparer tenu">{{ __('vitrine.comparer.tenu') }}</span>
        @endif

        @if(($notes[$schematic->id] ?? []) !== [])
          <ul class="remarques">
            @foreach($notes[$schematic->id] as $note)
              <li class="r-{{ $note['tone'] }}">
                <b>{{ $note['title'] }}</b>
                <span>{{ $note['because'] }}</span>
              </li>
            @endforeach
          </ul>
        @endif
      </article>
    @endforeach
  </div>
  {{ $schematics->links() }}
@endif
@endsection
