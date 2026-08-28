<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * An address for a member, so their work can be pointed at.
 *
 * Drawn at random rather than made from the Discord name, for two reasons that both end in
 * a broken link. Discord names change, and a slug that followed one would leave every
 * address ever shared answering 404. Two people can also carry the same name, and the first
 * would silently own the second's page.
 *
 * The same shape as a schematic's, and drawn the same way, because a member browsing the
 * site should not have to learn that this identifier looks different from that one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('slug', 16)->nullable()->unique()->after('id');
        });

        // Everybody already here gets one now. Filling it lazily at the next sign-in would
        // mean a member with schematics on the site has no page until they come back, and
        // the link on their schematic would have nowhere to go.
        foreach (DB::table('users')->whereNull('slug')->pluck('id') as $id) {
            do {
                $slug = Str::lower(Str::random(10));
            } while (DB::table('users')->where('slug', $slug)->exists());

            DB::table('users')->where('id', $id)->update(['slug' => $slug]);
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('slug');
        });
    }
};
