<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

/**
 * Somebody saying this does not belong here, and what that was worth when they said it.
 */
class Report extends Model
{
    public const SCHEMATIC = 'schematic';

    /** The short list a reporter picks from. Free text is the note, not the reason. */
    public const REASONS = ['obscene', 'spam', 'stolen', 'broken', 'other'];

    protected $fillable = ['target_type', 'target_id', 'user_id', 'reason', 'note', 'weight', 'ip_hash'];

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * File a report, and act on it if it tipped the target over.
     *
     * Returns the report, or null when this person had already reported this thing. Not an
     * exception: reporting twice is a double click and two open tabs, and the caller wants
     * to say "noted" either way rather than to show an error for something harmless.
     */
    public static function file(
        User $reporter,
        string $type,
        int $id,
        string $reason,
        ?string $note,
        ?string $ipHash,
    ): ?self {
        $report = DB::transaction(function () use ($reporter, $type, $id, $reason, $note, $ipHash) {
            if (static::where('target_type', $type)->where('target_id', $id)
                ->where('user_id', $reporter->id)->exists()) {
                return null;
            }

            return static::create([
                'target_type' => $type,
                'target_id' => $id,
                'user_id' => $reporter->id,
                'reason' => $reason,
                'note' => $note,
                // Copied in, not joined later: what this person's word was worth today is a
                // fact about today, and standing moves.
                'weight' => $reporter->standing()->weight,
                'ip_hash' => $ipHash,
            ]);
        });

        if ($report !== null) {
            static::actOn($type, $id);
        }

        return $report;
    }

    /** What the reports on one thing add up to. */
    public static function weightOn(string $type, int $id): int
    {
        return (int) static::where('target_type', $type)->where('target_id', $id)->sum('weight');
    }

    /**
     * Take the target out of circulation once enough weight has landed on it.
     *
     * Nothing happens below the threshold, and at launch nothing will happen at all: every
     * account is new, every new account weighs zero, so the sum stays zero and the queue is
     * the only thing that moves. That is the intended behaviour rather than a gap. A
     * threshold that acts on the word of accounts nobody has any reason to trust is a
     * threshold that hands the site to whoever registers three times.
     */
    private static function actOn(string $type, int $id): void
    {
        if ($type !== self::SCHEMATIC || static::weightOn($type, $id) < Standing::ACTS) {
            return;
        }

        Schematic::where('id', $id)->whereNull('hidden_at')->update([
            'hidden_at' => now(),
            'hidden_reason' => 'Signale par plusieurs membres, en attente de relecture.',
        ]);
    }
}
