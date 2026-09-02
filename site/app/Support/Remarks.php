<?php

namespace App\Support;

use App\Models\Schematic;
use App\Models\SchematicItem;
use App\Services\BlockCatalogue;

/**
 * What to say about a schematic in a list, so the reader does not have to compare tiles.
 *
 * A listing that only sorts leaves the whole comparison to the player: twenty-four tiles,
 * four numbers each, and no statement anywhere about which one answers their question.
 * Corentin, asking for this: "dis quel est le plus rendement par rapport a la taille, lui
 * est plus pour le debut de jeu car moins de ressource demander".
 *
 * The rule this class lives under, and it is the repository's own: a remark is never an
 * opinion, and it never travels without the figure that produced it. Not "this one is
 * good" but "the best value for its size, 2.3 times the median of this list". The reader
 * can disagree with the second, which is the only honest way to write the first.
 *
 * Everything is measured against the page in front of the reader, not against the
 * catalogue. "The smallest" means the smallest of these twenty-four, and it changes when
 * the filters change, because that is the comparison the reader is actually making. A
 * superlative computed over fifteen thousand rows and printed under eight of them would be
 * exact and answer a question nobody asked.
 */
final class Remarks
{
    /** How far above the median a schematic has to sit before the page says anything. */
    private const NOTABLE = 1.25;

    /** And how far below, before it says the opposite. */
    private const THIN = 0.8;

    /**
     * The four winners of the page, each on its own axis and each named for its axis.
     *
     * Four rather than one, because "the best" is not a question. A player with a gap in
     * their base, a player with a copper budget and a player who wants raw throughput are
     * asking three different things, and one ranking cannot answer all three. The same
     * schematic winning two of them is a real answer, not a bug.
     *
     * @param  iterable<Schematic>  $schematics
     * @return list<array{question: string, schematic: Schematic, figure: string}>
     */
    public static function winners(iterable $schematics, string $item, string $unit): array
    {
        $rows = collect($schematics)->filter(fn (Schematic $s) => $s->tiles() > 1);
        if ($rows->count() < 2) {
            return [];
        }

        $found = [];

        if ($item !== '') {
            $dense = $rows->sortByDesc(fn (Schematic $s) => self::rateOf($s, $item, true))->first();
            $strong = $rows->sortByDesc(fn (Schematic $s) => self::rateOf($s, $item))->first();

            if (self::rateOf($dense, $item, true) > 0) {
                $found[] = [
                    'question' => __('vitrine.verdict.rendement'),
                    'schematic' => $dense,
                    'figure' => self::number(self::rateOf($dense, $item, true), 1).' '.$unit
                        .' '.__('vitrine.verdict.par-tuile'),
                ];
            }
            if (self::rateOf($strong, $item) > 0) {
                $found[] = [
                    'question' => __('vitrine.verdict.production'),
                    'schematic' => $strong,
                    'figure' => self::number(self::rateOf($strong, $item)).' '.$unit,
                ];
            }
        }

        $small = $rows->sortBy(fn (Schematic $s) => $s->tiles())->first();
        $found[] = [
            'question' => __('vitrine.verdict.encombrement'),
            'schematic' => $small,
            'figure' => $small->width.'×'.$small->height,
        ];

        $light = $rows->sortBy('blocks')->first();
        $found[] = [
            'question' => __('vitrine.verdict.blocs'),
            'schematic' => $light,
            'figure' => self::number((float) $light->blocks).' '
                .trans_choice('vitrine.contraintes.unite.bloc-compte', (int) $light->blocks),
        ];

        return $found;
    }

    /**
     * Up to three remarks about one schematic, each carrying the figure behind it.
     *
     * Three and not five: a tile that says everything says nothing, and the fourth line is
     * where a reader stops reading. They are ordered by how much they change a decision,
     * so the one that gets cut is always the least useful.
     *
     * @param  iterable<Schematic>  $page
     * @return list<array{tone: string, title: string, because: string}>
     */
    public static function about(Schematic $schematic, iterable $page, string $item, string $unit): array
    {
        $rows = collect($page)->filter(fn (Schematic $s) => $s->tiles() > 1);
        $notes = [];

        if ($item !== '' && $rows->count() > 1) {
            $rates = $rows->map(fn (Schematic $s) => self::rateOf($s, $item, true))
                ->filter(fn ($r) => $r > 0)->values()->sort()->values();
            $mine = self::rateOf($schematic, $item, true);

            if ($mine > 0 && $rates->count() > 1) {
                $median = self::median($rates->all());
                $ratio = $median > 0 ? $mine / $median : 0;

                if ($ratio >= self::NOTABLE) {
                    $notes[] = [
                        'tone' => 'fort',
                        'title' => __('vitrine.note.rentable'),
                        'because' => self::number($ratio, 1).' × '.__('vitrine.note.la-mediane')
                            .' : '.self::number($mine, 1).' '.$unit.' '.__('vitrine.verdict.par-tuile'),
                    ];
                } elseif ($ratio > 0 && $ratio <= self::THIN) {
                    $notes[] = [
                        'tone' => 'faible',
                        'title' => __('vitrine.note.etale'),
                        'because' => self::number($mine, 1).' '.$unit.' '
                            .__('vitrine.verdict.par-tuile').' '.__('vitrine.note.contre')
                            .' '.self::number($median, 1).' '.__('vitrine.note.pour-la-mediane'),
                    ];
                }
            }
        }

        if ($rows->count() > 1 && $schematic->tiles() === $rows->min(fn (Schematic $s) => $s->tiles())) {
            $notes[] = [
                'tone' => 'petit',
                'title' => __('vitrine.note.le-plus-petit'),
                'because' => $schematic->width.'×'.$schematic->height.' '
                    .__('vitrine.note.soit').' '.$schematic->tiles().' '
                    .__('vitrine.contraintes.unite.tuiles'),
            ];
        }

        if ($note = self::aboutCost($schematic)) {
            $notes[] = $note;
        }

        if ($note = self::aboutPower($schematic)) {
            $notes[] = $note;
        }

        return array_slice($notes, 0, 3);
    }

    /**
     * What it costs to put down, and whether any of it has to be made first.
     *
     * "Early game" is the thing a player actually wants to know and the thing this class
     * refuses to guess. No field of the game orders its resources by era: `hardness` is
     * zero for everything crafted, and `cost` puts coal level with graphite. The game does
     * hold that order, in its tech tree, and the bench's dumper already walks it to stamp a
     * planet on each block; until the depth comes out of there, saying "early game" would
     * be this file's own opinion wearing the catalogue's clothes.
     *
     * So the question is turned into one the catalogue can answer without an order at all:
     * can every resource be dug out of the ground, or does some of it have to come out of a
     * machine you must already have built? `minableItems()` is the game's own list of what
     * a drill pulls up. A player reads "nothing to make first" and concludes "early" by
     * themselves, from a fact rather than from our ranking.
     */
    private static function aboutCost(Schematic $schematic): ?array
    {
        $cost = $schematic->cost();
        if ($cost === []) {
            return null;
        }

        $fromTheGround = BlockCatalogue::minableItems();
        $mustBeMade = array_diff(array_keys($cost), array_keys($fromTheGround));

        arsort($cost);
        $biggest = array_slice($cost, 0, 2, true);
        $saying = [];
        foreach ($biggest as $resource => $amount) {
            $saying[] = self::number((float) $amount).' '.Thing::name($resource);
        }

        if ($mustBeMade === []) {
            return [
                'tone' => 'tot',
                'title' => __('vitrine.note.rien-a-fabriquer'),
                'because' => __('vitrine.note.coute').' '.implode(', ', $saying),
            ];
        }

        // Named rather than counted: "three crafted resources" tells a player nothing, and
        // "phase fabric" tells them immediately whether this is for them.
        $made = array_slice(array_values($mustBeMade), 0, 2);

        return [
            'tone' => 'tard',
            'title' => __('vitrine.note.a-fabriquer').' '
                .implode(', ', array_map(fn ($r) => Thing::name($r), $made)),
            'because' => __('vitrine.note.coute').' '.implode(', ', $saying),
        ];
    }

    /**
     * Whether it hands the base electricity or asks for some.
     *
     * Both sides come from the ceiling, so this compares like with like. It is never a
     * penalty in any ranking: a base already has power, or can run a wire, so this is a
     * prerequisite to state and not a debt to mark down for.
     */
    private static function aboutPower(Schematic $schematic): ?array
    {
        $spare = (float) $schematic->power_made - (float) $schematic->power_used;

        if ($spare > 0.5) {
            return [
                'tone' => 'autonome',
                'title' => __('vitrine.note.autonome'),
                'because' => __('vitrine.note.il-reste').' '.self::number($spare).' '
                    .__('vitrine.note.energie-seconde'),
            ];
        }

        if ($spare < -0.5) {
            return [
                'tone' => 'brancher',
                'title' => __('vitrine.note.a-brancher'),
                'because' => __('vitrine.note.il-faut').' '.self::number(-$spare).' '
                    .__('vitrine.note.energie-seconde'),
            ];
        }

        return null;
    }

    /**
     * The ceiling this schematic carries for that thing, read off the rows already loaded.
     *
     * The ceiling and only the ceiling, the same kind the listing ranks on. Mixing a
     * measurement into a page ordered by ceilings would not empty it, it would fill it with
     * the wrong nature: a hundred and seventeen rows carry a measurement against six
     * thousand seven hundred carrying a ceiling, so a mixed read always returns enough to
     * look right.
     */
    private static function rateOf(Schematic $schematic, string $item, bool $perTile = false): float
    {
        $row = $schematic->items->first(fn (SchematicItem $i) => $i->item === $item
            && $i->sens === SchematicItem::PRODUIT
            && $i->kind === SchematicItem::PLAFOND);

        if ($row === null) {
            return 0;
        }

        return (float) ($perTile ? $row->rate_per_tile : $row->rate);
    }

    /** @param  list<float>  $values */
    private static function median(array $values): float
    {
        sort($values);
        $count = count($values);
        if ($count === 0) {
            return 0;
        }

        $middle = intdiv($count, 2);

        return $count % 2 === 1
            ? $values[$middle]
            : ($values[$middle - 1] + $values[$middle]) / 2;
    }

    /** Written the way the rest of the site writes numbers, space for thousands. */
    private static function number(float $value, int $decimals = 0): string
    {
        return number_format($value, $decimals, ',', ' ');
    }
}
