<?php

namespace App\Http\Controllers;

use App\Models\Report;
use App\Models\Schematic;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ReportController extends Controller
{
    /**
     * Take a report, whatever it turns out to be worth.
     *
     * Anybody signed in can file one from their first minute. The weight decides what it
     * makes happen, not whether it is heard: a site that only accepts reports from members
     * it already trusts hears nothing on the day it is first vandalised, which is the day
     * every account on it is new.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'schematique' => ['required', 'string', 'exists:schematics,slug'],
            'motif' => ['required', Rule::in(Report::REASONS)],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $reporter = $request->user();
        $standing = $reporter->standing();

        $today = Report::where('user_id', $reporter->id)
            ->where('created_at', '>=', now()->subDay())
            ->count();

        if ($today >= $standing->reportsPerDay()) {
            return response()->json([
                'message' => 'Tu as signalé beaucoup de choses aujourd\'hui. Reviens demain.',
            ], 429);
        }

        $schematic = Schematic::where('slug', $data['schematique'])->firstOrFail();

        Report::file(
            $reporter,
            Report::SCHEMATIC,
            $schematic->id,
            $data['motif'],
            $data['note'] ?? null,
            $this->fingerprint($request),
        );

        /*
         * The same answer whether this was the first report or the ninth, and whether it
         * hid anything or not.
         *
         * Telling the reporter that their report crossed a threshold tells anybody who
         * cares to try exactly how much weight is left to reach it, which turns the answer
         * into a probe. It also tells somebody reporting in bad faith that they succeeded.
         */
        return response()->json([
            'message' => 'Signalement enregistré. Quelqu\'un va regarder.',
        ], 201);
    }

    /**
     * Who this came from, as far as anybody needs to know later.
     *
     * Hashed with the application key, so the table cannot be turned back into a list of
     * addresses by anybody who reads it, including us. Its worth depends on the proxy
     * configuration: see the note in the migration.
     */
    private function fingerprint(Request $request): ?string
    {
        $ip = $request->ip();

        return $ip === null ? null : hash('sha256', $ip.config('app.key'));
    }
}
