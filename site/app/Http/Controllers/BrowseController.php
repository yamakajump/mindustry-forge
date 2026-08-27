<?php

namespace App\Http\Controllers;

use App\Models\Schematic;
use App\Models\SchematicItem;
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

        $query = Schematic::query()->with('user')->listed();

        if ($makes !== '') {
            // A join on the index rather than a key in a JSON blob: "graphite" must not
            // match a schematic that merely needs graphite to be built, and the answer
            // must not require reading every row on the site.
            $query->join('schematic_items', 'schematic_items.schematic_id', '=', 'schematics.id')
                ->where('schematic_items.item', $makes)
                ->select('schematics.*');
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
            'orders' => self::ORDERS,
            // Offered rather than typed: the analysis already knows what exists, so a
            // player picks from what is actually there instead of guessing a spelling.
            'items' => $this->itemsOnOffer(),
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
    private function itemsOnOffer(): array
    {
        return SchematicItem::query()
            ->join('schematics', 'schematics.id', '=', 'schematic_items.schematic_id')
            ->where('schematics.visibility', Schematic::PUBLIC)
            ->groupBy('schematic_items.item')
            ->orderByRaw('count(*) desc')
            ->limit(20)
            ->pluck('schematic_items.item')
            ->all();
    }
}
