<?php

namespace App\Models;

use App\Services\GameNames;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One thing a schematic produces, at the rate it produces it.
 *
 * Exists so the site can answer its own pitch with an index instead of a scan: "a hundred
 * graphite a minute under thirty blocks" is a query over these rows, where over the JSON
 * it was a full read of every schematic on the site.
 *
 * Nothing is displayed from here. The page reads `produces` and `power_made`, which carry
 * their own units; this table exists to be filtered and sorted on.
 */
class SchematicItem extends Model
{
    /** Energy, which is produced and searched for exactly like anything else. */
    public const POWER = 'power';

    /**
     * What a `rate` value measures, which is not the same thing depending on the row.
     *
     * For an item, `rate` comes from `produces`, already per minute. For energy, it comes
     * from the analysis's measured budget, in energy per second. The column is the same and
     * the unit is not.
     *
     * Hence this method rather than a conversion: the home page used to multiply everything
     * by sixty and print "/ min". On energy that was arithmetically correct and contradicted
     * the rest of the site, which says energy/s everywhere; on water it was wrong, the value
     * already being per minute. The same schematic carried two different figures depending on
     * which page showed it, on a site whose whole argument is that its figures can be proven.
     */
    public static function parSeconde(string $item): bool
    {
        return $item === self::POWER;
    }

    /**
     * The name the game gives it, or the word the site uses for energy.
     *
     * `power` is not a game object and therefore has no name in its bundles. The others are
     * looked up in the two families where they can live, an item or a liquid, before falling
     * back to the identifier, which is no worse than what the game itself has to offer.
     */
    public static function nomAffiche(string $item): string
    {
        if (self::parSeconde($item)) {
            return __('schema.unite.energie');
        }

        return GameNames::of('item', $item)
            ?? GameNames::of('liquid', $item)
            ?? $item;
    }

    /**
     * Which way the thing travels.
     *
     * Both directions are worth searching, and they are opposite questions. "What makes
     * graphite" is a shopping list; "what needs coal" is the answer to "I have coal, what
     * can I run", which is how a player with a working mine picks their next build.
     */
    public const PRODUIT = 'produit';

    public const CONSOMME = 'consomme';

    /**
     * Whether the figure was worked out, or is the best the schematic could ever do.
     *
     * The engine refuses to guess where a schematic plugs in, and it is right to: a press
     * with no drill in the picture makes nothing, and calling that a broken design would
     * be wrong. But a catalogue of fifteen thousand imported schematics has nobody to mark
     * them by hand, so their throughput can only be stated as a ceiling.
     *
     * A ceiling is worth having and worth searching. It is not worth showing as if it had
     * been measured, which is why this is a column and not a convention: a convention gets
     * lost, and a ranking that silently mixes the two lies on the one thing this site
     * sells.
     */
    public const MESURE = 'mesure';

    public const PLAFOND = 'plafond';

    /**
     * A throughput computed from a marking somebody other than the author supplied.
     *
     * As precise as `mesure` and resting on a stranger's word, which is a different claim
     * and therefore a different value rather than a flag beside one. Filed as `mesure` it
     * would redefine the word: 419 rows on this site mean "the author said where it is
     * fed", and burying them under thousands that mean "a passer by said so" costs the
     * distinction for ever, silently, with every number still correct.
     *
     * Never displayed without saying whose word it is.
     */
    public const DECLARE = 'declare';

    public $timestamps = false;

    protected $fillable = ['schematic_id', 'item', 'sens', 'kind', 'rate', 'rate_per_block',
        'rate_per_tile'];

    /** The column's default values, where the model can see them. */
    protected $attributes = [
        'sens' => self::PRODUIT,
        'kind' => self::MESURE,
    ];

    protected $casts = [
        'rate' => 'float',
        'rate_per_block' => 'float',
        'rate_per_tile' => 'float',
    ];

    public function schematic(): BelongsTo
    {
        return $this->belongsTo(Schematic::class);
    }
}
