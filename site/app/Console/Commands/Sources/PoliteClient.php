<?php

namespace App\Console\Commands\Sources;

use Closure;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Le client HTTP du collecteur : lent expres, et qui dit qui il est.
 *
 * Les deux catalogues qu'on ingere sont tenus par des gens seuls, sur des serveurs
 * gratuits, et il y a quinze mille entrees a prendre. Taper aussi vite que la machine le
 * permet, c'est se faire couper au bout de dix minutes, et il n'y aura pas de deuxieme
 * chance : le site principal est deja derriere Cloudflare, seule son API ne l'est pas
 * encore. La pause entre deux appels n'est donc pas un reglage de confort, c'est la
 * condition pour que la collecte aille au bout.
 *
 * L'agent s'annonce sous le nom du site plutot que sous celui d'un Chrome. Se deguiser en
 * visiteur marcherait mieux et vaudrait exactement ce que ca a l'air de valoir le jour ou
 * on ecrit au mainteneur d'en face pour lui annoncer l'agregateur. Un agent nommable est
 * aussi un agent qu'on peut bloquer proprement, ce qui est le droit du serveur d'en face.
 */
class PoliteClient
{
    /** Qui passe, et ou ecrire pour s'en plaindre. */
    public const AGENT = 'mindustry-forge/1.0 (+https://mindustryforge.com)';

    /** Au-dela, la lenteur n'est plus de la politesse : le serveur est tombe. */
    private const MAX_BACKOFF_MS = 60_000;

    private float $lastCall = 0.0;

    /**
     * @param  int  $pauseMs  Le creux minimum entre deux appels, quel qu'en soit le sort.
     * @param  int  $tries  Combien de fois on insiste avant d'abandonner un appel.
     * @param  ?Closure  $tell  De quoi raconter les attentes a qui regarde tourner.
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
     * Le JSON decode, ou null si la source dit qu'il n'y a rien la.
     *
     * Le type de retour est volontairement large : `/schematics/count` repond un entier nu,
     * pas un objet, et le forcer en tableau ici obligerait l'appelant a defaire la
     * conversion pour lire le nombre.
     */
    public function json(string $url): mixed
    {
        return $this->get($url)?->json();
    }

    /**
     * Le corps brut, pour les sources qui servent le `.msch` tel que le jeu l'ecrit.
     *
     * Rendu en base64, parce que c'est sous cette forme que le reste du site le tient : la
     * colonne `code` est la chaine que le joueur colle dans le jeu, pas des octets.
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

            // Ce qui n'existe pas n'est pas une panne. Une entree retiree du catalogue
            // entre le listing et le detail est une chose ordinaire sur douze mille, et
            // arreter la collecte pour ca serait la rendre impossible a terminer.
            if ($answer->status() === 404) {
                return null;
            }

            // Trop vite, ou en panne : les deux se soignent en attendant. Le reste des 4xx
            // ne se soigne pas en reessayant, donc on ne reessaie pas.
            if ($answer->status() === 429 || $answer->serverError()) {
                $this->waitOut($attempt, $url, "HTTP {$answer->status()}");

                continue;
            }

            if ($answer->clientError()) {
                throw new RuntimeException("{$url} repond HTTP {$answer->status()}");
            }

            return $answer;
        }

        throw new RuntimeException("{$url} n'a pas repondu en {$this->tries} tentatives");
    }

    /** Ne jamais rappeler avant que la pause demandee se soit ecoulee. */
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
     * Reculer, de plus en plus loin.
     *
     * Un serveur qui repond 429 le repondra encore dans une seconde. Doubler l'attente a
     * chaque fois est ce qui fait la difference entre attendre qu'il respire et l'aider a
     * suffoquer.
     */
    private function waitOut(int $attempt, string $url, string $why): void
    {
        // Adosse a la pause demandee plutot qu'a une constante : une collecte reglee
        // lentement recule lentement, et une suite de tests reglee a zero n'attend pas.
        $wait = min(self::MAX_BACKOFF_MS, max(1, $this->pauseMs) * (2 ** $attempt));
        ($this->tell ?? fn () => null)("{$url} : {$why}, nouvelle tentative dans ".round($wait / 1000).' s');
        usleep($wait * 1000);
    }
}
