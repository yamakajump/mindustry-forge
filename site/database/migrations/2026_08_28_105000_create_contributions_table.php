<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Somebody who is not the author saying where a schematic is fed.
 *
 * This is the whole point of the moderation work around it. The catalogue holds 14,847
 * ceilings against 419 measurements, and the gap is one fact no program can recover: which
 * belt the coal arrives on. `marks.js` exists because guessing it was tried and produced a
 * page of numbers that looked computed and were wrong. Nobody is going to mark fifteen
 * thousand imported schematics one at a time. The players might.
 *
 * The marking is kept here rather than written onto the schematic. `schematics.analysis`
 * belongs to whoever posted it, and a contribution that overwrote it could not be undone:
 * the moment a stranger's marking replaced the author's, the author's was gone. Kept apart,
 * reverting is deleting rows.
 *
 * `analysis` is the browser's, computed in the contributor's page by the same code the
 * author's own save runs. Nothing is analysed on the server, which is the first rule of
 * this repository and is not bent for this.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contributions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('schematic_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // What they marked, and what the analyser made of it.
            $table->json('marks');
            $table->json('analysis');
            $table->text('note')->nullable();

            $table->string('state', 12)->default('pending');
            $table->unsignedTinyInteger('weight_for')->default(0);
            $table->unsignedTinyInteger('weight_against')->default(0);
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->timestamps();

            $table->index(['state', 'created_at']);
            $table->index(['schematic_id', 'state']);
        });

        Schema::create('contribution_votes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('contribution_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->boolean('agree');
            $table->unsignedTinyInteger('weight')->default(0);
            $table->string('ip_hash', 64)->nullable();
            $table->timestamps();

            // One vote per person per contribution, in the database. See the reports table
            // for what this column of hashes is worth and what it depends on.
            $table->unique(['contribution_id', 'user_id']);
        });

        Schema::table('schematics', function (Blueprint $table) {
            /*
             * The one contribution in force, if any.
             *
             * A column rather than a partial unique index on `contributions`, because a
             * partial index is not portable to MySQL and this is the constraint that
             * matters: two declared throughputs disagreeing about the same schematic has to
             * be impossible by construction, not merely discouraged by the code that
             * happens to write them.
             */
            $table->foreignId('contribution_id')->nullable()->after('hidden_reason')
                ->constrained('contributions')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('schematics', function (Blueprint $table) {
            $table->dropConstrainedForeignId('contribution_id');
        });

        Schema::dropIfExists('contribution_votes');
        Schema::dropIfExists('contributions');
    }
};
