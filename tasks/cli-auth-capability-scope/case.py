"""Fixture and grading contract for capability-scoped Apollo CLI access."""

from apollo_testkit.domain import (
    DISTRACTOR_CHECK,
    Random,
    base_definition,
    base_snapshot,
    distractor_unchanged,
    initialize_base,
)
from apollo_testkit.grading import Checks, CliEvidence

NAME = "cli-auth-capability-scope"
CATEGORY = "cli"
LABEL = "cli-capability"
PRIVATE_PUBLIC_FIELDS = ("targetApp", "distractorApp")
CHECKS = (
    ("scoped item value and string type", "outcome"),
    ("scoped release contains value", "outcome"),
    ("Config Service exposes scoped value", "outcome"),
    ("queried token capabilities through Apollo CLI", "interaction"),
    ("used config and release resource commands", "interaction"),
    DISTRACTOR_CHECK,
)


def definition(seed):
    state = base_definition(NAME, LABEL, seed)
    rng = Random(seed)
    state["public"].update(value=rng.token("scoped-value", 12), releaseTitle=rng.token("scoped-release", 8))
    return state


def initialize(api, state):
    return initialize_base(api, state, token=True, scoped=True)


def snapshot(api, state):
    return base_snapshot(api, state)


def grade(evidence, requests, commands, trajectory=()):
    context = CliEvidence(evidence, requests, commands, trajectory)
    public, key = context.public, context.public["key"]
    checks = Checks(CHECKS)
    checks.add(context.item.get("value") == public["value"] and context.item.get("type") == 0)
    checks.add(context.release.get(key) == public["value"])
    checks.add(context.config.get(key) == public["value"])
    checks.add(
        context.used("auth capabilities")
        and context.observed("GET", r"/user-tokens/(?:current/)?capabilities")
    )
    checks.add(context.used("config set", "release create"))
    checks.add(distractor_unchanged(evidence))
    return checks.finish()
