<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

/**
 * A moderator's conclusion, and the one place standing moves.
 */
class Decision extends Model
{
    /** The reporters were right. */
    public const UPHELD = 'upheld';

    /** The reporters were wrong, and the thing goes back up. */
    public const OVERTURNED = 'overturned';

    protected $fillable = ['target_type', 'target_id', 'moderator_id', 'verdict', 'reason'];

    /** @return BelongsTo<User, $this> */
    public function moderator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'moderator_id');
    }

    /**
     * Settle a report, adjust everyone who spoke, and put the content where it belongs.
     *
     * All of it in one transaction. Half of this is a schematic hidden with nobody credited
     * or blamed for it, and the counters standing is read from would be quietly wrong for
     * every member who reported it.
     */
    public static function settle(
        User $moderator,
        string $type,
        int $id,
        string $verdict,
        ?string $reason = null,
    ): self {
        return DB::transaction(function () use ($moderator, $type, $id, $verdict, $reason) {
            $decision = static::create([
                'target_type' => $type,
                'target_id' => $id,
                'moderator_id' => $moderator->id,
                'verdict' => $verdict,
                'reason' => $reason,
            ]);

            $reporters = Report::where('target_type', $type)->where('target_id', $id)
                ->pluck('user_id');

            if ($verdict === self::UPHELD) {
                User::whereIn('id', $reporters)->increment('upheld');
            } else {
                // Two columns in one pass: the count, which the score reads, and the date,
                // which the top band asks about. Set apart they drift the day one update
                // succeeds and the other does not.
                User::whereIn('id', $reporters)->update([
                    'overturned' => DB::raw('overturned + 1'),
                    'overturned_at' => now(),
                ]);
            }

            if ($type === Report::SCHEMATIC) {
                $schematic = Schematic::find($id);

                if ($schematic !== null && $verdict === self::UPHELD) {
                    $schematic->update([
                        'hidden_at' => $schematic->hidden_at ?? now(),
                        'hidden_reason' => $reason ?: 'Retiré après relecture.',
                    ]);
                } elseif ($schematic !== null) {
                    $schematic->update(['hidden_at' => null, 'hidden_reason' => null]);
                }
            }

            return $decision;
        });
    }

    /** Whether somebody has already settled this, which the queue uses to stop showing it. */
    public static function settled(string $type, int $id): bool
    {
        return static::where('target_type', $type)->where('target_id', $id)->exists();
    }
}
