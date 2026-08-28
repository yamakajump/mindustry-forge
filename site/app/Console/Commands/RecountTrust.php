<?php

namespace App\Console\Commands;

use App\Models\Decision;
use App\Models\Report;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Rebuild everybody's standing from the decisions that produced it.
 *
 *     php artisan forge:recount-trust
 *
 * `users.upheld` and `users.overturned` are running totals, incremented in the same
 * transaction as the decision that moves them. Running totals drift: a transaction that
 * half applied, a row edited by hand at three in the morning, a bug in a future branch that
 * increments twice. The cure this repository already uses for `schematics.likes` and
 * `schematics.views` is a command that recomputes them from the rows that are the truth.
 *
 * `decisions` is the truth here, and it is append only. Nothing in this command writes to
 * it, which is what makes running it safe at any hour: the worst it can do is put the
 * counters back to what the ledger says they should have been.
 */
class RecountTrust extends Command
{
    protected $signature = 'forge:recount-trust {--dry-run : Say what would change, change nothing}';

    protected $description = 'Rebuild every member standing from the decisions ledger';

    public function handle(): int
    {
        /*
         * One row per member per decision they spoke on, counted by verdict.
         *
         * Joined on the target rather than on the report id, because a decision settles a
         * thing and not a report: everybody who reported that thing is credited or charged
         * by it, including somebody whose report arrived after the moderator had already
         * looked but before they clicked.
         */
        $tally = DB::table('reports')
            ->join('decisions', function ($join) {
                $join->on('decisions.target_type', '=', 'reports.target_type')
                    ->on('decisions.target_id', '=', 'reports.target_id');
            })
            ->select('reports.user_id', 'decisions.verdict')
            ->selectRaw('count(*) as total')
            ->selectRaw('max(decisions.created_at) as last_at')
            ->groupBy('reports.user_id', 'decisions.verdict')
            ->get();

        $standing = [];
        foreach ($tally as $row) {
            $standing[$row->user_id] ??= ['upheld' => 0, 'overturned' => 0, 'overturned_at' => null];
            if ($row->verdict === Decision::UPHELD) {
                $standing[$row->user_id]['upheld'] = (int) $row->total;
            } else {
                $standing[$row->user_id]['overturned'] = (int) $row->total;
                $standing[$row->user_id]['overturned_at'] = $row->last_at;
            }
        }

        $moved = 0;
        foreach (User::whereIn('id', array_keys($standing))->orWhere('upheld', '>', 0)
            ->orWhere('overturned', '>', 0)->cursor() as $user) {
            $should = $standing[$user->id] ?? ['upheld' => 0, 'overturned' => 0, 'overturned_at' => null];

            if ((int) $user->upheld === $should['upheld']
                && (int) $user->overturned === $should['overturned']) {
                continue;
            }

            $this->line(sprintf('  %-24s %d/%d -> %d/%d  (upheld/overturned)',
                $user->name, $user->upheld, $user->overturned,
                $should['upheld'], $should['overturned']));
            $moved++;

            if (! $this->option('dry-run')) {
                $user->update($should);
            }
        }

        $this->info($moved === 0
            ? 'Nothing to fix: the counters say what the ledger says.'
            : ($this->option('dry-run')
                ? "{$moved} member(s) to fix. Rerun without --dry-run."
                : "{$moved} member(s) fixed from ".Decision::count().' decision(s) over '
                    .Report::count().' report(s).'));

        return self::SUCCESS;
    }
}
