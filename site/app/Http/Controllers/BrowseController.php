<?php

namespace App\Http\Controllers;

use App\Models\Schematic;
use Illuminate\Http\Request;
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

    public function index(Request $request): View
    {
        $makes = trim((string) $request->query('produit', ''));
        $order = array_key_exists($request->query('tri'), self::ORDERS)
            ? $request->query('tri') : 'best';

        $query = Schematic::query()->with('user')->where('public', true);

        if ($makes !== '') {
            // A JSON key rather than a LIKE over the whole blob: "graphite" must not match
            // a schematic that merely needs graphite to be built.
            $query->whereNotNull("produces->{$makes}");
        }

        $query = match ($order) {
            // Output per block, which is what "well made" means for a factory and what a
            // date-sorted list can never surface.
            'best' => $query->orderByRaw(
                '(power_made - power_used) / CASE WHEN blocks = 0 THEN 1 ELSE blocks END DESC'
            )->orderByDesc('power_made'),
            'output' => $query->orderByDesc('power_made'),
            'small' => $query->orderBy('blocks'),
            'seen' => $query->orderByDesc('views'),
            default => $query->latest(),
        };

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

    /** Every item any public schematic actually produces. */
    private function itemsOnOffer(): array
    {
        $found = [];
        foreach (Schematic::where('public', true)->pluck('produces') as $produces) {
            foreach (array_keys((array) $produces) as $item) {
                $found[$item] = ($found[$item] ?? 0) + 1;
            }
        }
        arsort($found);

        return array_slice(array_keys($found), 0, 20);
    }
}
