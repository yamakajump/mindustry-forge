<?php

namespace App\Console\Commands\Sources;

/**
 * A catalogue we ingest from, and what the collector needs to know about it.
 *
 * The two sources do not resemble each other. One exposes a versioned API, paginates by
 * offset and serves the `.msch` in bytes at a third address; the other is an abandoned
 * site whose listing already carries the base64 and whose detail lives under a `.json`
 * extension stuck behind the identifier. A third will arrive with its own ways.
 *
 * What does not change is the walk: go through the listing, skip what we already hold,
 * go fetch the rest. That is what this class fixes, and that is all it fixes. Each source
 * keeps its quirks to itself.
 */
abstract class Catalogue
{
    public function __construct(protected PoliteClient $http) {}

    /** The name under which the origin is stored, on the `Schematic::SOURCES` side. */
    abstract public function source(): string;

    /** How many the source announces it holds, when it knows how to say so. */
    abstract public function announced(): ?int;

    /**
     * The listing's entries, page by page.
     *
     * A generator rather than an array: twelve thousand entries fit in memory, but the
     * collection must be able to write the first rows before it has read the last
     * page. A collection cut off midway has then already kept what it had taken.
     *
     * @return iterable<int, array<int, array<string, mixed>>>
     */
    abstract public function pages(): iterable;

    /** The identifier of an entry on its own side, which is what makes the ingestion idempotent. */
    abstract public function idOf(array $listed): string;

    /**
     * Everything needed to write the row, or null if the source no longer serves it.
     *
     * Returns `name`, `description`, `code` (the `.msch` in base64), `author` and `meta`,
     * the latter being the source's response kept whole. Recrawling twelve thousand
     * pages costs hours, so the moment a field costs nothing to keep is the moment it
     * arrives, well before anyone knows which ones will be useful.
     *
     * @return array{name: string, description: ?string, code: string, author: ?string, meta: array}|null
     */
    abstract public function fetch(array $listed): ?array;

    /**
     * A whole page at once, which is the only way to make this fast.
     *
     * One entry costs one or two round trips, and a round trip costs two hundred
     * milliseconds that no pause makes shorter. Asking one at a time means eighty minutes
     * of waiting for twelve thousand entries, even flat out. Asking together means two
     * hundred milliseconds for twenty-four.
     *
     * The default loops, so a source written later works without knowing any of this. The
     * two that exist replace it.
     *
     * @param  array<string, array>  $listed  The entries to take, by id.
     * @return array<string, ?array>
     */
    public function fetchMany(array $listed): array
    {
        $rows = [];
        foreach ($listed as $id => $one) {
            $rows[$id] = $this->fetch($one);
        }

        return $rows;
    }

    /** An empty string is not a description, it is the absence of a description. */
    protected function orNothing(mixed $text): ?string
    {
        $text = is_string($text) ? trim($text) : '';

        return $text === '' ? null : $text;
    }
}
