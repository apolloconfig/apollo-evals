"""Fixture and grading contract for an Apollo public namespace."""

from apollo_testkit.domain import (
    DISTRACTOR_CHECK,
    Random,
    base_definition,
    base_snapshot,
    distractor_unchanged,
    initialize_base,
)
from apollo_testkit.grading import Checks, CliEvidence

NAME = "cli-public-namespace-share"
CATEGORY = "cli"
LABEL = "cli-public"
CHECKS = (
    ("public properties AppNamespace has exact name", "outcome"),
    ("shared item value and string type", "outcome"),
    ("shared release contains value", "outcome"),
    ("provider Config Service exposes value", "outcome"),
    ("consumer reads public Namespace value", "outcome"),
    ("used namespace, config, and release resource commands", "interaction"),
    ("consumer application baseline unchanged", "boundary"),
    DISTRACTOR_CHECK,
)


def definition(seed):
    state = base_definition(NAME, LABEL, seed)
    rng = Random(seed)
    state["public"]["consumerApp"] = rng.token("consumer", 10).lower()
    state["consumerBaseline"] = {
        "key": rng.token("consumer-baseline", 8).replace("-", ".", 1),
        "value": rng.token("consumer-value", 12),
    }
    state["public"].update(
        namespaceName=rng.token("shared", 10).lower(),
        value=rng.token("shared-value", 12),
        releaseTitle=rng.token("shared-release", 8),
    )
    return state


def initialize(api, state):
    initialize_base(api, state, token=True)
    public = state["public"]
    api.create_app(public["consumerApp"])
    api.put(public["consumerApp"], **state["consumerBaseline"])
    api.release(public["consumerApp"], "consumer-baseline")
    return state


def snapshot(api, state):
    result = base_snapshot(api, state)
    public = state["public"]
    result["appNamespaces"] = api.request(f"/openapi/v1/apps/{public['targetApp']}/appnamespaces")
    result["consumer"] = api.configuration(public["consumerApp"], public["namespaceName"])
    result["consumerBaseline"] = api.configuration(public["consumerApp"])
    return result


def grade(evidence, requests, commands, trajectory=()):
    context = CliEvidence(evidence, requests, commands, trajectory)
    public, key = context.public, context.public["key"]
    metadata = next(
        (item for item in evidence["appNamespaces"] if item["name"] == public["namespaceName"]), {}
    )
    baseline = context.state["consumerBaseline"]
    checks = Checks(CHECKS)
    checks.add(metadata.get("format", "").lower() == "properties" and metadata.get("isPublic") is True)
    checks.add(context.item.get("value") == public["value"] and context.item.get("type") == 0)
    checks.add(context.release.get(key) == public["value"])
    checks.add(context.config.get(key) == public["value"])
    checks.add(evidence["consumer"].get(key) == public["value"])
    checks.add(context.used("namespace create", "config set", "release create"))
    checks.add(evidence["consumerBaseline"].get(baseline["key"]) == baseline["value"])
    checks.add(distractor_unchanged(evidence))
    return checks.finish()
