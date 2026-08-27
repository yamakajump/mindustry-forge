<?php

namespace App\Http\Controllers;

use App\Services\BlockCatalogue;
use App\Services\Sprites;
use GdImage;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * One block's or one item's picture, cut out of the sheet the bench exported.
 *
 * The sheet is how the analyser draws, and it is the wrong tool for a page that wants ten
 * small pictures beside ten names: it weighs 1.28 MB, and the same ten icons cut out and
 * served on their own weigh 8 kB. Measured, not guessed.
 *
 * Cut here rather than shipped as several hundred files, because those files do not exist:
 * `tools/build_sprites.py` writes one sheet, and making it write the pieces as well would be
 * a second generated artefact to keep in step with the first.
 *
 * The address is `/icone/...` and not `/forge/icone/...`, which is where it belongs by
 * subject. The vhost serves `/forge/` as static files with `try_files $uri =404`, so a
 * generated PNG under that prefix answers 404 in production while working perfectly behind
 * `artisan serve`, which routes everything through PHP.
 */
class IconController extends Controller
{
    /** The same shape the wiki accepts, so a bad name is a 404 and never a file read. */
    private const NAME = '/^[a-z0-9-]{1,64}$/';

    /** What a page may ask for. Anything else is somebody probing, not a page. */
    private const SIZES = [32, 64];

    /**
     * Where a family's sprites sit on the sheet.
     *
     * Liquids are absent on purpose, and not by oversight: the sheet carries no `liquid/`
     * prefix at all, so not one of the game's eleven liquids has a picture in it. Adding a
     * family here would serve a grey square and hide the hole; the fix belongs in the sprite
     * builder, and until then a page that names a liquid shows its name alone.
     */
    private const FAMILIES = ['bloc' => '', 'objet' => 'item/'];

    public function show(string $family, string $name): Response
    {
        $size = (int) request()->query('t', '32');

        if (! isset(self::FAMILIES[$family])
            || ! in_array($size, self::SIZES, true)
            || ! preg_match(self::NAME, $name)) {
            throw new NotFoundHttpException;
        }

        $sprite = Sprites::find(self::FAMILIES[$family].$name);
        if ($sprite === null) {
            throw new NotFoundHttpException;
        }

        $disk = Storage::disk('public');

        /* The game's version is in the path. An icon changes when the catalogue is rebuilt
           from a new jar, and nothing about a file's own date says that happened; a stale
           picture would otherwise outlive the upgrade that changed it. */
        $path = 'icones/'.BlockCatalogue::gameVersion()."/{$family}-{$name}-{$size}.png";

        if (! $disk->exists($path)) {
            $disk->put($path, $this->cut($sprite, $size));
        }

        return response($disk->get($path), 200, [
            'Content-Type' => 'image/png',
            /* A month, like the block cards: the version is in the address, so a rebuilt
               catalogue serves a different path and nothing has to expire. */
            'Cache-Control' => 'public, max-age=2592000',
        ]);
    }

    /**
     * The sprite, cut and squared, scaled nearest-neighbour.
     *
     * Nearest-neighbour because this is pixel art, and at these sizes it is the whole of
     * what makes a drill recognisable: smoothing a 32 pixel sprite up to 64 turns its own
     * grid into a blur, which reads as a broken image rather than as a small one.
     */
    private function cut(array $sprite, int $size): string
    {
        $sheet = @imagecreatefrompng(public_path('forge/atlas.png'));
        if ($sheet === false) {
            throw new NotFoundHttpException;
        }

        $out = imagecreatetruecolor($size, $size);
        imagealphablending($out, false);
        imagesavealpha($out, true);
        imagefilledrectangle($out, 0, 0, $size, $size, imagecolorallocatealpha($out, 0, 0, 0, 127));

        imagecopyresized($out, $sheet, 0, 0, $sprite['x'], $sprite['y'],
            $size, $size, $sprite['w'], $sprite['h']);
        imagedestroy($sheet);

        return $this->png($out);
    }

    private function png(GdImage $image): string
    {
        ob_start();
        imagepng($image, null, 9);
        imagedestroy($image);

        return (string) ob_get_clean();
    }
}
