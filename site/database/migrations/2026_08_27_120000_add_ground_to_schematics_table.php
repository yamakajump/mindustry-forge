<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The ground a schematic was designed on.
 *
 * Not part of the game's format, which stores blocks and nothing else. Without it, a
 * schematic kept and reopened lost its terrain, and its drills went back to being reported
 * "at best, on a full patch" - which is the tool admitting it does not know what they are
 * standing on. Painting one is now a real part of the editor, so it has to survive being
 * saved, or the whole tab is a sandcastle.
 *
 * A column of its own rather than a corner of `analysis`. What is in `analysis` is what the
 * analysis found; the ground is what the author drew. The marks already live there and that
 * is a wart, not a precedent.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('schematics', function (Blueprint $table) {
            $table->json('ground')->nullable()->after('analysis');
        });
    }

    public function down(): void
    {
        Schema::table('schematics', function (Blueprint $table) {
            $table->dropColumn('ground');
        });
    }
};
