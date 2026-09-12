"""Fixture and grading contract for a private Apollo namespace."""

import json

from apollo_testkit.domain import (
    DISTRACTOR_CHECK,
    Random,
    base_definition,
    base_snapshot,
    distractor_unchanged,
    initialize_base,
)
from apollo_testkit.grading import Checks, CliEvidence

NAME = "cli-namespace-create-publish"
CATEGORY = "cli"
LABEL = "cli-namespace"
CHECKS = (
    ("private properties AppNamespace metadata", "outcome"),
    ("namespace item value and type", "outcome"),
    ("active release contains value", "outcome"),
    ("Config Service exposes value", "outcome"),
    ("used namespace create, config set, and release create", "interaction"),
    DISTRACTOR_CHECK,
)


def definition(seed):
    state = base_definition(NAME, LABEL, seed)
    rng = Random(seed)
    value = json.dumps(
        {"enabled": True, "percentage": rng.integer(10, 90), "label": rng.token("variant", 8)},
        separators=(",", ":"),
    )
    state["public"].update(
        value=value,
        namespaceName=rng.token("feature", 8).lower(),
        type=3,
        releaseTitle=rng.token("namespace-release", 8),
    )
    return state


def initialize(api, state):
    return initialize_base(api, state, token=True)


def snapshot(api, state):
    result = base_snapshot(api, state)
    result["appNamespaces"] = api.request(f"/openapi/v1/apps/{state['public']['targetApp']}/appnamespaces")
    return result


def grade(evidence, requests, commands, trajectory=()):
    context = CliEvidence(evidence, requests, commands, trajectory)
    public, key = context.public, context.public["key"]
    metadata = next(
        (item for item in evidence["appNamespaces"] if item["name"] == public["namespaceName"]), {}
    )
    checks = Checks(CHECKS)
    checks.add(metadata.get("format", "").lower() == "properties" and metadata.get("isPublic") is False)
    checks.add(context.item.get("value") == public["value"] and context.item.get("type") == public["type"])
    checks.add(context.release.get(key) == public["value"])
    checks.add(context.config.get(key) == public["value"])
    checks.add(context.used("namespace create", "config set", "release create"))
    checks.add(distractor_unchanged(evidence))
    return checks.finish()
