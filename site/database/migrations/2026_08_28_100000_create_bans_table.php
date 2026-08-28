<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Accounts that are not welcome back, remembered so they stay out.
 *
 * Keyed on the Discord snowflake rather than on `users.id`, in bare columns with no foreign
 * key, for the reason `withdrawals` was written the same way: the memory has to outlive the
 * row it is about. A ban that points at a user row is undone by deleting the account and
 * signing in again with the same Discord, and the person comes back with a clean slate and
 * nothing recording that they were ever gone.
 *
 * `until` is nullable and null means forever. A separate boolean saying "permanent" would
 * be a second answer to a question this column already answers, and the day the two
 * disagree is the day a banned account signs in.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bans', function (Blueprint $table) {
            $table->id();
            $table->string('discord_id', 32)->unique();
            $table->text('reason')->nullable();
            $table->timestamp('until')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bans');
    }
};
