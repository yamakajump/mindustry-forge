<?php

namespace App\Console\Commands;

use App\Models\Ban;
use App\Models\User;
use DateTimeImmutable;
use Illuminate\Console\Command;

/**
 * Shut an account out, and keep it shut.
 *
 *     php artisan forge:bannir Vandale --raison="murs obscenes, 28/08"
 *     php artisan forge:bannir 4242 --jusqu-au=2026-09-30
 *
 * Takes a name as readily as a Discord id, because whoever is answering a report has the
 * name in front of them and would otherwise have to go and find the snowflake by hand. A
 * name that matches nothing is an error rather than a ban on a literal string: a typo would
 * otherwise be recorded as a ban that silently protects nobody, and the person who typed it
 * would believe the matter was handled.
 *
 * It does not delete anything. A ban and a takedown are two different requests, and
 * `forge:retirer` is the other one.
 */
class BanAccount extends Command
{
    protected $signature = 'forge:bannir
        {who : A member name, or a Discord id if the account is already gone}
        {--raison= : What they did, for whoever reads this later}
        {--jusqu-au= : A date, if the ban should lift on its own}';

    protected $description = 'Shut a Discord account out of the site';

    public function handle(): int
    {
        $who = (string) $this->argument('who');
        $user = User::where('name', $who)->first();

        /*
         * A bare run of digits is a Discord id. Names on this site come from Discord, which
         * does not allow an all digits username, so the two cannot be confused. Without this
         * an account that has been deleted could not be banned at all, which is the case
         * that matters most: somebody who deleted their account to shed a ban.
         */
        if ($user === null && ! ctype_digit($who)) {
            $this->error("Aucun membre nomme {$who}. "
                .'Donne son identifiant Discord si le compte a ete supprime.');

            return self::FAILURE;
        }

        $discordId = $user?->discord_id ?? $who;

        if ($discordId === null) {
            $this->error("{$who} n'a pas d'identifiant Discord, il n'y a rien a bannir.");

            return self::FAILURE;
        }

        $until = $this->option('jusqu-au')
            ? new DateTimeImmutable((string) $this->option('jusqu-au'))
            : null;

        Ban::place($discordId, $this->option('raison') ?: null, $until);

        $this->info($until
            ? "Ferme jusqu'au {$until->format('d/m/Y')}. Ses schematiques restent en place."
            : 'Ferme. Ses schematiques restent en place : un bannissement ne les retire pas, '
                .'forge:retirer est la pour ca.');

        return self::SUCCESS;
    }
}
