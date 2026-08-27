<?php

namespace App\Http\Controllers;

use App\Models\Schematic;
use App\Support\Comparison;
use Illuminate\Http\Request;
use Illuminate\View\View;

/**
 * Two schematics side by side, which is the question the catalogue creates.
 *
 * Once the site holds fifteen thousand layouts, a player stops asking "is there a graphite
 * line" and starts asking "which of these two". Every other Mindustry site answers that
 * with two screenshots; both of these were read by the same engine, so the answer is a
 * subtraction, and the subtraction is stated rather than left for the reader to do in their
 * head from two columns.
 *
 * What the page will not do is declare a winner. A layout that makes more and costs three
 * times as much is a different trade, not a better one, and the reader is the one who knows
 * which trade they want.
 */
class CompareController extends Controller
{
    /** What a slug is allowed to look like, so a lookup cannot be a paragraph. */
    private const SLUG = '/^[a-z0-9]{1,16}$/';

    public function index(Request $request): View
    {
        $left = $this->find($request->query('a'));
        $right = $this->find($request->query('b'));

        return view('compare', [
            'left' => $left,
            'right' => $right,
            // Only when both are in hand. Half a comparison is a form, not a result.
            'comparison' => $left && $right ? new Comparison($left, $right) : null,
            // Something to pick from, so the page is usable arriving from the menu rather
            // than only from a link somebody built by hand.
            'recent' => $this->offer($left, $right),
        ]);
    }

    /**
     * One schematic, if it is public and it is really there.
     *
     * `listed()` and not `visibleTo`: a comparison is a page whose whole content is two
     * other people's work, and a link to it travels. Unlisted schematics are reachable by
     * their own link on purpose, and that is not the same as being fair game to be pulled
     * into a page beside a stranger's.
     */
    private function find(mixed $slug): ?Schematic
    {
        if (! is_string($slug) || ! preg_match(self::SLUG, $slug)) {
            return null;
        }

        return Schematic::query()
            ->listed()
            ->with(['user', 'items'])
            ->where('slug', $slug)
            ->first();
    }

    /**
     * A short list to choose from, newest first, minus whatever is already chosen.
     *
     * Deliberately not the whole catalogue in a dropdown: fifteen thousand options is not a
     * choice, it is a scroll. Somebody comparing two specific layouts arrives with both
     * links; this is for somebody who arrived from the menu with neither.
     */
    private function offer(?Schematic $left, ?Schematic $right)
    {
        $taken = array_filter([$left?->id, $right?->id]);

        return Schematic::query()
            ->listed()
            ->whereNotIn('id', $taken ?: [0])
            ->orderByDesc('id')
            ->limit(12)
            ->get(['slug', 'name', 'blocks']);
    }
}
