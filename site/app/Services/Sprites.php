<?php

namespace App\Services;

/**
 * Where each block and item is drawn on the sheet the bench exported.
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

    private static ?array $sheet = null;

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

    /** An item's icon, which the sheet files under its own prefix. */
    public static function item(string $item): ?array
    {
        return self::find("item/{$item}");
    }

    /** How big the sheet is, read from the file rather than written down twice. */
    private static function sheet(): ?array
    {
        if (self::$sheet === null) {
            $size = @getimagesize(public_path('forge/atlas.png'));
            self::$sheet = is_array($size) ? [$size[0], $size[1]] : [];
        }

        return self::$sheet !== [] ? self::$sheet : null;
    }

    /**
     * The CSS that shows one sprite at a given size, or null when there is nothing to show.
     *
     * A background rather than an `img`, because the sprite is a window onto a shared sheet
     * and there is no URL for the window. The whole sheet is scaled so that the sprite lands
     * at the size asked for: a two-tile block is drawn at 64 pixels on the sheet, and asking
     * for 40 shrinks the sheet by the same factor rather than the sprite alone.
     */
    public static function style(?array $sprite, int $size): ?string
    {
        $sheet = self::sheet();
        if ($sprite === null || $sheet === null || $sprite['w'] <= 0) {
            return null;
        }

        $scale = $size / $sprite['w'];

        return sprintf(
            'width:%dpx;height:%dpx;background-image:url(/forge/atlas.png);'
            .'background-size:%.2fpx %.2fpx;background-position:%.2fpx %.2fpx',
            $size,
            (int) round($sprite['h'] * $scale),
            $sheet[0] * $scale,
            $sheet[1] * $scale,
            -$sprite['x'] * $scale,
            -$sprite['y'] * $scale,
        );
    }

    /** The style for a block, by name, at a given size. */
    public static function block(string $name, int $size): ?string
    {
        return self::style(self::find($name), $size);
    }

    /** The style for an item's icon, by name, at a given size. */
    public static function itemIcon(string $item, int $size): ?string
    {
        return self::style(self::item($item), $size);
    }
}
