"""Fixture and grading contract for rolling back a bad Apollo release."""

from apollo_testkit.domain import (
    DISTRACTOR_CHECK,
    Random,
    base_definition,
    base_snapshot,
    distractor_unchanged,
    initialize_base,
)
from apollo_testkit.grading import Checks, CliEvidence

NAME = "cli-release-rollback"
CATEGORY = "cli"
LABEL = "cli-rollback"
CHECKS = (
    ("Config Service restored stable value", "outcome"),
    ("active release restored stable value", "outcome"),
    ("bad release is no longer active", "outcome"),
    ("used release list and rollback", "interaction"),
    DISTRACTOR_CHECK,
)


def definition(seed):
    state = base_definition(NAME, LABEL, seed)
    rng = Random(seed)
    state["public"].update(stableValue=rng.token("stable", 10), badValue=rng.token("wrong", 10))
    return state


def initialize(api, state):
    initialize_base(api, state, token=True)
    public = state["public"]
    api.put(public["targetApp"], public["key"], public["stableValue"])
    api.release(public["targetApp"], "known-good")
    api.put(public["targetApp"], public["key"], public["badValue"])
    state["badReleaseId"] = api.release(public["targetApp"], "accidental-bad-release")["id"]
    return state


def snapshot(api, state):
    result = base_snapshot(api, state)
    public = state["public"]
    releases = api.request(api.ns(public["targetApp"]) + "/releases/active?page=0&size=100")
    result["activeReleases"] = releases if isinstance(releases, list) else releases["content"]
    if not isinstance(result["activeReleases"], list):
        raise TypeError("Invalid active-release response")
    return result


def grade(evidence, requests, commands, trajectory=()):
    context = CliEvidence(evidence, requests, commands, trajectory)
    public, key = context.public, context.public["key"]
    checks = Checks(CHECKS)
    checks.add(context.config.get(key) == public["stableValue"])
    checks.add(context.release.get(key) == public["stableValue"])
    checks.add(
        not any(
            int(release["id"]) == int(context.state["badReleaseId"]) for release in evidence["activeReleases"]
        )
    )
    checks.add(
        context.used("release list", "release rollback")
        and context.observed("PUT", r"/releases/\d+/rollback")
    )
    checks.add(distractor_unchanged(evidence))
    return checks.finish()
