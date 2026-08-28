<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Who liked what, and the count of it kept beside the schematic.
 *
 * The count on `schematics` is a cache of this table and not a second truth. It lives there
 * because the catalogue orders on it, and an ordering over an aggregate cannot use an
 * index: filling twenty-four tiles would mean counting over the whole catalogue.
 * `schematics.views` is already a column for that exact reason, so this follows the
 * repository rather than inventing.
 *
 * The price of the cache is drift, and it is paid by `forge:recount-likes`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('schematic_likes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('schematic_id')->constrained()->cascadeOnDelete();
            $table->timestamp('created_at')->useCurrent();

            /* The whole guard against a double click, held by the database rather than by
               the controller remembering to look first. */
            $table->unique(['user_id', 'schematic_id']);
        });

        Schema::table('schematics', function (Blueprint $table) {
            $table->unsignedInteger('likes')->default(0)->index();
        });
    }

    public function down(): void
    {
        Schema::table('schematics', function (Blueprint $table) {
            $table->dropIndex(['likes']);
            $table->dropColumn('likes');
        });

        Schema::dropIfExists('schematic_likes');
    }
};
