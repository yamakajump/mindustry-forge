<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Signing in with Discord, which is where this community already is.
 *
 * The password column goes nullable rather than being dropped: there is no password to
 * store, and a required column nobody fills is a column that gets filled with rubbish.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('discord_id')->nullable()->unique()->after('id');
            $table->string('avatar')->nullable()->after('email');
            $table->string('password')->nullable()->change();
            $table->string('email')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['discord_id', 'avatar']);
        });
    }
};
