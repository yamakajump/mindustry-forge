<?php

namespace App\Services\Cards;

use GdImage;

/**
 * The machinery every share card is built with: the canvas, the palette, the text.
 *
 * There are two kinds of card, one for a schematic and one for a block, and they have to
 * look like the same site. Writing the second composer next to the first would have given
 * two frames, two signatures and two ideas of what a figure looks like, and they would have
 * drifted apart the first time one of them was adjusted.
 *
 * The colours are the site's own tokens, spelled here because GD takes channels rather than
 * CSS. They are the only copy of the palette outside `forge.css`, and that is a real cost
 * paid for a real reason: a card is drawn where no stylesheet reaches.
 */
abstract class Card
{
    /** The shape every unfurler expects: Discord, Twitter, Slack, LinkedIn alike. */
    public const WIDTH = 1200;

    public const HEIGHT = 630;

    protected const PAD = 44;

    protected const TITLE = 36;

    protected const TITLE_STEP = 48;

    protected const BG = [0x12, 0x16, 0x1B];

    protected const STAGE = [0x0E, 0x11, 0x16];

    protected const EDGE = [0x2F, 0x37, 0x42];

    protected const INK = [0xE9, 0xED, 0xF3];

    protected const DIM = [0x9A, 0xA4, 0xB2];

    protected const ACCENT = [0xFF, 0xD3, 0x7F];

    protected const GOOD = [0x84, 0xD9, 0x8B];

    protected const BAD = [0xFF, 0x8B, 0x8B];

    public function __construct(
        protected readonly string $fontPath,
        protected readonly string $markPath,
    ) {}

    /**
     * A fresh canvas, and the JPEG that comes out of it.
     *
     * JPEG rather than PNG: the same visual is around 70 kB at quality 88 against more than
     * 500 as a PNG, and a share image is downloaded again by every service that unfurls the
     * link, every time it unfurls it.
     */
    protected function paint(callable $draw): string
    {
        $canvas = imagecreatetruecolor(self::WIDTH, self::HEIGHT);
        imagefilledrectangle($canvas, 0, 0, self::WIDTH, self::HEIGHT, $this->rgb($canvas, self::BG));

        $draw($canvas);
        $this->drawFrame($canvas);

        ob_start();
        imagejpeg($canvas, null, 88);
        imagedestroy($canvas);

        return (string) ob_get_clean();
    }

    /**
     * A pixel-art image dropped into a panel, scaled nearest-neighbour and never stretched.
     *
     * Nearest-neighbour because this is pixel art: bilinear smoothing turns a conveyor belt
     * into a grey smear, and that detail is exactly how a player recognises what they are
     * looking at. At an integer factor while that is possible, because a fractional one
     * gives one column in three a different width, which is glaring on a grid.
     */
    protected function drawPanel(GdImage $canvas, GdImage $art, int $panelWidth): void
    {
        imagefilledrectangle($canvas, 0, 0, $panelWidth, self::HEIGHT, $this->rgb($canvas, self::STAGE));

        $scale = min(
            ($panelWidth - self::PAD * 2) / imagesx($art),
            (self::HEIGHT - self::PAD * 2) / imagesy($art),
        );
        if ($scale > 1) {
            $scale = floor($scale);
        }

        $w = max(1, (int) round(imagesx($art) * $scale));
        $h = max(1, (int) round(imagesy($art) * $scale));

        imagealphablending($canvas, true);
        imagecopyresized(
            $canvas, $art,
            (int) (($panelWidth - $w) / 2), (int) ((self::HEIGHT - $h) / 2),
            0, 0, $w, $h, imagesx($art), imagesy($art),
        );
    }

    /**
     * The title, the line under it, then the figures. Centred on the height.
     *
     * Centred rather than pinned to the top: a one-line name and a three-line name are not
     * the same height, and pinning leaves the short one floating above a hole.
     *
     * @param  array<int, array{0: string, 1: array<int, int>}>  $figures
     */
    protected function drawColumn(GdImage $canvas, int $left, string $title, string $under,
        array $figures, ?string $kicker = null): void
    {
        $width = self::WIDTH - self::PAD - $left;
        $lines = $this->wrap($title, self::TITLE, $width, 3);

        $height = count($lines) * self::TITLE_STEP + 30 + ($kicker !== null ? 40 : 0)
            + 40 + count($figures) * 46;
        $y = (int) ((self::HEIGHT - $height) / 2) + self::TITLE;

        foreach ($lines as $line) {
            $this->write($canvas, $line, $left, $y, self::TITLE, self::INK);
            $y += self::TITLE_STEP;
        }

        $y += 12;
        $this->write($canvas, $under, $left, $y, 19, self::DIM);
        $y += 50;

        if ($kicker !== null) {
            $this->write($canvas, mb_strtoupper($kicker), $left, $y, 17, self::ACCENT);
            $y += 40;
        }

        foreach ($figures as [$text, $colour]) {
            $this->write($canvas, $text, $left, $y, 29, $colour);
            $y += 46;
        }

        $this->drawSignature($canvas, $left);
    }

    /** The mark and the site's name, at the foot of the card. */
    protected function drawSignature(GdImage $canvas, int $left): void
    {
        $baseline = self::HEIGHT - 54;
        $mark = @imagecreatefrompng($this->markPath);

        if ($mark !== false) {
            imagealphablending($canvas, true);
            imagecopyresampled($canvas, $mark, $left, $baseline - 26, 0, 0,
                34, 34, imagesx($mark), imagesy($mark));
            imagedestroy($mark);
            $left += 46;
        }

        /* Start from the box the render just returned, rather than measuring "Mindustry"
           plus a space: imagettfbbox measures ink and not advance, so a trailing space
           counts for nothing there and the two words ran together. */
        $end = $this->write($canvas, 'Mindustry', $left, $baseline, 22, self::INK);
        $this->write($canvas, 'Forge', $end + $this->spaceWidth(22), $baseline, 22, self::ACCENT);
    }

    /** The border, which lifts the card off whatever ground the client shows it on. */
    protected function drawFrame(GdImage $canvas): void
    {
        imagesetthickness($canvas, 12);
        imagerectangle($canvas, 0, 0, self::WIDTH - 1, self::HEIGHT - 1, $this->rgb($canvas, self::EDGE));
    }

    /**
     * Break a text into lines that fit, and put an ellipsis on the end.
     *
     * Measured line by line with the real face rather than estimated in characters: the
     * game's face is not monospaced, and a name made of capitals overruns where a character
     * count called it fine.
     *
     * @return array<int, string>
     */
    protected function wrap(string $text, int $size, int $maxWidth, int $maxLines): array
    {
        $words = preg_split('/\s+/', trim($text)) ?: [];
        $lines = [];
        $current = '';
        $placed = 0;

        foreach ($words as $word) {
            $candidate = $current === '' ? $word : $current.' '.$word;
            if ($current !== '' && $this->widthOf($candidate, $size) > $maxWidth) {
                $lines[] = $current;
                if (count($lines) === $maxLines) {
                    break;
                }
                $current = $word;
            } else {
                $current = $candidate;
            }
            $placed++;
        }

        if (count($lines) < $maxLines && $current !== '') {
            $lines[] = $current;
            $placed = count($words);
        }

        if ($lines === []) {
            return ['Sans nom'];
        }

        /* The count of words actually placed, rather than a str_word_count over the result:
           that function miscounts as soon as a name carries an accent or a digit, and a card
           that shows an ellipsis on a complete title lies about what it holds. */
        if ($placed < count($words)) {
            $last = count($lines) - 1;
            while ($this->widthOf($lines[$last].'...', $size) > $maxWidth
                   && mb_strlen($lines[$last]) > 1) {
                $lines[$last] = mb_substr($lines[$last], 0, -1);
            }
            $lines[$last] .= '...';
        }

        return $lines;
    }

    protected function widthOf(string $text, int $size): int
    {
        $box = imagettfbbox($size, 0, $this->fontPath, $text);

        return $box === false ? 0 : (int) ($box[2] - $box[0]);
    }

    /** Writes one line, and returns the abscissa where its ink stops. */
    protected function write(GdImage $canvas, string $text, int $x, int $y, int $size, array $colour): int
    {
        $box = imagettftext($canvas, $size, 0, $x, $y, $this->rgb($canvas, $colour),
            $this->fontPath, $text);

        return $box === false ? $x : (int) $box[2];
    }

    /**
     * The advance of a space, measured by difference.
     *
     * There is no other way to get it: a space has no ink, so its box is empty and its
     * measured width is zero.
     */
    protected function spaceWidth(int $size): int
    {
        return max(1, $this->widthOf('n n', $size) - $this->widthOf('nn', $size));
    }

    protected function rgb(GdImage $canvas, array $colour): int
    {
        return (int) imagecolorallocate($canvas, $colour[0], $colour[1], $colour[2]);
    }

    /** A number the way the site writes one: no pointless decimal, a thin space. */
    protected function number(float $value): string
    {
        return number_format($value, $value == (int) $value ? 0 : 1, ',', ' ');
    }
}
