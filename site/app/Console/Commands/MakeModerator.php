<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

/**
 * Hand somebody the keys to the queue, or take them back.
 *
 *     php artisan forge:moderateur yamakajump
 *     php artisan forge:moderateur yamakajump --retirer
 *
 * A command rather than an `update users set moderator = 1`, for the reason every other
 * administrative gesture here is a command: raw SQL against production is unrepeatable,
 * unreviewable, and easy to run against the wrong row at two in the morning. This one names
 * the person it changed and refuses a name it cannot find, so a typo is an error rather than
 * a silent no-op that leaves the queue with nobody to empty it.
 *
 * There is still no permissions system behind the flag. A site with one moderator needs a
 * moderator, not a hierarchy of roles, which is the position `users.moderator` was added
 * with and nothing since has changed it.
 */
class MakeModerator extends Command
{
    protected $signature = 'forge:moderateur
        {who : The member name, as Discord spells it}
        {--retirer : Take the flag back instead of giving it}';

    protected $description = 'Give or take the moderator flag';

    public function handle(): int
    {
        $who = (string) $this->argument('who');
        $user = User::where('name', $who)->first();

        if ($user === null) {
            $this->error("Aucun membre nomme {$who}.");

            // Named rather than left to be guessed: the usual cause is that the person has
            // never signed in here, so there is no row to flag, and the answer is to sign in
            // once rather than to look for a bug.
            $this->line('  Il faut s etre connecte au moins une fois pour avoir un compte.');

            $close = User::where('name', 'like', '%'.$who.'%')->limit(5)->pluck('name');
            if ($close->isNotEmpty()) {
                $this->line('  Peut-etre : '.$close->implode(', '));
            }

            return self::FAILURE;
        }

        $wanted = ! $this->option('retirer');

        if ((bool) $user->moderator === $wanted) {
            $this->info($wanted
                ? "{$user->name} est deja moderateur. Rien a faire."
                : "{$user->name} n est deja pas moderateur. Rien a faire.");

            return self::SUCCESS;
        }

        $user->forceFill(['moderator' => $wanted])->save();

        $this->info($wanted
            ? "{$user->name} est moderateur. /moderation lui repond desormais."
            : "{$user->name} n est plus moderateur. /moderation lui repond 404.");

        return self::SUCCESS;
    }
}
