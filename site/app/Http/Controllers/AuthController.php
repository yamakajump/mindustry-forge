<?php

namespace App\Http\Controllers;

use App\Models\Ban;
use App\Models\User;
use App\Services\Discord;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

/**
 * The only door into an account. Discord OAuth, and nothing beside it.
 *
 * There is no password to steal and no registration form to spam, because there is no
 * local credential at all: `start()` sends the visitor to Discord, `callback()` trusts
 * only what Discord hands back, and `User::updateOrCreate` keys on the Discord id rather
 * than on anything the visitor typed. That also means a ban keyed on the same id cannot be
 * shed by signing up again, which is why `callback()` checks `Ban::refuses` before the user
 * row exists rather than after.
 *
 * The state parameter is generated in `start()`, stored in the session, and compared in
 * `callback()` with `hash_equals`. Skipping the comparison would leave the redirect to
 * Discord as ceremony with no protection behind it: the whole point of the round trip is
 * that the callback can tell its own request from one somebody else forged.
 */
class AuthController extends Controller
{
    public function start(Request $request): RedirectResponse
    {
        $discord = Discord::fromConfig();
        if (! $discord->configured()) {
            return redirect('/')->with('error', "La connexion Discord n'est pas configurée.");
        }

        // Checked on the way back, not merely sent. An OAuth flow that generates a state
        // and never compares it has the ceremony without the protection.
        $state = Str::random(40);
        $request->session()->put('discord_state', $state);

        return redirect()->away($discord->authorizeUrl($state));
    }

    public function callback(Request $request): RedirectResponse
    {
        $expected = $request->session()->pull('discord_state');
        if (! $expected || ! hash_equals($expected, (string) $request->query('state'))) {
            return redirect('/')->with('error', 'Connexion expirée, réessaie.');
        }

        $code = (string) $request->query('code');
        $profile = $code ? Discord::fromConfig()->identify($code) : null;
        if (! $profile) {
            return redirect('/')->with('error', "Discord n'a pas confirmé la connexion.");
        }

        /*
         * Before the user row, not after.
         *
         * `updateOrCreate` below would recreate the account of somebody who deleted theirs
         * to shed a ban, and the ban would then be checked against a row that had just been
         * born clean. The refusal has to happen while the only thing known about them is the
         * Discord id, which is the one identifier they cannot change.
         */
        if (Ban::refuses($profile['id'])) {
            return redirect('/')->with('error', "Ce compte n'a plus accès au site.");
        }

        $user = User::updateOrCreate(
            ['discord_id' => $profile['id']],
            [
                'name' => $profile['name'],
                'avatar' => $profile['avatar'],
                // Written on every sign-in rather than only at creation, so the accounts
                // that existed before this column did fill it in the first time they come
                // back, without a backfill that would have to parse the same ids anyway.
                'discord_created_at' => User::discordCreatedAt($profile['id']),
            ],
        );

        Auth::login($user, remember: true);
        // Rotated on login, so a session id captured before signing in is not the session
        // id afterwards.
        $request->session()->regenerate();

        return redirect('/mes-schemas');
    }

    public function logout(Request $request): RedirectResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/');
    }
}
