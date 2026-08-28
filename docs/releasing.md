# Releasing

A release here is two acts, and nothing connects them automatically. `release-please` names
a version and publishes a tag; `deployment/deploy.sh` puts code on the server. Merging the
release pull request changes what GitHub says and changes nothing on
https://mindustryforge.com, and the gap lasts until somebody runs the deployment by hand.

## What a merge to `main` does

`.github/workflows/release-please.yml` triggers on a push to `main` and on nothing else.
The branch is written twice, once in `on.push.branches` and once in the action's
`target-branch`, because the first decides whether the workflow runs and the second decides
what it releases. `tests/test_workflows.py` fails when the two disagree: a workflow aimed at
a branch that does not exist never runs, and a workflow that never runs is green by never
being red.

On each push the action reads the conventional commits since the last tag and opens or
updates a single pull request, on the branch
`release-please--branches--main--components--mindustry-forge`, titled
`chore(main): release X.Y.Z`. It is a standing proposal rather than an event: ten merges
update the same pull request ten times, and the version in its title moves as the largest
bump among the accumulated commits changes. Leaving it open costs nothing, and it is the
answer to "what would ship if we released now".

The commit type decides the bump and the section:

| Commit type | Version | Where it lands in `CHANGELOG.md` |
|---|---|---|
| `feat` | minor | Features |
| `fix` | patch | Bug Fixes |
| `perf` | patch | Performance Improvements |
| `feat!`, or a `BREAKING CHANGE:` footer | major | the same sections, under a major heading |
| `docs`, `chore`, `refactor`, `test`, `style` | none | nowhere: they do not appear at all |

Those three section titles are the only ones the file has ever contained. A `docs` subject
is invisible to a reader of the changelog, which is worth knowing when choosing between
`docs` and `fix` for a change that a player would notice.

`release-please-config.json` sets `bump-minor-pre-major` and
`bump-patch-for-minor-pre-major` to `false`, so the table holds below 1.0 as well: a `feat`
moves 0.3.0 to 0.4.0 rather than to 0.3.1, and a breaking change would move it to 1.0.0.

## The three files the tool owns

The release pull request touches exactly these three, and nothing else in the repository
should ever touch them:

**`version.txt`** carries the released version, and `release-type: simple` in
`release-please-config.json` is what makes the tool write it. Nothing reads it: no PHP, no
JavaScript, no script names it, and `release-please-config.json` is the only file in the
repository that mentions it at all. Its whole job is to let a checkout answer which release
it is without asking git.

**`.release-please-manifest.json`** holds the version the tool believes is current. It is
the anchor the next bump is computed from, not a record of the past: set by hand to a
version that was never tagged, every later release is computed from a fiction, and nothing
reports it because the tool has no other source of truth to disagree with.

**`CHANGELOG.md`** is written by the tool at each release. It prepends the new section and
leaves the older ones alone, so a hand edit to the section it is about to write is lost and
a hand edit anywhere else is invisible to it and unexplained to everyone else.
`CONTRIBUTING.md` is where the French entries at the bottom of the file are explained.

Editing any of the three by hand desynchronises the tool from the repository in a way that
surfaces one release later, at the version that follows the wrong one.

## Merging the release pull request

Merge it like any other pull request, squashed, which leaves one commit
`chore(main): release X.Y.Z (#N)` on `main`. That push triggers the workflow again, and this
second run is the one that publishes: it creates the tag on that commit and a GitHub release
carrying the section it just wrote.

The tag is `vX.Y.Z` because `include-v-in-tag` is true and `include-component-in-tag` is
false, so it is neither `X.Y.Z` nor `mindustry-forge-vX.Y.Z`. `draft` and `prerelease` are
both false: the release is public the moment it exists.

```bash
gh run list --workflow=release-please.yml --limit 3
git fetch --tags
git rev-parse "vX.Y.Z^{commit}"   # the commit the release names
gh release view vX.Y.Z
```

If no tag appears, read that run. The workflow is the only thing in this repository that
creates a tag, so a missing tag is a failed or skipped run and never a delay.

## Deploying, which is a separate decision

No workflow deploys. The four files in `.github/workflows/` run the tests, audit
dependencies and drive `release-please`; none of them opens a connection to the server.
Production moves only here:

```bash
ssh <server> "bash /var/www/mindustry-forge/deployment/deploy.sh"
```

Deployment is production. Ask before running it.

`deploy.sh` fetches `main` and checks out `FETCH_HEAD`, so production tracks the tip of the
branch and not the tag. Deploying an hour after a release ships whatever else landed on
`main` in that hour, which is usually what is wanted and is never what the version number
says. The script dumps the database before migrating, keeps the last ten dumps under
`/var/backups/mindustry-forge/pre-deploy`, holds the site in maintenance across the
migration, and fails if the site does not answer 200 at the end. On failure its `ERR` trap
takes the site back out of maintenance, serving the code from before.

## Checking that production runs what the tag names

Nothing the site serves names its own commit. There is no version route in
`site/routes/web.php`, and `version.txt` sits at the repository root rather than under
`site/public/`, so it is not reachable over HTTP. The check has to be made on the server:

```bash
ssh <server> "git -C /var/www/mindustry-forge rev-parse HEAD"
git rev-parse "vX.Y.Z^{commit}"
```

The same hash means production is exactly the release. Different hashes mean one of two
things, and `git log --oneline vX.Y.Z..<the server's hash>` tells them apart: commits listed
means production is ahead of the tag, which is the normal state of a repository that keeps
merging after a release, and nothing listed means production is behind and the deployment
has not run.

## When the release touched the analysis

`EngineVersion` hashes the sources of the analysis and stamps the fingerprint into every
analysed row. Deploying a change to one of those sources re-measures nothing: the rows keep
the old fingerprint, and the site goes on presenting figures produced by an engine that no
longer exists as if they were current measurements.

```bash
php artisan forge:analyser          # from site/, as the application user
```

`Schematic::stale()` selects exactly the rows whose fingerprint is not the current one, and
that command re-measures them. It runs as the application user rather than as root, which
is `mforge` on the server: `deploy.sh` runs every other `artisan` call through
`sudo -u "$APP_USER"` for the same reason, so that nothing in `storage/` ends up owned by
root and unwritable by PHP-FPM afterwards. Nothing schedules it: there is no scheduler in
`site/bootstrap/app.php`, and `site/routes/console.php` holds only Laravel's `inspire`. So a
release that changed a hashed source is not finished when the deployment ends. `AGENTS.md`
says which sources are hashed and how to check whether a change touched one.

## When something is wrong

### A subject that reads badly, already merged

It stays. `main` is public and history is not rewritten here, and the changelog entry is
generated from the commit subject, so correcting the entry means correcting the commit. The
repair that costs nothing is the next subject: `CONTRIBUTING.md` says why the subject is
written for a reader meeting it in a list months later with no other context.

### A wrong type, already merged

The version consequence is the part that cannot be undone. A `fix` written as `feat` moves
the minor version, and versions are only ever climbed: nothing puts 0.4.0 back to 0.3.1. The
release goes out one version further along than it should have been, which is a cosmetic
loss, and the alternative, rewriting a public branch, is not.

### A release that should not have been cut

While the pull request is open there is nothing to undo: not merging is how a release is
held back, and the pull request goes on accumulating commits and moving its own title.

Once it is merged and the tag is published, the tag and the GitHub release are names and
change no behaviour, because nothing is deployed by either. If they have to go:

```bash
gh release delete vX.Y.Z
git push origin :refs/tags/vX.Y.Z
```

`.release-please-manifest.json` and `version.txt` still hold `X.Y.Z` on `main` afterwards,
so the tool would compute the next release from a version that no longer exists. Putting
both back to the previous version is the one case where those files are edited by hand, and
the commit body has to say so, because the rule against editing them is what makes them
trustworthy the rest of the time. Anyone who already fetched the tag keeps it: deleting a
published tag repairs the minutes after a mistake, not the days.

### A release that should not have been deployed

`deploy.sh` fetches a branch and checks out its tip, so it cannot be pointed at an arbitrary
commit and there is no "deploy the previous tag" path. The way back is a revert commit on
`main` followed by a normal deployment.

The database does not come back with it. `deploy.sh` runs `php artisan migrate --force` and
never rolls back, so reverting the code leaves the schema where the migration put it. The
dump taken immediately before the migration, under `/var/backups/mindustry-forge/pre-deploy`,
is the only way back for the data, and only the last ten are kept.
