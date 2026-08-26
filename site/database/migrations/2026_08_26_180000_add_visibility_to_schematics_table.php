<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Three states instead of two.
 *
 * A boolean forces a choice nobody wants to make: either the whole site sees a schematic,
 * or nobody but its author does. What a player actually wants most of the time is the
 * third thing, which is a link they can paste in a Discord thread without their draft
 * turning up in a public list ranked against finished work.
 *
 * Replaced rather than added alongside. Keeping `public` as well would leave two answers
 * to the same question, and the day they disagree is the day a private schematic is on
 * the front page.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('schematics', function (Blueprint $table) {
            $table->string('visibility', 10)->default('private')->after('code');
        });

        DB::table('schematics')->where('public', true)->update(['visibility' => 'public']);

        Schema::table('schematics', function (Blueprint $table) {
            $table->dropIndex(['public', 'created_at']);
            $table->dropIndex(['public', 'blocks']);
            $table->dropColumn('public');

            $table->index(['visibility', 'created_at']);
            $table->index(['visibility', 'blocks']);
        });
    }

    public function down(): void
    {
        Schema::table('schematics', function (Blueprint $table) {
            $table->boolean('public')->default(false)->after('code');
        });

        DB::table('schematics')->where('visibility', 'public')->update(['public' => true]);

        Schema::table('schematics', function (Blueprint $table) {
            $table->dropIndex(['visibility', 'created_at']);
            $table->dropIndex(['visibility', 'blocks']);
            $table->dropColumn('visibility');

            $table->index(['public', 'created_at']);
            $table->index(['public', 'blocks']);
        });
    }
};
