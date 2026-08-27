<?php

namespace App\Support;

/**
 * One block of the game, read from the catalogue the bench printed.
 *
 * The catalogue is a dump of `Block` fields as the running game held them, so it is shaped
 * like the game's class hierarchy and not like a page. A conveyor and a turret share four
 * fields out of thirty. This wraps one entry and answers the questions a page actually
 * asks, so that no view has to know which of `power` and `power_out` means what.
 *
 * Everything here reads. Nothing computes a flow: what a block does *in a layout* is the
 * solver's answer and it is lower than these figures, because it accounts for what
 * actually arrives. The rates on this object are nominal ceilings, and every page that
 * prints one has to say so, which is why they are named `atBest`.
 */
class Block
{
    /** The game's tick rate, and the only place this class says sixty. */
    private const TICKS = 60;

    /**
     * Subclasses whose `range` the dump already expressed in tiles.
     *
     * THIS IS A STOPGAP, not a fact about the game worth preserving. The catalogue stores
     * `range` in two different units and says which nowhere: it is a count of tiles for
     * bridges, beam nodes, plasma bores, mass drivers and overdrive projectors, and a world
     * distance at eight units to the tile for every turret, mender and shockwave tower. The
     * number alone cannot settle it, since a bridge conveyor's 4 and a mender's 40 are both
     * plausible either way.
     *
     * It comes from the game: `ItemBridge.range` is an int count of tiles while
     * `BaseTurret.range` is a float distance, and `DumpBlocks.java` divides by eight at three
     * call sites and copies the field as it stands at the rest. The real fix is in the
     * dumper, which should write the unit beside the value or bring everything to tiles;
     * until somebody owns that, this list keeps the pages honest.
     *
     * `BlockRangeUnitsTest` fails when the catalogue grows a subclass carrying `range` that
     * appears in neither this list nor its own list of world-unit classes, so the day the
     * dumper is corrected, or a new block arrives, this stops being silently wrong.
     */
    private const RANGE_IN_TILES = [
        'ItemBridge', 'BufferedItemBridge', 'DuctBridge', 'LiquidBridge',
        'DirectionLiquidBridge', 'BeamNode', 'BeamDrill',
        'MassDriver', 'PayloadMassDriver', 'OverdriveProjector',
    ];

    public function __construct(
        public readonly string $name,
        public readonly array $data,
    ) {}

    public function get(string $key, mixed $default = null): mixed
    {
        return $this->data[$key] ?? $default;
    }

    /**
     * The name as the game writes it, with the dashes taken out.
     *
     * Not translated, and deliberately: `silicon-smelter` is the string that appears in a
     * schematic, in a processor's `getBlock`, and in every other Mindustry tool. A player
     * searching for what they saw in the game has to find it here, so the identifier is
     * shown alongside and this prettier form is only ever decoration.
     */
    public function title(): string
    {
        return ucfirst(str_replace('-', ' ', $this->name));
    }

    public function category(): string
    {
        return (string) $this->get('category', 'effect');
    }

    /** Which world it belongs to, when it belongs to one. Plenty belong to neither. */
    public function planet(): ?string
    {
        return $this->get('planet');
    }

    /** The game class it came from, the closest thing to "what kind of thing is this". */
    public function kind(): string
    {
        return (string) $this->get('subclass', $this->get('kind', 'Block'));
    }

    public function size(): int
    {
        return (int) $this->get('size', 1);
    }

    public function health(): ?int
    {
        $health = (int) $this->get('health', 0);

        return $health > 0 ? $health : null;
    }

    /**
     * How long it takes to raise, in seconds.
     *
     * `buildTime` is in ticks like every other duration the game keeps, and the game runs
     * at sixty of them a second. Shown in seconds because nobody builds in ticks.
     */
    public function buildSeconds(): ?float
    {
        $ticks = (float) $this->get('build_time', 0);

        return $ticks > 0 ? $ticks / self::TICKS : null;
    }

    /** What it costs to build, item by item. */
    public function cost(): array
    {
        return (array) $this->get('cost', []);
    }

    /** How long one pass of its recipe takes, in seconds. */
    public function craftSeconds(): ?float
    {
        $ticks = (float) $this->get('craft_time', 0);

        return $ticks > 0 ? $ticks / self::TICKS : null;
    }

    /**
     * How many times a second it completes its recipe, fed perfectly.
     *
     * This is `craftsPerSecond` in `analyse.js`, which is the one implementation of the
     * game's arithmetic in this repository. It is repeated here rather than imported
     * because a Blade page cannot call a browser module, and `BlockRatesTest` runs the JS
     * over the whole catalogue and fails if the two ever answer differently. A copy that
     * cannot silently drift is a copy worth having; one that can is not.
     */
    public function craftsPerSecond(): float
    {
        $ticks = (float) $this->get('craft_time', 0);

        return $ticks > 0 ? self::TICKS / $ticks : 0.0;
    }

    /** The recipe as written: what goes in, per pass. */
    public function inputs(): array
    {
        return (array) $this->get('input', []);
    }

    public function inputLiquids(): array
    {
        return (array) $this->get('input_liquid', []);
    }

    public function outputs(): array
    {
        return (array) $this->get('output', []);
    }

    public function outputLiquids(): array
    {
        return (array) $this->get('output_liquid', []);
    }

    /**
     * What it makes a second with nothing in its way, item by item.
     *
     * A ceiling, not a measurement. A smelter standing in a real factory makes less
     * whenever less arrives, and the figures the rest of this site prints come from the
     * solver, which knows that. Every caller has to say "at best".
     */
    public function outputAtBest(): array
    {
        return $this->perSecond($this->outputs());
    }

    /** What it eats a second while running flat out. Same ceiling, same caveat. */
    public function inputAtBest(): array
    {
        return $this->perSecond($this->inputs());
    }

    public function outputLiquidAtBest(): array
    {
        return $this->perSecond($this->outputLiquids());
    }

    public function inputLiquidAtBest(): array
    {
        return $this->perSecond($this->inputLiquids());
    }

    private function perSecond(array $amounts): array
    {
        $rate = $this->craftsPerSecond();
        if ($rate <= 0) {
            return [];
        }

        $out = [];
        foreach ($amounts as $thing => $amount) {
            $out[$thing] = (float) $amount * $rate;
        }

        return $out;
    }

    /**
     * The electricity it draws, per second, or null when it draws none.
     *
     * Read off `power` and never off `consumes_power`. That flag is true on the graphite
     * press, a mechanical block with no `power` field at all: the game sets it from whether
     * the block could have a power consumer, not from whether it has one. Trusting it would
     * print "consumes power: yes, 0 per second" on a dozen pages.
     */
    public function powerIn(): ?float
    {
        $power = (float) $this->get('power', 0);

        return $power > 0 ? $power : null;
    }

    /**
     * The electricity it puts on the grid, per second, as the game's own card states it.
     *
     * `power_out` before `power_production`, which is the opposite of what the solver does,
     * and both are right. The solver wants the raw field because it then multiplies by the
     * ground the generator stands on. This page *is* the block's card, so it prints the
     * card's number: a turbine condenser's card has already divided by the nine vents it
     * expects, and a wiki that undid that division would describe a block nobody can build.
     */
    public function powerOut(): ?float
    {
        $power = (float) ($this->get('power_out') ?? $this->get('power_production') ?? 0);

        return $power > 0 ? $power : null;
    }

    /** How far it reaches, in tiles, whichever unit the catalogue happened to store. */
    public function rangeInTiles(): ?float
    {
        $range = $this->get('range');
        if (! is_numeric($range) || $range <= 0) {
            return null;
        }

        return in_array($this->kind(), self::RANGE_IN_TILES, true)
            ? (float) $range
            : (float) $range / 8;
    }

    /** How far a power node throws a laser. Kept in tiles by the dump already. */
    public function laserRange(): ?float
    {
        $range = (float) $this->get('laser_range', 0);

        return $range > 0 ? $range : null;
    }

    /** How many links a power node holds open at once. */
    public function maxNodes(): ?int
    {
        $nodes = (int) $this->get('max_nodes', 0);

        return $nodes > 0 ? $nodes : null;
    }

    /**
     * How long this drill takes to bring up one item, per tile of ore it stands on.
     *
     * This is `drillTimeOf` in `engine/ground.js`, which is `Drill.getDrillTime` in the
     * game, and it is not one formula but two. An ordinary drill pays a hardness term; a
     * burst drill does not, because its class sets `hardnessDrillMultiplier` to zero. A few
     * drills also halve their time on one particular ore, which is the `drill_multipliers`
     * divisor.
     *
     * Repeated in PHP for the same reason as `craftsPerSecond`, and guarded the same way:
     * `BlockRatesTest` runs the engine's own function over every drill and every ore and
     * fails if the two disagree. Before this existed the page printed the bare `drill_time`
     * and called it the answer, which quietly understated every ore harder than sand: a
     * mechanical drill on titanium takes 750 ticks, not 600.
     *
     * Still not a throughput. What a drill actually produces depends on how many ore tiles
     * are under it and on the water it is fed, which are properties of where it was placed:
     * the solver works those out and the analysis reports them.
     */
    public function drillTicksFor(string $item, int $hardness): float
    {
        $scale = (float) ($this->get('drill_multipliers')[$item] ?? 1);
        $hard = $this->get('role') === 'burst-drill' ? 0.0 : (float) $this->get('hardness_multiplier', 0);

        return ((float) $this->get('drill_time', 0) + $hard * $hardness) / ($scale ?: 1);
    }

    public function drillSecondsFor(string $item, int $hardness): float
    {
        return $this->drillTicksFor($item, $hardness) / self::TICKS;
    }

    /** Whether it is a drill at all, which is what decides if the ore table is worth drawing. */
    public function isDrill(): bool
    {
        return (float) $this->get('drill_time', 0) > 0 && $this->drillTier() !== null;
    }

    /** The ores it refuses regardless of hardness. The impact drill will not touch thorium. */
    public function blockedItems(): array
    {
        return array_values(array_filter((array) $this->get('blocked_items', []), 'is_string'));
    }

    /** Whether this drill can reach a given ore at all, by hardness and by refusal. */
    public function canDrill(string $item, int $hardness): bool
    {
        return $hardness <= (int) $this->get('tier', 0)
            && ! in_array($item, $this->blockedItems(), true);
    }

    /** The hardest ore it will touch. A mechanical drill stops at titanium. */
    public function drillTier(): ?int
    {
        $tier = (int) $this->get('tier', 0);

        return $tier > 0 ? $tier : null;
    }

    /** How much faster it runs on its boost liquid, when it takes one. */
    public function liquidBoost(): ?float
    {
        $boost = (float) $this->get('liquid_boost', 0);

        return $boost > 1 ? $boost : null;
    }

    public function itemCapacity(): ?int
    {
        $capacity = (int) $this->get('item_capacity', 0);

        return $capacity > 0 ? $capacity : null;
    }

    public function liquidCapacity(): ?int
    {
        $capacity = (int) $this->get('liquid_capacity', 0);

        return $capacity > 0 ? $capacity : null;
    }

    /** What a carrier moves a second, for the blocks whose whole job is moving things. */
    public function itemsPerSecond(): ?float
    {
        $rate = (float) $this->get('items_per_second', 0);

        return $rate > 0 ? $rate : null;
    }

    /** What it will take in, which is wider than a recipe: a turret accepts its ammo. */
    public function accepts(): array
    {
        return array_values(array_filter((array) $this->get('accepts', []), 'is_string'));
    }

    /** The liquids it will take, ammo and coolant included. */
    public function drinks(): array
    {
        return array_values(array_filter((array) $this->get('drinks', []), 'is_string'));
    }

    /** What it can be loaded with, for a turret. */
    public function ammo(): array
    {
        return array_values(array_filter((array) $this->get('ammo', []), 'is_string'));
    }

    /** The ore a floor gives up when it is drilled, for the tiles worth drilling. */
    public function drops(): ?string
    {
        $drops = $this->get('drops');

        return is_string($drops) ? $drops : null;
    }

    public function visibility(): string
    {
        return (string) $this->get('build_visibility', 'shown');
    }

    /**
     * Whether it only exists under some condition, such as a sandbox or the campaign.
     *
     * Shown rather than dropped, with its condition said out loud: a player who found a
     * block in a sandbox and came here looking for it deserves an answer, and the answer is
     * "yes, and only there".
     */
    public function isConditional(): bool
    {
        return $this->visibility() !== 'shown';
    }

    /** Whether it turns things into other things, which is what most pages are about. */
    public function isCrafter(): bool
    {
        return $this->outputs() !== [] || $this->outputLiquids() !== [];
    }

    /** Everything it takes in, recipe and ammo alike, with no duplicates. */
    public function everythingItTakes(): array
    {
        return array_values(array_unique(array_merge(
            array_keys($this->inputs()),
            $this->accepts(),
        )));
    }

    /** Everything it hands out. Liquids included, since a page lists them side by side. */
    public function everythingItMakes(): array
    {
        return array_values(array_unique(array_merge(
            array_keys($this->outputs()),
            array_keys($this->outputLiquids()),
        )));
    }
}
