<?php

namespace App\Http\Controllers;

use App\Models\Space;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * An account's saved editor boards: as many as the quota allows, resumed on any machine.
 *
 * Everything here is scoped to `$request->user()->id` before it is scoped to anything
 * else, and every route it answers sits behind the `auth` middleware. An anonymous visitor
 * keeps the single seven-day `localStorage` draft `draft.js` already gives them, untouched
 * by any of this: a work space is what an account buys on top of that draft, not a
 * replacement for it.
 *
 * A space is never shown to anyone but its owner, so a wrong guess at a slug answers 404
 * rather than 403 throughout this controller: 403 would confirm the slug belongs to
 * somebody, which is one bit of information a stranger has no business learning about
 * another account's private board.
 */
class SpaceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'spaces' => Space::query()
                ->where('user_id', $request->user()->id)
                ->orderByDesc('opened_at')
                ->get(['slug', 'name', 'opened_at', 'updated_at'])
                ->map(fn (Space $space) => [
                    'slug' => $space->slug,
                    'name' => $space->name,
                    'opened_at' => $space->opened_at?->toIso8601String(),
                    'updated_at' => $space->updated_at?->toIso8601String(),
                ]),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        // Checked before validation, not after: a board that is otherwise fine but arrives
        // over quota should refuse for the quota reason, not get its JSON picked apart
        // first only to be thrown away regardless of what the picking found.
        $mine = Space::query()->where('user_id', $request->user()->id);
        if ($mine->count() >= Space::MAX_SPACES) {
            throw ValidationException::withMessages([
                'quota' => __('edition.espaces.quota', ['max' => Space::MAX_SPACES]),
            ]);
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'board' => ['required', 'array'],
        ]);
        $this->assertBoardFits($data['board']);

        $space = Space::create([
            'user_id' => $request->user()->id,
            'slug' => Space::freshSlug(),
            'name' => $data['name'],
            'board' => $data['board'],
            'opened_at' => now(),
        ]);

        return response()->json([
            'slug' => $space->slug,
            'name' => $space->name,
        ], 201);
    }

    /**
     * Reopening a space, which is the one action that counts as "opened" for its sort.
     *
     * `opened_at` moves here and on `update()`, not on `index()`: browsing the list is not
     * opening any one of them, but loading a board into the editor is, and so is every
     * save that follows while it stays open. Without the second half, a space worked on
     * for twenty minutes without being reopened would sink down the list of its own account
     * while it was, at that very moment, the one thing being worked on.
     */
    public function show(Request $request, Space $space): JsonResponse
    {
        abort_unless($space->ownedBy($request->user()), 404);

        $space->update(['opened_at' => now()]);

        return response()->json([
            'slug' => $space->slug,
            'name' => $space->name,
            'board' => $space->board,
        ]);
    }

    public function update(Request $request, Space $space): JsonResponse
    {
        abort_unless($space->ownedBy($request->user()), 404);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:80'],
            'board' => ['sometimes', 'array'],
        ]);

        if (array_key_exists('board', $data)) {
            $this->assertBoardFits($data['board']);
            $space->board = $data['board'];
        }
        if (array_key_exists('name', $data)) {
            $space->name = $data['name'];
        }
        $space->opened_at = now();
        $space->save();

        return response()->json(['ok' => true]);
    }

    public function destroy(Request $request, Space $space): JsonResponse
    {
        abort_unless($space->ownedBy($request->user()), 404);
        $space->delete();

        return response()->json(['ok' => true]);
    }

    /**
     * Refuse a board too big to be an honest mistake, as a clear 422 rather than a 500.
     *
     * `array` validation counts elements, not bytes, and a board's fields are not uniform
     * enough for an element count to bound its weight: one tile with a long `config` and
     * one without are the same "one element" to that rule. Measured here instead, against
     * `Space::MAX_BOARD_BYTES`, on the encoded JSON a save would actually write to the
     * column.
     */
    private function assertBoardFits(array $board): void
    {
        $bytes = strlen(json_encode($board));
        if ($bytes > Space::MAX_BOARD_BYTES) {
            throw ValidationException::withMessages([
                'board' => __('edition.espaces.trop-grand', [
                    'max' => (int) round(Space::MAX_BOARD_BYTES / 1024 / 1024),
                ]),
            ]);
        }
    }
}
