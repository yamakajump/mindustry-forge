# The application

What a server is actually for here: remembering analyses, and letting people share them.
The page carries no computation, and the analysis it loads has rules of its own, in
[`public/forge/AGENTS.md`](public/forge/AGENTS.md).

Run these from this directory:

```bash
vendor/bin/pint            # style (--test to check without fixing)
php artisan test           # Pest tests, SQLite in memory
php artisan serve --port=8770
```

## Translation keys

Keys are written `<domain>.<screen>.<element>`, in kebab-case, and are **never assembled at
runtime**: a key glued together at render time is a key no check sees, and that is verified
mechanically.

**A unit never goes through a placeholder.** When a key is missing, Laravel renders the key
without substituting, so `__('blocs.unite.points', ['n' => 160])` prints
`blocs.unite.points` and **the 160 disappears**. Losing a word is a display defect; losing
a number, on a site that sells nothing but numbers, is losing the information. Write
`{{ $n }} {{ __('blocs.unite.points') }}`, which degrades to `160 blocs.unite.points`.

The rule is strict for quantities and units, where the number is the whole information and
its absence is invisible, and free for sentences, where a missing word is noticed and
freezing the number-then-word order would break translation. The test applies it to
`.unite.` keys, because neither PHP nor JS says statically that a variable is a number.

The two dictionaries are checked by two different suites: `php artisan test` holds
`lang/fr/`, and `npm test`, from the repository root, holds `public/forge/lang/fr.json`.
Passing one says nothing about the other.
