<?php

namespace App\Http\Controllers;

use App\Models\Schematic;
use App\Models\SchematicItem;
use App\Services\BlockCatalogue;
use App\Support\Remarks;
use App\Support\Thing;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
    ];

    /** The two that compare schematics on their output, so the two that need an item. */
    private const NEEDS_AN_ITEM = ['best', 'dense', 'output'];

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
                ->where('schematic_items.kind', SchematicItem::PLAFOND)
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
        $setAside = $creative ? 0 : (clone $query)
            ->whereExists(fn ($sub) => $sub
                ->selectRaw('1')
                ->from('schematic_blocks')
                ->whereColumn('schematic_blocks.schematic_id', 'schematics.id')
                ->whereIn('schematic_blocks.block', Schematic::sandboxBlocks()))
            ->distinct()
            ->count('schematics.id');

        if (! $creative) {
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

        $page = $query->paginate(24)->withQueryString();

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
            'orders' => self::ORDERS,
            // Offered rather than typed: the analysis already knows what exists, so a
            // player picks from what is actually there instead of guessing a spelling.
            'items' => $this->itemsOnOffer(),
            'holds' => $holds,
            // Offered from what is actually in the catalogue, same reason as the items: a
            // player picks a name that exists instead of guessing how it is spelled.
            'blocks' => $this->blocksOnOffer(),
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

    /**
     * Everything any public schematic actually produces, commonest first.
     *
     * A grouped count over an indexed table. It used to mean reading the `produces` blob of
     * every public schematic and counting keys in PHP, which measured 141 ms over fifteen
     * thousand rows, paid on every single view of the listing, to fill a dropdown of
     * twenty. That was briefly patched with a ten minute cache; indexing what a schematic
     * makes removed the reason for the cache along with the cost.
     */
    /**
     * Every block a public schematic is built from, commonest first.
     *
     * Capped at two hundred: the list goes into a `datalist` on every render of the page,
     * and the whole catalogue would be four hundred names of markup nobody scrolls past
     * the first dozen of. The cap is a display decision and it is stated rather than left
     * to be discovered - a search for a block outside it still works, it simply is not
     * suggested.
     */
    private function blocksOnOffer(): array
    {
        return DB::table('schematic_blocks')
            ->join('schematics', 'schematics.id', '=', 'schematic_blocks.schematic_id')
            ->where('schematics.visibility', Schematic::PUBLIC)
            ->groupBy('schematic_blocks.block')
            ->orderByRaw('count(*) desc')
            ->limit(200)
            ->pluck('schematic_blocks.block')
            ->all();
    }

    private function itemsOnOffer(): array
    {
        return SchematicItem::query()
            ->join('schematics', 'schematics.id', '=', 'schematic_items.schematic_id')
            ->where('schematics.visibility', Schematic::PUBLIC)
            ->where('schematic_items.sens', SchematicItem::PRODUIT)
            // La meme nature que le classement, sans quoi la liste proposerait du graphite
            // et la page n'afficherait rien : un filtre qui offre ce qu'il ne sait pas
            // rendre est pire qu'un filtre qui ne l'offre pas.
            ->where('schematic_items.kind', SchematicItem::PLAFOND)
            ->groupBy('schematic_items.item')
            ->orderByRaw('count(*) desc')
            ->limit(20)
            ->pluck('schematic_items.item')
            ->all();
    }
}
