<?php

namespace App\Http\Controllers;

use App\Models\Decision;
use App\Models\Report;
use App\Models\Schematic;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\View\View;

/**
 * The queue, which is one page and a pair of buttons.
 *
 * No permissions system behind it: `users.moderator` is a boolean set by hand, and a site
 * with one moderator needs a moderator rather than a hierarchy of roles. That is the
 * position the flag was added with, and nothing since has changed it.
 */
class ModerationController extends Controller
{
    public function index(Request $request): View
    {
        abort_unless($request->user()?->moderator, 404);

        /*
         * Everything reported and not yet settled, heaviest first.
         *
         * Ordered by weight and not by date, because the queue is read from the top and the
         * bottom may never be reached. What has been hidden automatically is what is
         * costing an author their page right now, so it goes first.
         */
        $waiting = Report::query()
            ->select('target_type', 'target_id')
            ->selectRaw('sum(weight) as weight, count(*) as reports, max(created_at) as last_at')
            ->whereNotIn('target_id', function ($query) {
                $query->select('target_id')->from('decisions')
                    ->whereColumn('decisions.target_type', 'reports.target_type');
            })
            ->groupBy('target_type', 'target_id')
            ->orderByDesc('weight')
            ->orderByDesc('last_at')
            ->get();

        $schematics = Schematic::whereIn('id', $waiting->pluck('target_id'))->get()->keyBy('id');

        return view('moderation', [
            'waiting' => $waiting,
            'schematics' => $schematics,
            'reasons' => Report::query()
                ->whereIn('target_id', $waiting->pluck('target_id'))
                ->get()
                ->groupBy(fn (Report $one) => $one->target_type.':'.$one->target_id),
        ]);
    }

    public function decide(Request $request): RedirectResponse
    {
        abort_unless($request->user()?->moderator, 404);

        $data = $request->validate([
            'cible' => ['required', 'string'],
            'id' => ['required', 'integer'],
            'verdict' => ['required', Rule::in([Decision::UPHELD, Decision::OVERTURNED])],
            'motif' => ['nullable', 'string', 'max:500'],
        ]);

        Decision::settle(
            $request->user(),
            $data['cible'],
            (int) $data['id'],
            $data['verdict'],
            $data['motif'] ?? null,
        );

        return redirect('/moderation');
    }
}
