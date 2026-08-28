<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Somebody saying this does not belong here.
 *
 * A `target_type` string rather than the flat table per surface the likes work chose, and
 * the difference is which side of the hot path each sits on. A like is read on every tile
 * of every listing render, so an abstraction there costs a join nobody can afford. A report
 * is written rarely and read by one person on one page, and there will be four kinds of
 * target before long: a schematic, a contribution, a folder, a comment. Four tables that
 * differ by one column would be four migrations, four models and four queues.
 *
 * `weight` is copied in at the moment the report is made rather than joined from the
 * reporter's standing when the queue is read. Standing moves: somebody who was worth
 * nothing in September is worth three in November, and reading the queue would silently
 * re-decide thresholds that were already crossed. What the report was worth when it landed
 * is a fact about that moment, and facts about moments get stored.
 *
 * `ip_hash` is never the trigger for anything. It exists so a human looking at nine reports
 * from nine accounts can see they arrived from one place. Hashed, and dropped after ninety
 * days by the command that owns it.
 *
 * **What this column is worth depends on a firewall, not on this file.** The site is served
 * through a Cloudflare tunnel that connects from localhost, so without `trustProxies` every
 * row here would have recorded the hash of 127.0.0.1 and a ring of nine accounts would have
 * rendered as a ring spanning the country. That is fixed, and the origin was measured on
 * 28/08/2026 to be unreachable except through the tunnel: ufw denying incoming with one
 * rule for 22/tcp, and ports 80 and 443 timing out from another machine while the public
 * address answered 200.
 *
 * The day somebody opens port 80 for an unrelated reason, or reuses this vhost on a machine
 * without that firewall, `X-Forwarded-For` becomes a value the attacker supplies, and this
 * column becomes a value the attacker chooses. It is evidence for a human either way, never
 * an automatic trigger, which is what keeps the failure from being silent.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reports', function (Blueprint $table) {
            $table->id();
            $table->string('target_type', 16);
            $table->unsignedBigInteger('target_id');
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('reason', 32);
            $table->text('note')->nullable();
            $table->unsignedTinyInteger('weight')->default(0);
            $table->string('ip_hash', 64)->nullable();
            $table->timestamps();

            // One report per person per thing. In the database rather than in PHP: a
            // double click and two tabs are the ordinary case, not the attack.
            $table->unique(['target_type', 'target_id', 'user_id']);
            $table->index(['target_type', 'target_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reports');
    }
};
