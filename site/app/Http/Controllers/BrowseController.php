<?php

namespace App\Http\Controllers;

use App\Models\Schematic;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\View\View;

/**
 * Finding a schematic by what it does, which is the thing no other Mindustry site can do.
 *
 * Every one of them searches names and hand-typed tags, because that is all they hold. A
 * player looking for "a hundred graphite a minute under thirty blocks" has to read
 * pictures until one looks right.
 *
 * Here the analysis was lifted into columns on the way in, so that sentence is a query.
 * The ordering matters as much as the filter: a list sorted by date is a list of whoever
 * posted last, and a list sorted by output per block is a list of the good ones.
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

    /**
     * What an item is allowed to look like.
     *
     * The name goes into a JSON path rather than a bound parameter, so it is worth being
     * strict about. Laravel escapes the quotes, so this is not about injection; it is that
     * an unchecked three hundred character path is a full scan of the catalogue that
     * cannot possibly match anything, asked for by whoever felt like it.
     */
    private const ITEM = '/^[a-z][a-z-]{0,39}$/';

    public function index(Request $request): View
    {
        $makes = trim((string) $request->query('produit', ''));
        if ($makes !== '' && ! preg_match(self::ITEM, $makes)) {
            $makes = '';
        }
        $order = array_key_exists($request->query('tri'), self::ORDERS)
            ? $request->query('tri') : 'best';

        $query = Schematic::query()->with('user')->listed();

        if ($makes !== '') {
            // A JSON key rather than a LIKE over the whole blob: "graphite" must not match
            // a schematic that merely needs graphite to be built.
            $query->whereNotNull("produces->{$makes}");
        }

        $query = match ($order) {
            // Output per block, which is what "well made" means for a factory and what a
            // date-sorted list can never surface. Read from a column rather than worked
            // out in the ORDER BY: as an expression no index could serve it, so the
            // default view of the marketplace sorted the whole catalogue on every visit.
            'best' => $query->orderByDesc('power_per_block')->orderByDesc('power_made'),
            'output' => $query->orderByDesc('power_made'),
            'small' => $query->orderBy('blocks'),
            'seen' => $query->orderByDesc('views'),
            default => $query->latest(),
        };

        /*
         * A last tiebreaker, so the ordering is total.
         *
         * Every one of these sorts has ties, and most have a lot of them: thousands of
         * schematics are twelve blocks, and thousands more make no power at all. Rows that
         * compare equal come back in whatever order the database found convenient, and it
         * has no reason to pick the same one twice. Paging through the list then shows the
         * same schematic on two pages and never shows another one at all, which reads as
         * the site losing things rather than as a missing ORDER BY.
         */
        $query->orderByDesc('id');

        return view('browse', [
            'schematics' => $query->paginate(24)->withQueryString(),
            'makes' => $makes,
            'order' => $order,
            'orders' => self::ORDERS,
            // Offered rather than typed: the analysis already knows what exists, so a
            // player picks from what is actually there instead of guessing a spelling.
            'items' => $this->itemsOnOffer(),
        ]);
    }

    /**
     * Every item any public schematic actually produces.
     *
     * Cached, because working it out means reading the `produces` blob of every public
     * schematic and counting keys in PHP: 141 ms over fifteen thousand rows, paid on every
     * single view of the listing, to fill a dropdown of twenty entries. It was the largest
     * cost on the page by a wide margin.
     *
     * Ten minutes rather than forever, and cleared by nothing. What changes this list is a
     * schematic appearing that makes an item no other one makes, and a player waiting ten
     * minutes to see a new entry in a dropdown is not a person having a bad time. Tying it
     * to a saved model would mean remembering to clear it from four places, one of which
     * would eventually be forgotten.
     */
    private function itemsOnOffer(): array
    {
        return Cache::remember('browse.items', now()->addMinutes(10), function () {
            $found = [];
            foreach (Schematic::listed()->pluck('produces') as $produces) {
                foreach (array_keys((array) $produces) as $item) {
                    $found[$item] = ($found[$item] ?? 0) + 1;
                }
            }
            arsort($found);

            return array_slice(array_keys($found), 0, 20);
        });
    }
}
