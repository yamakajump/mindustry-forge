<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Two axes the table had no way to say, added in one pass.
 *
 * `schematic_items` was written for a single question: how much of this item does this
 * schematic produce, measured. Three pieces of work land on it at the same time, and each
 * needs a distinction the table does not carry.
 *
 * The first wants to search by what a player has on hand, "I have coal, show me what I
 * can run", so a row needs to say whether it is what comes out or what must go in. The
 * second wants to index the rate of a schematic nobody marked by hand, which is a ceiling
 * and not a measurement: the catalogue's fifteen thousand entries arrive unmarked, and the
 * engine rightly refuses to guess where they connect.
 *
 * The two axes are independent: a consumption ceiling makes perfect sense. So this is not
 * a choice between two columns, it is two columns, and adding both in one pass beats
 * coming back to a table that will carry fifteen thousand rows times the number of items.
 * The defaults carry forward exactly what the existing rows already said, so nothing
 * changes for them.
 *
 * `kind` carries the rule of the day: what is not measured must never display as if it
 * were. A column rather than a convention, because a convention gets lost, and a ranking
 * that mixes a ceiling and a measurement lies without anything saying so.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('schematic_items', function (Blueprint $table) {
            // What comes out, or what must go in.
            $table->string('sens', 8)->default('produit')->after('item');

            // An observed rate, or what the schematic would do running flat out.
            $table->string('kind', 8)->default('mesure')->after('sens');
        });

        Schema::table('schematic_items', function (Blueprint $table) {
            // The same thing can now be said four times about a schematic: what it
            // produces and what it consumes, measured and at best.
            //
            // The new index is added before the old one is dropped, and the order is not
            // a matter of style: the foreign key on `schematic_id` needs an index that
            // starts with this column, and MySQL refuses to drop the only one left.
            // SQLite accepts it, because it rebuilds the table, so the error only shows
            // up in production. It was caught by the MySQL check in CI, written this
            // morning precisely for this.
            $table->unique(['schematic_id', 'item', 'sens', 'kind']);
            $table->dropUnique(['schematic_id', 'item']);

            // The listing's two sorts, once the item is chosen. The three filter columns
            // come before the sort column, otherwise the index only serves half the
            // query and the database sorts the rest itself.
            $table->dropIndex(['item', 'rate_per_block']);
            $table->dropIndex(['item', 'rate']);
            $table->index(['item', 'sens', 'kind', 'rate_per_block']);
            $table->index(['item', 'sens', 'kind', 'rate']);
        });
    }

    public function down(): void
    {
        Schema::table('schematic_items', function (Blueprint $table) {
            $table->dropIndex(['item', 'sens', 'kind', 'rate_per_block']);
            $table->dropIndex(['item', 'sens', 'kind', 'rate']);
        });

        // Under the old form a schematic can only have one row per item. Rows that say
        // something other than the produced, measured rate have no place there: keeping
        // them would fail the constraint, and picking one at random would be worse.
        DB::table('schematic_items')
            ->where('sens', '!=', 'produit')
            ->orWhere('kind', '!=', 'mesure')
            ->delete();

        // Same constraint as on the way up, in reverse: the old unique index comes back
        // before the new one is dropped, otherwise the foreign key is left for an instant
        // without an index starting with `schematic_id`, and MySQL refuses.
        Schema::table('schematic_items', function (Blueprint $table) {
            $table->unique(['schematic_id', 'item']);
        });

        Schema::table('schematic_items', function (Blueprint $table) {
            $table->dropUnique(['schematic_id', 'item', 'sens', 'kind']);
            $table->dropColumn(['sens', 'kind']);
            $table->index(['item', 'rate_per_block']);
            $table->index(['item', 'rate']);
        });
    }
};
