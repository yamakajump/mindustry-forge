<?php

namespace App\Http\Controllers;

use App\Models\Folder;
use App\Models\Schematic;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Putting a schematic into a folder, and taking it out. */
class FolderItemController extends Controller
{
    public function store(Request $request, Folder $folder, Schematic $schematic): JsonResponse
    {
        $this->owned($request, $folder);

        /* A folder may hold anybody's schematic, which is the point of sharing one. But
           only one this person could already see: putting somebody else's private plan in
           a folder would otherwise be a way to learn that it exists. */
        abort_unless($schematic->visibleTo($request->user()), 404);

        $done = $folder->schematics()->syncWithoutDetaching([$schematic->id]);

        return response()->json(['dans' => true], $done['attached'] !== [] ? 201 : 200);
    }

    public function destroy(Request $request, Folder $folder, Schematic $schematic): JsonResponse
    {
        $this->owned($request, $folder);

        $folder->schematics()->detach($schematic->id);

        return response()->json(['dans' => false]);
    }

    private function owned(Request $request, Folder $folder): void
    {
        abort_unless($folder->user_id === $request->user()->id, 403);
    }
}
