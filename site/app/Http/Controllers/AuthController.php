<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Discord;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function start(Request $request): RedirectResponse
    {
        $discord = Discord::fromConfig();
        if (! $discord->configured()) {
            return redirect('/')->with('error', "La connexion Discord n'est pas configuree.");
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
            return redirect('/')->with('error', 'Connexion expiree, reessaie.');
        }

        $code = (string) $request->query('code');
        $profile = $code ? Discord::fromConfig()->identify($code) : null;
        if (! $profile) {
            return redirect('/')->with('error', "Discord n'a pas confirme la connexion.");
        }

        $user = User::updateOrCreate(
            ['discord_id' => $profile['id']],
            ['name' => $profile['name'], 'avatar' => $profile['avatar']],
        );

        Auth::login($user, remember: true);
        // Rotated on login, so a session id captured before signing in is not the session
        // id afterwards.
        $request->session()->regenerate();

        return redirect('/mes-schematiques');
    }

    public function logout(Request $request): RedirectResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/');
    }
}
