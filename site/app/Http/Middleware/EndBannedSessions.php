<?php

namespace App\Http\Middleware;

use App\Models\Ban;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * A ban checked only at sign-in starts whenever that person's session happens to end.
 *
 * Sessions here are remembered, `Auth::login($user, remember: true)`, so somebody signed in
 * on Monday is still signed in in November. Checking at the callback alone would leave a
 * banned account posting for months, which is the whole window a ban exists to close.
 *
 * One indexed lookup, and only on a request that carries a signed-in user. Signed-out
 * visitors, who are nearly all the traffic, never reach the query.
 */
class EndBannedSessions
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = Auth::user();

        if ($user !== null && $user->discord_id !== null && Ban::refuses($user->discord_id)) {
            Auth::logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return redirect('/')->with('error', "Ce compte n'a plus accès au site.");
        }

        return $next($request);
    }
}
