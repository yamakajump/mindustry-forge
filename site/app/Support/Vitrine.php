<?php

namespace App\Support;

use App\Models\Schematic;
use App\Models\SchematicItem;
use Illuminate\Support\Facades\DB;

/**
 * What the catalogue actually holds, asked once and answered the same way everywhere.
 *
 * The browse page, the home page and the filters all need to know which products and which
 * blocks exist in public schematics, and all three would otherwise write the query. Two
 * copies of a question is how a site comes to answer it two ways.
 *
 * Not named `Catalogue`: `App\Services\BlockCatalogue` already exists and reads
 * `blocks.json`, which is the game's blocks rather than what this site was given. Two
 * classes named catalogue that mean different things is a confusion paid for later.
 */
class Vitrine
{
    /**
     * The nature of the figures these lists are built on, and the reason this constant is
     * here rather than typed at each call site.
     *
     * `itemsOnOffer()` filters on the ceiling because that is what the listing can rank. A
     * caller that takes this list and then asks a second question without the same filter
     * gets an answer of the other nature, and the failure is quiet: the catalogue holds
     * roughly 117 measured rows against 6 775 ceilings, so a mixed query returns plenty of
     * plausible rows rather than an empty page that somebody would notice.
     *
     * That is the defect this repository logged six times on 27/08. Every one was a correct
     * figure displayed where a different question was being asked.
     */
    public const NATURE = SchematicItem::PLAFOND;

    /** How many products a page may offer before the list stops being a list. */
    private const ITEMS = 20;

    /**
     * Every block a public schematic is built from, commonest first.
     *
     * Capped at two hundred: the list goes into a `datalist` on every render of the page,
     * and the whole catalogue would be four hundred names of markup nobody scrolls past the
     * first dozen of. The cap is a display decision and it is stated rather than left to be
     * discovered: a search for a block outside it still works, it simply is not suggested.
     */
    public static function blocksOnOffer(int $limit = 200): array
    {
        return DB::table('schematic_blocks')
            ->join('schematics', 'schematics.id', '=', 'schematic_blocks.schematic_id')
            ->where('schematics.visibility', Schematic::PUBLIC)
            // Masquee veut dire hors circulation, y compris hors des listes de choix :
            // proposer un objet ou un bloc qui ne vient que d'un plan retire ferait
            // repondre vide a un filtre que la page a offert elle-meme.
            ->whereNull('schematics.hidden_at')
            ->groupBy('schematic_blocks.block')
            ->orderByRaw('count(*) desc')
            ->limit($limit)
            ->pluck('schematic_blocks.block')
            ->all();
    }

    /**
     * Every product a public schematic makes, commonest first.
     *
     * Ordered by how many schematics make each rather than by how much they make: this
     * answers "what is there to look at", not "what is the site best at". The two differ
     * sharply here, because a handful of reactors out-produce eight hundred graphite lines.
     */
    /**
     * Everything any public schematic asks for from outside, commonest first.
     *
     * The mirror of `itemsOnOffer`, and a separate method rather than a flag on it: the two
     * lists overlap without being the same. Water is produced by 2 579 schematics and
     * demanded by 2 548 others, and a caller that offered one list for both questions would
     * propose sand as something to search production on, where almost nothing makes it.
     *
     * Same nature as the other side, and for the same reason: what a layout demands running
     * flat out is a ceiling, and a list built on one nature must not be filtered on another.
     *
     * @return list<string>
     */
    public static function eatsOnOffer(int $limit = self::ITEMS): array
    {
        return DB::table('schematic_items')
            ->join('schematics', 'schematics.id', '=', 'schematic_items.schematic_id')
            ->where('schematics.visibility', Schematic::PUBLIC)
            // Masquee veut dire hors circulation, y compris hors des listes de choix :
            // proposer un objet ou un bloc qui ne vient que d'un plan retire ferait
            // repondre vide a un filtre que la page a offert elle-meme.
            ->whereNull('schematics.hidden_at')
            ->where('schematic_items.sens', SchematicItem::CONSOMME)
            ->where('schematic_items.kind', self::NATURE)
            ->groupBy('schematic_items.item')
            ->orderByRaw('count(*) desc')
            ->limit($limit)
            ->pluck('schematic_items.item')
            ->all();
    }

    public static function itemsOnOffer(int $limit = self::ITEMS): array
    {
        return SchematicItem::query()
            ->join('schematics', 'schematics.id', '=', 'schematic_items.schematic_id')
            ->where('schematics.visibility', Schematic::PUBLIC)
            // Masquee veut dire hors circulation, y compris hors des listes de choix :
            // proposer un objet ou un bloc qui ne vient que d'un plan retire ferait
            // repondre vide a un filtre que la page a offert elle-meme.
            ->whereNull('schematics.hidden_at')
            ->where('schematic_items.sens', SchematicItem::PRODUIT)
            ->where('schematic_items.kind', self::NATURE)
            ->groupBy('schematic_items.item')
            ->orderByRaw('count(*) desc')
            ->limit($limit)
            ->pluck('schematic_items.item')
            ->all();
    }
}
