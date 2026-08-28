<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * One saved editor board, owned by exactly one account.
 *
 * What an anonymous visitor gets for free is the single `localStorage` draft in
 * `draft.js`, kept seven days on one machine. A work space is what an account buys on top
 * of that: as many boards as the quota below allows, resumed on any machine, kept until
 * deleted.
 */
class Space extends Model
{
    use HasFactory;

    /**
     * How many spaces one account may hold at once.
     *
     * Not an autosave history and not a per-gesture log: a space is created deliberately,
     * when somebody names a board worth coming back to. Thirty is an order of magnitude
     * above what a person juggling several concurrent bases actually keeps open at
     * once, generous enough that nobody sane hits it by working, and a real ceiling on
     * what a runaway loop could write: at the size limit below, thirty spaces is at most
     * sixty megabytes for one account, not the whole database.
     */
    public const MAX_SPACES = 30;

    /**
     * The largest a board's JSON may be, in bytes.
     *
     * A board with no frame is still the old 64 by 64 schematic (`MAX_SIZE` in `state.js`),
     * a few hundred kilobytes at most one tile and one ground entry per cell. Frames change
     * that story: once one exists, placement is bounded by the board itself, 256 by 256
     * (`BOARD_SIZE` in `state.js`), not by any one frame's own 64 cap. A board actually
     * saturated at that size (one tile and one ground entry per one of its 65,536 cells,
     * plus a handful of frame records) measures about 4.8 MB, not "a few hundred kilobytes"
     * any more. Sixteen megabytes is roughly triple that, the same margin the old limit
     * kept over its own worst case, room for a board actually that full without being a
     * ceiling a legitimate multi-frame save could ever meet by accident.
     */
    public const MAX_BOARD_BYTES = 16 * 1024 * 1024;

    protected $fillable = ['user_id', 'slug', 'name', 'board', 'opened_at'];

    protected $casts = [
        'board' => 'array',
        'opened_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $space) {
            $space->slug ??= static::freshSlug();
            $space->opened_at ??= now();
        });
    }

    public function getRouteKeyName(): string
    {
        return 'slug';
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Whether this account, and only this account, may read, save or delete it. */
    public function ownedBy(?User $user): bool
    {
        return $user !== null && $this->user_id === $user->id;
    }

    /** A short address nobody else holds, exactly as a schematic or a folder gets one. */
    public static function freshSlug(): string
    {
        do {
            $slug = Str::lower(Str::random(10));
        } while (static::where('slug', $slug)->exists());

        return $slug;
    }
}
