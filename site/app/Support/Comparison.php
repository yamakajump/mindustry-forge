<?php

namespace App\Support;

use App\Models\Schematic;
use App\Models\SchematicItem;

/**
 * Two schematics held against each other, and the honest limits of doing so.
 *
 * This is the question no other Mindustry site can answer. They hold screenshots, so a
 * player picking between two graphite lines reads two pictures and guesses; here both were
 * read by the same engine, so the answer is a subtraction.
 *
 * The subtraction is the easy half. The hard half, and the reason this is a class rather
 * than a Blade file with two columns, is knowing when there is no answer:
 *
 * **Two schematics that do not make the same thing have no winner.** Ranking forty graphite
 * a minute against twenty-five silicon a minute would be declaring one graphite worth one
 * silicon, which is false and would be invisible. So the comparison is per item, over the
 * items they share, and a pair sharing nothing is said to share nothing.
 *
 * **A ceiling and a measurement do not compare.** The catalogue arriving tonight is fifteen
 * thousand imported schematics that nobody marked by hand, so their throughput can only be
 * a ceiling. Setting one against a measured figure and printing the difference would be
 * inventing a verdict out of two different kinds of number.
 *
 * **There is no single score.** Not "A wins", not a percentage of overall goodness. A
 * schematic that makes more per minute and costs three times as much is not better or
 * worse, it is a different trade, and the player is the one who knows which they want. The
 * site states each difference and stops.
 */
class Comparison
{
    /** Below this, two rates are the same number and the difference is noise. */
    private const SETTLED = 1e-4;

    public function __construct(
        public readonly Schematic $left,
        public readonly Schematic $right,
    ) {}

    /**
     * What both of them make, with each side's figure and the gap.
     *
     * Keyed by item, in the order of the biggest gap first: the point of the page is what
     * separates them, so what separates them most goes at the top.
     *
     * @return array<int, array{item: string, left: ?SchematicItem, right: ?SchematicItem, gap: float, comparable: bool}>
     */
    public function outputs(): array
    {
        $left = $this->produced($this->left);
        $right = $this->produced($this->right);

        $rows = [];
        foreach (array_unique([...array_keys($left), ...array_keys($right)]) as $item) {
            $a = $left[$item] ?? null;
            $b = $right[$item] ?? null;

            $rows[] = [
                'item' => $item,
                'left' => $a,
                'right' => $b,
                'gap' => (float) ($a?->rate ?? 0) - (float) ($b?->rate ?? 0),
                'perBlockGap' => (float) ($a?->rate_per_block ?? 0) - (float) ($b?->rate_per_block ?? 0),
                // Both sides present, and both figures of the same kind. Anything else is
                // shown side by side and explicitly not subtracted.
                'comparable' => $a !== null && $b !== null && $a->kind === $b->kind,
                'kind' => $a?->kind ?? $b?->kind,
                'mixed' => $a !== null && $b !== null && $a->kind !== $b->kind,
            ];
        }

        usort($rows, fn ($x, $y) => abs($y['gap']) <=> abs($x['gap']));

        return $rows;
    }

    /** What they both make, which is the only ground a comparison can stand on. */
    public function shared(): array
    {
        return array_values(array_filter(
            $this->outputs(),
            fn ($row) => $row['left'] !== null && $row['right'] !== null,
        ));
    }

    /**
     * Whether there is anything to compare at all.
     *
     * A graphite line and a turret wall share nothing, and saying so is the answer. Inventing
     * a comparison between them would be the same fault as the net-power ranking: a single
     * figure over things that do not belong on the same axis reads as a verdict.
     */
    public function comparable(): bool
    {
        return $this->shared() !== [];
    }

    /**
     * Whether either side's figures are ceilings rather than measurements.
     *
     * Said once at the top rather than per row, because it colours the whole page. Most of
     * what the site holds after tonight will be imported and unmarked, so this will be the
     * common case and not the exception.
     */
    public function anyCeiling(): bool
    {
        foreach ($this->outputs() as $row) {
            if ($row['kind'] === SchematicItem::PLAFOND) {
                return true;
            }
        }

        return false;
    }

    /** Where the two sides state different kinds of figure, which cannot be subtracted. */
    public function mixedKinds(): bool
    {
        foreach ($this->outputs() as $row) {
            if ($row['mixed']) {
                return true;
            }
        }

        return false;
    }

    /**
     * The differences that hold whatever the schematics make: room, cost, current.
     *
     * These are the axes where a smaller number is plainly better and no weighting is
     * needed, so they are stated as a difference rather than as two columns for the reader
     * to subtract in their head. That is the whole point of the page.
     *
     * @return array<int, array{key: string, left: float, right: float, gap: float, lowerIsBetter: bool}>
     */
    public function sizes(): array
    {
        // Chaque cle ecrite en toutes lettres plutot qu'un prefixe suivi d'un nom d'axe :
        // une cle assemblee au rendu est une cle qu'aucun controle ne voit, donc le jour
        // ou un axe s'ajoute, la page imprime la cle brute et rien ne le signale.
        return array_values(array_filter([
            $this->measure('schema.comparer.mesure-blocs',
                (float) $this->left->blocks, (float) $this->right->blocks),
            $this->measure('schema.comparer.mesure-emprise',
                (float) $this->left->width * $this->left->height,
                (float) $this->right->width * $this->right->height),
            $this->measure('schema.comparer.mesure-energie',
                $this->left->powerNeeded(), $this->right->powerNeeded()),
        ]));
    }

    /**
     * What each costs to raise, item by item, and the gap.
     *
     * Read from the stored analysis rather than recomputed: `cost` is what the engine
     * worked out from the game's own requirements, and a second sum here would be a second
     * thing to have wrong.
     *
     * @return array<int, array{item: string, left: float, right: float, gap: float}>
     */
    public function cost(): array
    {
        $left = (array) ($this->left->analysis['cost'] ?? []);
        $right = (array) ($this->right->analysis['cost'] ?? []);

        $rows = [];
        foreach (array_unique([...array_keys($left), ...array_keys($right)]) as $item) {
            if (! is_string($item)) {
                continue;
            }
            $a = (float) ($left[$item] ?? 0);
            $b = (float) ($right[$item] ?? 0);
            $rows[] = ['item' => $item, 'left' => $a, 'right' => $b, 'gap' => $a - $b];
        }

        usort($rows, fn ($x, $y) => abs($y['gap']) <=> abs($x['gap']));

        return $rows;
    }

    /** Whether the two hold enough cost detail for that section to say anything. */
    public function hasCost(): bool
    {
        return $this->cost() !== [];
    }

    /** What stops each of them, when the engine found something. */
    public function bottlenecks(): array
    {
        return [
            'left' => $this->left->analysis['bottleneck'][0] ?? null,
            'right' => $this->right->analysis['bottleneck'][0] ?? null,
        ];
    }

    /**
     * One axis where less is plainly better, or nothing when neither side uses it.
     *
     * Room, footprint and current are the three places a difference needs no weighting: a
     * layout in twelve fewer blocks is smaller, full stop. Everything else on this page is
     * a trade, which is why only these three are stated as a gap.
     */
    private function measure(string $key, float $left, float $right): ?array
    {
        if ($left <= self::SETTLED && $right <= self::SETTLED) {
            return null;
        }

        return [
            'key' => $key,
            'left' => $left,
            'right' => $right,
            'gap' => $left - $right,
        ];
    }

    /** @return array<string, SchematicItem> */
    private function produced(Schematic $schematic): array
    {
        $rows = [];
        foreach ($schematic->items as $row) {
            if ($row->sens === SchematicItem::PRODUIT) {
                $rows[$row->item] = $row;
            }
        }

        return $rows;
    }
}
