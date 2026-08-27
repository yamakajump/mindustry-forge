<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Where a schematic came from, for the ones that did not come from here.
 *
 * The site is about to hold far more schematics than its members ever posted, because the
 * two existing Mindustry catalogues hold fifteen thousand between them and neither can say
 * what any of them actually produce. Answering that is the whole argument of this
 * repository, and it needs the schematics to answer it about.
 *
 * So origin is a column, not a note kept somewhere else. Added afterwards it is never
 * recovered: rows already in the table have no origin left to find, and a catalogue that
 * cannot say where a schematic came from cannot credit its author, cannot link back, and
 * cannot be taken down cleanly if it is ever asked to be.
 *
 * `source_meta` keeps whatever the source answered, whole and unread. Re-crawling twelve
 * thousand pages costs hours, so the cheap moment to keep a field is the moment it arrives,
 * long before anybody knows which fields matter. It also keeps their own power figures,
 * which turns their catalogue into twelve thousand free comparisons against this engine:
 * wherever the two disagree one of them is wrong, and this repository owns a bench that
 * can say which.
 *
 * `user_id` goes nullable because an imported schematic has no account here. That is not
 * free: see `Schematic::visibleTo()`, where a null author and a signed-out visitor used to
 * compare equal.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('schematics', function (Blueprint $table) {
            // Where it came from. 'upload' is the default so every row already in the
            // table gets the right answer without a backfill: they were all posted here.
            $table->string('source', 24)->default('upload')->after('user_id');

            // Its id at the source, which is what makes ingesting twice harmless.
            $table->string('source_id', 64)->nullable()->after('source');

            // The credit, as the source spelled it. Not a foreign key: these people have
            // no account here and most never will.
            $table->string('author', 80)->nullable()->after('source_id');

            $table->timestamp('fetched_at')->nullable()->after('author');

            // Everything else the source said, kept whole for the same reason `code` is.
            $table->json('source_meta')->nullable()->after('analysis');

            // The collector can die halfway through and start again. Nulls do not collide
            // in SQL, so every locally uploaded row (source_id null) sits outside this.
            $table->unique(['source', 'source_id']);

            // A listing filtered to one catalogue, or to what members posted themselves.
            $table->index(['source', 'visibility']);
        });

        Schema::table('schematics', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('schematics', function (Blueprint $table) {
            $table->dropUnique(['source', 'source_id']);
            $table->dropIndex(['source', 'visibility']);
            $table->dropColumn(['source', 'source_id', 'author', 'fetched_at', 'source_meta']);
        });

        // Rows with no author cannot exist under the old shape, and they are exactly the
        // imported ones. Dropping them is the honest reversal: keeping them would mean
        // inventing an owner for somebody else's work.
        DB::table('schematics')->whereNull('user_id')->delete();

        Schema::table('schematics', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable(false)->change();
        });
    }
};
