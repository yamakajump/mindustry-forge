<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A schematic somebody kept, and what the analysis said about it.
 *
 * The analysis is stored alongside rather than recomputed on every read, because the
 * whole point of the site is searching by it: "a hundred graphite a minute under thirty
 * blocks" is a query over these columns, and re-analysing three thousand schematics to
 * answer it would be a query nobody runs twice.
 *
 * `verified` is deliberately separate. The numbers arrive from the browser that did the
 * analysis, which is fast and free and also unverifiable, so the bench re-measures them on
 * a real server afterwards and this says whether it has. A site that promises measured
 * figures has to be able to point at which ones are.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('schematics', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('slug', 16)->unique();
            $table->string('name');
            $table->text('description')->nullable();

            // The string the game reads. Kept whole, so anything can be recomputed and the
            // player can always copy back exactly what they pasted.
            $table->longText('code');

            $table->boolean('public')->default(false);
            $table->boolean('verified')->default(false);

            // What the analysis found, whole, for anything not worth a column of its own.
            $table->json('analysis')->nullable();

            // The columns worth searching and ranking on, lifted out of the analysis.
            $table->unsignedSmallInteger('width')->default(0);
            $table->unsignedSmallInteger('height')->default(0);
            $table->unsignedSmallInteger('blocks')->default(0);
            $table->float('power_made')->default(0);
            $table->float('power_used')->default(0);
            $table->json('produces')->nullable();
            $table->json('needs')->nullable();
            $table->unsignedInteger('views')->default(0);

            $table->timestamps();

            $table->index(['public', 'created_at']);
            $table->index(['public', 'blocks']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('schematics');
    }
};
