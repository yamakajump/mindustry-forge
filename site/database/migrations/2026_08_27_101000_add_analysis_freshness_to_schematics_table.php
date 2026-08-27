<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which engine said that, and when.
 *
 * A stored analysis is a measurement with a date on it, and the engine that produced it
 * changes every week. The day a power calculation is corrected, every figure already in
 * this table becomes wrong, silently, and the site goes on presenting them as measured.
 * That is the one failure this repository cannot afford, because measured figures are the
 * only thing it sells.
 *
 * Two columns rather than a history table. `engine_version` is a short hash of the
 * analysis sources, so a stale row is a `where engine_version != ?` and re-analysis runs
 * in batches that can stop and resume. A full table of every analysis every engine ever
 * produced would be the more interesting artefact, and nobody would read it.
 *
 * Both are null for rows that predate this, which is the truthful answer: nothing recorded
 * which engine analysed them, so nothing can claim to know. They come back on the next
 * pass.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('schematics', function (Blueprint $table) {
            $table->timestamp('analysed_at')->nullable()->after('source_meta');
            $table->string('engine_version', 12)->nullable()->after('analysed_at');

            // The batch query the re-analysis pass runs: everything the current engine has
            // not seen, oldest first.
            $table->index(['engine_version', 'analysed_at']);
        });
    }

    public function down(): void
    {
        Schema::table('schematics', function (Blueprint $table) {
            $table->dropIndex(['engine_version', 'analysed_at']);
            $table->dropColumn(['analysed_at', 'engine_version']);
        });
    }
};
