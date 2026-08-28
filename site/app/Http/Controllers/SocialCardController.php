<?php

namespace App\Http\Controllers;

use App\Models\Schematic;
use App\Services\Cards\SchematicCard;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;

/**
 * A schematic's social card, composed on demand and kept on disk.
 *
 * On demand rather than on save, for three reasons. Schematics already in the database
 * benefit from it without anything needing to be replayed. Changing the card's layout
 * needs no migration, only clearing a folder. And above all, these cards are only ever
 * requested by the services that unfurl a link: building one for every imported
 * schematic would be thousands of images nobody looks at.
 */
class SocialCardController extends Controller
{
    /** Where already composed cards live, under the public disk already mounted. */
    private const CACHE = 'cartes';

    public function show(Schematic $schematic): Response
    {
        /* A link unfurler is never authenticated: it arrives with the link and nothing
           else. `visibleTo(null)` therefore lets public and unlisted through, which is
           exactly what a shared link should show, and refuses private. */
        abort_unless($schematic->visibleTo(null), 404);

        $disk = Storage::disk('public');
        $path = self::CACHE."/{$schematic->slug}.jpg";

        if (! $this->fresh($schematic, $path)) {
            $disk->put($path, $this->compose($schematic));
        }

        return response($disk->get($path), 200, [
            'Content-Type' => 'image/jpeg',
            /* A week, and no more: the address carries no fingerprint, so a renamed
               schematic would otherwise keep its old thumbnail in Discord's caches long
               after anybody understood why. */
            'Cache-Control' => 'public, max-age=604800',
        ]);
    }

    /**
     * Whether the kept card still agrees with the schematic.
     *
     * Compared against `updated_at` rather than mere existence: a corrected name or a
     * redone analysis has to show in the thumbnail, and a card that never regenerates
     * is a card that ends up announcing a throughput the page no longer states.
     */
    private function fresh(Schematic $schematic, string $path): bool
    {
        $disk = Storage::disk('public');

        return $disk->exists($path)
            && $disk->lastModified($path) >= ($schematic->updated_at?->timestamp ?? 0);
    }

    private function compose(Schematic $schematic): string
    {
        $disk = Storage::disk('public');
        $preview = "apercus/{$schematic->slug}.png";

        $card = new SchematicCard(
            resource_path('fonts/forge.ttf'),
            resource_path('brand/mark-96.png'),
        );

        return $card->render(
            $schematic,
            $disk->exists($preview) ? $disk->path($preview) : null,
        );
    }
}
