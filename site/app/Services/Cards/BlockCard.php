<?php

namespace App\Services\Cards;

use App\Services\BlockCatalogue;
use App\Services\Sprites;
use App\Support\Block;
use GdImage;

/**
 * What a link to a block's page shows when it is pasted somewhere.
 *
 * Same reasoning as the schematic card, and the same hole: the block pages pushed the site's
 * generic thumbnail, so 254 links all unfurled into the same picture. A block page pasted
 * into a conversation about that block deserves to show that block.
 *
 * The card states a figure, and that is the whole point. A name and a sprite is a thumbnail;
 * a name, a sprite and "1,5 silicon/s" is the difference between this site and a wiki.
 */
class BlockCard extends Card
{
    /** The share of the width given to the sprite. */
    private const SPRITE_SHARE = 0.40;

    public function render(Block $block): string
    {
        return $this->paint(function (GdImage $canvas) use ($block) {
            $panel = 0;
            $sprite = $this->sprite($block->name);

            if ($sprite !== null) {
                $panel = (int) (self::WIDTH * self::SPRITE_SHARE);
                $this->drawPanel($canvas, $sprite, $panel);
                imagedestroy($sprite);
            }

            [$figures, $kicker] = $this->figures($block);

            $this->drawColumn(
                $canvas,
                $panel + self::PAD * ($panel > 0 ? 1 : 2),
                $block->title(),
                $this->under($block),
                $figures,
                $kicker,
            );
        });
    }

    /**
     * The block's sprite, cut out of the sheet the bench exported.
     *
     * Out of `atlas.png` and not from a file of its own, because no such file exists: the
     * individual images are never written to disk, and making them would be a second
     * generated artefact to keep in step with the first.
     */
    private function sprite(string $name): ?GdImage
    {
        $where = Sprites::find($name);
        $sheetPath = public_path('forge/atlas.png');

        if ($where === null || ! is_file($sheetPath)) {
            return null;
        }

        $sheet = @imagecreatefrompng($sheetPath);
        if ($sheet === false) {
            return null;
        }

        $cut = imagecreatetruecolor($where['w'], $where['h']);
        imagealphablending($cut, false);
        imagesavealpha($cut, true);
        imagecopy($cut, $sheet, 0, 0, $where['x'], $where['y'], $where['w'], $where['h']);
        imagedestroy($sheet);

        return $cut;
    }

    /** The line under the title: how big it is, what it is, where it is from. */
    private function under(Block $block): string
    {
        $parts = [$block->size().'x'.$block->size()];
        $parts[] = __(BlockCatalogue::categoryKey($block->category()));

        if ($block->planet() !== null) {
            $parts[] = __(BlockCatalogue::planetKey($block->planet()));
        }

        return implode('  -  ', $parts);
    }

    /**
     * Three figures at most, and the word that says what kind of figures they are.
     *
     * What matters differs by block: a smelter is what it makes, a conveyor is what it
     * carries, a generator is what it puts on the grid. Printing whichever one exists beats
     * printing a fixed set that is empty on two thirds of the pages.
     *
     * **The label follows the figure and is never assumed.** Rates get `au mieux`, the
     * site's own word for a nominal ceiling. A build cost is exact, so calling it a ceiling
     * would be a lie, and it gets `Coût de construction` instead. This repository sells the
     * difference between a measurement and an estimate; mislabelling one as the other on the
     * single image a stranger sees is the worst place to get it wrong.
     *
     * Every quantity is composed here rather than passed through a translation placeholder.
     * When a key is missing Laravel renders the key without substituting, and the number
     * disappears silently; on a site that only sells numbers, that is the information gone.
     *
     * Public because it is the rule worth testing, and testing it through the JPEG would
     * mean reading text back out of a picture.
     *
     * @return array{0: array<int, array{0: string, 1: array<int, int>}>, 1: string|null}
     */
    public function figures(Block $block): array
    {
        $second = __('blocs.unite.par-seconde');
        $lines = [];

        foreach (array_slice($block->outputAtBest(), 0, 2, true) as $item => $rate) {
            $lines[] = [$this->number((float) $rate).' '.$item.' '.$second, self::ACCENT];
        }

        if ($lines === [] && ($carried = $block->itemsPerSecond()) !== null) {
            $lines[] = [$this->number($carried).' '.__('blocs.page.objets').' '.$second, self::ACCENT];
        }

        if (($made = $block->powerOut()) !== null) {
            $lines[] = ['+'.$this->number($made).' '.__('blocs.unite.energie-seconde'), self::GOOD];
        } elseif (($used = $block->powerIn()) !== null) {
            $lines[] = ['-'.$this->number($used).' '.__('blocs.unite.energie-seconde'), self::BAD];
        }

        if ($lines !== []) {
            return [array_slice($lines, 0, 3), __('blocs.page.au-mieux')];
        }

        /* Nothing this block does is a rate: a wall, a turret, a bridge. Its cost is still
           worth stating, and it is the one number every block has. */
        foreach (array_slice($block->cost(), 0, 3, true) as $item => $amount) {
            $lines[] = [$this->number((float) $amount).' '.$item, self::INK];
        }

        return [$lines, $lines === [] ? null : __('blocs.page.cout')];
    }
}
