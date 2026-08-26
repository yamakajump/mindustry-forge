<?php

namespace App\Http\Controllers;

use App\Models\Schematic;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\View\View;

/**
 * Keeping, publishing and finding schematics.
 *
 * The analysis arrives from the browser that ran it, because that is where it runs: the
 * page computes it in milliseconds on the visitor's machine and the server has no reason
 * to do the same work again. What the server does is refuse to believe it blindly, which
 * is why every figure is bounded on the way in and `verified` stays false until the bench
 * has re-measured the schematic on a real game.
 */
class SchematicController extends Controller
{
    private const MAX_CODE = 512 * 1024;

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:2000'],
            'code' => ['required', 'string', 'max:'.self::MAX_CODE],
            'visibility' => ['sometimes', 'in:private,unlisted,public'],
            'analysis' => ['required', 'array'],
            // Rendered by the same code that drew it on screen, so the picture in a Discord
            // unfurl cannot disagree with the picture on the page.
            'thumbnail' => ['nullable', 'string', 'max:4194304'],
        ]);

        $schematic = new Schematic(Schematic::fromAnalysis($data['analysis']));
        $schematic->fill([
            'user_id' => $request->user()->id,
            'slug' => Schematic::freshSlug(),
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'code' => preg_replace('/\s+/', '', $data['code']),
            'visibility' => $data['visibility'] ?? Schematic::PRIVATE,
            'analysis' => $data['analysis'],
        ])->save();

        $this->keepThumbnail($schematic, $data['thumbnail'] ?? null);

        return response()->json([
            'slug' => $schematic->slug,
            'url' => url("/s/{$schematic->slug}"),
        ], 201);
    }

    /**
     * Everything needed to reopen a schematic in the analyser.
     *
     * Including what its author marked by hand, which was stored from the first day and
     * never read back: reopening a schematic threw away the one answer the tool cannot
     * work out for itself, and asked for it again.
     */
    public function read(Request $request, Schematic $schematic): JsonResponse
    {
        abort_unless($schematic->visibleTo($request->user()), 404);

        return response()->json([
            'slug' => $schematic->slug,
            'name' => $schematic->name,
            'description' => $schematic->description,
            'code' => $schematic->code,
            'visibility' => $schematic->visibility,
            'mine' => $schematic->managedBy($request->user()),
            'marked' => (array) ($schematic->analysis['marked'] ?? []),
            'kept' => $schematic->created_at?->format('d/m/Y'),
        ]);
    }

    public function update(Request $request, Schematic $schematic): JsonResponse
    {
        abort_unless($schematic->managedBy($request->user()), 403);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:2000'],
            'visibility' => ['sometimes', 'in:private,unlisted,public'],
            // A corrected string, and the analysis that goes with it. A schematic that
            // could never be edited meant a typo in a name, or an intake marked wrongly,
            // was permanent: the only way out was to delete it and start again.
            'code' => ['sometimes', 'string', 'max:'.self::MAX_CODE],
            'analysis' => ['sometimes', 'array'],
            'thumbnail' => ['nullable', 'string', 'max:4194304'],
        ]);

        if (isset($data['analysis'])) {
            $schematic->fill(Schematic::fromAnalysis($data['analysis']));
            $schematic->analysis = $data['analysis'];
        }
        if (isset($data['code'])) {
            $schematic->code = preg_replace('/\s+/', '', $data['code']);
        }
        foreach (['name', 'description', 'visibility'] as $field) {
            if (array_key_exists($field, $data)) {
                $schematic->{$field} = $data[$field];
            }
        }
        $schematic->save();
        $this->keepThumbnail($schematic, $data['thumbnail'] ?? null);

        return response()->json(['ok' => true, 'url' => url("/s/{$schematic->slug}")]);
    }

    public function destroy(Request $request, Schematic $schematic): JsonResponse
    {
        abort_unless($schematic->managedBy($request->user()), 403);
        $schematic->delete();

        return response()->json(['ok' => true]);
    }

    public function mine(Request $request): View
    {
        return view('mine', [
            'schematics' => $request->user()->schematics()
                ->latest()->paginate(24),
        ]);
    }

    /** The public page, which is also what a Discord link unfurls into. */
    public function show(Schematic $schematic): View
    {
        abort_unless($schematic->visibleTo(auth()->user()), 404);
        $schematic->increment('views');

        return view('schematic', ['schematic' => $schematic]);
    }

    /** The raw string, for the analyser's "analyse chez moi" link. */
    public function code(Schematic $schematic): \Illuminate\Http\Response
    {
        abort_unless($schematic->visibleTo(auth()->user()), 404);

        return response($schematic->code, 200, ['Content-Type' => 'text/plain']);
    }

    /**
     * Store the picture the browser drew.
     *
     * Rendered on the client rather than here. Redrawing it server-side would mean a
     * second implementation of the renderer, in another language, and this repository has
     * spent two days learning what a second implementation of anything costs.
     */
    private function keepThumbnail(Schematic $schematic, ?string $data): void
    {
        if (! $data || ! str_starts_with($data, 'data:image/png;base64,')) {
            return;
        }
        $binary = base64_decode(substr($data, strlen('data:image/png;base64,')), true);
        // A PNG starts with a fixed eight byte signature. Anything else is not one, and
        // writing it under a .png would be storing whatever somebody felt like sending.
        if (! $binary || ! str_starts_with($binary, "\x89PNG\r\n\x1a\n") || strlen($binary) > 3_000_000) {
            return;
        }
        Storage::disk('public')->put("apercus/{$schematic->slug}.png", $binary);
    }
}
