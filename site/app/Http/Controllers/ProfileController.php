<?php

namespace App\Http\Controllers;

use App\Models\Contribution;
use App\Models\Schematic;
use App\Models\SchematicItem;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\View\View;

/**
 * A member's page: what they posted, and what they documented.
 *
 * For accounts only. The 15,000 imported schematics credit an author string with no account
 * behind it, and giving each of those a page would make thousands of near empty pages that
 * are bad for search and let anybody claim a name that is not theirs. Their credit stays
 * what it is, a name and a link back to the source.
 *
 * Everything here is already public. Favorites, notes and private folders are private by
 * construction, and a public page that renders them is a leak rather than a feature.
 */
class ProfileController extends Controller
{
    public function show(Request $request, User $user): View
    {
        $posted = Schematic::where('user_id', $user->id)->listed()
            ->withCount([])->orderByDesc('created_at')->limit(24)->get();

        /*
         * The figure that belongs at the top.
         *
         * How many ceilings this person turned into a throughput is what this site needs
         * and what no other Mindustry catalogue can even count. Views belong lower: a
         * member who posted one schematic that went round Discord has more of them than
         * somebody who documented three hundred plans, and the two are not the same
         * achievement. Every number on this page is named for the question it answers.
         */
        $documented = Contribution::where('user_id', $user->id)
            ->where('state', Contribution::APPLIED)
            ->count();

        $byResource = SchematicItem::query()
            ->join('schematics', 'schematics.id', '=', 'schematic_items.schematic_id')
            ->join('contributions', 'contributions.id', '=', 'schematics.contribution_id')
            ->where('contributions.user_id', $user->id)
            ->where('schematic_items.kind', SchematicItem::DECLARE)
            ->where('schematic_items.sens', SchematicItem::PRODUIT)
            ->groupBy('schematic_items.item')
            ->orderByRaw('count(*) desc')
            ->limit(8)
            ->pluck('schematic_items.item')
            ->all();

        return view('profile', [
            'member' => $user,
            'posted' => $posted,
            'postedCount' => Schematic::where('user_id', $user->id)->listed()->count(),
            'views' => (int) Schematic::where('user_id', $user->id)->listed()->sum('views'),
            'documented' => $documented,
            'byResource' => $byResource,
            'measured' => Schematic::where('user_id', $user->id)->listed()
                ->where('verified', true)->count(),
            /*
             * Their own standing, to them alone.
             *
             * The rules are public, on their own page; what stays private is what any given
             * member's word weighs. Published, it tells somebody exactly how many accounts
             * they need to move a threshold, and it points at which accounts are worth
             * harassing. There is no leaderboard of the trustworthy.
             */
            'standing' => $request->user()?->is($user) ? $user->standing() : null,
        ]);
    }
}
