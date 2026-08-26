<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

/**
 * Signing in with Discord, written out rather than pulled in.
 *
 * Socialite does not support Laravel 13 yet, and the alternative to waiting is sixty lines
 * of the authorization code flow, which is a specification rather than a puzzle. Written
 * here it is also readable: the whole exchange is two requests and one lookup.
 *
 * Discord rather than email and password because that is where this community already is.
 * A Mindustry player has a Discord account; making them invent a password for a schematic
 * site is asking them not to bother.
 */
class Discord
{
    private const AUTHORIZE = 'https://discord.com/oauth2/authorize';
    private const TOKEN = 'https://discord.com/api/oauth2/token';
    private const ME = 'https://discord.com/api/users/@me';

    public function __construct(
        private readonly string $clientId,
        private readonly string $clientSecret,
        private readonly string $redirect,
    ) {
    }

    public static function fromConfig(): self
    {
        return new self(
            (string) config('services.discord.client_id'),
            (string) config('services.discord.client_secret'),
            (string) config('services.discord.redirect'),
        );
    }

    public function configured(): bool
    {
        return $this->clientId !== '' && $this->clientSecret !== '';
    }

    /**
     * Where to send the browser, with a state we will recognise on the way back.
     *
     * The state is what stops somebody else's login from being handed to this session, and
     * it is checked rather than merely sent: an OAuth flow that generates a state and never
     * compares it has the ceremony without the protection.
     */
    public function authorizeUrl(string $state): string
    {
        return self::AUTHORIZE.'?'.http_build_query([
            'client_id' => $this->clientId,
            'redirect_uri' => $this->redirect,
            'response_type' => 'code',
            // Only what is needed to say who you are. A schematic site has no business
            // reading somebody's guild list.
            'scope' => 'identify',
            'state' => $state,
            'prompt' => 'none',
        ]);
    }

    /** Trade the code for a token, then the token for who they are. */
    public function identify(string $code): ?array
    {
        $token = Http::asForm()->post(self::TOKEN, [
            'client_id' => $this->clientId,
            'client_secret' => $this->clientSecret,
            'grant_type' => 'authorization_code',
            'code' => $code,
            'redirect_uri' => $this->redirect,
        ]);

        if (! $token->successful() || ! $token->json('access_token')) {
            return null;
        }

        $user = Http::withToken($token->json('access_token'))->get(self::ME);
        if (! $user->successful() || ! $user->json('id')) {
            return null;
        }

        return [
            'id' => (string) $user->json('id'),
            'name' => (string) ($user->json('global_name') ?: $user->json('username')),
            'avatar' => $this->avatarUrl($user->json('id'), $user->json('avatar')),
        ];
    }

    private function avatarUrl(?string $id, ?string $hash): ?string
    {
        if (! $id || ! $hash) {
            return null;
        }
        $extension = str_starts_with($hash, 'a_') ? 'gif' : 'png';

        return "https://cdn.discordapp.com/avatars/{$id}/{$hash}.{$extension}?size=64";
    }
}
