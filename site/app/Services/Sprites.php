<?php

namespace App\Services;

/**
 * Where each block and item is drawn on the sheet the bench exported.
 *
 * Only the lookup is left. This class used to compose the CSS that shows a sprite as a
 * background, and the pages that used it now ask `/icone/{family}/{name}.png` for one image
 * apiece: the wiki's index was downloading 1 311 kB of sheet to show 254 thumbnails of about
 * six hundred bytes each. What remains is what the icon endpoint and the social card need,
 * which is where a sprite sits.
 *
 * `atlas.png` holds every sprite the game has, and `atlas.json` says where each one sits.
 * Both are generated artefacts, written by `tools/build_sprites.py` from the game's own
 * files: this class only ever reads them, and a page never learns their layout.
 *
 * Serving them as one sheet rather than as several hundred files is not a micro-optimisation
 * chosen here, it is the only option: the individual images do not exist on disk, and
 * creating them would mean a second generated artefact and a second build step to keep it
 * in step with the first.
 */
class Sprites
{
    private static ?array $sprites = null;

    /** Where one sprite sits on the sheet, or null for anything not drawn. */
    public static function find(string $name): ?array
    {
        if (self::$sprites === null) {
            $path = public_path('forge/atlas.json');
            $decoded = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
            self::$sprites = (array) ($decoded['sprites'] ?? []);
        }

        $sprite = self::$sprites[$name] ?? null;

        return is_array($sprite) && isset($sprite['x'], $sprite['y'], $sprite['w'], $sprite['h'])
            ? $sprite
            : null;
    }
}
