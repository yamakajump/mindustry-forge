<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Which blocks a schematic is built out of, one row per kind, so a block can be searched.
 *
 * `schematic_items` indexes what a schematic *produces*. Nothing recorded what it
 * *contains*, and that is the question the block wiki has to answer: standing on the
 * silicon smelter page, "show me layouts that use one" is the thing no other Mindustry site
 * can do, because none of them ever read the schematics they host.
 *
 * The answer was already in the database and unreachable. The stored `analysis` blob holds
 * a `detail` array with one entry per placed block, carrying its name. So this is filled
 * from the blob rather than by parsing the `.msch` again, for the same reason the
 * `schematic_items` migration gave: a walk written twice in two dialects is the second
 * implementation this repository spends its time avoiding.
 *
 * `count` is kept rather than a bare presence row. A layout with forty conveyors and one
 * smelter is a conveyor layout, and a listing that cannot tell it from a smelter layout
 * ranks them the same.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('schematic_blocks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('schematic_id')->constrained()->cascadeOnDelete();

            // As wide as the game's longest block name with room to spare, and the same
            // width as `schematic_items.item` so the two indexes cost the same.
            $table->string('block', 40);

            // How many of it. Small: a schematic is capped at far fewer tiles than this.
            $table->unsignedSmallInteger('count');

            // Rebuilt wholesale on every save, so a corrected schematic cannot stay listed
            // under a block it no longer holds.
            $table->unique(['schematic_id', 'block']);

            // The one query this table exists for: every schematic holding a given block,
            // busiest first, so the wiki page can show the layouts that lean on it.
            $table->index(['block', 'count']);
        });

        /*
         * Everything already stored, read back out of the analysis it was kept in.
         *
         * In PHP rather than SQL because the blob is a PHP array here and a JSON path
         * expression there, and the two dialects disagree about arrays of objects in ways
         * that are invisible until production runs MySQL and the tests ran SQLite.
         */
        DB::table('schematics')->orderBy('id')->chunk(500, function ($schematics) {
            $rows = [];
            foreach ($schematics as $schematic) {
                $analysis = json_decode($schematic->analysis ?? 'null', true);
                foreach (self::census($analysis) as $block => $count) {
                    $rows[] = [
                        'schematic_id' => $schematic->id,
                        'block' => $block,
                        'count' => $count,
                    ];
                }
            }
            if ($rows !== []) {
                DB::table('schematic_blocks')->insert($rows);
            }
        });
    }

    /**
     * Count each kind of block in one stored analysis.
     *
     * Repeated from `Schematic::countBlocks()` on purpose. A migration has to keep working
     * against the code as it was the day it ran, and calling a model method would make this
     * file change meaning every time that method is edited. The duplication is two lines
     * and it is frozen; the alternative is a migration that rewrites history.
     */
    private static function census(mixed $analysis): array
    {
        $counts = [];
        foreach ((array) ($analysis['detail'] ?? []) as $tile) {
            $name = $tile['name'] ?? null;
            if (is_string($name) && $name !== '') {
                $key = substr($name, 0, 40);
                $counts[$key] = ($counts[$key] ?? 0) + 1;
            }
        }

        return array_map(fn ($count) => min(65535, $count), $counts);
    }

    public function down(): void
    {
        Schema::dropIfExists('schematic_blocks');
    }
};
