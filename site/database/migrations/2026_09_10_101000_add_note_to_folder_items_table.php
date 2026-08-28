<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Why this schematic is in this folder, said to whoever can see the folder.
 *
 * A column and not a table: a table of captions would carry exactly the same key as this
 * row and need a join to say anything, which is the definition of a column.
 *
 * It belongs to the folder rather than to the schematic, unlike the private note: the same
 * plan is "the one to start with" in a beginner's folder and "the fallback" in somebody
 * else's, and neither opinion should follow it around.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('folder_items', function (Blueprint $table) {
            $table->text('note')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('folder_items', function (Blueprint $table) {
            $table->dropColumn('note');
        });
    }
};
