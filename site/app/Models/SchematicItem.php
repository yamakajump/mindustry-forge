<?php

namespace App\Models;

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

    public $timestamps = false;

    protected $fillable = ['schematic_id', 'item', 'rate', 'rate_per_block'];

    protected $casts = [
        'rate' => 'float',
        'rate_per_block' => 'float',
    ];

    public function schematic(): BelongsTo
    {
        return $this->belongsTo(Schematic::class);
    }
}
