<?php

namespace App\Console\Commands;

use App\Models\Schematic;
use App\Models\Withdrawal;
use Illuminate\Console\Command;

/**
 * Honour a takedown request, in the one gesture that actually honours it.
 *
 *     php artisan forge:retirer y00htikdfh --raison="demande de l auteur, 28/08"
 *
 * `SECURITY.md` promises an author's schematic will be removed without argument. Deleting
 * the row does not do that: the collector holds no cursor, it asks the database whether a
 * schematic is already there, and a deliberate removal looks exactly like something never
 * collected. It came back at the next run, counted as a new entry.
 *
 * So removal and remembering are one command. Whoever answers a request cannot do half of
 * it and believe they are done, which is the failure that matters here: the author has
 * been told it was handled and has no reason to check again.
 */
class WithdrawSchematic extends Command
{
    protected $signature = 'forge:retirer
        {slug : The schematic, as it appears after /s/ in its address}
        {--raison= : What was asked, and by whom, for whoever reads this later}';

    protected $description = 'Remove a schematic and keep the collector from bringing it back';

    public function handle(): int
    {
        $schematic = Schematic::where('slug', $this->argument('slug'))->first();

        if ($schematic === null) {
            $this->error("Aucune schematique a l'adresse /s/{$this->argument('slug')}");

            return self::FAILURE;
        }

        $this->line("  {$schematic->name}");
        $this->line('  '.($schematic->sourceName() ?? 'postee ici').', par '.$schematic->credit());

        // Nothing collected this one, so nothing will bring it back and there is nothing to
        // remember. Said out loud rather than silently skipped: whoever runs this is
        // answering somebody, and needs to know which of the two things happened.
        if ($schematic->source_id === null) {
            $schematic->delete();
            $this->info('Retiree. Rien ne la ramenera : elle a ete postee ici, pas collectee.');

            return self::SUCCESS;
        }

        Withdrawal::take($schematic, $this->option('raison') ?: null);

        $this->info("Retiree, et {$schematic->source} ne la ramenera pas : "
            .'la collecte consulte les retraits avant de demander quoi que ce soit.');

        return self::SUCCESS;
    }
}
