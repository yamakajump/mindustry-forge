<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What a moderator concluded, kept for ever, because it is what everything else is built on.
 *
 * Three uses, and the third is the reason this table exists on the day the site opens with
 * nobody on it.
 *
 * It answers the author, who was told their schematic was hidden and deserves to know by
 * whom and why. It answers a second report on the same thing, which does not need deciding
 * twice. And it is the only material from which standing can ever be computed: whether
 * somebody's reports turn out to be right is a question about the past, and a site that did
 * not record its decisions from the first day cannot answer it in six months except by
 * starting the clock over.
 *
 * The counters on `users` are a running total of this table. They can be rebuilt from it,
 * which is what `forge:recount-trust` does; this table cannot be rebuilt from them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('decisions', function (Blueprint $table) {
            $table->id();
            $table->string('target_type', 16);
            $table->unsignedBigInteger('target_id');
            $table->foreignId('moderator_id')->constrained('users')->cascadeOnDelete();

            // Whether the people who reported it were right. Named from their side rather
            // than from the content's, because that is the question the counters ask.
            $table->string('verdict', 12);
            $table->text('reason')->nullable();
            $table->timestamps();

            $table->index(['target_type', 'target_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('decisions');
    }
};
