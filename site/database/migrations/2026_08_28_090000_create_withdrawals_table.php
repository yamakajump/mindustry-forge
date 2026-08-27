<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Schematics an author asked us to take down, remembered so they stay down.
 *
 * `SECURITY.md` promises a takedown will be honoured without argument. It could not be:
 * deleting the row was the whole gesture, and the next collection put it straight back.
 * Proven rather than suspected - deleted, re-collected, back, and the collector reported
 * it as an ordinary new entry.
 *
 * That is not a bug in the collector, it is the cost of the property that makes it
 * restartable. It carries no cursor and no progress file; before paying for the two calls
 * an entry costs, it asks the database whether it already holds the row. A deliberate
 * removal and something never collected look exactly the same from there, and nothing in
 * `schematics` can tell them apart, because the whole point is that the row is gone.
 *
 * So the memory lives outside the table the removal empties. Small, append-only, and never
 * touched by a collection.
 *
 * A takedown that quietly undoes itself is worse than no takedown at all, because the
 * author has been told it was done and has no reason to look again.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('withdrawals', function (Blueprint $table) {
            $table->id();

            // The same pair the collector checks before fetching anything, and the same
            // pair `schematics` is unique on. Kept as plain columns rather than a foreign
            // key: the row it refers to is gone, and it has to stay gone.
            $table->string('source', 24);
            $table->string('source_id', 64);

            // Why, in whatever words the request arrived in. Nobody has to fill it, but a
            // takedown with no trace is one nobody can answer questions about later.
            $table->text('reason')->nullable();

            $table->timestamps();

            $table->unique(['source', 'source_id']);
        });
    }

    public function down(): void
    {
        // Dropping this makes every withdrawn schematic collectable again, which is the
        // one reversal that should be done on purpose and never by accident.
        Schema::dropIfExists('withdrawals');
    }
};
