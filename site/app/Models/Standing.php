<?php

namespace App\Models;

/**
 * What a member's word is worth, and the four bands it falls into.
 *
 * A class of its own rather than methods on `User`, because every number in it is a guess
 * that will be revised at the first hundred accounts, and a guess is easier to find and
 * argue with when it lives in one file than when it is spread across a model that also
 * does five other things.
 *
 * None of these were calibrated against anything. Nobody had an account when they were
 * written. They are written down as guesses on purpose: the same constant read a year from
 * now, in the middle of a method, reads as a measurement.
 */
class Standing
{
    /** Weight needed for a threshold to act without a moderator. */
    public const ACTS = 3;

    /** Below this age, a Discord account carries no weight whatever it has done. */
    public const YOUNG_ACCOUNT_DAYS = 30;

    /** Being wrong costs twice what being right earns. */
    public const OVERTURNED_COSTS = 2;

    private function __construct(public readonly int $level, public readonly int $weight) {}

    /**
     * Where this member stands right now.
     *
     * The age gate comes first and overrides everything, including a good score. An account
     * three weeks old with five upheld claims is either remarkable or a second account
     * somebody warmed up, and there is no way to tell them apart from here.
     */
    public static function of(User $user): self
    {
        $score = (int) $user->upheld - self::OVERTURNED_COSTS * (int) $user->overturned;

        if ($score < 0) {
            return new self(-1, 0);
        }

        if ($user->discord_created_at !== null
            && $user->discord_created_at->diffInDays(now()) < self::YOUNG_ACCOUNT_DAYS) {
            return new self(0, 0);
        }

        if ($score >= 5 && ! $user->overturnedRecently()) {
            return new self(2, 3);
        }

        if ($score >= 1) {
            return new self(1, 1);
        }

        return new self(0, 0);
    }

    /** Whether what this member submits is published without waiting for anybody. */
    public function actsAlone(): bool
    {
        return $this->level >= 1;
    }

    /**
     * How many reports this member may file in a day.
     *
     * A quota rather than a rate limit per minute, because the abuse this stops is not
     * speed, it is volume: somebody working through the catalogue reporting everything.
     * Slowing that to one a minute would take a week to notice and still fill the queue.
     */
    public function reportsPerDay(): int
    {
        return match ($this->level) {
            2 => 50,
            1 => 30,
            default => 10,
        };
    }

    /** How many markings this member may contribute in a day. */
    public function contributionsPerDay(): int
    {
        return match ($this->level) {
            2 => 50,
            1 => 20,
            default => 5,
        };
    }
}
