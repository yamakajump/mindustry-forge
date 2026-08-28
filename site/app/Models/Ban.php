<?php

namespace App\Models;

use DateTimeInterface;
use Illuminate\Database\Eloquent\Model;

/**
 * An account that is not welcome back.
 *
 * Deliberately not a relation to `User`: the row it refers to may be gone, and the point
 * of this one is that it outlives it.
 */
class Ban extends Model
{
    protected $fillable = ['discord_id', 'reason', 'until'];

    protected function casts(): array
    {
        return ['until' => 'datetime'];
    }

    /**
     * Whether this Discord account is refused right now.
     *
     * A row whose `until` has passed is kept rather than deleted: what somebody did last
     * month is the context for judging what they do today, and a ban that erases itself
     * erases that too.
     */
    public static function refuses(string $discordId): bool
    {
        return static::where('discord_id', $discordId)
            ->where(fn ($query) => $query->whereNull('until')->orWhere('until', '>', now()))
            ->exists();
    }

    /** Place a ban, or replace the one already there. */
    public static function place(
        string $discordId,
        ?string $reason = null,
        ?DateTimeInterface $until = null,
    ): self {
        return static::updateOrCreate(
            ['discord_id' => $discordId],
            ['reason' => $reason, 'until' => $until],
        );
    }
}
