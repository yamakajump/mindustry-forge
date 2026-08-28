<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What one person learned about one schematic, for themselves.
 *
 * One row per person per schematic, replaced in place rather than appended: it is a memory,
 * not a thread. It hangs off the schematic and not off a folder, because what somebody
 * learned about a plan is true in every folder they put it in.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('schematic_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('schematic_id')->constrained()->cascadeOnDelete();
            $table->text('body');
            $table->timestamps();

            $table->unique(['user_id', 'schematic_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('schematic_notes');
    }
};
