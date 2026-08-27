<?php

namespace Database\Seeders;

use App\Models\Schematic;
use App\Models\User;
use App\Services\EngineVersion;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * A catalogue the size of the one this site is about to hold.
 *
 * Written to be measured against, not to look at. Every performance question about the
 * marketplace is a question about fifteen thousand rows, and a listing page that answers
 * in four milliseconds over the forty rows on a laptop says nothing at all about it. The
 * only honest way to know which query is the slow one is to have the rows.
 *
 *     php artisan db:seed --class=CatalogueSeeder
 *
 * Never run against production: it writes rows that credit authors who do not exist.
 */
class CatalogueSeeder extends Seeder
{
    /**
     * How many, by default. The two existing catalogues hold about this between them.
     *
     * Overridable with `CATALOGUE_SEED_COUNT`, because continuous integration wants a few
     * hundred rows to check that the queries run at all, and only a machine measuring
     * something wants fifteen thousand.
     */
    private const COUNT = 15000;

    /** Inserted in blocks, because fifteen thousand round trips is its own benchmark. */
    private const CHUNK = 500;

    /** What a Mindustry factory actually makes, so the item filter has real cardinality. */
    private const ITEMS = [
        'copper', 'lead', 'graphite', 'silicon', 'metaglass', 'titanium', 'thorium',
        'plastanium', 'phase-fabric', 'surge-alloy', 'scrap', 'coal', 'sand',
        'pyratite', 'blast-compound', 'spore-pod',
    ];

    public function run(): void
    {
        $author = User::first() ?? User::factory()->create();
        $engine = EngineVersion::current();
        $now = now();
        $wanted = max(1, (int) env('CATALOGUE_SEED_COUNT', self::COUNT));

        $made = 0;
        while ($made < $wanted) {
            $rows = [];
            $size = min(self::CHUNK, $wanted - $made);

            for ($i = 0; $i < $size; $i++) {
                $n = $made + $i;
                // Four in five are collected rather than posted, which is the ratio the
                // site is heading for and the one the listing has to stay honest under.
                $imported = $n % 5 !== 0;
                $source = match ($n % 3) {
                    0 => Schematic::MINDUSTRY_TOOL,
                    1 => Schematic::MINDUSTRY_SCHEMATICS,
                    default => Schematic::MINDUSTRY_TOOL,
                };

                $makes = self::ITEMS[$n % count(self::ITEMS)];
                $needs = self::ITEMS[($n * 7 + 3) % count(self::ITEMS)];
                $blocks = 4 + ($n * 13) % 400;
                $powerMade = ($n * 37) % 6000;
                $powerUsed = ($n * 11) % 2000;

                $rows[] = [
                    'user_id' => $imported ? null : $author->id,
                    'source' => $imported ? $source : Schematic::UPLOAD,
                    'source_id' => $imported ? "seed-{$source}-{$n}" : null,
                    'author' => $imported ? 'joueur'.($n % 400) : null,
                    'fetched_at' => $imported ? $now : null,
                    'slug' => Str::lower(Str::random(10)),
                    'name' => "Schematique de test {$n}",
                    'description' => null,
                    'code' => 'bXNjaAF4nA'.Str::random(24),
                    // Most of a real catalogue is public; the rest is what nobody
                    // published, and the listing has to skip it without reading it.
                    'visibility' => $n % 11 === 0 ? 'private' : 'public',
                    'verified' => $n % 50 === 0,
                    'analysis' => json_encode(['blocks' => $blocks]),
                    'source_meta' => null,
                    'analysed_at' => $now,
                    'engine_version' => $engine,
                    'width' => 4 + $n % 60,
                    'height' => 4 + $n % 40,
                    'blocks' => $blocks,
                    'power_made' => $powerMade,
                    'power_used' => $powerUsed,
                    // Written by hand because this insert goes round Eloquent for speed,
                    // and so misses the hook that normally keeps this column in step.
                    'power_per_block' => ($powerMade - $powerUsed) / max(1, $blocks),
                    'produces' => json_encode([$makes => 10 + $n % 300]),
                    'needs' => json_encode([$needs => 5 + $n % 150]),
                    'views' => $n % 900,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            DB::table('schematics')->insert($rows);
            $made += $size;
        }

        $this->command?->info("{$made} schematiques de test en base.");
    }
}
