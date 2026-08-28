<?php

namespace App\Support;

use App\Models\Schematic;
use Illuminate\Database\Eloquent\Builder;

/**
 * Looking a schematic up by the name a player would type, in one place.
 *
 * This lived inside the comparison controller, and then a second caller appeared: the
 * comparison page now searches while somebody types, over an endpoint. Two copies of a
 * `like` escape is two chances to get an escape wrong, and this particular escape has
 * already cost a production 500.
 *
 * What was typed goes in as text, never as a pattern. Somebody looking for "100%" is not
 * writing a query language, and a raw `like` would read that as "anything".
 */
class NameSearch
{
    /**
     * What marks an escaped character in a `like`, and why it is not a backslash.
     *
     * A backslash has to survive a SQL string literal as well as the `like`, and it does
     * not survive it the same way twice: MySQL reads `escape '\'` as an escaped quote and
     * never closes the literal, so the query is a syntax error, while SQLite parses it
     * happily. That is a 500 anybody could fire by typing one character into a public
     * search box, and it passed every local test because the local database is SQLite.
     * `=` has no meaning inside a string literal in either dialect, so there is nothing
     * left to get wrong.
     *
     * Declared rather than left to the default, too: SQLite has no default escape
     * character at all and MySQL has one, so an implicit `escape` means two behaviours
     * from one query.
     */
    private const ESCAPE = '=';

    /**
     * Public schematics whose name contains what was typed, closest first.
     *
     * Shortest name first, so "graphite" offers "Graphite" before "Graphite line v3
     * reworked": the closer a name is to what was typed, the likelier it is meant.
     *
     * @return Builder<Schematic>
     */
    public static function query(string $term): Builder
    {
        $escaped = str_replace(
            [self::ESCAPE, '%', '_'],
            [self::ESCAPE.self::ESCAPE, self::ESCAPE.'%', self::ESCAPE.'_'],
            $term,
        );

        return Schematic::query()
            ->listed()
            ->whereRaw('name like ? escape ?', ["%{$escaped}%", self::ESCAPE])
            ->orderByRaw('length(name) asc');
    }
}
