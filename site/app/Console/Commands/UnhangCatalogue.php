<?php

namespace App\Console\Commands;

use App\Models\Schematic;
use Illuminate\Console\Command;

/**
 * Take the collected catalogue off the wall, without throwing it away.
 *
 *     php artisan forge:decrocher --raison="catalogue remis a zero"
 *     php artisan forge:decrocher y00htikdfh --rendre
 *
 * Fifteen thousand schematics were scraped from two other sites to have something to show.
 * Keeping them is a decision about what this site is, and it was taken the other way: a
 * catalogue nobody chose is a catalogue nobody trusts, and the point of the showcase is to
 * be worth reading rather than to be large. So they come off the wall and the shelf keeps
 * them, until somebody puts up schematics they actually picked.
 *
 * **This is not `forge:retirer`, and confusing the two is expensive.** That command answers
 * a takedown request: it deletes, and it records a `Withdrawal` so the collector never
 * brings the schematic back. Doing that here would write fifteen thousand refusals into a
 * table that means "an author asked us to stop", and it would be irreversible in the one
 * direction that matters. Nothing here is a takedown. Nothing here is deleted.
 *
 * What it sets is `hidden_at`, which `Schematic::listed()` already reads, so one write
 * takes a schematic out of the showcase, the block pages, the comparison, the home page
 * and the sitemap at once. A moderator can still open its page by address, which is what
 * makes this a shelf rather than a bin.
 *
 * There is no screen for the way back. The moderation queue is built from reports, and
 * these carry none, so they will never appear in it: without this command a hidden
 * catalogue would be a state with no exit. Hence `--rendre`, and hence the care below
 * about what it is allowed to touch.
 */
class UnhangCatalogue extends Command
{
    protected $signature = 'forge:decrocher
        {slug? : One schematic, by the address after /s/. Left out, the whole collected catalogue.}
        {--raison= : Why, kept on the row. Required to put a whole catalogue back.}
        {--rendre : Hang it back up instead of taking it down}
        {--dry-run : Say what would change, change nothing}';

    protected $description = 'Take the collected catalogue out of the showcase, keeping every row';

    public function handle(): int
    {
        $slug = $this->argument('slug');
        $reason = $this->option('raison') ?: null;
        $back = (bool) $this->option('rendre');
        $dry = (bool) $this->option('dry-run');

        $query = $slug !== null
            ? Schematic::where('slug', $slug)
            : $this->wholeCatalogue($back, $reason);

        if ($query === null) {
            return self::FAILURE;
        }

        $count = (clone $query)->count();

        if ($count === 0) {
            $this->info($slug !== null
                ? "No schematic at the address /s/{$slug}"
                : 'Nothing to do: no schematic is in that state.');

            return $slug !== null ? self::FAILURE : self::SUCCESS;
        }

        if ($dry) {
            $this->info(($back ? 'Would hang back up: ' : 'Would take down: ')."{$count}");

            return self::SUCCESS;
        }

        (clone $query)->update($back
            ? ['hidden_at' => null, 'hidden_reason' => null]
            : ['hidden_at' => now(), 'hidden_reason' => $reason]);

        $this->info(($back ? 'Hung back up: ' : 'Taken down: ')."{$count}");
        $this->line('Every row is still there, and every page still answers for a moderator.');

        return self::SUCCESS;
    }

    /**
     * The whole catalogue, meaning everything nobody here put up.
     *
     * Read off `user_id` rather than off `source`, because the question is not where a
     * schematic came from but whether a person on this site chose it. A new collector with
     * a name nobody thought of would slip past a list of sources; it cannot slip past
     * having no account behind it.
     *
     * Putting a whole catalogue back is the dangerous direction, and it is the one that
     * needs a reason to match. A schematic hidden after a takedown request carries its own
     * reason, and a bulk `--rendre` that swept it up would undo, silently, the one promise
     * `SECURITY.md` makes out loud.
     */
    private function wholeCatalogue(bool $back, ?string $reason)
    {
        $query = Schematic::whereNull('user_id');

        if (! $back) {
            return $query->whereNull('hidden_at');
        }

        if ($reason === null) {
            $this->error('--rendre over a whole catalogue needs --raison, matched exactly '
                .'against what was written when it was taken down.');
            $this->line('Without it this would also put back whatever was hidden on request.');

            return null;
        }

        return $query->whereNotNull('hidden_at')->where('hidden_reason', $reason);
    }
}
