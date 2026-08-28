<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What somebody's word is worth here, kept as the two counts it is made of.
 *
 * The design document called for a `trust` column alongside these two. It is not here, and
 * the reason is the defect this repository keeps paying for: a score that is a pure
 * function of two other columns on the same row is a third answer to a question already
 * answered twice, and the day it disagrees is the day somebody is weighted on a number
 * nothing recomputed. The score is `upheld - 2 * overturned`, in one method, read from
 * these two.
 *
 * Denormalising is what `schematics.likes` and `schematics.views` do, and it is right
 * there, because those are ordered on by the database. Nothing orders by trust: it is read
 * for the person in front of you, one row at a time.
 *
 * `discord_created_at` is a gate rather than a measure of merit. A Discord account made
 * this morning to vote is the cheapest attack on any of this, and account age is the one
 * thing about a stranger that cannot be manufactured after the fact.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Claims of theirs a moderator later agreed with, and disagreed with.
            $table->unsignedInteger('upheld')->default(0)->after('moderator');
            $table->unsignedInteger('overturned')->default(0)->after('upheld');

            // When the last one landed. The top band asks for nobody having overturned you
            // recently, and asking the decisions table for that on every page that renders
            // a weight would be a join to answer a question about one row. Kept here, where
            // the counter it qualifies already lives.
            $table->timestamp('overturned_at')->nullable()->after('overturned');

            // Read out of the Discord snowflake, which encodes it. Nullable because the
            // rows already here were made before anybody read it, and because an account
            // created by a test or a seeder has no snowflake to read.
            $table->timestamp('discord_created_at')->nullable()->after('overturned');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['upheld', 'overturned', 'overturned_at', 'discord_created_at']);
        });
    }
};
