# mindustry-forge

Paste a Mindustry schematic, find out what it really produces and where it jams.
Public site: **https://mindustryforge.com**

This file is for anyone working in this repository, human or agent. It is in English like
the rest of the repository, and it is a set of rules rather than a history: what to do,
and what it costs when it is not done.

## The trunk is `main`, and there is only one

Everything lives on **`main`**: the default branch, what `deploy.sh` puts into production,
what CI watches. Long lived side branches have already cost this repository a public page
showing 161 commits of lag and no licence. If one is ever needed again, it is merged early
and often, not at the end. **No test runs on the difference between two branches.**

The workflows `tests.yml` and `verify-catalogue.yml` predate the restart and reference
paths that no longer exist. Do not rely on them. The CI that counts is `site.yml`, and it
runs the oracle.

## The two rules of this repository

**One implementation of the analysis.** It is in `site/public/forge/analyse.js`, in
JavaScript, and it runs in the visitor's browser. A second version, in another language,
for a command line or a backend, would be a second thing to be wrong. Do not write one.

**Numbers are proven against the game, not against us.** `bench/` runs a real headless
Mindustry server on a fixed world, stamps the schematic into it and counts what comes out.
If the analysis and the measurement disagree, that is a bug here, not a matter of opinion.
Never adjust a constant to make a test pass without checking what the bench says.

The `.msch` format is implemented from `Schematics.write` and `TypeIO` in Mindustry
v159.7, the version pinned throughout this repository. Reading that format off a wiki is
how a tool ends up disagreeing with the game about what the player just pasted.

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

**Never edit the nginx site file or the PHP-FPM pool over SSH.** The change would be
overwritten by the next deployment, silently. Edit the file in the repository.

`install-server.sh` rebuilds the machine from nothing. Keeping it current is the only
thing standing between a hardware failure and a reinstall from memory.

The server hosts other applications under other accounts, which is why this site has its
own system user, its own PHP-FPM pool and its own database. Do not share anything between
them.

Expensive trap: adding a PHP-FPM pool needs a `systemctl restart`, not a `reload`. A
reload reuses inherited sockets, the new pool never appears, and nothing reports an error.

## The recurring defect: a correct number, next to the wrong question

Six times in one day, under six faces, the same defect. Each time an **exact** number,
correctly computed, displayed where the surface asks a different question.

| What was correct | The question asked | What it produced |
|---|---|---|
| net power | "which one produces most" | a factory ranked below an empty schematic |
| the power ceiling | "how big is it" | 480 megawatts on a plan nobody can place |
| a sandbox tap's throughput | "what does this plan produce" | 36 million water a minute |
| the ceiling, filed as a measurement | "the ones that produce most" | 3364 schematics ranked on what they do not do |
| a link's relative position | "which block do I connect" | a map of empty cells |
| the panel's aspect ratio | "how big should the drawing be" | plans squashed, others out of frame |

None was an arithmetic error, and **none would have been caught by a test that checks a
number**. They are visible by reading the sentence around them, or by opening the page.

**The rule**: before displaying a number, say out loud the question the surface claims to
answer. If the number answers a neighbouring question, it is wrong in that place even when
it is right everywhere else. A ceiling is never displayed without saying that it is one.

**The corollary**, which cost the sixth case: whoever spent the day measuring other
people's work and being right three times drew a square next to a file they had written
themselves saying disc. Measuring is not what gets forgotten. Measuring yourself is.

## What goes into the engine fingerprint, and what does not

`EngineVersion` hashes the sources of the analysis and stamps the result into every row,
so a stale figure can be found. The boundary has been wrong in both directions.

**Too narrow.** It covered only `public/forge`, not `tools/ingest.mjs`, which decides
which computed fields reach a column. A field computed and then dropped by the sieve let
fifteen thousand rows read as current while the item ceiling existed in none of them.

**Too wide.** Adding a colour registry, which changes no number, would have staled fifteen
thousand analyses and triggered a full re-measurement for presentation.

**The rule**: what decides an answer goes in the hashed file, what decides how a page
reads does not. And the check that goes with it, because a rule alone is an intention:
compare the checksum of `blocks.json` before and after the change. Identical to the byte
means zero stale analyses.

## Conventions

### Language: English in the repository, French on the site

**Everything a contributor reads is in English**: the code, its comments, commit messages,
pull request titles and descriptions, and the documents in `docs/`. The repository is
public and open source, and a project whose commits and documentation are in a language
its reader does not speak is a project they do not pick up.

**Everything a player reads stays French**, and lives in `site/lang/` and
`site/public/forge/lang/`. The site addresses French-speaking players first; other
languages will come, and the multilingual base is there for that.

**The language of a commit follows the audience of the repository, not the language of the
conversation.** This repository is public, so English, including when everything else
around the work happens in French. A session in doubt runs `git log --oneline -20`: French
subjects there predate the decision of 27 August 2026 and are not a model.

History is not rewritten. `main` is public, and the merged pull requests are permalinks
that nothing justifies breaking for cosmetics.

Accents are written, in both languages. The font carries them, that is verified, and
French without accents is badly written French.

### The rest

- Conventional commits, in English, imperative subject, 50 characters max. Same for the
  pull request title and description.
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

  **The line falls where the disappearance is silent.** Strict for quantities and units,
  where the number is the whole information and its absence is invisible. Free for
  sentences, where a missing word is noticed and where freezing the number-then-word order
  would break translation. The test applies it to `.unite.` keys, because neither PHP nor
  JS says statically that a variable is a number, and a test that guesses becomes flaky and
  then gets disabled.

## Several sessions often work on this repository in parallel

Before committing, check that the diff contains only your own work:

```bash
git diff --stat        # is all of this really mine?
git add <files>        # never a blind `git add -A`
git commit -- <paths>  # the only form that ignores what someone else staged
```

**And checking is not enough on its own.** `git log --oneline origin/main..HEAD` being
empty says nothing about the state a few minutes later. Pushing `HEAD:refs/heads/<branch>`
then carries whatever landed in between: that is how a documentation change came to
introduce a public endpoint and a page rewrite, under a subject mentioning neither.

Cut your branch from `origin/main` in a worktree, not from the shared checkout:

```bash
git worktree add -b <branch> ../<work> origin/main
```

## What must never enter the repository

`site/.env` (application key, Discord credentials, database password) is ignored, and the
database password lives only on the server, readable by root alone. Never copy either into
a versioned file, an issue or a comment. The repository is public: anything committed here
is readable by anyone, immediately and permanently.
