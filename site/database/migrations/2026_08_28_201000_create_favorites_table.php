<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What somebody wants to find again.
 *
 * A table apart from the like, on purpose. The two gestures answer different questions,
 * one says a schematic is good and the other says I want it back, and a player does one
 * without the other every day.
 *
 * No counter column beside this one, unlike `schematics.likes`. Nothing is ordered on how
 * many people privately kept a schematic, and a public number counted from private rows
 * would leak the list it was counted from.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('favorites', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('schematic_id')->constrained()->cascadeOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['user_id', 'schematic_id']);

            /* The one query the catalogue will run under `favoris=oui`: one person's list,
               most recently kept first. */
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('favorites');
    }
};
