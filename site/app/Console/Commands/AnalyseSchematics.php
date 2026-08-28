<?php

namespace App\Console\Commands;

use App\Models\Schematic;
use App\Services\EngineVersion;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Process;

/**
 * Measure what the collector brought back, with the browser's own engine.
 *
 *     php artisan forge:analyser              everything the current engine has not seen
 *     php artisan forge:analyser --lot=200    in bigger batches
 *     php artisan forge:analyser --tout       redo everything, even what is already current
 *
 * There is only one implementation of the analysis in this repository, and it is
 * `site/public/forge/analyse.js`. Running that file under Node does not make a second one:
 * it is the same file, with the same catalogue, rendering the same figures. Rewriting it in
 * PHP would make a second one, and a second thing to have wrong. So the orchestration and
 * the database stay here, the arithmetic stays there, and what passes between the two fits
 * on a single line of JSON.
 *
 * This command serves two purposes. It measures what just arrived, and it re-measures the
 * whole catalogue the day a correction to the engine lands: `Schematic::stale()` names
 * exactly the rows whose figures were produced by an engine that no longer exists, and
 * without it the site would keep presenting last month's figures as measurements. That is
 * the one thing it sells.
 */
class AnalyseSchematics extends Command
{
    protected $signature = 'forge:analyser
        {--lot=50 : How many schematics per call to Node}
        {--limite=0 : Stop after this many schematics}
        {--tout : Redo everything, not just what is stale}';

    protected $description = 'Analyse the schematics the current engine has not seen';

    public function handle(): int
    {
        $script = dirname(base_path()).DIRECTORY_SEPARATOR.'tools'.DIRECTORY_SEPARATOR.'ingest.mjs';
        if (! is_file($script)) {
            $this->error("Not found: {$script}");

            return self::FAILURE;
        }

        $batch = max(1, (int) $this->option('lot'));
        $limit = (int) $this->option('limite');
        $engine = EngineVersion::current();

        $this->info("Engine {$engine}");

        $done = $failed = 0;
        $after = 0;

        while (true) {
            $take = $limit > 0 ? min($batch, $limit - $done) : $batch;
            if ($take <= 0) {
                break;
            }

            $rows = $this->pending($after)->limit($take)->get();
            if ($rows->isEmpty()) {
                break;
            }
            $after = (int) $rows->max('id');

            $answers = $this->askNode($script, $rows);
            if ($answers === []) {
                // Node did not answer at all. Stamping these fifty rows as unreadable would
                // burn the catalogue over an absent command: the engine would mark them
                // seen, and nothing would ever pick them up again.
                $this->error('Node returned nothing: nothing was written, the queue is intact.');

                return self::FAILURE;
            }

            foreach ($rows as $schematic) {
                $answer = $answers[$schematic->id] ?? ['erreur' => 'aucune reponse de Node'];

                if (isset($answer['analyse'])) {
                    $this->apply($schematic, $answer['analyse']);
                    $done++;
                } else {
                    $this->giveUpOn($schematic, (string) $answer['erreur']);
                    $failed++;
                    $done++;
                }
            }

            $this->line("  {$done} analysed".($failed ? ", {$failed} of them unreadable" : ''));
        }

        $this->newLine();
        $this->info("{$done} analysed, {$failed} unreadable");

        return self::SUCCESS;
    }

    /**
     * The queue, and two ways not to spin in circles inside it.
     *
     * In normal operation the filter empties itself: an analysed row stops being stale, so
     * picking up the head of `stale()` on every pass necessarily moves forward, and the
     * intended order - never analysed first, then the oldest - is respected.
     *
     * `--tout` does not have that luxury: nothing ever leaves the filter, so picking up the
     * head would return the same fifty rows forever. Hence the cursor on the id, which is
     * used only for this case.
     */
    private function pending(int $after)
    {
        return $this->option('tout')
            ? Schematic::query()->where('id', '>', $after)->orderBy('id')
            : Schematic::stale();
    }

    /**
     * A round trip with Node: one line of JSON per schematic, in both directions.
     *
     * One process per batch rather than one per schematic. Node takes about two tenths of a
     * second to start up and re-read the block catalogue, which is not noticeable once but
     * adds up to fifty minutes over fifteen thousand.
     *
     * @return array<int, array{analyse?: array, erreur?: string}>
     */
    private function askNode(string $script, $rows): array
    {
        $asked = $rows
            ->map(fn (Schematic $one) => json_encode(['id' => $one->id, 'code' => $one->code]))
            ->implode("\n");

        $ran = Process::timeout(600)->input($asked)->run(['node', $script]);

        if (! $ran->successful()) {
            // Node missing, script broken: this is not about any one schematic in
            // particular, and retrying line by line would only repeat the same failure.
            $this->error(trim($ran->errorOutput()) ?: 'node failed without saying why');

            return [];
        }

        $answers = [];
        foreach (preg_split('/\r?\n/', trim($ran->output())) as $line) {
            $said = json_decode($line, true);
            if (is_array($said) && isset($said['id'])) {
                $answers[(int) $said['id']] = $said;
            }
        }

        return $answers;
    }

    private function apply(Schematic $schematic, array $analysis): void
    {
        $schematic->fill(Schematic::fromAnalysis($analysis));
        $schematic->analysis = $analysis;
        // `saved` rebuilds `schematic_items` behind the scenes, so a re-analysed schematic
        // stops appearing under what it no longer produces.
        $schematic->save();
    }

    /**
     * Stamp a schematic even when the engine failed to read it.
     *
     * Otherwise it stays stale forever, the queue never empties, and the command keeps
     * cycling over the same fifty broken `.msch` files forever. It **has** been analysed
     * by this engine: the answer is simply that it cannot manage it, and that is an answer
     * worth keeping. The day the engine learns the mod block that was blocking it, its
     * version changes and the row comes back into the queue on its own.
     */
    private function giveUpOn(Schematic $schematic, string $why): void
    {
        $this->warn("  {$schematic->slug} : {$why}");

        $schematic->forceFill([
            'analysis' => ['erreur' => $why],
            'analysed_at' => now(),
            'engine_version' => EngineVersion::current(),
        ])->save();
    }
}
