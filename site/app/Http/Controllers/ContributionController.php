<?php

namespace App\Http\Controllers;

use App\Models\Contribution;
use App\Models\Schematic;
use App\Models\SchematicItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContributionController extends Controller
{
    /**
     * Offer a marking for somebody else's schematic.
     *
     * The analysis comes from the contributor's browser, computed by the same module the
     * author's own save runs. Nothing here recomputes it: a second implementation of the
     * analysis, on the server, to check the first, is the thing this repository exists not
     * to have.
     *
     * What is checked is what a browser cannot be trusted about: that the target exists,
     * that it has no measurement of its own to overwrite, and that the numbers are numbers.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'schematique' => ['required', 'string', 'exists:schematics,slug'],
            'marques' => ['required', 'array', 'min:1'],
            'analysis' => ['required', 'array'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $author = $request->user();
        $schematic = Schematic::where('slug', $data['schematique'])->firstOrFail();

        /*
         * A schematic whose author already marked it is not open to contribution.
         *
         * Their marking is what `mesure` means, and a stranger's competing with it is a
         * dispute nothing here can settle: both people are describing the same plan and
         * only one of them built it. Refused rather than queued, so the answer says why.
         */
        if ($schematic->items()->where('kind', SchematicItem::MESURE)->exists()) {
            return response()->json([
                'message' => 'Son auteur a deja dit ou elle se branche. Rien a completer ici.',
            ], 409);
        }

        $standing = $author->standing();

        $today = Contribution::where('user_id', $author->id)
            ->where('created_at', '>=', now()->subDay())
            ->count();

        if ($today >= $standing->contributionsPerDay()) {
            return response()->json([
                'message' => 'Tu as propose beaucoup de branchements aujourd hui. Reviens demain.',
            ], 429);
        }

        $contribution = Contribution::offer(
            $author,
            $schematic,
            $data['marques'],
            $data['analysis'],
            $data['note'] ?? null,
        );

        return response()->json([
            'etat' => $contribution->state,
            'message' => $contribution->state === Contribution::APPLIED
                ? 'En ligne. Le debit annonce dit desormais qu il vient de toi.'
                : 'Propose. D autres joueurs vont dire s ils sont d accord.',
        ], 201);
    }

    /** Agreeing or disagreeing with a marking that is still waiting. */
    public function vote(Request $request, Contribution $contribution): JsonResponse
    {
        $data = $request->validate(['accord' => ['required', 'boolean']]);

        $contribution->weigh(
            $request->user(),
            (bool) $data['accord'],
            ($ip = $request->ip()) === null ? null : hash('sha256', $ip.config('app.key')),
        );

        // The state, and nothing about how close the threshold is. Telling a voter how much
        // weight is left tells anybody who cares to ask how many accounts they need.
        return response()->json(['etat' => $contribution->fresh()->state]);
    }
}
