<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The two columns `listed()` filters on, in one key, followed by the default sort.
 *
 * Since the collected showcase came off the wall, 15,533 of 15,535 schematics carry a
 * `hidden_at`. The old key stops at `visibility`, which every one of them shares, so every
 * listing, every count and every suggestion list read the whole table to keep two rows:
 * eighteen queries of 25 to 65 ms on each visit to /schemas, measured in October 2026.
 *
 * `created_at` last so the date-sorted page walks the key in order and stops at a page.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('schematics', function (Blueprint $table) {
            $table->index(['visibility', 'hidden_at', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::table('schematics', function (Blueprint $table) {
            $table->dropIndex(['visibility', 'hidden_at', 'created_at']);
        });
    }
};
