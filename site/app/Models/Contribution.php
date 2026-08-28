<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

/**
 * A marking offered by somebody who is not the author, and what became of it.
 */
class Contribution extends Model
{
    public const PENDING = 'pending';

    public const APPLIED = 'applied';

    public const REJECTED = 'rejected';

    public const REVERTED = 'reverted';

    protected $fillable = [
        'schematic_id', 'user_id', 'marks', 'analysis', 'note',
        'state', 'weight_for', 'weight_against', 'decided_by', 'decided_at',
    ];

    protected $casts = [
        'marks' => 'array',
        'analysis' => 'array',
        'decided_at' => 'datetime',
    ];

    /** @return BelongsTo<Schematic, $this> */
    public function schematic(): BelongsTo
    {
        return $this->belongsTo(Schematic::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return HasMany<ContributionVote, $this> */
    public function votes(): HasMany
    {
        return $this->hasMany(ContributionVote::class);
    }

    /**
     * Offer a marking. Trusted members skip the queue; everybody else waits for weight.
     *
     * A trusted member's marking goes up unreviewed, and what holds them to it afterwards
     * is a report, like every other piece of content here. Making them wait too would mean
     * nothing is ever published on a site whose every account is new, and a contribution
     * nobody sees is a contribution nobody makes twice.
     */
    public static function offer(
        User $author,
        Schematic $schematic,
        array $marks,
        array $analysis,
        ?string $note = null,
    ): self {
        $contribution = static::create([
            'schematic_id' => $schematic->id,
            'user_id' => $author->id,
            'marks' => $marks,
            'analysis' => $analysis,
            'note' => $note,
            'state' => static::PENDING,
        ]);

        if ($author->standing()->actsAlone()) {
            $contribution->apply();
        }

        return $contribution;
    }

    /**
     * Put this marking in force, replacing whatever was in force before.
     *
     * The replacement is why this is one method: applying a second contribution while the
     * first still owns rows in `schematic_items` would leave two declared throughputs for
     * one schematic, and the listing would show whichever the query happened to reach.
     */
    public function apply(): void
    {
        DB::transaction(function () {
            $schematic = $this->schematic()->lockForUpdate()->first();

            if ($schematic === null) {
                return;
            }

            $schematic->contribution?->retire();

            $schematic->indexWhatWasDeclared((array) $this->analysis);
            $schematic->forceFill(['contribution_id' => $this->id])->save();

            $this->update(['state' => static::APPLIED]);
        });
    }

    /** Take this marking out of force, leaving the schematic on its ceiling as before. */
    public function retire(string $state = self::REVERTED): void
    {
        DB::transaction(function () use ($state) {
            $schematic = $this->schematic;

            if ($schematic !== null) {
                $schematic->items()->where('kind', SchematicItem::DECLARE)->delete();

                if ((int) $schematic->contribution_id === (int) $this->id) {
                    $schematic->forceFill(['contribution_id' => null])->save();
                }
            }

            $this->update(['state' => $state]);
        });
    }

    /**
     * Somebody agreeing or disagreeing with a marking that is still waiting.
     *
     * Only a pending contribution can be voted on. Once it is in force, disagreeing with it
     * is a report: the same gesture as for any other content, decided the same way, rather
     * than a second machinery for taking things down.
     */
    public function weigh(User $voter, bool $agree, ?string $ipHash = null): void
    {
        if ($this->state !== static::PENDING || $voter->id === $this->user_id) {
            return;
        }

        $vote = ContributionVote::firstOrCreate(
            ['contribution_id' => $this->id, 'user_id' => $voter->id],
            ['agree' => $agree, 'weight' => $voter->standing()->weight, 'ip_hash' => $ipHash],
        );

        if (! $vote->wasRecentlyCreated) {
            return;
        }

        $this->refresh()->update([
            'weight_for' => (int) $this->votes()->where('agree', true)->sum('weight'),
            'weight_against' => (int) $this->votes()->where('agree', false)->sum('weight'),
        ]);

        if ($this->weight_against >= Standing::ACTS) {
            $this->update(['state' => static::REJECTED]);
        } elseif ($this->weight_for >= Standing::ACTS) {
            $this->apply();
        }
    }
}
