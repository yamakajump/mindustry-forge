<?php

namespace App\Http\Controllers;

use App\Services\BlockCatalogue;
use App\Services\Cards\BlockCard;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * The thumbnail a link to a block's page unfurls into.
 *
 * Composed on demand and kept on disk, like the schematic card and for the same reasons:
 * only the pages somebody actually shares ever cost anything, and changing the layout means
 * emptying a directory rather than replaying 254 renders.
 */
class BlockCardController extends Controller
{
    /** The same shape the wiki accepts, so a bad name is a 404 and never a file read. */
    private const NAME = '/^[a-z0-9-]{1,64}$/';

    public function show(string $name): Response
    {
        if (! preg_match(self::NAME, $name) || ! BlockCatalogue::has($name)) {
            throw new NotFoundHttpException;
        }

        $disk = Storage::disk('public');

        /* The game's version is in the path rather than compared against a date. A block's
           card changes when the catalogue is rebuilt from a new jar, and nothing about the
           file's own timestamp says that happened; a stale card would otherwise survive an
           upgrade and quote the previous version's rates. */
        $path = 'cartes-blocs/'.BlockCatalogue::gameVersion().'/'.$name.'.jpg';

        if (! $disk->exists($path)) {
            $card = new BlockCard(
                resource_path('fonts/forge.ttf'),
                resource_path('brand/mark-96.png'),
            );
            $disk->put($path, $card->render(BlockCatalogue::find($name)));
        }

        return response($disk->get($path), 200, [
            'Content-Type' => 'image/jpeg',
            /* A month, where a schematic gets a week: the version is in the address, so a
               rebuilt catalogue serves a different path and nothing has to expire. */
            'Cache-Control' => 'public, max-age=2592000',
        ]);
    }
}
