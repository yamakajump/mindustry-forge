"""The branches the workflows name, checked against the one branch that exists.

`release-please.yml` only ever triggered on `restart/place-de-marche`. That branch was
deleted on 27/08/2026 when the restart was merged back, and from that day the workflow ran
zero times: no tag, no release, and 242 commits landing on `main` behind the silence.

Nothing failed, and that is the whole difficulty. A workflow that never triggers is green by
never being red, so the version automation was not broken, it was absent, and absence has no
red cross beside it. Two other workflows still listed a `restart/**` pattern matching
nothing, which is harmless and reads as if those branches were still around.

This file is the control that the rule was missing. `main` is the only branch this
repository has, which its own CLAUDE.md states in its first section, so a workflow naming
anything else is either a leftover or a branch somebody forgot to create.
"""

from __future__ import annotations

import pathlib

import pytest
import yaml

WORKFLOWS = sorted((pathlib.Path(__file__).resolve().parents[1] / ".github" / "workflows").glob("*.yml"))

# The trunk, and there is only one. Named here rather than read from git so the check means
# the same thing in a shallow CI checkout as it does on a laptop.
TRUNK = "main"


def _branches(document: dict) -> list[tuple[str, str]]:
    """Every branch a workflow names, with the trigger that names it.

    `on` is read through `True` as well: YAML 1.1 parses a bare `on` key as the boolean
    true, which is a trap worth handling here rather than discovering as an empty result
    that makes the whole check pass without testing anything.
    """
    triggers = document.get("on", document.get(True, {}))
    if not isinstance(triggers, dict):
        return []

    found = []
    for name, body in triggers.items():
        if isinstance(body, dict):
            for branch in body.get("branches", []) or []:
                found.append((name, branch))
    return found


assert WORKFLOWS, "no workflow found: the path is wrong, not the repository empty"


@pytest.mark.parametrize("path", WORKFLOWS, ids=lambda p: p.name)
def test_a_workflow_only_names_the_trunk(path: pathlib.Path):
    document = yaml.safe_load(path.read_text(encoding="utf-8"))

    for trigger, branch in _branches(document):
        assert branch == TRUNK, (
            f"{path.name} triggers on `{branch}` through `{trigger}`, which does not exist. "
            f"A workflow aimed at an absent branch never runs and never goes red."
        )


@pytest.mark.parametrize("path", WORKFLOWS, ids=lambda p: p.name)
def test_release_please_targets_the_branch_it_triggers_on(path: pathlib.Path):
    """The two places release-please names a branch have to agree.

    `on.push.branches` decides whether it runs; `target-branch` decides what it releases.
    Set to different branches it would run and then do nothing useful, which is a quieter
    failure than not running at all.
    """
    document = yaml.safe_load(path.read_text(encoding="utf-8"))

    for job in (document.get("jobs") or {}).values():
        for step in job.get("steps") or []:
            target = (step.get("with") or {}).get("target-branch")
            if target is None:
                continue

            triggers = [branch for _, branch in _branches(document)]
            assert target in triggers, (
                f"{path.name} releases on `{target}` but only triggers on {triggers}."
            )
