<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * What each schematic asks for from outside, indexed the way what it makes already is.
 *
 * The other half of the site's own question, and the other direction of it. "What makes
 * graphite" is a shopping list; "what eats coal" is the answer to "my mine is running, what
 * can I build now", which is how a player picks their next factory. The column that answers
 * it has been stored since the first day and read by nobody: `schematics.needs` carries what
 * the layout demands from outside, per minute, already net of what it makes itself.
 *
 * So this recomputes nothing. It walks a column that is already right and makes it
 * searchable, which is exactly what the `schematic_items` migration did for production.
 *
 * Filed as a ceiling rather than a measurement, because that is what it is: the appetite of
 * a layout running flat out. Mixing the two natures in one column is the fault this
 * repository spent a day undoing on the production side, and it would be just as quiet here.
 *
 * Walked in PHP rather than in SQL because the shape is a JSON blob, and a JSON walk written
 * twice in two dialects is the second implementation this repository spends its time
 * avoiding. MySQL and SQLite disagree about JSON objects in ways that stay invisible until
 * production runs the one the tests did not.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('schematic_items', function (Blueprint $table) {
            // The one query this exists for: everything that eats a given thing, hungriest
            // first. `sens` is in the key because the same item name lives on both sides.
            $table->index(['item', 'sens', 'rate']);
        });

        DB::table('schematics')->orderBy('id')->chunk(500, function ($schematics) {
            $rows = [];
            foreach ($schematics as $schematic) {
                $blocks = max(1, (int) $schematic->blocks);
                $tiles = max(1, (int) $schematic->width * (int) $schematic->height);

                foreach ((array) json_decode($schematic->needs ?? '{}', true) as $item => $rate) {
                    /* Categorical keys are left out. A generator that burns "anything" names
                       no resource and comes out under `*combustible`. Deciding whether coal
                       covers that hunger needs the game's per-block `accepts` list, which
                       `needs.js` already reads in the browser; resolving it a second time
                       here would be the duplicate this repository keeps refusing. And a name
                       no player can type is not a filter anyway. */
                    if (! is_string($item) || $item === '' || $item[0] === '*') {
                        continue;
                    }
                    if (! is_numeric($rate) || $rate <= 0) {
                        continue;
                    }

                    $rows[] = [
                        'schematic_id' => $schematic->id,
                        'item' => substr($item, 0, 40),
                        'sens' => 'consomme',
                        'kind' => 'plafond',
                        'rate' => (float) $rate,
                        'rate_per_block' => (float) $rate / $blocks,
                        'rate_per_tile' => (float) $rate / $tiles,
                    ];
                }
            }

            if ($rows !== []) {
                // `insertOrIgnore` rather than `insert`: this migration can meet rows the
                // save hook has already written on a database that is not empty, and a
                // duplicate key would abort a pass over fifteen thousand rows near its end.
                DB::table('schematic_items')->insertOrIgnore($rows);
            }
        });
    }

    public function down(): void
    {
        DB::table('schematic_items')->where('sens', 'consomme')->delete();

        Schema::table('schematic_items', function (Blueprint $table) {
            $table->dropIndex(['item', 'sens', 'rate']);
        });
    }
};
