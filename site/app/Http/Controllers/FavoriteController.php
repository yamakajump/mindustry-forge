<?php

namespace App\Http\Controllers;

use App\Models\Favorite;
use App\Models\Schematic;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Filling and emptying the private list.
 *
 * Reading it is the catalogue's job, under `favoris=oui`, so that this site has one
 * implementation of "list some schematics" rather than two that drift apart: the catalogue
 * is growing filters by planet, by footprint and by minimum output, and a listing written
 * here would learn none of them.
 *
 * No counter to keep in step, so no transaction: the unique constraint is the whole of the
 * correctness here. And the removal is scoped to its owner rather than checked first, which
 * is why deleting somebody else's favorite deletes nothing and says nothing. Distinguishing
 * "not yours" from "not there" would tell the asker that somebody else kept it.
 */
class FavoriteController extends Controller
{
    public function store(Request $request, Schematic $schematic): JsonResponse
    {
        $kept = Favorite::firstOrCreate(
            ['user_id' => $request->user()->id, 'schematic_id' => $schematic->id],
            ['created_at' => now()],
        );

        return response()->json(['favori' => true], $kept->wasRecentlyCreated ? 201 : 200);
    }

    public function destroy(Request $request, Schematic $schematic): JsonResponse
    {
        Favorite::where('user_id', $request->user()->id)
            ->where('schematic_id', $schematic->id)
            ->delete();

        return response()->json(['favori' => false]);
    }
}
