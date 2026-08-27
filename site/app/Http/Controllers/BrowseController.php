<?php

namespace App\Http\Controllers;

use App\Models\Schematic;
use App\Models\SchematicItem;
use App\Services\BlockCatalogue;
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
 * What follows from that is that "les mieux faites" needs an item before it means
 * anything. Ranking forty graphite a minute against twenty-five silicon a minute would be
 * declaring that one graphite is worth one silicon, which is false and would be invisible.
 * So without a chosen item the listing sorts by date and says so, and offers the choice.
 */
class BrowseController extends Controller
{
    /** How a listing can be ordered, and what each means. */
    private const ORDERS = [
        'best' => 'Les mieux faites',
        'output' => 'Celles qui produisent le plus',
        'small' => 'Les plus compactes',
        'new' => 'Les plus recentes',
        'seen' => 'Les plus vues',
    ];

    /** The two that compare schematics on their output, so the two that need an item. */
    private const NEEDS_AN_ITEM = ['best', 'output'];

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

        return view('browse', [
            'schematics' => $query->paginate(24)->withQueryString(),
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
        ]);
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
