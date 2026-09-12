"""Fixture and grading contract for Apollo cluster precedence."""

from apollo_testkit.domain import (
    DISTRACTOR_CHECK,
    Random,
    base_definition,
    base_snapshot,
    initialize_base,
)
from apollo_testkit.grading import Checks, json_output

NAME = "java-client-cluster-precedence"
CATEGORY = "java-client"
LABEL = "java-cluster"
JAVA_CLASS = "ClusterPrecedence"
VARIANT_CHECKS = (
    ("locked apollo-client dependency", "interaction"),
    ("uses cluster-aware Apollo Java Client read", "interaction"),
    ("program compiles offline", "outcome"),
    ("preferred cluster overrides default", "outcome"),
    ("missing cluster falls back to default", "outcome"),
)
CHECKS = VARIANT_CHECKS + (DISTRACTOR_CHECK,)


def definition(seed):
    state = base_definition(NAME, LABEL, seed)
    rng = Random(seed)
    state["public"].update(
        preferredCluster=rng.token("canary", 8).lower(),
        missingCluster=rng.token("missing", 8).lower(),
        mavenRepo="/m2",
        apolloJavaVersion="2.5.0",
    )
    state["expected"] = {
        "preferredValue": rng.token("cluster-value", 12),
        "defaultValue": rng.token("default-value", 12),
    }
    return state


def initialize(api, state):
    initialize_base(api, state)
    public = state["public"]
    api.put(public["targetApp"], public["key"], state["expected"]["defaultValue"])
    api.release(public["targetApp"], "default-cluster-baseline")
    api.cluster(public["targetApp"], public["preferredCluster"])
    api.put(
        public["targetApp"],
        public["key"],
        state["expected"]["preferredValue"],
        cluster=public["preferredCluster"],
    )
    api.release(
        public["targetApp"],
        "preferred-cluster-value",
        cluster=public["preferredCluster"],
    )
    return state


def snapshot(api, state):
    return base_snapshot(api, state)


def grade_variant(context):
    public = context.state["public"]
    checks = Checks(VARIANT_CHECKS)
    checks.add(context.dependency_ok)
    checks.add(context.explicit_config and "apollo.cluster" in context.source)
    checks.add(context.compiled)
    for cluster, expected in (
        (public["preferredCluster"], context.state["expected"]["preferredValue"]),
        (public["missingCluster"], context.state["expected"]["defaultValue"]),
    ):
        code, stdout, stderr = context.run(
            [public["targetApp"], "application", public["key"], cluster],
            cache_suffix=cluster,
        )
        checks.add(
            code == 0 and json_output(stdout) == {"cluster": cluster, "value": expected},
            stdout + stderr,
        )
    return checks.finish()
