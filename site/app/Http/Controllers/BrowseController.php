<?php

namespace App\Http\Controllers;

use App\Models\Schematic;
use App\Models\SchematicItem;
use App\Services\BlockCatalogue;
use App\Support\Remarks;
use App\Support\Thing;
use App\Support\Vitrine;
use Illuminate\Http\Request;
use Illuminate\View\View;

/**
 * Finding a schematic by what it does, which is the thing no other Mindustry site can do.
 *
 * Every one of them searches names and hand-typed tags, because that is all they hold. A
 * player looking for "a hundred graphite a minute under thirty blocks" has to read
 * pictures until one looks right. Here what a schematic produces is indexed row by row, so
 * that sentence is a query.
 *
 * The ordering carries as much weight as the filter, and it has to mean something. It used
 * to rank on net power, which scored every real factory below zero: a silicon smelter
 * consumes electricity, so it sorted beneath an empty schematic, and the default view of a
 * site whose promise is "search by what it makes" showed power plants and nothing else.
 *
 * Electricity is not a debt a schematic carries. A player pasting a factory into their
 * base already has power, or can run a wire; it is a prerequisite to state, not something
 * to be marked down for. So consumption is said plainly on the schematic's page and used
 * nowhere in any ranking, while production is simply one more thing a schematic makes,
 * searchable like graphite.
 *
 * What follows from that is that "les mieux faits" needs an item before it means
 * anything. Ranking forty graphite a minute against twenty-five silicon a minute would be
 * declaring that one graphite is worth one silicon, which is false and would be invisible.
 * So without a chosen item the listing sorts by date and says so, and offers the choice.
 */
class BrowseController extends Controller
{
    /** How a listing can be ordered, and what each means. */
    private const ORDERS = [
        'best' => 'Les mieux faits (par bloc posé)',
        'dense' => 'Les plus denses (par tuile de sol)',
        'output' => 'Ceux qui produisent le plus',
        'small' => 'Les plus compacts',
        'new' => 'Les plus récents',
        'seen' => 'Les plus vus',
        // Une grandeur unique, comparable entre deux schemas quels qu'ils soient : un
        // j'aime vaut un j'aime. C'est pourquoi ce tri n'exige pas d'objet choisi la ou
        // les trois qui comparent des productions l'exigent.
        'aimes' => 'Les plus aimés',
        // N'a de sens que sous le filtre des favoris, et n'est offert que la : ailleurs il
        // classerait sur une date que la liste ne porte pas. Asymetrie assumee.
        'garde' => 'Dans l ordre ou je les ai gardés',
    ];

    /** The two that compare schematics on their output, so the two that need an item. */
    private const NEEDS_AN_ITEM = ['best', 'dense', 'output'];

    /**
     * How many fit on one page, and the size of the crowd a leaderboard needs.
     *
     * One constant rather than two, because the second is the first: a ranking that cannot
     * fill its own first screen is not a ranking. Written as a derivation rather than as a
     * second literal, so that raising the page size cannot leave a comment behind saying
     * twenty-four for a reason that stopped being true.
     */
    private const PER_PAGE = 24;

    /** The two worlds, which do not share a build menu. */
    private const PLANETS = ['serpulo', 'erekir'];

    /** The widest a schematic can be, matching the column the analysis writes into. */
    private const MAX_SIDE = 4096;

    /** What an item name is allowed to look like, so a filter cannot be a paragraph. */
    private const ITEM = '/^[a-z][a-z-]{0,39}$/';

    public function index(Request $request): View
    {
        $makes = trim((string) $request->query('produit', ''));
        if ($makes !== '' && ! preg_match(self::ITEM, $makes)) {
            $makes = '';
        }

        $order = array_key_exists($request->query('tri'), self::ORDERS)
            ? $request->query('tri') : 'best';

        // Nothing to rank output against, so do not pretend to. Falling back to date is
        // the honest answer, and the page says which of the two it is doing.
        if ($makes === '' && in_array($order, self::NEEDS_AN_ITEM, true)) {
            $order = 'new';
        }

        /* Creative builds are set aside by default, and the page says so with a link that
           brings them back. Corentin asked for "a part", not "dehors": a catalogue that
           announces fifteen thousand schematics and quietly serves fourteen would be lying
           about its own size, which is the fault this repository spent a day closing.

           A schematic built for a sandbox server, or built to make one lag, is not a worse
           design - it is an answer to another question, and it sat at the top of the energy
           ranking ahead of every real factory. */
        $creative = $request->query('creatif') === 'oui';

        /* Which block it has to contain. The question a player actually asks - "show me
           what people build with a thorium reactor" - and the one the site could not answer
           at all until `schematic_blocks` stopped being empty.

           Matched against the catalogue rather than taken on trust: a name that is not a
           block returns nothing, and the page says so, where a free-text `LIKE` would have
           returned a plausible-looking wrong list for a typo. */
        $holds = (string) $request->query('bloc', '');
        if ($holds !== '' && ! BlockCatalogue::has($holds)) {
            $holds = '';
        }

        /* The constraints, which are the half of this page no other Mindustry site has.
           "A hundred graphite a minute under thirty blocks" is the sentence this repository
           opens with, and until now not one of its three clauses could be typed.

           Every one is bounded rather than trusted: these arrive in a URL a stranger writes,
           and a width of nine million would be a full scan answering nothing. What does not
           parse is dropped rather than corrected, and the page then behaves as if it had not
           been asked, which is the only honest thing to do with a filter nobody can read. */
        $fitsWide = $this->positive($request->query('large'), self::MAX_SIDE);
        $fitsTall = $this->positive($request->query('haut'), self::MAX_SIDE);
        $atLeast = $this->positive($request->query('min'), 1_000_000_000);
        $atMostBlocks = $this->positive($request->query('blocs'), 65535);

        // Self sufficient in electricity. Both sides of this comparison come from
        // `analysis['potential']`, so it is a ceiling against a ceiling: what the layout
        // would make flat out against what it would then draw. Comparing a ceiling to a
        // measurement is the fault this repository keeps paying for, and it is not made here.
        $selfPowered = $request->query('autonome') === 'oui';

        // Only what the bench re-measured on a real server. A hundred and seventeen rows
        // carry a measurement against six thousand seven hundred carrying a ceiling, so this
        // filter empties most of the catalogue. That is the point of it, and the page says so.
        $measured = $request->query('verifie') === 'oui';

        $planet = in_array($request->query('planete'), self::PLANETS, true)
            ? $request->query('planete') : '';

        /* Ce qui est a moi : mes favoris, ce que j'ai aime, ce que j'ai publie.

           Offerts aux seuls connectes, parce qu'un filtre qui rend toujours vide est pire
           qu'un filtre absent. Le controle est ici et pas seulement dans la vue : une
           adresse se tape, et `favoris=oui` sans session ne doit pas filtrer sur un
           identifiant nul. */
        /* Ce qu'il faut lui amener : « j'ai du charbon, qu'est-ce que je peux faire tourner ».

           Confronte a ce que le catalogue reclame vraiment plutot que pris pour argent
           comptant, comme le filtre par bloc : un nom qui n'est demande par rien rendrait une
           page vide sans que rien ne dise que la faute est dans le nom. */
        $eats = (string) $request->query('consomme', '');
        $eatsOnOffer = Vitrine::eatsOnOffer();
        if ($eats !== '' && ! in_array($eats, $eatsOnOffer, true)) {
            $eats = '';
        }

        /* Comparer deux plans, en deux clics et sans une ligne de JavaScript.

           `/comparer` existe depuis longtemps et la vitrine ne l'alimentait pas : un joueur
           qui voulait opposer deux resultats devait ouvrir deux onglets et recopier deux
           adresses. Des cases a cocher auraient demande un script, et sans lui elles
           n'auraient rien fait du tout, ce qui est pire qu'une absence.

           Alors c'est un parametre. Le premier clic retient un schema dans l'adresse, le
           second part vers la comparaison. Chaque etape a son adresse, donc elle se partage,
           se met en favori et revient par le bouton precedent. */
        $against = (string) $request->query('comparer', '');
        $held = $against === '' ? null
            : Schematic::query()->listed()->where('slug', $against)->first();
        if ($held === null) {
            $against = '';
        }

        $me = $request->user();
        $favorites = $me !== null && $request->query('favoris') === 'oui';
        $liked = $me !== null && $request->query('aimes') === 'oui';
        $mine = $me !== null && $request->query('miens') === 'oui';

        /* Une liste personnelle n'est pas le catalogue, et ne suit donc pas sa regle.

           `ordinary()` met de cote ce qui ne se pose pas en partie normale, ce qui est juste
           pour « qu'est-ce qui existe et qui marche ». Ma liste de favoris repond a « qu'est-ce
           que j'ai garde », et la reponse ne se discute pas : je l'ai garde, je le revois.
           Vaut pour les trois, y compris ce que j'ai publie : un auteur doit retrouver son
           propre plan de bac a sable dans sa propre liste.

           Ecrit ici plutot que laisse a deduire, parce que la prochaine personne qui verra
           un scope manquant sous un filtre le remettra par coherence. */
        $personal = $favorites || $liked || $mine;

        /* Quels classements cette page a le droit d'offrir, et lesquels elle retire.

           « Les plus aimés » n'apparait pas tant que moins d'une page entiere de schemas
           porte au moins un j'aime. En dessous, le palmares ne remplit pas son premier ecran
           et classe des schemas dont la plupart valent zero : un chiffre exact, affiche a
           l'endroit qui pose une autre question, ce que ce depot a paye six fois en une
           journee. Le seuil EST la taille d'une page, derive d'elle et non recopie a cote,
           pour qu'en la changeant la raison reste vraie.

           « Dans l'ordre ou je les ai gardes » ne vit que sous les favoris : ailleurs la
           table de liaison n'est pas jointe et la colonne n'existe pas dans la requete. */
        $leaderboard = Schematic::query()->listed()->where('likes', '>', 0)->count()
            >= self::PER_PAGE;

        $offered = self::ORDERS;
        if (! $leaderboard) {
            unset($offered['aimes']);
        }
        if (! $favorites) {
            unset($offered['garde']);
        }

        if (! array_key_exists($order, $offered)) {
            // Retombe sur ce que la page sait faire, et le dit, plutot que de rendre une
            // liste classee autrement que ce que son onglet actif annonce.
            $order = $favorites ? 'garde' : 'new';
        } elseif ($favorites && $request->query('tri') === null) {
            // Ce que je viens de garder en premier : c'est la question que pose une liste
            // personnelle, et elle n'est pas celle du catalogue.
            $order = 'garde';
        }

        // `items` charge en une fois : chaque tuile lit son plafond, et sans ca une page de
        // vingt-quatre ferait vingt-quatre requetes de plus.
        $query = Schematic::query()->with(['user', 'items'])->listed();
        if ($holds !== '') {
            $query->whereExists(fn ($sub) => $sub
                ->selectRaw('1')
                ->from('schematic_blocks')
                ->whereColumn('schematic_blocks.schematic_id', 'schematics.id')
                ->where('schematic_blocks.block', $holds));
        }

        /* The footprint, and it is strict on purpose: no rotation, no swapping the two
           sides. Checked in the game rather than assumed from a wiki - `Binding` exposes
           `schematicFlipX` and `schematicFlipY` and no rotate at all, and
           `Schematics.rotate()` is called only by `BaseBuilderAI` and `BaseGenerator`, the
           enemy base builder. A mirror does not change a bounding box, so a plan of 20 by 15
           never fits a gap of 15 by 20, and offering it would be an exact answer to a
           question the player did not ask. */
        if ($fitsWide > 0) {
            $query->where('schematics.width', '<=', $fitsWide);
        }
        if ($fitsTall > 0) {
            $query->where('schematics.height', '<=', $fitsTall);
        }

        if ($atMostBlocks > 0) {
            $query->where('schematics.blocks', '<=', $atMostBlocks);
        }

        if ($selfPowered) {
            $query->whereColumn('schematics.power_made', '>=', 'schematics.power_used');
        }

        if ($measured) {
            $query->where('schematics.verified', true);
        }

        if ($planet !== '') {
            $query->onPlanet($planet);
        }

        /* Une jointure plutot qu'un `whereExists` pour les favoris : l'ordre « dans l'ordre
           ou je les ai gardes » a besoin de la colonne `created_at` de la table de liaison,
           qu'un `exists` ne rend pas. Les deux autres n'ont rien a lire, donc ils restent
           des existences. */
        if ($favorites) {
            $query->join('favorites', function ($join) use ($me) {
                $join->on('favorites.schematic_id', '=', 'schematics.id')
                    ->where('favorites.user_id', $me->id);
            })->select('schematics.*');
        }

        if ($liked) {
            $query->whereExists(fn ($sub) => $sub
                ->selectRaw('1')
                ->from('schematic_likes')
                ->whereColumn('schematic_likes.schematic_id', 'schematics.id')
                ->where('schematic_likes.user_id', $me->id));
        }

        if ($mine) {
            $query->where('schematics.user_id', $me->id);
        }

        /* Une existence et non une jointure : la jointure sur `schematic_items` est deja
           prise par le produit, et une seconde sur la meme table multiplierait les lignes
           sans que le compte affiche le dise. */
        if ($eats !== '') {
            $query->whereExists(fn ($sub) => $sub
                ->selectRaw('1')
                ->from('schematic_items as besoins')
                ->whereColumn('besoins.schematic_id', 'schematics.id')
                ->where('besoins.item', $eats)
                ->where('besoins.sens', SchematicItem::CONSOMME)
                ->where('besoins.kind', Vitrine::NATURE));
        }

        if ($makes !== '') {
            // A join on the index rather than a key in a JSON blob: "graphite" must not
            // match a schematic that merely needs graphite to be built, and the answer
            // must not require reading every row on the site.
            $query->join('schematic_items', 'schematic_items.schematic_id', '=', 'schematics.id')
                ->where('schematic_items.item', $makes)
                /*
                 * Le plafond, et lui seul.
                 *
                 * Exiger une mesure rendait le catalogue muet : 117 schematiques en portent
                 * une contre 6 775 qui portent un plafond, et ni le graphite ni le silicium
                 * n'avaient un seul resultat alors que 844 et 1 700 plans en produisent.
                 * Ce n'est pas un accident qui se resorbera : une schematique arrachee d'une
                 * base n'a pas la foreuse qui l'alimentait, donc son debit mesure vaut zero
                 * et le restera.
                 *
                 * Le plafond seul, et non « plafond ou mesure », parce qu'un classement qui
                 * melange les deux natures est exactement la faute reparee sur l'energie
                 * nette. Et il n'exclut personne : le plafond se calcule avec une
                 * alimentation infinie, donc il est toujours superieur ou egal a la mesure,
                 * et toute schematique qui a une mesure non nulle a aussi un plafond. Une
                 * seule nature dans un seul ordre, sans rien perdre.
                 *
                 * La regle n'est pas assouplie, elle est appliquee : un plafond ne s'affiche
                 * jamais sans dire qu'il en est un. La phrase sous les filtres le dit, et
                 * chaque tuile le repete a cote de son chiffre.
                 */
                ->where('schematic_items.sens', SchematicItem::PRODUIT)
                ->where('schematic_items.kind', Vitrine::NATURE)
                ->select('schematics.*');

            /* "At least a hundred a minute", which only means anything once a thing is
               chosen. Applied here rather than beside the other constraints for that reason:
               out here `schematic_items` is not joined, and a floor on a rate with nothing to
               rate would silently filter on whatever row the database happened to reach. */
            if ($atLeast > 0) {
                $query->where('schematic_items.rate', '>=', $atLeast);
            }
        }

        /* Counted on the list the reader is looking at, filters and all, and not on the
           catalogue.

           It said 4,475 on every page, which is the right count of the whole catalogue and
           the wrong answer to "how many did this page set aside". On
           `?produit=power&tri=output` the true answer was zero: those schematics were
           already gone, dropped by the measured-versus-ceiling rule because their measured
           energy is nought, so this filter had nothing left to remove. A page that sets
           nothing aside announced four and a half thousand.

           Counted before the exclusion is applied rather than as the difference of two
           totals, and forwards through the block index, for the reason written where that
           first count was: a difference means two passes over the whole filtered set. */
        $setAside = ($creative || $personal) ? 0 : (clone $query)
            ->whereExists(fn ($sub) => $sub
                ->selectRaw('1')
                ->from('schematic_blocks')
                ->whereColumn('schematic_blocks.schematic_id', 'schematics.id')
                ->whereIn('schematic_blocks.block', Schematic::sandboxBlocks()))
            ->distinct()
            ->count('schematics.id');

        if (! $creative && ! $personal) {
            $query->ordinary();
        }

        $query = match ($order) {
            // How much it makes for the room it takes, which is what "well made" means and
            // what a date-sorted list can never surface.
            'best' => $query->orderByDesc('schematic_items.rate_per_block'),
            // What it makes for the ground it stands on, which is the question a player
            // asks in front of a gap in their base. Not the same question as `best`: a
            // layout spread wide with few blocks wins one and loses the other.
            'dense' => $query->orderByDesc('schematic_items.rate_per_tile'),
            'output' => $query->orderByDesc('schematic_items.rate'),
            'small' => $query->orderBy('blocks'),
            'seen' => $query->orderByDesc('views'),
            'aimes' => $query->orderByDesc('schematics.likes'),
            'garde' => $query->orderByDesc('favorites.created_at'),
            default => $query->orderByDesc('schematics.created_at'),
        };

        /*
         * A last tiebreaker, so the ordering is total.
         *
         * Every one of these sorts has ties, and most have a lot of them: thousands of
         * schematics are twelve blocks. Rows that compare equal come back in whatever
         * order the database found convenient, and it has no reason to pick the same one
         * twice. Paging through then shows the same schematic on two pages and never shows
         * another at all, which reads as the site losing things rather than as a missing
         * ORDER BY.
         */
        $query->orderByDesc('schematics.id');

        $page = $query->paginate(self::PER_PAGE)->withQueryString();

        /* Ce que la page dit, en plus de ce qu'elle classe.
         *
         * Calcule ici plutot que dans la vue, et une seule fois : chaque remarque compare une
         * schematique aux autres de la meme page, donc la laisser a la vue voudrait dire
         * passer la page entiere a chaque tuile.
         *
         * Aucune requete de plus : les plafonds sont deja charges par `with('items')`, et le
         * cout de construction se lit dans `analysis`, deja sur la ligne. Le recalculer depuis
         * `schematic_blocks` fois le catalogue serait la meme arithmetique ecrite une seconde
         * fois, sur le chiffre qu'un joueur verifie contre son propre noyau avant de coller.
         */
        $shown = $page->getCollection();
        $unit = $makes === '' ? '' : ($makes === SchematicItem::POWER
            ? __('schema.unite.energie') : Thing::name($makes));

        // L'unite suit la chose et non la colonne : `rate` porte des objets par minute et de
        // l'energie par seconde sous le meme nom. Ecrire « 60 energie/min » serait juste
        // arithmetiquement et faux partout ailleurs sur ce site.
        $unitShort = $makes === '' ? '' : ($makes === SchematicItem::POWER
            ? __('vitrine.note.energie-seconde')
            : Thing::name($makes).__('schema.unite.par-minute'));

        /* Ce que la recherche porte en ce moment, une puce par contrainte, chacune avec le
           lien qui la retire.

           Une page arrivee par un lien partage applique des filtres que son lecteur n'a pas
           poses, et le panneau qui les contient est replie. Sans ces puces, la seule façon de
           savoir pourquoi la liste est courte est d'ouvrir le panneau et de lire six champs.

           Les nombres sont assembles ici et jamais passes a une cle de traduction : une cle
           manquante rendrait la cle sans substituer, et « au moins 1 000 » deviendrait « au
           moins », ce qui est la seule moitie de la phrase qui ne veut rien dire. */
        $chips = [];
        if ($fitsWide > 0 || $fitsTall > 0) {
            $chips[] = [
                'label' => __('vitrine.contraintes.tient-dans').' '
                    .($fitsWide > 0 ? self::plain($fitsWide) : '?').' × '
                    .($fitsTall > 0 ? self::plain($fitsTall) : '?'),
                'clear' => ['large' => null, 'haut' => null],
            ];
        }
        if ($atLeast > 0 && $makes !== '') {
            $chips[] = [
                'label' => __('vitrine.contraintes.au-moins').' '.self::plain($atLeast).' '.$unitShort,
                'clear' => ['min' => null],
            ];
        }
        if ($atMostBlocks > 0) {
            $chips[] = [
                'label' => __('vitrine.contraintes.au-plus').' '.self::plain($atMostBlocks).' '
                    .__('vitrine.contraintes.unite.blocs'),
                'clear' => ['blocs' => null],
            ];
        }
        if ($planet !== '') {
            $chips[] = ['label' => ucfirst($planet), 'clear' => ['planete' => null]];
        }
        if ($selfPowered) {
            $chips[] = ['label' => __('vitrine.contraintes.autonome'), 'clear' => ['autonome' => null]];
        }
        if ($measured) {
            $chips[] = ['label' => __('vitrine.contraintes.verifie'), 'clear' => ['verifie' => null]];
        }
        if ($holds !== '') {
            $chips[] = ['label' => Thing::name($holds), 'clear' => ['bloc' => null]];
        }
        if ($eats !== '') {
            $chips[] = [
                'label' => __('vitrine.contraintes.consomme').' '.Thing::name($eats),
                'clear' => ['consomme' => null],
            ];
        }

        return view('browse', [
            'schematics' => $page,
            'winners' => Remarks::winners($shown, $makes, $unit),
            'notes' => $shown->mapWithKeys(
                fn (Schematic $s) => [$s->id => Remarks::about($s, $shown, $makes, $unit)]
            ),
            'makes' => $makes,
            'order' => $order,
            'creative' => $creative,
            // A page that says how many it is holding back is a page a reader can
            // disagree with - as long as the figure is this page's and not the catalogue's.
            'setAside' => $setAside,
            'orders' => $offered,
            // Offered rather than typed: the analysis already knows what exists, so a
            // player picks from what is actually there instead of guessing a spelling.
            'items' => Vitrine::itemsOnOffer(),
            'holds' => $holds,
            // Offered from what is actually in the catalogue, same reason as the items: a
            // player picks a name that exists instead of guessing how it is spelled.
            'blocks' => Vitrine::blocksOnOffer(),
            'powerKey' => SchematicItem::POWER,
            // Rendered back into the form so a search survives being shared, bookmarked or
            // paged through. A field the page forgets is a filter the reader cannot see it
            // is still applying.
            'fitsWide' => $fitsWide,
            'fitsTall' => $fitsTall,
            'atLeast' => $atLeast,
            'atMostBlocks' => $atMostBlocks,
            'selfPowered' => $selfPowered,
            'measured' => $measured,
            'planet' => $planet,
            'planets' => self::PLANETS,
            'favorites' => $favorites,
            'liked' => $liked,
            'mine' => $mine,
            'signedIn' => $me !== null,
            'eats' => $eats,
            'eatsOnOffer' => $eatsOnOffer,
            'against' => $against,
            'held' => $held,
            'chips' => $chips,
        ]);
    }

    /**
     * A number a stranger typed, or zero meaning "not asked".
     *
     * Zero rather than null for absent, because every caller here treats "not asked" and
     * "asked for nothing" the same way, and a null would make five call sites carry a check
     * that means nothing. Anything that is not a positive number inside the bound is dropped
     * rather than clamped: clamping nine million to four thousand would answer a question
     * nobody asked, quietly, which is this repository's signature defect.
     */
    private function positive(mixed $raw, int $ceiling): float
    {
        if (! is_string($raw) && ! is_numeric($raw)) {
            return 0;
        }

        $value = is_numeric($raw) ? (float) $raw : 0;

        return $value > 0 && $value <= $ceiling ? $value : 0;
    }

    /** A bound as the reader typed it: 16 and not 16,00, 0,5 kept as 0,5. */
    private static function plain(float $value): string
    {
        return rtrim(rtrim(number_format($value, 2, ',', ' '), '0'), ',');
    }
}
