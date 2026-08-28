<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * A collection somebody assembled on purpose, which may hold other collections.
 *
 * The catalogue answers "what makes graphite fastest". It cannot answer "what should I
 * build first", which is a question one person answers for another by assembling a dozen
 * plans in an order they thought about. That is what this is for.
 */
class Folder extends Model
{
    use HasFactory;

    /**
     * How deep the nesting may go.
     *
     * A guard, not a design. Five is not meaningful: it is past what anybody assembling
     * schematics will reach, and short enough that a breadcrumb still fits on a phone. It
     * exists so a pathological move meets a wall and is told why, rather than building a
     * chain nothing can render.
     */
    public const MAX_DEPTH = 5;

    protected $fillable = ['user_id', 'parent_id', 'name', 'icon', 'description', 'visibility'];

    protected static function booted(): void
    {
        static::creating(function (self $folder) {
            $folder->slug ??= Str::lower(Str::random(12));
        });
    }

    public function getRouteKeyName(): string
    {
        return 'slug';
    }

    /** @return BelongsTo<self, $this> */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    /** @return HasMany<self, $this> */
    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsToMany<Schematic, $this> */
    public function schematics(): BelongsToMany
    {
        return $this->belongsToMany(Schematic::class, 'folder_items')
            ->withPivot(['created_at']);
    }

    /**
     * Every folder above this one, nearest first. At most MAX_DEPTH of them.
     *
     * @return array<int, self>
     */
    public function ancestors(): array
    {
        $chain = [];
        $at = $this->parent;

        while ($at !== null && count($chain) < self::MAX_DEPTH) {
            $chain[] = $at;
            $at = $at->parent;
        }

        return $chain;
    }

    /** 1 at the root. */
    public function depth(): int
    {
        return count($this->ancestors()) + 1;
    }

    /**
     * Would putting this folder under that one make a ring?
     *
     * Walks up from the proposed parent looking for this folder. Bounded by MAX_DEPTH, so
     * it cannot itself loop on a tree that is already broken.
     */
    public function wouldCycle(?self $newParent): bool
    {
        if ($newParent === null) {
            return false;
        }

        $at = $newParent;
        for ($step = 0; $at !== null && $step <= self::MAX_DEPTH; $step++) {
            if ($at->is($this)) {
                return true;
            }
            $at = $at->parent;
        }

        return false;
    }
}
