<?php

namespace App\Http\Controllers;

use App\Models\Schematic;
use App\Models\SchematicNote;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The private note, written and cleared by one verb.
 *
 * `PUT` rather than `POST` and `DELETE`: there is at most one note, its address is known
 * before it exists, and writing it twice has to leave one. That is what PUT means, and it
 * saves the browser from having to know whether it is creating or replacing.
 */
class NoteController extends Controller
{
    public function put(Request $request, Schematic $schematic): JsonResponse
    {
        $body = trim((string) $request->validate([
            'body' => ['present', 'nullable', 'string', 'max:1000'],
        ])['body']);

        $keys = ['user_id' => $request->user()->id, 'schematic_id' => $schematic->id];

        /* Vide veut dire pas de note, et non une note vide : sinon « est-ce qu'il y a une
           note » a deux reponses possibles pour le meme etat. */
        if ($body === '') {
            SchematicNote::where($keys)->delete();

            return response()->json(['note' => null]);
        }

        SchematicNote::updateOrCreate($keys, ['body' => $body]);

        return response()->json(['note' => $body]);
    }
}
