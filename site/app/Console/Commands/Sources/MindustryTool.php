<?php

namespace App\Console\Commands\Sources;

use App\Models\Schematic;

/**
 * mindustry-tool.com, the bigger of the two.
 *
 * Twelve thousand five hundred schematics behind a v4 API with no quota and no
 * authentication. Three addresses per entry, read off the source on 27 August 2026:
 *
 *     /schematics?page=N&size=S   the listing: id, name, likes, downloads
 *     /schematics/{id}            the detail: description, dimensions, author, their figures
 *     /schematics/{id}/data       the `.msch` in bytes, `application/octet-stream`
 *
 * The detail earns its two hundred milliseconds: it carries `meta.powerConsumption` and
 * `meta.powerProduction`, that is, their own answer to a question this repository asks
 * another way. Twelve thousand free comparisons against our engine, kept in
 * `source_meta`: everywhere the two diverge, one of them is wrong, and this repository
 * holds a bench able to say which.
 *
 * With one caveat, verified on the first forty entries before it cost someone a
 * half day: **their figures are per tick, ours are per second**. Their thorium reactor
 * announces 15 where we say 900, and 900 = 15 x 60. Both catalogues do the same. A
 * comparison that forgets the factor of sixty thinks it has found twelve thousand
 * disagreements; there are none.
 *
 * Pagination is an offset over a list sorted from newest to oldest, so an entry
 * submitted during the collection shifts the window. That is not fixed: it is
 * restarted. The uniqueness constraint absorbs the duplicates, and whatever slipped
 * between two pages will be picked up on the next pass.
 */
class MindustryTool extends Catalogue
{
    private const BASE = 'https://api.mindustry-tool.com/api/v4';

    /** How many entries per listing page. A hundred goes through, and divides traffic by five. */
    private const SIZE = 100;

    /**
     * Something to stop a loop the source would not close on its own.
     *
     * `pages()` normally stops on an empty page. An API that answered the same
     * page indefinitely would loop forever, and a collection running forever on someone
     * else's server is exactly what we promised ourselves to avoid.
     */
    private const MAX_PAGES = 1000;

    /** The author names already resolved, so as not to ask for the same one a thousand times. */
    private array $names = [];

    public function source(): string
    {
        return Schematic::MINDUSTRY_TOOL;
    }

    public function announced(): ?int
    {
        $count = $this->http->json(self::BASE.'/schematics/count');

        return is_numeric($count) ? (int) $count : null;
    }

    public function pages(): iterable
    {
        for ($page = 0; $page < self::MAX_PAGES; $page++) {
            $listed = (array) $this->http->json(
                self::BASE."/schematics?page={$page}&size=".self::SIZE);

            if ($listed === []) {
                return;
            }

            yield $listed;
        }
    }

    public function idOf(array $listed): string
    {
        return (string) ($listed['id'] ?? '');
    }

    public function fetch(array $listed): ?array
    {
        $id = $this->idOf($listed);

        $detail = $this->http->json(self::BASE."/schematics/{$id}");
        if (! is_array($detail) || $detail === []) {
            return null;
        }

        // The only call that brings back the schematic itself. Without it there is nothing
        // to keep: the detail only carries what is said about it.
        $code = $this->http->base64(self::BASE."/schematics/{$id}/data");
        if ($code === null || $code === '') {
            return null;
        }

        return [
            'name' => (string) ($detail['name'] ?? $listed['name'] ?? ''),
            'description' => $this->orNothing($detail['description'] ?? null),
            'code' => $code,
            'author' => $this->nameOf($detail['createdBy'] ?? null),
            'meta' => $detail,
        ];
    }

    /**
     * A page in three waves instead of two hundred calls in single file.
     *
     * Details together, then the `.msch` bodies together, then the authors those reveal.
     * The order matters: the authors are only known once the details are in, and there is
     * a handful of them per page once deduplicated, where asking one by one would be a
     * third of the whole collection's traffic.
     */
    public function fetchMany(array $listed): array
    {
        $details = [];
        foreach ($this->http->all(array_map(
            fn ($id) => self::BASE."/schematics/{$id}", array_combine(array_keys($listed), array_keys($listed))
        )) as $id => $answer) {
            $found = $answer?->json();
            $details[$id] = is_array($found) && $found !== [] ? $found : null;
        }

        // Only the ones whose detail answered: asking for the schematic of an entry that
        // vanished between listing and detail is a call paid for a 404.
        $alive = array_keys(array_filter($details));
        $codes = $this->http->all(array_map(
            fn ($id) => self::BASE."/schematics/{$id}/data", array_combine($alive, $alive)
        ));

        // The authors this page introduces, each asked for once. The cache holds from one
        // page to the next, so a whole collection pays for a person once however many
        // schematics they posted.
        $missing = [];
        foreach ($details as $detail) {
            $who = $detail['createdBy'] ?? null;
            if (is_string($who) && $who !== '' && ! array_key_exists($who, $this->names)) {
                $missing[$who] = self::BASE."/users/{$who}";
            }
        }
        foreach ($this->http->all($missing) as $who => $answer) {
            $user = $answer?->json();
            $this->names[$who] = is_array($user) ? $this->orNothing($user['name'] ?? null) : null;
        }

        $rows = [];
        foreach ($listed as $id => $one) {
            $detail = $details[$id] ?? null;
            $body = $codes[$id] ?? null;
            $rows[$id] = $detail === null || $body === null || $body->body() === ''
                ? null
                : [
                    'name' => (string) ($detail['name'] ?? $one['name'] ?? ''),
                    'description' => $this->orNothing($detail['description'] ?? null),
                    'code' => base64_encode($body->body()),
                    'author' => $this->names[$detail['createdBy'] ?? ''] ?? null,
                    'meta' => $detail,
                ];
        }

        return $rows;
    }

    /**
     * The username behind the identifier the detail gives.
     *
     * The detail does not name the author, it numbers them. A credit that cannot be read
     * is not a credit, so the call is paid for, once per person: across twelve thousand
     * schematics there are a few hundred authors, and asking again on every row
     * would make a third of the collection's traffic for nothing.
     */
    private function nameOf(?string $who): ?string
    {
        if ($who === null || $who === '') {
            return null;
        }
        if (array_key_exists($who, $this->names)) {
            return $this->names[$who];
        }

        $user = $this->http->json(self::BASE."/users/{$who}");

        return $this->names[$who] = is_array($user)
            ? $this->orNothing($user['name'] ?? null)
            : null;
    }
}
