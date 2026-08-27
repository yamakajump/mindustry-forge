<?php

namespace App\Services;

use Illuminate\Support\Facades\App;

/**
 * What the game calls a block, an item or a liquid, in the language the reader has.
 *
 * The site used to show `silicon-smelter`, and the best it did anywhere was
 * `Silicon smelter`: an identifier with its dashes taken out, offered to a French reader.
 *
 * Nothing here was written by hand. Mindustry is translated by its own community and ships
 * every translation inside the jar; `tools/build_names.py` reads that and writes one file
 * per language. Four hundred and eleven names for French, of which a hundred and
 * seventy-five carry an accent.
 *
 * Read from the same generated file the browser reads, and not copied into a PHP array
 * beside it. Two lists of four hundred names would be two lists to keep in step, and this
 * repository already knows how that ends.
 */
class GameNames
{
    /** @var array<string, array<string, string>> */
    private static array $loaded = [];

    /**
     * The name, or null when the game does not state one.
     *
     * Null happens and is not a fault: `air`, three removed unit factories and thirteen ore
     * floors have no name in any of the game's thirty-seven bundles. A caller falls back to
     * the identifier, which is what the game itself has nothing better than.
     */
    public static function of(string $family, string $name, ?string $locale = null): ?string
    {
        return self::table($locale ?? App::getLocale())["{$family}.{$name}"] ?? null;
    }

    /** @return array<string, string> */
    private static function table(string $locale): array
    {
        if (! isset(self::$loaded[$locale])) {
            $path = public_path("forge/noms/{$locale}.json");
            $decoded = is_file($path)
                ? json_decode((string) file_get_contents($path), true)
                : null;
            self::$loaded[$locale] = is_array($decoded) ? $decoded : [];
        }

        return self::$loaded[$locale];
    }
}
