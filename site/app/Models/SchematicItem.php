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
     * Ce qu'une valeur de `rate` mesure, qui n'est pas la meme chose selon la ligne.
     *
     * Pour un objet, `rate` vient de `produces`, deja par minute. Pour l'energie, il vient
     * du budget mesure de l'analyse, en energie par seconde. La colonne est la meme et
     * l'unite ne l'est pas.
     *
     * D'ou cette methode plutot qu'une conversion : l'accueil multipliait tout par soixante
     * et ecrivait « / min ». Sur l'energie c'etait arithmetiquement juste et contredisait le
     * reste du site, qui dit energie/s partout ; sur l'eau c'etait faux, la valeur etant
     * deja par minute. La meme schematique portait deux chiffres selon la page qui la
     * montrait, sur un site dont l'argument est que ses chiffres se prouvent.
     */
    public static function parSeconde(string $item): bool
    {
        return $item === self::POWER;
    }

    /**
     * Le nom que le jeu donne, ou le mot que le site emploie pour l'energie.
     *
     * `power` n'est pas un objet du jeu et n'a donc pas de nom dans ses bundles. Les autres
     * sont cherches dans les deux familles ou ils peuvent vivre, un objet ou un liquide,
     * avant de retomber sur l'identifiant, ce que le jeu lui-meme n'a pas de mieux a offrir.
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

    public $timestamps = false;

    protected $fillable = ['schematic_id', 'item', 'sens', 'kind', 'rate', 'rate_per_block'];

    /** Les valeurs par défaut de la colonne, là où le modèle peut les voir. */
    protected $attributes = [
        'sens' => self::PRODUIT,
        'kind' => self::MESURE,
    ];

    protected $casts = [
        'rate' => 'float',
        'rate_per_block' => 'float',
    ];

    public function schematic(): BelongsTo
    {
        return $this->belongsTo(Schematic::class);
    }
}
