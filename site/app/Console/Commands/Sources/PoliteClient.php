<?php

namespace App\Console\Commands\Sources;

use Closure;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * The collector's HTTP client: deliberately slow, and one that says who it is.
 *
 * The two catalogues we ingest are each run by a single person, on free
 * servers, and there are fifteen thousand entries to take. Hitting them as fast as the
 * machine allows means getting cut off within ten minutes, and there will be no second
 * chance: the main site is already behind Cloudflare, only its API is not
 * yet. The pause between two calls is therefore not a comfort setting, it is the
 * condition for the collection to make it to the end.
 *
 * The agent announces itself under the site's own name rather than under a Chrome's.
 * Disguising itself as a visitor would work better and would be worth exactly what it
 * looks like it is worth the day we write to the maintainer on the other end to tell
 * them about the aggregator. An agent that can be named is also an agent that can be
 * cleanly blocked, which is the other server's right.
 */
class PoliteClient
{
    /** Who is passing through, and where to write to complain about it. */
    public const AGENT = 'mindustry-forge/1.0 (+https://mindustryforge.com)';

    /** Beyond this, the slowness is no longer politeness: the server is down. */
    private const MAX_BACKOFF_MS = 60_000;

    private float $lastCall = 0.0;

    /**
     * @param  int  $pauseMs  The minimum gap between two calls, whatever their outcome.
     * @param  int  $tries  How many times to insist before giving up on a call.
     * @param  ?Closure  $tell  Something to report the waits to whoever is watching it run.
     */
    public function __construct(
        private int $pauseMs = 1000,
        private int $tries = 4,
        private ?Closure $tell = null,
        private string $agent = self::AGENT,
        // One at a time by default. A setting that speeds things up without being asked
        // is a setting somebody uses without knowing what it is aimed at.
        private int $atOnce = 1,
    ) {}

    /**
     * The decoded JSON, or null if the source says there is nothing there.
     *
     * The return type is deliberately wide: `/schematics/count` answers a bare integer,
     * not an object, and forcing it into an array here would force the caller to undo
     * the conversion just to read the number.
     */
    public function json(string $url): mixed
    {
        return $this->get($url)?->json();
    }

    /**
     * The raw body, for sources that serve the `.msch` exactly as the game writes it.
     *
     * Rendered in base64, because that is the form the rest of the site holds it in: the
     * `code` column is the string the player pastes into the game, not bytes.
     */
    public function base64(string $url): ?string
    {
        $answer = $this->get($url);

        return $answer === null ? null : base64_encode($answer->body());
    }

    /**
     * Many addresses at once, because waiting for one answer at a time is the real cost.
     *
     * The first collector made a call, slept, made another. Across twenty-eight thousand
     * calls the round trips alone come to more than eighty minutes **even with no pause at
     * all**: what set the pace was never the politeness, it was the latency. Twenty-four
     * in flight makes that disappear, and it is the only change that moves the total.
     *
     * What breaks in a batch breaks only for itself: an address that fails is retried on
     * its own through `get()`, where the exponential backoff lives. The others have
     * already arrived.
     *
     * **Measured on 27/08/2026, not guessed.** Their API answers one detail in 750 ms, and
     * twenty-four together in 2.94 s, six times better. A hundred together answered
     * nothing at all - the probe timed out without a single response - so the ceiling is
     * on their side, somewhere between the two. Whoever raises this number should know
     * that is what they are betting against, and that the far side is a community nobody
     * has written to yet.
     *
     * @param  array<string, string>  $urls  One key per call, to tell the answers apart.
     * @return array<string, ?Response>
     */
    public function all(array $urls): array
    {
        $answers = [];

        foreach (array_chunk($urls, max(1, $this->atOnce), true) as $chunk) {
            $this->breathe();

            $got = Http::pool(function (Pool $pool) use ($chunk) {
                $calls = [];
                foreach ($chunk as $key => $url) {
                    $calls[] = $pool->as((string) $key)
                        ->withUserAgent($this->agent)
                        ->withHeaders(['Accept-Encoding' => 'gzip'])
                        ->timeout(30)
                        ->connectTimeout(10)
                        ->get($url);
                }

                return $calls;
            });

            foreach ($chunk as $key => $url) {
                $answer = $got[(string) $key] ?? null;

                // A batch hands back either a response or the exception that stopped it.
                // An isolated failure, a 429 on one call: retry that one alone, where the
                // backoff lives. The other twenty-three are already here.
                $answers[$key] = $answer instanceof Response && ! $answer->serverError()
                    && $answer->status() !== 429
                    ? ($answer->status() === 404 ? null : $answer)
                    : $this->get($url);
            }
        }

        return $answers;
    }

    private function get(string $url): ?Response
    {
        for ($attempt = 1; $attempt <= $this->tries; $attempt++) {
            $this->breathe();

            try {
                $answer = Http::withUserAgent($this->agent)
                    ->withHeaders(['Accept-Encoding' => 'gzip'])
                    ->timeout(30)
                    ->connectTimeout(10)
                    ->get($url);
            } catch (ConnectionException $cut) {
                $this->waitOut($attempt, $url, $cut->getMessage());

                continue;
            }

            // What does not exist is not a failure. An entry removed from the catalogue
            // between the listing and the detail is an ordinary thing across twelve
            // thousand, and stopping the collection for that would make it impossible to
            // ever finish.
            if ($answer->status() === 404) {
                return null;
            }

            // Too fast, or down: both are cured by waiting. The rest of the 4xx family
            // is not cured by retrying, so we do not retry it.
            if ($answer->status() === 429 || $answer->serverError()) {
                $this->waitOut($attempt, $url, "HTTP {$answer->status()}");

                continue;
            }

            if ($answer->clientError()) {
                throw new RuntimeException("{$url} answers HTTP {$answer->status()}");
            }

            return $answer;
        }

        throw new RuntimeException("{$url} did not answer within {$this->tries} attempts");
    }

    /** Never call again before the requested pause has elapsed. */
    private function breathe(): void
    {
        if ($this->pauseMs <= 0) {
            return;
        }

        $since = (microtime(true) - $this->lastCall) * 1000;
        if ($this->lastCall > 0.0 && $since < $this->pauseMs) {
            usleep((int) (($this->pauseMs - $since) * 1000));
        }
        $this->lastCall = microtime(true);
    }

    /**
     * Back off, further and further.
     *
     * A server answering 429 will still answer it a second later. Doubling the wait
     * each time is what makes the difference between waiting for it to breathe and
     * helping it suffocate.
     */
    private function waitOut(int $attempt, string $url, string $why): void
    {
        // Anchored to the requested pause rather than to a constant: a collection set
        // to run slowly backs off slowly, and a test suite set to zero does not wait.
        $wait = min(self::MAX_BACKOFF_MS, max(1, $this->pauseMs) * (2 ** $attempt));
        ($this->tell ?? fn () => null)("{$url}: {$why}, retrying in ".round($wait / 1000).' s');
        usleep($wait * 1000);
    }
}
