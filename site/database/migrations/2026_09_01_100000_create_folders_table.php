<?php

use App\Models\Schematic;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A folder, and what is in it.
 *
 * `parent_id` is a self reference and the whole of the nesting. No materialised path and no
 * closure table: the pages walk one level at a time, so a child listing is one indexed
 * query and a breadcrumb is at most five. Both of those structures exist to make a whole
 * subtree cheap to read at once, which nothing here asks for.
 *
 * `visibility` carries the same three values as a schematic, on purpose. A second scale
 * would mean explaining twice why "par lien" is not "publique".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('folders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            /* Null on delete rather than cascade: deleting a folder promotes its children
               instead of taking a subtree with it. A recursive delete behind one button is
               how somebody loses a month of collecting to a misclick. The controller sets
               the new parent explicitly; this is the safety net, not the mechanism. */
            $table->foreignId('parent_id')->nullable()
                ->constrained('folders')->nullOnDelete();

            $table->string('slug', 16)->unique();
            $table->string('name');
            $table->string('icon')->nullable();
            $table->text('description')->nullable();
            $table->string('visibility')->default(Schematic::PRIVATE);
            $table->timestamps();

            // The one query every page of this feature runs: the children of a folder, or
            // somebody's roots when parent_id is null.
            $table->index(['user_id', 'parent_id']);
            $table->index(['visibility', 'created_at']);
        });

        Schema::create('folder_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('folder_id')->constrained()->cascadeOnDelete();
            $table->foreignId('schematic_id')->constrained()->cascadeOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['folder_id', 'schematic_id']);
            $table->index(['folder_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('folder_items');
        Schema::dropIfExists('folders');
    }
};
