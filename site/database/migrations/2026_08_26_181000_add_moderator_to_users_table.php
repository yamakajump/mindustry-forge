<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Somebody has to be able to take a schematic out of the showcase.
 *
 * A public list anyone can post to is a public list anyone can wreck, and until now the
 * only recourse would have been to open the database by hand. One flag, set by hand, and
 * no interface to grant it: a site with one moderator does not need a permissions system,
 * it needs a moderator.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('moderator')->default(false)->after('avatar');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('moderator');
        });
    }
};
