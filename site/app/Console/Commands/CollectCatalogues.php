<?php

namespace App\Console\Commands;

use App\Console\Commands\Sources\Catalogue;
use App\Console\Commands\Sources\MindustrySchematics;
use App\Console\Commands\Sources\MindustryTool;
use App\Console\Commands\Sources\PoliteClient;
use App\Models\Schematic;
use App\Models\Withdrawal;
use Illuminate\Console\Command;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Bring back the two existing catalogues, without breaking anything on their side.
 *
 *     php artisan forge:collecter                     both, one second between each call
 *     php artisan forge:collecter mindustry-tool      just one
 *     php artisan forge:collecter --limite=20         a trial run
 *
 * Collecting and publishing are two distinct gestures. Everything arrives `private`, with
 * no owner, and the catalogue stays measurable, queryable and invisible until the day
 * somebody decides otherwise. Publishing will be a bulk UPDATE; it waits for a message to
 * have gone out to the maintainer on the other side, which costs five minutes before and
 * is worth nothing anymore after.
 *
 * **Resuming carries no state.** No cursor, no position file, no progress table: before
 * paying the two calls an entry costs, the database is asked whether it already holds it.
 * Cutting off at the ten thousandth entry and restarting walks the listings again, which
 * takes two minutes, and only asks again for what is missing. A cursor, by contrast, goes
 * wrong the moment an entry is dropped on their side during the collection, and it goes
 * wrong silently.
 *
 * Nothing is analysed here. A collected row comes out with `engine_version` at null, so it
 * is stale by construction and `forge:analyser` will pick it up. The two passes fail
 * differently - one on somebody else's network, the other on a mangled `.msch` - and a
 * single command doing both would force starting everything over for the wrong half.
 */
class CollectCatalogues extends Command
{
    protected $signature = 'forge:collecter
        {source? : mindustry-tool, mindustryschematics, or nothing for both}
        {--pause=0 : Milliseconds between two batches, when the source asks to breathe}
        {--essais=4 : How many times to insist before giving up on a call}
        {--paralleles=1 : How many calls in flight at once. One by one unless asked}
        {--limite=0 : Stop after this many new entries, for a trial run}';

    protected $description = 'Ingest the existing catalogues, privately, without analysing them';

    /**
     * How many lost pages in a row before concluding this is no longer an accident.
     *
     * A withdrawn schematic, a broken detail, an empty `.msch`: that happens and is skipped
     * without counting anything here. What matters here is a whole page breaking, meaning
     * the server has changed its mind about us. Three in a row is enough to say so, and
     * continuing to hammer it would be exactly the wrong response.
     */
    private const GIVE_UP_AFTER = 3;

    public function handle(): int
    {
        $client = new PoliteClient(
            pauseMs: (int) $this->option('pause'),
            tries: (int) $this->option('essais'),
            tell: fn (string $said) => $this->warn("  {$said}"),
            atOnce: max(1, (int) $this->option('paralleles')),
        );

        $wanted = $this->argument('source');
        $catalogues = array_filter(
            [new MindustryTool($client), new MindustrySchematics($client)],
            fn (Catalogue $one) => $wanted === null || $one->source() === $wanted,
        );

        if ($catalogues === []) {
            $this->error("Unknown source: {$wanted}");
            $this->line('Expected: '.Schematic::MINDUSTRY_TOOL.', '.Schematic::MINDUSTRY_SCHEMATICS);

            return self::INVALID;
        }

        foreach ($catalogues as $catalogue) {
            try {
                $this->walk($catalogue);
            } catch (Throwable $stopped) {
                $this->error("{$catalogue->source()}: {$stopped->getMessage()}");
                $this->line('Nothing is lost: rerunning the command resumes where it left off.');

                return self::FAILURE;
            }
        }

        return self::SUCCESS;
    }

    private function walk(Catalogue $catalogue): void
    {
        $source = $catalogue->source();
        $announced = $catalogue->announced();

        $this->newLine();
        $this->info($source.($announced ? ": {$announced} announced" : ''));

        $taken = $held = $gone = $failed = $withdrawn = 0;
        $inARow = 0;
        $limit = (int) $this->option('limite');

        foreach ($catalogue->pages() as $listedPage) {
            // One query for the whole page rather than one per entry. This is what makes
            // resuming free: on a second pass, a hundred already known entries cost one
            // `select` and zero network calls.
            $known = Schematic::where('source', $source)
                ->whereIn('source_id', array_map($catalogue->idOf(...), $listedPage))
                ->pluck('source_id')
                ->flip();

            /* What an author asked us to take down, checked before anything is fetched.
               `SECURITY.md` promises a takedown is honoured, and deleting the row does not
               do that: this collector holds no cursor, it asks the database whether it
               already has a schematic, and a deliberate removal looks exactly like
               something never collected. It came back on the next run, counted as new. The
               memory has to live outside the table the removal empties. */
            $refused = Withdrawal::where('source', $source)
                ->whereIn('source_id', array_map($catalogue->idOf(...), $listedPage))
                ->pluck('source_id')
                ->flip();

            $todo = [];
            foreach ($listedPage as $listed) {
                $id = $catalogue->idOf($listed);
                if ($id !== '' && $refused->has($id)) {
                    $withdrawn++;

                    continue;
                }
                if ($id === '' || $known->has($id)) {
                    $held++;

                    continue;
                }
                $todo[$id] = $listed;
                // On a trial run, do not pay for a whole page of calls to keep three of
                // them: the batch is capped at what is still missing.
                if ($limit > 0 && count($todo) >= $limit - $taken) {
                    break;
                }
            }

            if ($todo === []) {
                continue;
            }

            // The whole page asked for at once. Sequential unless `--paralleles` says
            // otherwise: what costs is the sum of the round trips, not the work.
            try {
                $rows = $catalogue->fetchMany($todo);
            } catch (Throwable $broke) {
                $failed += count($todo);
                $this->warn("  page lost: {$broke->getMessage()}");
                if (++$inARow >= self::GIVE_UP_AFTER) {
                    throw $broke;
                }

                continue;
            }

            $inARow = 0;

            /* The whole page in one transaction, which is not a comfort detail. A kept
               row costs a handful of writes - the slug it draws, the schematic, the index
               of what it makes - and outside a transaction each one is a disk sync.
               Measured on a hundred entries: fifty seconds, nearly all of it spent waiting
               on the disk while the network had already handed everything over. In one
               block, the page is written once. This is worth having on its own, whether or
               not anything is fetched in parallel. */
            DB::transaction(function () use ($rows, $source, &$taken, &$gone) {
                foreach ($rows as $id => $row) {
                    if ($row === null) {
                        $gone++;

                        continue;
                    }

                    $taken += $this->keep($source, (string) $id, $row) ? 1 : 0;
                }
            });

            $this->line("  {$taken} taken, {$held} already held, {$gone} gone"
                .($withdrawn ? ", {$withdrawn} withdrawn on request" : ''));

            if ($limit > 0 && $taken >= $limit) {
                $this->line("  limit of {$limit} reached");
                break;
            }
        }

        $this->table(
            ['taken', 'already held', 'gone', 'failed', 'withdrawn'],
            [[$taken, $held, $gone, $failed, $withdrawn]],
        );
    }

    /**
     * Write the row, and let the database refuse a duplicate rather than predicting one.
     *
     * The page check does not cover everything: two entries with the same id in the same
     * page, or a second collection run in parallel, slip through it. The uniqueness
     * constraint on (source, source_id) is the real guarantee, and it is on the side that
     * cannot get it wrong. It is left to speak for itself.
     */
    private function keep(string $source, string $id, array $row): bool
    {
        try {
            Schematic::create([
                'user_id' => null,
                'slug' => Schematic::freshSlug(),
                'source' => $source,
                'source_id' => $id,
                'name' => mb_substr(trim($row['name']) ?: 'sans nom', 0, 120),
                'description' => $row['description'],
                // Same cleaning as the submission route: the game packs base64 onto one
                // line, and a carriage return let through by a server turns it into two
                // different strings for the same schematic.
                'code' => preg_replace('/\s+/', '', $row['code']),
                'visibility' => Schematic::PRIVATE,
                'author' => $row['author'] === null ? null : mb_substr($row['author'], 0, 80),
                'fetched_at' => now(),
                'source_meta' => $row['meta'],
            ]);

            return true;
        } catch (QueryException $refused) {
            // Only the duplicate. A column too short, a full database or a dropped
            // connection raise the same exception, and swallowing them would produce a
            // collection that announces fifteen thousand rows while having written three
            // thousand.
            if ($refused->getCode() !== '23000') {
                throw $refused;
            }

            return false;
        }
    }
}
