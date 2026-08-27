<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One kind of block a schematic is built out of, and how many of it.
 *
 * Exists so the wiki can answer "which layouts use a silicon smelter" with an index rather
 * than a scan. Over the stored analysis blob that question was a full read of every
 * schematic on the site; here it is a `where` on an indexed column.
 *
 * Nothing is displayed from here. The block page reads these rows to find schematics and
 * then shows the schematics themselves.
 */
class SchematicBlock extends Model
{
    public $timestamps = false;

    protected $fillable = ['schematic_id', 'block', 'count'];

    protected $casts = [
        'count' => 'integer',
    ];

    public function schematic(): BelongsTo
    {
        return $this->belongsTo(Schematic::class);
    }
}
