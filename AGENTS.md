# mindustry-forge

Paste a Mindustry schematic, find out what it really produces and where it jams.
Public site: **https://mindustryforge.com**

This file follows the [AGENTS.md](https://agents.md) convention and is read by coding
agents generally. It describes how the codebase is put together and the rules that hold in
it, for anyone working in this repository, human or agent.

## Branch and CI

`main` is the only branch. It is what `deploy.sh` puts into production and what CI
watches, and nothing here compares one branch against another: a side branch that
diverges from `main` is invisible to every check in this repository, so keep any side
branch short lived and merge it early.

`tests.yml` and `verify-catalogue.yml` reference paths that no longer exist in this
repository (`forge/server_setup.py`, `gradlew`); do not rely on them. `site.yml` is the CI
that matters, and it runs the oracle (see below).

## The two rules of this repository

**One implementation of the analysis.** It is in `site/public/forge/analyse.js`, in
JavaScript, and it runs in the visitor's browser. A second version, in another language,
for a command line or a backend, would be a second thing to be wrong. Do not write one.

**Numbers are proven against the game, not against us.** `bench/` runs a real headless
Mindustry server on a fixed world, stamps the schematic into it and counts what comes out.
If the analysis and the measurement disagree, that is a bug here, not a matter of opinion.
Never adjust a constant to make a test pass without checking what the bench says.

The `.msch` format is implemented from `Schematics.write` and `TypeIO` in Mindustry
v159.7, the version pinned throughout this repository, rather than from a wiki: a format
read off a wiki is how a tool ends up disagreeing with the game about what the player just
pasted.

## Commands

```bash
npm test                   # the analyser, the heart of the repository
npm run oracle             # replay every recorded scenario, expected gap 0.00 %
npm run oracle:measure     # re-measure in a real server, needs the jar
python -m pytest tests/ -q # file formats only, runs no game despite the name

cd site
vendor/bin/pint            # style (--test to check without fixing)
php artisan test           # Pest tests, SQLite in memory
php artisan serve --port=8770
```

Deployment is production. Ask before running it.

```bash
ssh <server> "bash /var/www/mindustry-forge/deployment/deploy.sh"
```

## Where things are

| | |
|---|---|
| `site/public/forge/` | the analysis: reads a `.msch`, builds the flow graph, finds the bottleneck |
| `site/public/index.html` | the page, which carries no computation |
| `site/app/`, `site/routes/` | what a server is actually for: remembering, and letting people share |
| `bench/` | runs the real game and measures the same schematic |
| `tests/js/` | the analysis, run exactly as the page runs it |
| `docs/` | the roadmap, the known gaps, and the pitfalls already paid for |
| `deployment/` | everything that describes the production server |

## Deployment: the repository is the truth

`deployment/` holds the nginx vhost, the PHP-FPM pool and the systemd units, and
`deploy.sh` copies them onto the server on every pass.

**Never edit the nginx site file or the PHP-FPM pool over SSH.** The change is overwritten
by the next deployment, silently. Edit the file in the repository instead.

`install-server.sh` rebuilds the machine from nothing; keeping it current is what makes a
hardware failure recoverable without depending on memory.

The server hosts other applications under other accounts, so this site has its own system
user, its own PHP-FPM pool and its own database, and shares nothing between them.

Adding a PHP-FPM pool needs a `systemctl restart`, not a `reload`: a reload reuses
inherited sockets, so the new pool never appears, and nothing reports an error.

## What goes into the engine fingerprint, and what does not

`EngineVersion` hashes the sources of the analysis and stamps the result into every row of
the catalogue, so a stale figure can be found. What decides an answer belongs in the
hashed sources; what only decides how a page reads does not.

The hashed sources are `site/public/forge/` and `tools/ingest.mjs`: the ingest pass
decides which computed fields reach a column, so a field computed but dropped there would
otherwise read as current everywhere while never actually reaching storage. Data that only
changes presentation, such as a colour registry, is kept out of the hashed sources on
purpose: including it would stale every stored analysis and force a full re-measurement
for no numeric reason.

To check the boundary after a change, compare the checksum of `blocks.json` before and
after: identical means the change touched nothing hashed.

## Conventions

### Language: English in the repository, French on the site

**Everything a contributor reads is in English**: the code, its comments, commit messages,
pull request titles and descriptions, and the documents in `docs/`.

**Everything a player reads stays French**, and lives in `site/lang/` and
`site/public/forge/lang/`. The site addresses French-speaking players first; other
languages will come, and the multilingual base is there for that.

History is not rewritten: `main` is public, and merged pull requests are permalinks that
nothing justifies breaking for cosmetics.

Accents are written, in both languages. The font carries them, and that is verified;
French without accents is badly written French.

### The rest

- Conventional commits, in English, imperative subject, 50 characters max. Same for the
  pull request title and description. See `CONTRIBUTING.md` for what that buys a reader
  of the changelog.
- The commit body explains *why*, not *what*: the diff already says what.
- No em dash, anywhere.
- Translation keys are written `<domain>.<screen>.<element>`, in kebab-case, **never
  assembled at runtime**: a key glued together at render time is a key no check sees, and
  that is verified mechanically.
- **A unit never goes through a placeholder.** When a key is missing, Laravel renders the
  key without substituting, so `__('blocs.unite.points', ['n' => 160])` prints
  `blocs.unite.points` and **the 160 disappears**. Losing a word is a display defect;
  losing a number, on a site that sells nothing but numbers, is losing the information.
  Write `{{ $n }} {{ __('blocs.unite.points') }}`, which degrades to
  `160 blocs.unite.points`.

  The rule is strict for quantities and units, where the number is the whole information
  and its absence is invisible, and free for sentences, where a missing word is noticed
  and freezing the number-then-word order would break translation. The test applies it to
  `.unite.` keys, because neither PHP nor JS says statically that a variable is a number.

## Working with a shared checkout

Before committing, check that the diff contains only your own work:

```bash
git diff --stat        # is all of this really mine?
git add <files>        # never a blind `git add -A`
git commit -- <paths>  # the only form that ignores what someone else staged
```

Cut a branch from `origin/main`, in a worktree rather than the shared checkout, so that
pushing it cannot carry work someone else left staged or committed there in the meantime:

```bash
git worktree add -b <branch> ../<work> origin/main
```

## What must never enter the repository

`site/.env` (application key, Discord credentials, database password) is gitignored, and
the database password lives only on the server, readable by root alone. Never copy either
into a versioned file, an issue or a comment: the repository is public, and anything
committed here is readable by anyone, immediately and permanently.
