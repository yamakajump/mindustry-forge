<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The like, on a second noun.
 *
 * The third flat table rather than the polymorphic `likeable` the first spec declined to
 * build early, and the bet is settled here: three readable tables have cost less than one
 * abstraction plus the migration to reach it.
 *
 * No favourite on a folder beside it. A favourite exists so you can find something again,
 * and a folder is already a place things are found.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('folder_likes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('folder_id')->constrained()->cascadeOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['user_id', 'folder_id']);
        });

        Schema::table('folders', function (Blueprint $table) {
            $table->unsignedInteger('likes')->default(0)->index();
        });
    }

    public function down(): void
    {
        Schema::table('folders', function (Blueprint $table) {
            $table->dropIndex(['likes']);
            $table->dropColumn('likes');
        });

        Schema::dropIfExists('folder_likes');
    }
};
