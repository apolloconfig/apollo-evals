"""Fixture and grading contract for exact cluster configuration synchronization."""

from apollo_testkit.domain import (
    DISTRACTOR_CHECK,
    Random,
    base_definition,
    base_snapshot,
    distractor_unchanged,
    initialize_base,
)
from apollo_testkit.grading import Checks, CliEvidence

NAME = "cli-config-sync-release"
CATEGORY = "cli"
LABEL = "cli-sync"
CHECKS = (
    ("target added updated and deleted exactly", "outcome"),
    ("target active release equals source", "outcome"),
    ("source remained unchanged", "boundary"),
    ("used config diff, apply, delete, and target release create", "interaction"),
    DISTRACTOR_CHECK,
)


def definition(seed):
    state = base_definition(NAME, LABEL, seed)
    rng = Random(seed)
    state["public"]["targetCluster"] = rng.token("canary", 6).lower()
    state["expected"] = {
        state["public"]["key"]: rng.token("updated", 8),
        rng.token("created-key", 6): rng.token("created-value", 8),
        rng.token("kept-key", 6): rng.token("kept-value", 8),
    }
    state["public"]["releaseTitle"] = rng.token("sync-release", 8)
    return state


def initialize(api, state):
    initialize_base(api, state, token=True)
    public = state["public"]
    for key, value in state["expected"].items():
        api.put(public["targetApp"], key, value)
    api.release(public["targetApp"], "source-current")
    api.cluster(public["targetApp"], public["targetCluster"])
    api.put(public["targetApp"], public["key"], "stale-value", cluster=public["targetCluster"])
    api.put(public["targetApp"], "obsolete.key", "delete-me", cluster=public["targetCluster"])
    api.release(public["targetApp"], "target-stale", cluster=public["targetCluster"])
    return state


def snapshot(api, state):
    result = base_snapshot(api, state)
    result["source"] = api.snapshot_namespace(state["public"]["targetApp"])
    return result


def grade(evidence, requests, commands, trajectory=()):
    context = CliEvidence(evidence, requests, commands, trajectory)
    actual = {key: value["value"] for key, value in context.items.items()}
    source = {item["key"]: item["value"] for item in evidence["source"]["items"] if item.get("key")}
    checks = Checks(CHECKS)
    checks.add(actual == context.state["expected"], actual)
    checks.add(context.release == context.state["expected"])
    checks.add(source == context.state["expected"])
    checks.add(context.used("config diff", "config apply", "config delete", "release create"))
    checks.add(distractor_unchanged(evidence))
    return checks.finish()
