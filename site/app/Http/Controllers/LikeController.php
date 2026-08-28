<?php

namespace App\Http\Controllers;

use App\Models\Schematic;
use App\Models\SchematicLike;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The public gesture on a schematic.
 *
 * The counter only moves when a row was actually created or actually deleted. A click that
 * changes nothing must not change the number: the unique constraint absorbs the second
 * press, and `wasRecentlyCreated` is how this learns which press it was.
 */
class LikeController extends Controller
{
    public function store(Request $request, Schematic $schematic): JsonResponse
    {
        $added = DB::transaction(function () use ($request, $schematic) {
            $like = SchematicLike::firstOrCreate(
                ['user_id' => $request->user()->id, 'schematic_id' => $schematic->id],
                ['created_at' => now()],
            );

            if ($like->wasRecentlyCreated) {
                $schematic->increment('likes');
            }

            return $like->wasRecentlyCreated;
        });

        return response()->json($this->state($schematic, true), $added ? 201 : 200);
    }

    public function destroy(Request $request, Schematic $schematic): JsonResponse
    {
        DB::transaction(function () use ($request, $schematic) {
            $removed = SchematicLike::where('user_id', $request->user()->id)
                ->where('schematic_id', $schematic->id)
                ->delete();

            /* Guarded rather than clamped afterwards. A counter already at zero is a
               counter that has drifted, and decrementing it would print a negative number
               on the page, which is worse than the drift it came from. */
            if ($removed) {
                Schematic::whereKey($schematic->id)->where('likes', '>', 0)->decrement('likes');
            }
        });

        return response()->json($this->state($schematic, false));
    }

    /** @return array{likes: int, aime: bool} */
    private function state(Schematic $schematic, bool $liked): array
    {
        return ['likes' => (int) $schematic->refresh()->likes, 'aime' => $liked];
    }
}
