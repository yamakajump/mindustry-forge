<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The default ranking, stored instead of recomputed on every visit.
 *
 * "Les mieux faites" is net power per block, and it was an expression in the ORDER BY, so
 * no index could serve it: every listing sorted the whole catalogue in a temporary B-tree
 * before throwing away all but twenty-four rows. Measured on fifteen thousand rows, that
 * is 24 ms on the first page and 55 ms deep into the list, against 1.5 ms for a sort the
 * index can answer. It is also the sort the marketplace shows by default, so it is the one
 * every visitor pays for, and the only one that gets worse as the catalogue grows.
 *
 * Same formula, moved. Nothing about the ordering changes; it is computed once when the
 * analysis is taken in rather than fifteen thousand times per page view.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('schematics', function (Blueprint $table) {
            // Double rather than float: MySQL's `float` is single precision, and rounding
            // a sort key to seven digits invents ties between schematics that were not
            // tied. The four extra bytes a row buy an ordering that means what it says.
            $table->double('power_per_block')->default(0)->after('power_used');
            $table->index(['visibility', 'power_per_block']);
        });

        // The rows already here were ranked by the expression, so they get exactly what it
        // gave them. The zero guard is the one the ORDER BY carried: a schematic with no
        // blocks is a parse that went wrong, not a division to attempt.
        DB::statement('update schematics set power_per_block =
            (power_made - power_used) / (case when blocks = 0 then 1 else blocks end)');
    }

    public function down(): void
    {
        Schema::table('schematics', function (Blueprint $table) {
            $table->dropIndex(['visibility', 'power_per_block']);
            $table->dropColumn('power_per_block');
        });
    }
};
