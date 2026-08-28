<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * How much it makes for the ground it stands on, beside how much it makes per block.
 *
 * `rate_per_block` already answers "what does it cost to build", and it is a real question.
 * It is not the question a player asks in front of a gap in their base, which is "will this
 * fit, and what is the best thing that fits". A layout spread over a wide footprint with few
 * blocks scores well per block and badly per tile; a dense one does the opposite. Ranking
 * both on the same column would have been one number answering two questions, which is the
 * fault this repository has documented six times.
 *
 * Derived from figures already stored, so nothing is re-analysed and nothing goes stale:
 * `blocks.json` is untouched, and `EngineVersion` hashes that file and the sources of the
 * analysis, not this one. Verified by checksum rather than asserted.
 *
 * The divisor is the bounding box and not the count of occupied tiles. That is deliberate
 * and it is the honest one: a schematic is pasted as a rectangle, and the empty tiles inside
 * it are still ground the player cannot use for anything else.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('schematic_items', function (Blueprint $table) {
            $table->double('rate_per_tile')->default(0)->after('rate_per_block');
        });

        /* Filled in SQL rather than in PHP, unlike the walk that created this table.
           That walk had to decode a JSON blob, which is a PHP array here and a JSON path
           expression there; this one reads three numeric columns, which every dialect
           agrees about. */
        DB::statement('update schematic_items set rate_per_tile = rate / (
            select case when s.width * s.height = 0 then 1 else s.width * s.height end
            from schematics s where s.id = schematic_items.schematic_id)');

        Schema::table('schematic_items', function (Blueprint $table) {
            // The ordering this column exists for, and it has to be an index: the listing
            // sorts fifteen thousand rows on it on every view of the page.
            $table->index(['item', 'rate_per_tile']);
        });
    }

    public function down(): void
    {
        Schema::table('schematic_items', function (Blueprint $table) {
            $table->dropIndex(['item', 'rate_per_tile']);
            $table->dropColumn('rate_per_tile');
        });
    }
};
