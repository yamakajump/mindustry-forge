<?php

use App\Models\Schematic;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A fingerprint of the string itself, so the same schematic cannot be published twice.
 *
 * Publishing is about to become the default gesture in the analyser rather than a choice
 * buried in a dropdown, and nothing in this table has ever stopped the same code from
 * being posted again. The catalogue already holds fifteen thousand imported schematics:
 * the common act is pasting one of them back in, which would have produced a second public
 * page for a schematic that already has one, indexed, listed, and crediting the wrong
 * person.
 *
 * Indexed and NOT unique. Whatever the two imported catalogues already hold between them,
 * they were collected without this column and certainly repeat each other; a unique index
 * would fail the migration on production data and tell us so only there. The refusal lives
 * in the controller instead, where it can be narrow: only publishing is refused, keeping a
 * private copy never is.
 *
 * Backfilled in PHP rather than with a single UPDATE. SQLite, which every test runs on,
 * has no SHA2 function, so a one-line SQL backfill would pass on the server and be
 * untestable here, which is the shape of a migration nobody can rehearse.
 */
return new class extends Migration
{
    /** Rows per pass. Big enough to be one query per fifty megabytes, small enough to hold. */
    private const BATCH = 500;

    public function up(): void
    {
        Schema::table('schematics', function (Blueprint $table) {
            $table->char('code_hash', 64)->nullable()->after('code');
            $table->index('code_hash');
        });

        /* `select` is spelled out because `code` is the heaviest column in the table and
           the default would drag every row's analysis and source_meta through memory
           alongside it.

           One transaction per chunk rather than one per row. Fifteen thousand five hundred
           single-statement updates each pay their own commit, which measured at a minute
           and twenty on the development database; the site is in maintenance for the whole
           of it, so the cost lands on players and not on whoever runs the deployment. */
        DB::table('schematics')->select('id', 'code')->orderBy('id')
            ->chunk(self::BATCH, function ($rows) {
                DB::transaction(function () use ($rows) {
                    foreach ($rows as $row) {
                        DB::table('schematics')->where('id', $row->id)
                            ->update(['code_hash' => Schematic::hashOf($row->code)]);
                    }
                });
            });
    }

    public function down(): void
    {
        Schema::table('schematics', function (Blueprint $table) {
            $table->dropIndex(['code_hash']);
            $table->dropColumn('code_hash');
        });
    }
};
