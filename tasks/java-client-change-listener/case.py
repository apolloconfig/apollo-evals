"""Fixture and grading contract for Apollo Java Client change listeners."""

import re

from apollo_testkit.domain import (
    DISTRACTOR_CHECK,
    Random,
    base_definition,
    base_snapshot,
    initialize_base,
)
from apollo_testkit.grading import Checks

NAME = "java-client-change-listener"
CATEGORY = "java-client"
LABEL = "java-listener"
JAVA_CLASS = "ChangeListenerApp"
VARIANT_CHECKS = (
    ("locked apollo-client dependency", "interaction"),
    ("uses Apollo change listener API", "interaction"),
    ("program compiles offline", "outcome"),
    ("ready exposes initial value", "outcome"),
    ("listener reports exact change", "outcome"),
    ("program exits normally", "outcome"),
)
CHECKS = VARIANT_CHECKS + (DISTRACTOR_CHECK,)


def definition(seed):
    state = base_definition(NAME, LABEL, seed)
    rng = Random(seed)
    state["public"].update(mavenRepo="/m2", apolloJavaVersion="2.5.0")
    state.update(initialValue=rng.token("initial", 10), newValue=rng.token("updated", 10))
    return state


def initialize(api, state):
    initialize_base(api, state)
    public = state["public"]
    api.put(public["targetApp"], public["key"], state["initialValue"])
    api.release(public["targetApp"], "listener-initial")
    return state


def snapshot(api, state):
    return base_snapshot(api, state)


def grade_variant(context):
    public = context.state["public"]
    checks = Checks(VARIANT_CHECKS)
    checks.add(context.dependency_ok)
    checks.add(bool(re.search(r"addChangeListener\s*\(", context.source)) and not context.uses_http)
    checks.add(context.compiled)
    ready, change, code, output = context.listen([public["targetApp"], "application", public["key"]])
    checks.add(ready is not None and ready.get("value") == context.state["initialValue"], ready)
    checks.add(
        change is not None
        and all(
            change.get(key) == value
            for key, value in {
                "key": public["key"],
                "oldValue": context.state["initialValue"],
                "newValue": context.state["newValue"],
                "changeType": "MODIFIED",
            }.items()
        ),
        change,
    )
    checks.add(code == 0, output)
    return checks.finish()
