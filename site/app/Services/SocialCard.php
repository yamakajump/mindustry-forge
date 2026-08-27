<?php

namespace App\Services;

use App\Models\Schematic;
use GdImage;

/**
 * La vignette qu'un lien vers une schematique affiche quand on le colle quelque part.
 *
 * La page poussait jusqu'ici le rendu brut du plan en `og:image`. Ca marche, au sens ou
 * une image apparait, mais un plan est carre ou tres allonge selon ce qu'on a copie :
 * Discord le rogne ou le pose sur des bandes noires, et il n'y a ni titre, ni chiffre, ni
 * marque. Un lien qui montre ce qu'une schematique fait se clique ; un lien qui montre
 * une bouillie de pixels gris, non.
 *
 * On compose donc une carte au format que tous les deplieurs attendent, avec le plan d'un
 * cote et ce que l'analyse en a dit de l'autre.
 */
class SocialCard
{
    /** Le format que Discord, Twitter, Slack et LinkedIn attendent tous. */
    public const WIDTH = 1200;

    public const HEIGHT = 630;

    /** La part de la largeur laissee au plan. Le reste porte le texte. */
    private const PLAN_SHARE = 0.52;

    private const PAD = 44;

    /** Le corps du titre, et le pas entre ses lignes. */
    private const TITLE = 36;

    private const TITLE_STEP = 48;

    private const BG = [0x12, 0x16, 0x1B];

    private const STAGE = [0x0E, 0x11, 0x16];

    private const EDGE = [0x2F, 0x37, 0x42];

    private const INK = [0xE9, 0xED, 0xF3];

    private const DIM = [0x9A, 0xA4, 0xB2];

    private const ACCENT = [0xFF, 0xD3, 0x7F];

    private const GOOD = [0x84, 0xD9, 0x8B];

    private const BAD = [0xFF, 0x8B, 0x8B];

    public function __construct(
        private readonly string $fontPath,
        private readonly string $markPath,
    ) {}

    /**
     * La carte, en JPEG.
     *
     * JPEG et pas PNG : le meme visuel pese autour de 70 ko en JPEG de qualite 88 contre
     * plus de 500 en PNG, et une image de partage est retelechargee par chaque service qui
     * deplie le lien, a chaque fois qu'il le deplie.
     */
    public function render(Schematic $schematic, ?string $planPath = null): string
    {
        $canvas = imagecreatetruecolor(self::WIDTH, self::HEIGHT);
        imagefilledrectangle($canvas, 0, 0, self::WIDTH, self::HEIGHT, $this->rgb($canvas, self::BG));

        $planWidth = $planPath !== null ? (int) (self::WIDTH * self::PLAN_SHARE) : 0;
        if ($planWidth > 0) {
            $this->drawPlan($canvas, $planPath, $planWidth);
        }

        $this->drawText($canvas, $schematic, $planWidth);
        $this->drawFrame($canvas);

        ob_start();
        imagejpeg($canvas, null, 88);
        imagedestroy($canvas);

        return (string) ob_get_clean();
    }

    /**
     * Le plan, agrandi au plus proche voisin et jamais deforme.
     *
     * Au plus proche voisin parce que c'est du pixel art : le lissage bilineaire d'une
     * bande de convoyeur en fait une trainee grise, et c'est precisement le detail auquel
     * un joueur reconnait ce qu'il regarde. La page fait la meme chose avec
     * `image-rendering: pixelated`.
     */
    private function drawPlan(GdImage $canvas, string $planPath, int $panelWidth): void
    {
        imagefilledrectangle($canvas, 0, 0, $panelWidth, self::HEIGHT, $this->rgb($canvas, self::STAGE));

        $plan = @imagecreatefrompng($planPath);
        if ($plan === false) {
            return;
        }

        $boxW = $panelWidth - self::PAD * 2;
        $boxH = self::HEIGHT - self::PAD * 2;
        $scale = min($boxW / imagesx($plan), $boxH / imagesy($plan));

        /* On n'agrandit qu'a un facteur entier tant qu'on peut. Un plan de 40 pixels
           etire par 7,3 donne des tuiles de largeurs inegales, une colonne sur trois plus
           epaisse que ses voisines, et ca se voit immediatement sur une grille. */
        if ($scale > 1) {
            $scale = floor($scale);
        }

        $w = max(1, (int) round(imagesx($plan) * $scale));
        $h = max(1, (int) round(imagesy($plan) * $scale));

        imagealphablending($canvas, true);
        imagecopyresized(
            $canvas, $plan,
            (int) (($panelWidth - $w) / 2), (int) ((self::HEIGHT - $h) / 2),
            0, 0, $w, $h, imagesx($plan), imagesy($plan),
        );
        imagedestroy($plan);
    }

    /** Le nom, les chiffres, et la marque en pied. */
    private function drawText(GdImage $canvas, Schematic $schematic, int $planWidth): void
    {
        $left = $planWidth + self::PAD * ($planWidth > 0 ? 1 : 2);
        $width = self::WIDTH - self::PAD - $left;

        $title = $this->wrap($schematic->name, self::TITLE, $width, 3);
        $figures = $this->figures($schematic);

        /* Le bloc est centre sur la hauteur plutot que cale en haut. Un nom d'une ligne et
           un nom de trois lignes n'ont pas la meme hauteur, et un bloc cale en haut laisse
           le premier flotter au-dessus d'un grand vide. */
        $height = count($title) * self::TITLE_STEP + 30 + 40 + count($figures) * 48;
        $y = (int) ((self::HEIGHT - $height) / 2) + self::TITLE;

        foreach ($title as $line) {
            $this->write($canvas, $line, $left, $y, self::TITLE, self::INK);
            $y += self::TITLE_STEP;
        }

        $y += 12;
        $this->write($canvas, $this->shape($schematic), $left, $y, 19, self::DIM);
        $y += 52;

        foreach ($figures as [$text, $colour]) {
            $this->write($canvas, $text, $left, $y, 29, $colour);
            $y += 46;
        }

        $this->drawSignature($canvas, $left);
    }

    /**
     * Ce que l'analyse a retenu, au plus trois lignes.
     *
     * Trois et pas la liste complete : la vignette est lue en une seconde dans un fil de
     * discussion, et une liste de huit sorties n'y est pas lue du tout.
     */
    private function figures(Schematic $schematic): array
    {
        $lines = [];

        $produces = collect($schematic->produces ?? [])->sortDesc()->take(2);
        foreach ($produces as $item => $rate) {
            $lines[] = [$this->number($rate).' '.$item.' / min', self::ACCENT];
        }

        $power = round($schematic->power_made - $schematic->power_used);
        if (abs($power) >= 1 || $schematic->power_used > 0) {
            $lines[] = [
                ($power > 0 ? '+' : '').$this->number($power).' energie / s',
                $power < 0 ? self::BAD : self::GOOD,
            ];
        }

        return array_slice($lines, 0, 3);
    }

    /** La taille et le nombre de blocs, la ligne que la page affiche sous le titre. */
    private function shape(Schematic $schematic): string
    {
        return $schematic->width.'x'.$schematic->height.'  -  '.$schematic->blocks.' blocs';
    }

    /** Le signe et le nom du site, en pied de carte. */
    private function drawSignature(GdImage $canvas, int $left): void
    {
        $baseline = self::HEIGHT - 54;
        $mark = @imagecreatefrompng($this->markPath);

        if ($mark !== false) {
            $size = 34;
            imagealphablending($canvas, true);
            imagecopyresampled(
                $canvas, $mark, $left, $baseline - 26, 0, 0,
                $size, $size, imagesx($mark), imagesy($mark),
            );
            imagedestroy($mark);
            $left += 46;
        }

        /* On repart de la boite que le rendu vient de retourner, pas d'une mesure de
           « Mindustry » suivie d'un espace : imagettfbbox mesure l'encre et pas la chasse,
           donc l'espace final n'y compte pour rien et les deux mots se collaient. */
        $end = $this->write($canvas, 'Mindustry', $left, $baseline, 22, self::INK);
        $this->write($canvas, 'Forge', $end + $this->spaceWidth(22), $baseline, 22, self::ACCENT);
    }

    /** Le lisere, qui detache la carte du fond du client qui l'affiche. */
    private function drawFrame(GdImage $canvas): void
    {
        $edge = $this->rgb($canvas, self::EDGE);
        imagesetthickness($canvas, 12);
        imagerectangle($canvas, 0, 0, self::WIDTH - 1, self::HEIGHT - 1, $edge);
    }

    /**
     * Couper un texte en lignes qui tiennent, et poser des points de suspension au bout.
     *
     * Mesure ligne par ligne avec la vraie police plutot qu'estime en nombre de
     * caracteres : la police du jeu n'a pas des chasses egales, et un nom de schematique
     * fait de majuscules deborde la ou un compte de caracteres le disait bon.
     */
    private function wrap(string $text, int $size, int $maxWidth, int $maxLines): array
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

        /* Le compte des mots poses, plutot qu'un `str_word_count` sur le resultat : cette
           fonction compte mal des qu'un nom porte un accent ou un chiffre, et une carte qui
           annonce des points de suspension sur un titre complet ment sur son contenu. */
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

    private function widthOf(string $text, int $size): int
    {
        $box = imagettfbbox($size, 0, $this->fontPath, $text);

        return $box === false ? 0 : (int) ($box[2] - $box[0]);
    }

    /** Ecrit une ligne, et rend l'abscisse ou son encre s'arrete. */
    private function write(GdImage $canvas, string $text, int $x, int $y, int $size, array $colour): int
    {
        $box = imagettftext($canvas, $size, 0, $x, $y, $this->rgb($canvas, $colour),
            $this->fontPath, $text);

        return $box === false ? $x : (int) $box[2];
    }

    /**
     * La chasse d'une espace, mesuree par difference.
     *
     * Il n'y a pas d'autre facon de l'obtenir : une espace n'a pas d'encre, donc sa boite
     * est vide et sa largeur mesuree vaut zero.
     */
    private function spaceWidth(int $size): int
    {
        return max(1, $this->widthOf('n n', $size) - $this->widthOf('nn', $size));
    }

    private function rgb(GdImage $canvas, array $colour): int
    {
        return (int) imagecolorallocate($canvas, $colour[0], $colour[1], $colour[2]);
    }

    /** Un nombre comme le site l'ecrit : sans decimale inutile, avec une espace fine. */
    private function number(float $value): string
    {
        return number_format($value, $value == (int) $value ? 0 : 1, ',', ' ');
    }
}
