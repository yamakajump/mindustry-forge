<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Taking a schematic out of circulation without deciding anything about it yet.
 *
 * A schematic drawn with walls to be obscene is served into other people's Discord threads
 * by `/s/{slug}/carte.jpg`, and the unfurler caches it. Waiting for a human to look before
 * it stops being served means it keeps being served all night. So the hiding comes first
 * and the decision second, which is the opposite order from deletion.
 *
 * Hidden rather than deleted, and this is the whole reason for a column instead of a
 * `delete()`: the moderator has to be able to look at what was reported, and half the
 * reports will be wrong. A gesture a moderator cannot undo is a gesture they will hesitate
 * to make, and hesitation is what leaves the picture up.
 *
 * `hidden_reason` is what the site says to the author, so it is written for them and not
 * for us.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('schematics', function (Blueprint $table) {
            $table->timestamp('hidden_at')->nullable()->after('verified');
            $table->text('hidden_reason')->nullable()->after('hidden_at');
        });
    }

    public function down(): void
    {
        Schema::table('schematics', function (Blueprint $table) {
            $table->dropColumn(['hidden_at', 'hidden_reason']);
        });
    }
};
