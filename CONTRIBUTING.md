# Contributing

Thank you for looking. This document says what this project is strict about and why,
so that you can decide before writing code whether the rules suit you.

Everything here is written in English, including commit messages and comments. The site's
own text stays French for now: it addresses French-speaking players, and it lives in
`site/lang/` and `site/public/forge/lang/`. The line is between the two audiences, not
between two files.

## The two rules this project actually has

Everything else is preference. These two are not.

### 1. One implementation of the analysis

The analysis lives in `site/public/forge/analyse.js`, in JavaScript, and runs in the
visitor's browser. A second one, in another language, for a command line or a backend,
would be a second thing to be wrong.

This is why the ingestion pass runs `analyse.js` under Node rather than reimplementing it
in PHP, and why the schematic renderer is not redrawn server-side. When you find yourself
about to compute a game figure in a second place, stop and read
[`docs/known-gaps.md`](docs/known-gaps.md) first: the answer is usually already written
somewhere.

There is an honest exception, and it is documented in the README rather than hidden: there
are currently **two models in JavaScript** that do not agree on the same physics. Closing
that gap is stated work, not a secret.

### 2. Numbers are proven against the game, never against ourselves

`bench/` runs a real headless Mindustry v159.7 server on a frozen world, stamps a schematic
into it, and counts what comes out. Every scenario is recorded in
`bench/data/oracle/`.

```bash
npm run oracle           # replay every recorded scenario, expected gap 0.00 %
npm run oracle:measure   # re-measure in a real server, needs the game jar
node tools/gap.mjs       # how far the steady-state solver is from the tick engine
```

If the analysis and the measurement disagree, that is a bug here, not a matter of opinion.
**Never adjust a constant until a test goes green.** If you cannot explain a number by
reading the game's own source or bytecode, say so in the pull request instead of shipping
it.

The `.msch` format is implemented from `Schematics.write` and `TypeIO` in Mindustry
v159.7, the version pinned everywhere in this repository. Reading that format from a wiki
is how a tool ends up disagreeing with the game about what the player just pasted.

## Getting it running

```bash
git clone https://github.com/yamakajump/mindustry-forge
cd mindustry-forge

npm test                        # the analyser, no install needed

cd site
composer install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate
php artisan test
php artisan serve
```

The analyser itself is a static page and needs no server at all: opening
`site/public/index.html` works.

## Before you open a pull request

- `npm test` and `php artisan test` both green.
- `cd site && vendor/bin/pint` for PHP style.
- **Look at the change in a browser**, not only in the test output. Three of the worst
  defects found in this repository had perfectly correct numbers and were only visible in
  the rendered sentence.
- If you changed anything the bench covers, `npm run oracle` and quote the gap.

## What a good pull request looks like here

**The body explains why, not what.** The diff already says what. The reason a change exists
is the part that will not be reconstructable in six months.

**A number in the body beats an adjective.** "141 ms over fifteen thousand rows, paid on
every view" is reviewable. "It was slow" is not.

**Say what you did not do.** A limitation stated in the pull request is a limitation; the
same limitation discovered later is a bug. If a test cannot cover something, write that
down rather than letting the green tick imply otherwise.

**Break your own tests before trusting them.** A mutation that no test catches is either a
missing test or, more often, a design problem. Both are worth knowing before merging.
"The test passes" and "the test protects" are two different claims.

## Some things this repository has learned the hard way

They are collected in [`docs/pitfalls.md`](docs/pitfalls.md), and reading them will save you
an afternoon. A few examples:

- MySQL reorders the keys of a JSON object and SQLite does not, so an ordering assertion
  passes locally and fails in CI.
- MySQL refuses to drop a unique index a foreign key depends on; SQLite accepts it because
  it rebuilds the table. A migration can therefore pass every local test and break the
  deployment.
- A repeated `og:` meta tag is an array, not a replacement, so the generic card silently
  wins over the specific one.
- `php artisan serve` prints "Server running" even when the port is already taken, and you
  end up debugging somebody else's screen.

## Reporting something

Use the issue templates. The bug one asks for the schematic string when there is one:
without it a throughput report cannot be reproduced, and a report that cannot be reproduced
cannot be fixed.

Security issues go to [`SECURITY.md`](SECURITY.md) rather than to a public issue.

## Licence

This project is AGPL-3.0. By contributing you agree that your contribution is licensed
under it. The fonts under `site/public/forge/fonts/` are **not** covered by it and carry
their own terms; see the README there.
