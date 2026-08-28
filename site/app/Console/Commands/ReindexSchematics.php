<?php

namespace App\Console\Commands;

use App\Models\Schematic;
use Illuminate\Console\Command;

/**
 * Rebuild the search index from analyses that are already stored.
 *
 *     php artisan forge:indexer                 tout le catalogue
 *     php artisan forge:indexer --lot=200       par paquets plus gros
 *
 * The one thing `forge:analyser` cannot do, and the gap it leaves is quiet.
 *
 * `schematic_items` is rebuilt by the `saved` hook, and the only path that saves rows in
 * bulk is `forge:analyser`, which takes what `Schematic::stale()` names. `stale()` compares
 * `engine_version` to the engine hash, and that hash covers JavaScript and the catalogue
 * only. So a correction written entirely in PHP - and the rule that keeps a sandbox tap out
 * of the producers' ranking is exactly that - never makes a single row stale. The queue
 * stays empty, the rows are never picked up, and the index keeps what it had.
 *
 * Deploying does not close it either: a deployment changes the code, not the rows already
 * written. Between the two, a correction can be merged, green, deployed and still true of
 * nothing at all.
 *
 * So this command exists to say "the rules changed, not the measurements". It runs no Node,
 * re-reads no schematic and re-measures nothing: it takes the analysis already in the row
 * and files it again under the rules of today.
 *
 * `updated_at` is deliberately left alone. Re-filing is not an edit, and bumping fifteen
 * thousand timestamps would put the whole catalogue at the top of "recently changed" for
 * a housekeeping pass nobody asked to see.
 */
class ReindexSchematics extends Command
{
    protected $signature = 'forge:indexer
        {--lot=500 : Combien de schematiques par paquet}';

    protected $description = 'Reclasser les analyses deja stockees, sans les recalculer';

    public function handle(): int
    {
        $batch = max(1, (int) $this->option('lot'));
        $seen = 0;
        $changed = 0;

        Schematic::query()
            ->whereNotNull('analysis')
            ->orderBy('id')
            ->chunkById($batch, function ($rows) use (&$seen, &$changed) {
                foreach ($rows as $one) {
                    $before = $this->fingerprint($one);

                    $one->indexWhatItMakes();
                    $one->indexWhatItCouldMake();
                    $one->indexWhatItHolds();
                    $one->indexWhatItNeeds();

                    $seen++;
                    if ($this->fingerprint($one->fresh()) !== $before) {
                        $changed++;
                    }
                }

                $this->line("  {$seen} relues, {$changed} reclassees");
            });

        $this->newLine();
        $this->info("{$seen} schematiques relues, {$changed} reclassees");

        return self::SUCCESS;
    }

    /**
     * What this row is filed under, in one string.
     *
     * Compared before and after so the command can report what actually moved rather than
     * how many rows it walked. A pass that changes nothing is the answer on a healthy
     * catalogue, and it should be visible as one instead of reading like fifteen thousand
     * rewrites.
     */
    private function fingerprint(Schematic $one): string
    {
        return $one->items()
            ->orderBy('item')->orderBy('sens')->orderBy('kind')
            ->get(['item', 'sens', 'kind', 'rate'])
            ->map(fn ($row) => "{$row->item}|{$row->sens}|{$row->kind}|{$row->rate}")
            ->implode(',');
    }
}
