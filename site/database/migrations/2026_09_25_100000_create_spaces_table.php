<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A saved editor board, so a build started on one machine can be picked up on another.
 *
 * Never `schematics`. A draft changes every few seconds and carries no analysis, no engine
 * freshness, no moderation state and no public key: writing it into the table that holds
 * all four would mean touching the catalogue's own table on every keystroke. Ownership,
 * a name and a board is all a work space is.
 *
 * `board` holds a full snapshot on every save, never a delta: the same shape the browser
 * already keeps in `localStorage` for an anonymous visitor's single draft (tiles, ground
 * and frames). A delta log would be a second data model to keep in agreement with the
 * first, for bandwidth a board bounded by `Space::MAX_BOARD_BYTES` does not need saving.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('spaces', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // Short and unguessable, like a schematic's or a folder's: the row id never
            // appears in a url, so nobody outside the owner learns how many spaces exist
            // or walks them by counting up.
            $table->string('slug', 16)->unique();
            $table->string('name', 80);
            $table->json('board');

            // "My plans" sorts on this, not on `updated_at`: reopening a space without
            // changing it should still bring it to the top of the list next time, and a
            // rename from elsewhere must not reorder a board nobody has touched.
            $table->timestamp('opened_at');
            $table->timestamps();

            // The one query this feature runs on every page load: this account's spaces,
            // most recently opened first.
            $table->index(['user_id', 'opened_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('spaces');
    }
};
