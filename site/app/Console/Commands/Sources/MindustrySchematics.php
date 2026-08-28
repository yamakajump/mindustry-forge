<?php

namespace App\Console\Commands\Sources;

use App\Models\Schematic;

/**
 * mindustryschematics.com, the smaller of the two, and the easiest.
 *
 * Two thousand nine hundred and forty-nine entries on an abandoned site, with no terms
 * of use: its `/info` page contains three links and nothing else.
 *
 * The marketplace's own plan announces raw `.msch` at `/schematics/{id}.msch`. There is
 * better, found by reading what the page actually calls: the listing itself already
 * serves the base64 in its `text` field, so the schematic on its own costs no call at
 * all.
 *
 *     /schematics.json?page=N        pages of twenty: _id, name, text (the base64)
 *     /schematics/{id}.json          description, tags, cost, their figures, creator_id
 *     /user/{id}.json                the username
 *
 * A trap not to reproduce: the site's own page calls this detail with `?increment=true`,
 * which increments their download counter. The collector does not pass it. Inflating
 * someone's statistics just to read a page is a way of lying, even a small one, and the
 * lie would stay in their database because of us.
 */
class MindustrySchematics extends Catalogue
{
    private const BASE = 'https://mindustryschematics.com';

    /** What the source announces it holds, read on the first page and kept. */
    private ?int $documents = null;

    private array $names = [];

    public function source(): string
    {
        return Schematic::MINDUSTRY_SCHEMATICS;
    }

    public function announced(): ?int
    {
        if ($this->documents === null) {
            $first = $this->http->json(self::BASE.'/schematics.json?page=1');
            $this->documents = is_array($first) ? (int) ($first['documents'] ?? 0) : null;
        }

        return $this->documents;
    }

    /**
     * The hundred and forty-eight pages, stopping at the number it announces.
     *
     * Not at an empty page, like the other source: this one **caps** the page number.
     * Asking for page two hundred returns page one hundred and forty-eight, with an HTTP
     * 200 and twenty perfectly valid entries. A collector waiting for emptiness would
     * loop forever on the last page, never writing anything new, with no error ever
     * reporting it.
     */
    public function pages(): iterable
    {
        $last = null;

        for ($page = 1; $last === null || $page <= $last; $page++) {
            $answer = $this->http->json(self::BASE."/schematics.json?page={$page}");
            if (! is_array($answer)) {
                return;
            }

            $last ??= (int) ($answer['pages'] ?? 0);
            $this->documents ??= (int) ($answer['documents'] ?? 0);

            $listed = (array) ($answer['schematics'] ?? []);
            if ($listed === []) {
                return;
            }

            yield $listed;
        }
    }

    public function idOf(array $listed): string
    {
        return (string) ($listed['_id'] ?? '');
    }

    public function fetch(array $listed): ?array
    {
        $id = $this->idOf($listed);
        $detail = $this->http->json(self::BASE."/schematics/{$id}.json");
        $detail = is_array($detail) ? $detail : [];

        // The listing already carries the schematic, so an entry whose detail has vanished
        // remains ingestable. That is what matters: the `.msch` is the thing, the rest is
        // what is said about it.
        $code = (string) ($detail['text'] ?? $listed['text'] ?? '');
        if ($code === '') {
            return null;
        }

        return [
            'name' => (string) ($detail['name'] ?? $listed['name'] ?? ''),
            'description' => $this->orNothing($detail['description'] ?? null),
            'code' => $code,
            'author' => $this->nameOf($detail['creator_id'] ?? null),
            // Without `text`: it is already in `code`, whole, and two thousand nine
            // hundred and forty-nine base64 kept twice is wasted duplicate space.
            // Everything else in their response passes through as is.
            'meta' => array_diff_key($detail, ['text' => null]),
        ];
    }

    /**
     * A page in two waves: the details together, then the authors they name.
     *
     * Cheaper than the other source, because the listing already carries the `.msch`:
     * there is never a third wave to go and fetch the schematic itself.
     */
    public function fetchMany(array $listed): array
    {
        $details = [];
        foreach ($this->http->all(array_map(
            fn ($id) => self::BASE."/schematics/{$id}.json",
            array_combine(array_keys($listed), array_keys($listed))
        )) as $id => $answer) {
            $found = $answer?->json();
            $details[$id] = is_array($found) ? $found : [];
        }

        $missing = [];
        foreach ($details as $detail) {
            $who = $detail['creator_id'] ?? null;
            if (is_string($who) && $who !== '' && ! array_key_exists($who, $this->names)) {
                $missing[$who] = self::BASE."/user/{$who}.json";
            }
        }
        foreach ($this->http->all($missing) as $who => $answer) {
            $user = $answer?->json();
            $this->names[$who] = is_array($user) ? $this->orNothing($user['username'] ?? null) : null;
        }

        $rows = [];
        foreach ($listed as $id => $one) {
            $detail = $details[$id] ?? [];
            // The listing already carries the schematic, so an entry whose detail is gone
            // is still worth taking: the `.msch` is the thing, the rest is what is said
            // about it.
            $code = (string) ($detail['text'] ?? $one['text'] ?? '');
            $rows[$id] = $code === '' ? null : [
                'name' => (string) ($detail['name'] ?? $one['name'] ?? ''),
                'description' => $this->orNothing($detail['description'] ?? null),
                'code' => $code,
                'author' => $this->names[$detail['creator_id'] ?? ''] ?? null,
                'meta' => array_diff_key($detail, ['text' => null]),
            ];
        }

        return $rows;
    }

    private function nameOf(?string $who): ?string
    {
        if ($who === null || $who === '') {
            return null;
        }
        if (array_key_exists($who, $this->names)) {
            return $this->names[$who];
        }

        $user = $this->http->json(self::BASE."/user/{$who}.json");

        return $this->names[$who] = is_array($user)
            ? $this->orNothing($user['username'] ?? null)
            : null;
    }
}
