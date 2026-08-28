<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Carbon\CarbonImmutable;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;

#[Fillable(['name', 'email', 'password', 'discord_id', 'avatar', 'upheld', 'overturned', 'overturned_at', 'discord_created_at'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'moderator' => 'boolean',
            'overturned_at' => 'datetime',
            'discord_created_at' => 'datetime',
        ];
    }

    /** Their page is found by slug, never by id or by name. */
    public function getRouteKeyName(): string
    {
        return 'slug';
    }

    /**
     * Give every member an address, whatever route created them.
     *
     * On the model rather than in the sign-in controller, because a member also arrives
     * from a factory in a test and from the console, and a profile link that works for
     * people who signed in through Discord and 404s for anybody else is worse than no link.
     */
    protected static function booted(): void
    {
        static::creating(function (self $user) {
            $user->slug ??= static::freshSlug();
        });
    }

    /** A short address nobody else holds. */
    public static function freshSlug(): string
    {
        do {
            $slug = Str::lower(Str::random(10));
        } while (static::where('slug', $slug)->exists());

        return $slug;
    }

    /** Where this member stands, and what their word is worth. */
    public function standing(): Standing
    {
        return Standing::of($this);
    }

    /** Whether a moderator has disagreed with them lately, which the top band asks about. */
    public function overturnedRecently(): bool
    {
        return $this->overturned_at !== null
            && $this->overturned_at->diffInDays(now()) < Standing::YOUNG_ACCOUNT_DAYS;
    }

    /**
     * When a Discord account was created, read out of its id.
     *
     * A snowflake carries its own timestamp in the high bits, counted from the first
     * millisecond of 2015. So the age of an account costs no request to Discord, works for
     * every row already stored, and cannot be faked by the person it describes, which is
     * the whole reason to gate on it rather than on when they signed up here.
     */
    public static function discordCreatedAt(string $discordId): ?CarbonImmutable
    {
        if (! ctype_digit($discordId)) {
            return null;
        }

        return CarbonImmutable::createFromTimestampMs(((int) $discordId >> 22) + 1420070400000);
    }

    /**
     * Everything this person has kept.
     *
     * @return HasMany<Schematic, $this>
     */
    public function schematics(): HasMany
    {
        return $this->hasMany(Schematic::class);
    }
}
