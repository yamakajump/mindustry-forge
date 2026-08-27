<?php

namespace App\Http\Controllers;

use App\Models\Schematic;
use App\Support\Comparison;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\View\View;

/**
 * Two schematics side by side, which is the question the catalogue creates.
 *
 * Once the site holds fifteen thousand layouts, a player stops asking "is there a graphite
 * line" and starts asking "which of these two". Every other Mindustry site answers that
 * with two screenshots; both of these were read by the same engine, so the answer is a
 * subtraction, and the subtraction is stated rather than left for the reader to do in their
 * head from two columns.
 *
 * What the page will not do is declare a winner. A layout that makes more and costs three
 * times as much is a different trade, not a better one, and the reader is the one who knows
 * which trade they want.
 */
class CompareController extends Controller
{
    /** What a slug is allowed to look like, so a lookup cannot be a paragraph. */
    private const SLUG = '/^[a-z0-9]{1,16}$/';

    /** How many to offer. Enough to recognise one, few enough to read without scrolling. */
    private const OFFERED = 8;

    /**
     * What marks an escaped character in a `like`, and why it is not a backslash.
     *
     * A backslash has to pass through the SQL string literal before it reaches the
     * pattern, and the two dialects disagree about that step. `=` means nothing to
     * either of them, so it arrives as itself.
     */
    private const ESCAPE = '=';

    public function index(Request $request): View
    {
        // `is_string` before anything else: `?a[]=1` hands back an array, and casting one
        // to a string is a fatal rather than an empty field. A query parameter is whatever
        // the caller felt like sending.
        $said = fn (string $key) => is_string($v = $request->query($key)) ? trim($v) : '';
        $asked = ['a' => $said('a'), 'b' => $said('b')];

        $left = $this->find($asked['a']);
        $right = $this->find($asked['b']);

        return view('compare', [
            'left' => $left,
            'right' => $right,
            'asked' => $asked,
            // Only when both are in hand. Half a comparison is a form, not a result.
            'comparison' => $left && $right ? new Comparison($left, $right) : null,
            /* What was typed, when it was not an address. The page used to answer a name
               with an empty form, which reads as "there is no such schematic" when what
               happened is that it was never looked for. */
            'matches' => [
                'a' => $left ? null : $this->matching($asked['a']),
                'b' => $right ? null : $this->matching($asked['b']),
            ],
            // Something to pick from, so the page is usable arriving from the menu rather
            // than only from a link somebody built by hand.
            'recent' => $this->offer($left, $right),
        ]);
    }

    /**
     * One schematic, if it is public and it is really there.
     *
     * `listed()` and not `visibleTo`: a comparison is a page whose whole content is two
     * other people's work, and a link to it travels. Unlisted schematics are reachable by
     * their own link on purpose, and that is not the same as being fair game to be pulled
     * into a page beside a stranger's.
     */
    private function find(mixed $slug): ?Schematic
    {
        if (! is_string($slug) || ! preg_match(self::SLUG, $slug)) {
            return null;
        }

        return Schematic::query()
            ->listed()
            ->with(['user', 'items'])
            ->where('slug', $slug)
            ->first();
    }

    /**
     * What somebody meant when they typed something that is not an address.
     *
     * The page used to take an identifier and nothing else: ten characters read off a list,
     * held in the head, and typed into a box, twice. That is asking a reader to do the
     * machine's work, and the list of suggestions printed right underneath was proof that
     * the site already knew which schematics it was talking about.
     *
     * So a name is accepted in the same field. A slug still wins when it matches one,
     * because a link pasted from a thread has to keep working and an address is exact where
     * a name is not; anything else is looked for.
     *
     * @return Collection<int, Schematic>|null
     */
    private function matching(string $term)
    {
        if ($term === '') {
            return null;
        }

        /* What was typed goes in as text. A name is not a query language: somebody
           looking for "100%" is not writing a pattern, and a `like` would read that as
           "anything".

           The escape character is `=` and not the backslash everybody reaches for. A
           backslash has to survive a SQL string literal as well as the `like`, and it
           does not survive it the same way twice: MySQL reads `escape '\'` as an escaped
           quote and never closes the literal, so the query is a syntax error, while
           SQLite parses it happily. That is a 500 anybody could fire by typing one
           character into a public search box, and it passed every local test because the
           local database is SQLite. `=` has no meaning inside a string literal in either
           dialect, so there is nothing left to get wrong.

           Declared rather than left to the default, too: SQLite has no default escape
           character at all and MySQL has one, so an implicit `escape` means two
           behaviours from one query. */
        $escaped = str_replace(
            [self::ESCAPE, '%', '_'],
            [self::ESCAPE.self::ESCAPE, self::ESCAPE.'%', self::ESCAPE.'_'],
            $term,
        );

        return Schematic::query()
            ->listed()
            ->whereRaw('name like ? escape ?', ["%{$escaped}%", self::ESCAPE])
            // Shortest first, so "graphite" offers "Graphite" before "Graphite line v3
            // reworked": the closer a name is to what was typed, the likelier it is meant.
            ->orderByRaw('length(name) asc')
            ->limit(self::OFFERED)
            ->with('user')
            ->get(['id', 'user_id', 'slug', 'name', 'blocks', 'author']);
    }

    /**
     * A short list to choose from, newest first, minus whatever is already chosen.
     *
     * Deliberately not the whole catalogue in a dropdown: fifteen thousand options is not a
     * choice, it is a scroll. Somebody comparing two specific layouts arrives with both
     * links; this is for somebody who arrived from the menu with neither.
     */
    private function offer(?Schematic $left, ?Schematic $right)
    {
        $taken = array_filter([$left?->id, $right?->id]);

        return Schematic::query()
            ->listed()
            ->whereNotIn('id', $taken ?: [0])
            ->orderByDesc('id')
            ->limit(self::OFFERED)
            ->with('user')
            ->get(['id', 'user_id', 'slug', 'name', 'blocks', 'author']);
    }
}
