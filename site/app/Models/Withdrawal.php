<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A schematic an author asked us to take down, and the reason it stays down.
 *
 * Deliberately not a relation to `Schematic`: the row it refers to has been deleted, and
 * the point of this one is that it outlives it. It is keyed the way the collector asks its
 * question, on the pair the source uses to name a schematic.
 */
class Withdrawal extends Model
{
    protected $fillable = ['source', 'source_id', 'reason'];

    /**
     * Take a schematic down, and remember that we did.
     *
     * One method rather than two calls at the call site, because the two halves are not
     * separable: deleting without recording undoes itself at the next collection, and
     * recording without deleting leaves it on the site. Whoever handles a request should
     * not be able to do half of it.
     */
    public static function take(Schematic $schematic, ?string $reason = null): self
    {
        $kept = static::updateOrCreate(
            ['source' => $schematic->source, 'source_id' => $schematic->source_id],
            ['reason' => $reason],
        );

        $schematic->delete();

        return $kept;
    }

    /** Whether this pair has been asked for, which is what the collector checks. */
    public static function refuses(string $source, string $sourceId): bool
    {
        return static::where('source', $source)->where('source_id', $sourceId)->exists();
    }
}
