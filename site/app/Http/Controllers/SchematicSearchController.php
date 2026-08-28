<?php

namespace App\Http\Controllers;

use App\Models\Schematic;
use App\Support\NameSearch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Names, while somebody types them.
 *
 * The comparison page used to be two text boxes and a full page reload per side: pick the
 * left one, wait, read a list of names, pick the right one, wait again. Filling in a page
 * that exists to hold two things side by side took two round trips and showed neither of
 * them until both were chosen.
 *
 * The plan travels with the result, so the list of names is a list of pictures. That is the
 * whole reason this endpoint exists rather than the page reloading: choosing between eight
 * schematics called "Silicon" is impossible on their names and immediate on their plans.
 */
class SchematicSearchController extends Controller
{
    /** How many to answer with. A dropdown is read at a glance or it is not read. */
    private const OFFERED = 8;

    /**
     * How long a code may be and still ride along in the answer.
     *
     * The browser needs the code to draw a plan, and the plan is the point. Eight of them
     * at the median size of the live catalogue is about 8 kB, which is cheaper than eight
     * more requests. Past the cap the answer carries no code and the page fetches that one
     * on its own from `/api/schematiques/{slug}/code`: a single 512 kB schematic has no
     * business arriving inside a search suggestion.
     */
    private const CARRIED = 16384;

    public function __invoke(Request $request): JsonResponse
    {
        // `is_string` first: `?q[]=1` hands back an array, and casting one to a string is
        // a fatal rather than an empty search. A query parameter is whatever the caller
        // felt like sending.
        $term = is_string($q = $request->query('q')) ? trim($q) : '';

        if ($term === '') {
            return response()->json(['results' => []]);
        }

        /* An address answers as itself. Links get pasted into this box from Discord
           threads, and a slug that matches exactly is exact where a name is a guess. */
        $found = preg_match('/^[a-z0-9]{1,16}$/', $term)
            ? Schematic::query()->listed()->where('slug', $term)->with('user')->get()
            : collect();

        if ($found->isEmpty()) {
            $found = NameSearch::query(mb_substr($term, 0, 120))
                ->with('user')
                ->limit(self::OFFERED)
                ->get();
        }

        return response()->json([
            'results' => $found->map(fn (Schematic $one) => [
                'slug' => $one->slug,
                'name' => $one->displayName(),
                'author' => $one->credit(),
                // Zero blocks means the analysis has not been run on it, not that it is
                // empty. The page says nothing rather than printing a size it invented.
                'blocks' => (int) $one->blocks,
                'width' => (int) $one->width,
                'height' => (int) $one->height,
                'code' => strlen((string) $one->code) <= self::CARRIED ? $one->code : null,
            ])->values(),
        ]);
    }
}
