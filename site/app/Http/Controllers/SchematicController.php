<?php

namespace App\Http\Controllers;

use App\Models\Contribution;
use App\Models\ContributionVote;
use App\Models\Favorite;
use App\Models\Folder;
use App\Models\Schematic;
use App\Models\SchematicItem;
use App\Models\SchematicLike;
use App\Models\SchematicNote;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
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

    /**
     * The ground cannot be larger than the schematic it carries.
     *
     * 64 x 64 is the game's limit, so 4,096 tiles, and one more is either a bug or
     * somebody trying to fill the database through the back door.
     */
    private const MAX_GROUND = 4096;

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:2000'],
            'code' => ['required', 'string', 'max:'.self::MAX_CODE],
            'visibility' => ['sometimes', 'in:private,unlisted,public'],
            'analysis' => ['required', 'array'],
            'ground' => ['nullable', 'array', 'max:'.self::MAX_GROUND],
            // Rendered by the same code that drew it on screen, so the picture in a Discord
            // unfurl cannot disagree with the picture on the page.
            'thumbnail' => ['nullable', 'string', 'max:4194304'],
        ]);

        /* The default stays private here, and the page always sends a value.
           A save that forgot to say who sees it is a save whose author did not decide,
           and the only direction that can be wrong without anybody noticing is the
           public one. */
        $visibility = $data['visibility'] ?? Schematic::PRIVATE;

        if ($visibility === Schematic::PUBLIC
            && $twin = Schematic::publishedTwin($data['code'])) {
            return $this->alreadyThere($twin);
        }

        $schematic = new Schematic(Schematic::fromAnalysis($data['analysis']));
        $schematic->fill([
            'user_id' => $request->user()->id,
            'slug' => Schematic::freshSlug(),
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'code' => preg_replace('/\s+/', '', $data['code']),
            'code_hash' => Schematic::hashOf($data['code']),
            'visibility' => $visibility,
            'analysis' => $data['analysis'],
            'ground' => $data['ground'] ?? null,
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
            // The ground it was designed on. Without it, reopening a schematic left
            // its drills mute: "at best, on a full patch".
            'ground' => (array) ($schematic->ground ?? []),
            'kept' => $schematic->created_at?->format('d/m/Y'),
            /* Whether this reader could say where it plugs in.
               The whole machinery for it was written and nothing ever called it, because
               nothing on the page could tell whether calling it would be refused: `store`
               answers 409 for a schematic its author has already marked, and a button that
               is refused half the time is a button nobody presses twice. The three
               conditions are the controller's own, asked here so the interface can exist. */
            'contribuable' => $request->user() !== null
                && ! $schematic->managedBy($request->user())
                && ! $schematic->items()->where('kind', SchematicItem::MESURE)->exists(),
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
            'ground' => ['nullable', 'array', 'max:'.self::MAX_GROUND],
            'thumbnail' => ['nullable', 'string', 'max:4194304'],
        ]);

        /* The same refusal as on the way in, and it has to be here too.
           Without it the guard is a screen door: keep it private, which is never refused,
           then flip it to public from its own page, which is two clicks and lands the
           duplicate in the catalogue anyway. Both the string and the visibility can move
           in one call, so what is weighed is where the row would end up, not where it
           came from. */
        $becoming = $data['visibility'] ?? $schematic->visibility;
        $carrying = $data['code'] ?? $schematic->code;

        if ($becoming === Schematic::PUBLIC
            && $twin = Schematic::publishedTwin($carrying, $schematic->id)) {
            return $this->alreadyThere($twin);
        }

        if (isset($data['analysis'])) {
            $schematic->fill(Schematic::fromAnalysis($data['analysis']));
            $schematic->analysis = $data['analysis'];
        }
        if (isset($data['code'])) {
            $schematic->code = preg_replace('/\s+/', '', $data['code']);
            $schematic->code_hash = Schematic::hashOf($data['code']);
        }
        if (array_key_exists('ground', $data)) {
            $schematic->ground = $data['ground'];
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
    /**
     * A schematic, which is the analyser with that schematic already in it.
     *
     * It used to be a page of its own, and that was the complaint: one schematic described
     * by two screens, calling the same facts different names, a click apart. The analyser is
     * the one that survived, because it is the one that does something - the verdict, the
     * marking, the simulation - and everything the other page had that it lacked has moved
     * into it.
     *
     * Served by injection into `public/index.html` rather than by a Blade view of its own,
     * which is the pattern `HomeController` already uses for the showcase and for the same
     * reason: the markers are inert comments when the file is served as it lies, so the page
     * still works without a server. It fails soft.
     *
     * Two holes. `<!--TETE-->` takes the head, which is the whole of what a crawler and a
     * Discord unfurler ever read: they never run a line of the body, so losing the figures
     * out of the rendered HTML costs the unfurl nothing. `<!--FICHE-->` takes the cards that
     * belong to the schematic as an object somebody keeps - who may see it, the note, the
     * code to take away, the markings other players offered - and none that describe what
     * the plan does, because the analyser answers that and answering twice is what made one
     * schematic read as two screens.
     */
    public function show(Schematic $schematic): Response
    {
        abort_unless($schematic->visibleTo(auth()->user()), 404);
        $schematic->increment('views');

        /* Two reads, and only for whoever is logged in: the counter is public and
           reads the same for everyone, but the state of the two buttons belongs to
           this particular person. Mixing the two up would show a pressed button to
           somebody who pressed nothing. */
        $user = auth()->user();

        $data = [
            'schematic' => $schematic,
            'summary' => $this->summary($schematic),
            /* The markings other players have offered and nobody has weighed.
               `Contribution::weigh` was written, routed and reachable only with curl: a
               proposal could be made and never seen, so the queue only ever grew. Their own
               is in the list too, greyed by the view: seeing that it arrived is half of why
               somebody sends a second one, and `weigh` already refuses their own vote. */
            'propositions' => $user === null ? collect() : Contribution::query()
                ->where('schematic_id', $schematic->id)
                ->where('state', Contribution::PENDING)
                ->with('user')
                ->latest()
                ->get(),
            'dejaPese' => $user === null ? [] : ContributionVote::query()
                ->where('user_id', $user->id)
                ->whereIn('contribution_id', Contribution::where('schematic_id', $schematic->id)
                    ->where('state', Contribution::PENDING)->pluck('id'))
                ->pluck('agree', 'contribution_id')->all(),
            'aime' => $user !== null && SchematicLike::where('user_id', $user->id)
                ->where('schematic_id', $schematic->id)->exists(),
            'favori' => $user !== null && Favorite::where('user_id', $user->id)
                ->where('schematic_id', $schematic->id)->exists(),
            /* Their own folders, and which of them already hold this schematic: without
               the second part, the list would offer to file something already filed,
               and the person would not know where they had put it. */
            'note' => $user === null ? null : SchematicNote::where('user_id', $user->id)
                ->where('schematic_id', $schematic->id)->value('body'),
            'folders' => $user === null ? collect() : Folder::query()
                ->where('user_id', $user->id)->orderBy('name')->get(['id', 'slug', 'name']),
            'inFolders' => $user === null ? [] : DB::table('folder_items')
                ->join('folders', 'folders.id', '=', 'folder_items.folder_id')
                ->where('folders.user_id', $user->id)
                ->where('folder_items.schematic_id', $schematic->id)
                ->pluck('folders.slug')->all(),
        ];

        $page = File::get(public_path('index.html'));
        $page = preg_replace(
            '/<!--TETE-->.*?<!--\/TETE-->/s',
            view('partials.tete-schema', $data)->render(),
            $page,
            1,
        );
        $page = str_replace('<!--FICHE-->', view('partials.fiche', $data)->render(), $page);

        return response($page)->header('Content-Type', 'text/html; charset=utf-8');
    }

    /**
     * The one line that travels furthest.
     *
     * It goes into `description`, into `og:description` and into the social card's alt text:
     * it is what a reader sees without having opened anything, and on Discord it is most of
     * why a link gets clicked at all. `og:title` is the name, never this.
     */
    private function summary(Schematic $schematic): string
    {
        $made = collect($schematic->produces ?? [])
            ->map(fn ($rate, $item) => SchematicItem::debitAffiche($item, $rate)." {$item}/s")
            ->values();
        $power = $schematic->power_made - $schematic->power_used;
        $tap = $schematic->fedBySandbox();

        return trim(collect([
            $tap ? __('schema.page.bac-a-sable-court') : null,
            ! $tap && $power > 0.5 ? number_format($power, 0, ',', ' ').' énergie/s' : null,
            $tap ? null : ($made->take(2)->implode(', ') ?: null),
            "{$schematic->blocks} blocs",
        ])->filter()->implode(' - '));
    }

    /** The raw string, for the analyser's "analyse chez moi" link. */
    public function code(Schematic $schematic): Response
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
    /**
     * Refusing to publish a schematic the catalogue already shows, and saying where it is.
     *
     * 409 and not 422: nothing about the request is malformed, and the page has something
     * useful to do with the answer. It carries the twin's address so the refusal turns into
     * a link, which is the whole difference between losing a contributor and gaining a
     * reader: somebody who pasted a schematic they found is interested in that schematic,
     * and the page that already analyses it is what they were looking for.
     *
     * `contribuable` is the same three conditions `read` answers, asked here for the same
     * reason. Somebody who marked the intakes of a schematic already in the catalogue holds
     * exactly what it is missing, and `/api/contributions` has existed to receive it since
     * August. Told plainly, the refusal routes that work somewhere instead of dropping it.
     */
    private function alreadyThere(Schematic $twin): JsonResponse
    {
        return response()->json([
            'twin' => [
                'slug' => $twin->slug,
                'url' => url("/s/{$twin->slug}"),
                'name' => $twin->displayName(),
                'contribuable' => ! $twin->managedBy(request()->user())
                    && ! $twin->items()->where('kind', SchematicItem::MESURE)->exists(),
            ],
        ], 409);
    }

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
