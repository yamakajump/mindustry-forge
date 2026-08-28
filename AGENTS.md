# mindustry-forge

Paste a Mindustry schematic, find out what it really produces and where it jams.
Public site: **https://mindustryforge.com**

This file follows the [AGENTS.md](https://agents.md) convention and is read by coding
agents generally. It describes how the codebase is put together and the rules that hold
everywhere in it, for anyone working in this repository, human or agent.

## Read the nearest file, not only this one

What binds a single area lives beside the code it governs, in a nested `AGENTS.md`. A
nested file covers its directory and everything under it, and this file no longer repeats
what it says. So read this one, then every nested file on the way down to what you are
about to edit.

| | | |
|---|---|---|
| `site/public/forge/` | the analysis: reads a `.msch`, builds the flow graph, finds the bottleneck | [`AGENTS.md`](site/public/forge/AGENTS.md) |
| `site/public/index.html` | the page, which carries no computation | |
| `site/app/`, `site/routes/` | what a server is actually for: remembering, and letting people share | [`AGENTS.md`](site/AGENTS.md) |
| `bench/` | runs the real game and measures the same schematic | [`AGENTS.md`](bench/AGENTS.md) |
| `tools/` | builds the data the site reads, and carries the catalogue into the database | [`AGENTS.md`](tools/AGENTS.md) |
| `tests/js/` | the analysis, run exactly as the page runs it | |
| `docs/` | the roadmap, the known gaps, and the pitfalls already paid for | |
| `deployment/` | everything that describes the production server | [`AGENTS.md`](deployment/AGENTS.md) |

Mindustry **v159.7** is the version pinned throughout this repository, on the browser side
and on the measuring side alike. Nothing here follows `latest`: a silent engine bump would
invalidate every number recorded in this repository without saying so.

## Branch and CI

`main` is the only branch. It is what `deploy.sh` puts into production and what CI
watches, and nothing here compares one branch against another: a side branch that
diverges from `main` is invisible to every check in this repository, so keep any side
branch short lived and merge it early.

`tests.yml` predates the restart and does not cover `site/`; do not rely on it for a change
there. `site.yml` is the CI that matters for the site, and it runs the oracle described in
[`bench/AGENTS.md`](bench/AGENTS.md).

## Commands

```bash
npm test                   # the analyser, the heart of the repository
python -m pytest tests/ -q # file formats only, runs no game despite the name
```

Each area's own commands are in its nested file.

Deployment is production. Ask before running it, and read
[`deployment/AGENTS.md`](deployment/AGENTS.md) first.

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
