<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * One saved schematic, with what the analysis said about it.
 *
 * The searchable figures are lifted out of the analysis on the way in rather than read out
 * of the JSON on the way out. "A hundred graphite a minute under thirty blocks" is a query
 * over columns; over a JSON blob it is a full scan of every row on the site.
 */
class Schematic extends Model
{
    use HasFactory;

    /**
     * Who can see it.
     *
     * `unlisted` is the one a boolean could not express and the one most drafts want: a
     * link that works for anybody it is given to, and a schematic that stays out of the
     * public list until its author says otherwise.
     */
    public const PRIVATE = 'private';

    public const UNLISTED = 'unlisted';

    public const PUBLIC = 'public';

    public const VISIBILITIES = [self::PRIVATE, self::UNLISTED, self::PUBLIC];

    protected $fillable = [
        'user_id', 'slug', 'name', 'description', 'code', 'visibility',
        'analysis', 'width', 'height', 'blocks', 'power_made', 'power_used',
        'produces', 'needs',
    ];

    protected $casts = [
        'verified' => 'boolean',
        'analysis' => 'array',
        'produces' => 'array',
        'needs' => 'array',
    ];

    /** In the public list. Unlisted schematics are reachable and not listed. */
    public function scopeListed($query)
    {
        return $query->where('visibility', self::PUBLIC);
    }

    /** Whether this user may open its page at all. */
    public function visibleTo(?User $user): bool
    {
        return $this->visibility !== self::PRIVATE
            || $this->user_id === $user?->id
            || (bool) $user?->moderator;
    }

    /**
     * Whether this user may change or remove it.
     *
     * Its author, and whoever keeps the showcase. A public list anyone can post to needs
     * somebody able to take something out of it, and the alternative was opening the
     * database by hand.
     */
    public function managedBy(?User $user): bool
    {
        return $user !== null && ($this->user_id === $user->id || $user->moderator);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function getRouteKeyName(): string
    {
        return 'slug';
    }

    /**
     * A short, unguessable id.
     *
     * Not the row number. A sequential url tells anybody how many schematics the site has
     * and lets them walk every private one that ever slipped through, and it makes the
     * first day of a new site look like its last.
     */
    public static function freshSlug(): string
    {
        do {
            $slug = Str::lower(Str::random(10));
        } while (static::where('slug', $slug)->exists());

        return $slug;
    }

    /**
     * Pull the figures worth searching on out of a browser's analysis.
     *
     * Defensive on purpose: this arrives from a page, and a page can send anything. Every
     * field is coerced and bounded rather than trusted, and what does not fit is dropped
     * instead of stored as a surprise for whatever reads it next.
     */
    public static function fromAnalysis(array $analysis): array
    {
        $produces = [];
        foreach ((array) ($analysis['perMinute'] ?? []) as $item => $rate) {
            if (is_string($item) && is_numeric($rate) && $rate > 0) {
                $produces[substr($item, 0, 40)] = round((float) $rate, 2);
            }
        }

        $needs = [];
        foreach ((array) ($analysis['needs'] ?? []) as $need) {
            $name = $need['resource'] ?? null;
            if (is_string($name) && is_numeric($need['perMinute'] ?? null)) {
                $needs[substr($name, 0, 40)] = round((float) $need['perMinute'], 2);
            }
        }

        $power = (array) ($analysis['potential'] ?? []);

        return [
            'width' => min(4096, max(0, (int) ($analysis['width'] ?? 0))),
            'height' => min(4096, max(0, (int) ($analysis['height'] ?? 0))),
            'blocks' => min(65535, max(0, (int) ($analysis['blocks'] ?? 0))),
            'power_made' => max(0, (float) ($power['made'] ?? 0)),
            'power_used' => max(0, (float) ($power['spent'] ?? 0)),
            'produces' => $produces,
            'needs' => $needs,
        ];
    }
}
