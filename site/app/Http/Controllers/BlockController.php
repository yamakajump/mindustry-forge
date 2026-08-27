<?php

namespace App\Http\Controllers;

use App\Models\Schematic;
use App\Services\BlockCatalogue;
use App\Support\Block;
use Illuminate\Http\Request;
use Illuminate\View\View;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * A page for every block in the game, written from the figures the game itself printed.
 *
 * Their wiki is typed by hand, so it is out of date the day a version ships and nobody can
 * tell which parts. This one is a rendering of `blocks.json`, which the bench dumps from a
 * running server: when the game moves, the catalogue is regenerated and all two hundred and
 * fifty-four pages move with it. That is the whole argument, and it is the reason none of
 * these figures is allowed to be typed in this file.
 *
 * What makes the pages worth more than a stat sheet is the two directions they point in.
 * Upward, what feeds this block and where that comes from. Downward, what it feeds and
 * which public schematics on this site actually use it. The second one is a question no
 * other Mindustry site can answer, because none of them ever read the schematics they host.
 */
class BlockController extends Controller
{
    /** How many layouts to show on a block page before it stops being a block page. */
    private const SCHEMATICS_SHOWN = 12;

    /** What a block name is allowed to look like, so a lookup cannot be a paragraph. */
    private const NAME = '/^[a-z][a-z0-9-]{0,39}$/';

    /**
     * Every block worth a page, in the game's own grouping.
     *
     * Filtering happens here rather than in the browser: a player on a phone in the middle
     * of a game should get the list they asked for, not two hundred and fifty-four tiles
     * and a script that hides most of them.
     */
    public function index(Request $request): View
    {
        $categories = BlockCatalogue::byCategory();

        $chosen = (string) $request->query('categorie', '');
        if (! array_key_exists($chosen, $categories)) {
            $chosen = '';
        }

        $planet = (string) $request->query('planete', '');
        if (! in_array($planet, ['serpulo', 'erekir'], true)) {
            $planet = '';
        }

        if ($chosen !== '') {
            $categories = [$chosen => $categories[$chosen]];
        }

        if ($planet !== '') {
            // A block belonging to neither world is kept whichever world is asked for: the
            // conveyor is on both, and a player filtering to Serpulo still needs conveyors.
            $categories = array_filter(array_map(
                fn (array $blocks) => array_filter(
                    $blocks,
                    fn (Block $block) => $block->planet() === null || $block->planet() === $planet,
                ),
                $categories,
            ));
        }

        return view('blocks.index', [
            'categories' => $categories,
            'chosen' => $chosen,
            'planet' => $planet,
            'allCategories' => array_keys(BlockCatalogue::byCategory()),
            'total' => count(BlockCatalogue::all()),
            'gameVersion' => BlockCatalogue::gameVersion(),
        ]);
    }

    public function show(string $name): View
    {
        if (! preg_match(self::NAME, $name) || ! BlockCatalogue::has($name)) {
            // A hidden block is a real block that has no page, which is not the same thing
            // as a typo, but it is the same answer: there is nothing here to read.
            throw new NotFoundHttpException;
        }

        $block = BlockCatalogue::find($name);

        return view('blocks.show', [
            'block' => $block,
            'sources' => $this->sources($block),
            'destinations' => $this->destinations($block),
            'schematics' => $this->schematicsUsing($name),
            'schematicCount' => $this->countSchematicsUsing($name),
            'ores' => $this->oresWithinReach($block),
            'gameVersion' => BlockCatalogue::gameVersion(),
        ]);
    }

    /**
     * What this drill can pull up, and how long each one takes per tile of ore.
     *
     * Empty for anything that is not a drill. The hardness term is the whole reason this
     * exists: a mechanical drill on sand and the same drill on titanium are six hundred
     * ticks apart, and a page printing one figure for both was wrong on every ore but the
     * softest.
     *
     * @return array<string, float> item name to seconds per item per ore tile
     */
    private function oresWithinReach(Block $block): array
    {
        if (! $block->isDrill()) {
            return [];
        }

        $reachable = [];
        foreach (BlockCatalogue::minableItems() as $item => $hardness) {
            if ($block->canDrill($item, $hardness)) {
                $reachable[$item] = $block->drillSecondsFor($item, $hardness);
            }
        }

        return $reachable;
    }

    /**
     * Where everything this block takes in can come from.
     *
     * Two answers per thing, and the second one matters more than it looks. Sand has no
     * recipe: it is dug out of a sand floor. Without the ground, the silicon smelter page
     * would say nothing produces sand, which is false and is exactly the sort of hole that
     * makes a reader stop trusting the rest of the page.
     *
     * @return array<string, array{made: array<string, Block>, mined: array<string, Block>}>
     */
    private function sources(Block $block): array
    {
        $wanted = array_merge(
            $block->everythingItTakes(),
            array_keys($block->inputLiquids()),
            $block->drinks(),
        );

        $sources = [];
        foreach (array_unique($wanted) as $thing) {
            $sources[$thing] = [
                'made' => BlockCatalogue::makersOf($thing),
                'mined' => BlockCatalogue::minedFrom($thing),
            ];
        }

        return $sources;
    }

    /**
     * What everything this block hands out is good for.
     *
     * @return array<string, array<string, Block>>
     */
    private function destinations(Block $block): array
    {
        $destinations = [];
        foreach ($block->everythingItMakes() as $thing) {
            $takers = BlockCatalogue::takersOf($thing);
            // Not itself. A block that eats what it makes is a rarity, and listing it under
            // its own outputs reads as a mistake rather than as a fact about the game.
            unset($takers[$block->name]);
            $destinations[$thing] = $takers;
        }

        return $destinations;
    }

    /**
     * The public schematics built with this block, the ones leaning on it hardest first.
     *
     * An indexed join, not a scan of stored analyses. Ordered on how many of the block a
     * layout holds, because a smelter array is a better answer to "show me silicon
     * smelters" than a base wall that happens to contain one.
     */
    private function schematicsUsing(string $name)
    {
        return Schematic::query()
            ->listed()
            ->with('user')
            ->join('schematic_blocks', 'schematic_blocks.schematic_id', '=', 'schematics.id')
            ->where('schematic_blocks.block', $name)
            ->orderByDesc('schematic_blocks.count')
            // A total order, so two layouts holding four smelters each do not swap places
            // between page loads. The browse listing learned this the hard way.
            ->orderByDesc('schematics.id')
            // The count comes back on the row rather than being looked up per tile. Reading
            // it off the relation would be one query per schematic shown, which is twelve
            // queries to print twelve numbers the join already had in hand.
            ->select('schematics.*', 'schematic_blocks.count as held')
            ->limit(self::SCHEMATICS_SHOWN)
            ->get();
    }

    private function countSchematicsUsing(string $name): int
    {
        return Schematic::query()
            ->listed()
            ->join('schematic_blocks', 'schematic_blocks.schematic_id', '=', 'schematics.id')
            ->where('schematic_blocks.block', $name)
            ->count();
    }
}
