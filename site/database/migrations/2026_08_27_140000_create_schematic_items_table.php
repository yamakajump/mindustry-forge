<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * What each schematic produces, one row per thing, so it can be searched and ranked.
 *
 * The site's whole claim is that you can find a schematic by what it makes. That lived in
 * a JSON blob, which means the filter was a `json_extract` no index could serve, the
 * dropdown of available items was a scan of every public row, and ranking by "graphite per
 * block" was not expressible at all. One row per (schematic, thing) makes all three a
 * plain indexed query.
 *
 * Power is one of those things. A reactor produces energy the way a press produces
 * graphite, so it is a row here and it is searchable the same way, which is how somebody
 * finds the most compact reactor rather than scrolling for it. It is indexed on the
 * surplus rather than on what the generators put out, because a plant that burns part of
 * its own output hands the base only the rest, and that is what two reactors are compared
 * on. That is not the consumption rule in reverse: a factory's power draw never touches
 * its ranking on graphite. It is that when energy is the product, the product is what is
 * left over.
 *
 * `rate` is in whatever unit that thing is naturally counted in: items per minute, power
 * per second. That is not sloppiness. Every comparison this table exists to serve is
 * between two schematics for the *same* thing, never between two different things, so the
 * unit never has to be reconciled. Nothing is ever displayed from here either; the page
 * reads `produces` and `power_made`, which carry their own units.
 *
 * This also removes `power_per_block`, added earlier the same day. It ranked on net power,
 * which quietly scored every real factory below zero: a silicon smelter consumes power, so
 * it ranked beneath an empty schematic. Electricity is something a base already has, not a
 * debt a schematic carries, and the fix is not a better weighting but ranking on what
 * comes out.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('schematic_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('schematic_id')->constrained()->cascadeOnDelete();
            $table->string('item', 40);
            $table->double('rate');

            // Rate divided by the block count, which is what "well made" means: not how
            // much it makes, but how much it makes for the room it takes.
            $table->double('rate_per_block');

            // Rebuilt wholesale whenever a schematic is saved, so a thing it no longer
            // makes cannot linger and keep it in a listing it does not belong to.
            $table->unique(['schematic_id', 'item']);

            // The two orderings the listing offers, once an item is chosen.
            $table->index(['item', 'rate_per_block']);
            $table->index(['item', 'rate']);
        });

        // Everything already stored, read out of the JSON it was kept in. Done in PHP
        // rather than SQL because the shape of the blob is a PHP array, and a JSON walk
        // written twice in two dialects is the second implementation this repository
        // spends its time avoiding.
        DB::table('schematics')->orderBy('id')->chunk(500, function ($schematics) {
            $rows = [];
            foreach ($schematics as $schematic) {
                $blocks = max(1, (int) $schematic->blocks);
                foreach ((array) json_decode($schematic->produces ?? '[]', true) as $item => $rate) {
                    if (! is_string($item) || ! is_numeric($rate) || $rate <= 0) {
                        continue;
                    }
                    $rows[] = [
                        'schematic_id' => $schematic->id,
                        'item' => substr($item, 0, 40),
                        'rate' => (float) $rate,
                        'rate_per_block' => (float) $rate / $blocks,
                    ];
                }
                // What the plant hands back, not what its generators put out: a
                // reactor that burns part of its own output gives the base the rest.
                $spare = (float) $schematic->power_made - (float) $schematic->power_used;
                if ($spare > 0) {
                    $rows[] = [
                        'schematic_id' => $schematic->id,
                        'item' => 'power',
                        'rate' => $spare,
                        'rate_per_block' => $spare / $blocks,
                    ];
                }
            }
            if ($rows !== []) {
                DB::table('schematic_items')->insert($rows);
            }
        });

        Schema::table('schematics', function (Blueprint $table) {
            $table->dropIndex(['visibility', 'power_per_block']);
            $table->dropColumn('power_per_block');
        });
    }

    public function down(): void
    {
        Schema::table('schematics', function (Blueprint $table) {
            $table->double('power_per_block')->default(0)->after('power_used');
            $table->index(['visibility', 'power_per_block']);
        });

        DB::statement('update schematics set power_per_block =
            (power_made - power_used) / (case when blocks = 0 then 1 else blocks end)');

        Schema::dropIfExists('schematic_items');
    }
};
