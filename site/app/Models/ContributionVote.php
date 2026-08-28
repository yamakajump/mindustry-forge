<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One member's opinion on one marking, weighed at what it was worth when they gave it.
 */
class ContributionVote extends Model
{
    protected $fillable = ['contribution_id', 'user_id', 'agree', 'weight', 'ip_hash'];

    protected $casts = ['agree' => 'boolean'];

    /** @return BelongsTo<Contribution, $this> */
    public function contribution(): BelongsTo
    {
        return $this->belongsTo(Contribution::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
