<?php

namespace App\Http\Controllers;

use App\Models\Folder;
use App\Models\FolderLike;
use App\Models\Schematic;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The same gesture as on a schematic, on a folder.
 *
 * Deliberately the same shape as `LikeController`, down to the guarded decrement: two
 * counters that drift for different reasons would be two bugs to find instead of one.
 *
 * The one thing it adds: a private folder is a 404 before anything is recorded. Liking
 * something you cannot see would be a way to learn that it exists.
 */
class FolderLikeController extends Controller
{
    public function store(Request $request, Folder $folder): JsonResponse
    {
        $this->visible($request, $folder);

        $added = DB::transaction(function () use ($request, $folder) {
            $like = FolderLike::firstOrCreate(
                ['user_id' => $request->user()->id, 'folder_id' => $folder->id],
                ['created_at' => now()],
            );

            if ($like->wasRecentlyCreated) {
                $folder->increment('likes');
            }

            return $like->wasRecentlyCreated;
        });

        return response()->json($this->state($folder, true), $added ? 201 : 200);
    }

    public function destroy(Request $request, Folder $folder): JsonResponse
    {
        $this->visible($request, $folder);

        DB::transaction(function () use ($request, $folder) {
            $removed = FolderLike::where('user_id', $request->user()->id)
                ->where('folder_id', $folder->id)
                ->delete();

            if ($removed) {
                Folder::whereKey($folder->id)->where('likes', '>', 0)->decrement('likes');
            }
        });

        return response()->json($this->state($folder, false));
    }

    private function visible(Request $request, Folder $folder): void
    {
        abort_if(
            $folder->visibility === Schematic::PRIVATE && $folder->user_id !== $request->user()->id,
            404,
        );
    }

    /** @return array{likes: int, aime: bool} */
    private function state(Folder $folder, bool $liked): array
    {
        return ['likes' => (int) $folder->refresh()->likes, 'aime' => $liked];
    }
}
