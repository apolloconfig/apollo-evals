"""Fixture and grading contract for mixed Apollo namespace formats."""

import base64
import json
import re

from apollo_testkit.domain import (
    DISTRACTOR_CHECK,
    Random,
    base_definition,
    base_snapshot,
    initialize_base,
)
from apollo_testkit.grading import Checks, json_output

NAME = "java-client-mixed-namespace-formats"
CATEGORY = "java-client"
LABEL = "java-formats"
JAVA_CLASS = "MixedNamespaceFormats"
VARIANT_CHECKS = (
    ("locked apollo-client dependency", "interaction"),
    ("uses normal and file Apollo Java Client reads", "interaction"),
    ("uses typed YAML getters", "interaction"),
    ("program compiles offline", "outcome"),
    ("program reads YAML types and exact JSON file", "outcome"),
)
CHECKS = VARIANT_CHECKS + (DISTRACTOR_CHECK,)


def definition(seed):
    state = base_definition(NAME, LABEL, seed)
    rng = Random(seed)
    state["public"].update(
        yamlNamespace=rng.token("yaml", 8).lower() + ".yml",
        jsonNamespace=rng.token("json", 8).lower() + ".json",
        yamlBooleanKey="feature.enabled",
        yamlIntKey="feature.limit",
        mavenRepo="/m2",
        apolloJavaVersion="2.5.0",
    )
    enabled, limit = rng.integer(0, 1) == 1, rng.integer(100, 999)
    state["jsonText"] = json.dumps(
        {
            "mode": rng.token("mode", 8),
            "retries": rng.integer(2, 9),
            "enabled": rng.integer(0, 1) == 1,
        },
        separators=(",", ":"),
    )
    state["expected"] = {
        "yamlEnabled": enabled,
        "yamlLimit": limit,
        "jsonBase64": base64.b64encode(state["jsonText"].encode()).decode(),
    }
    return state


def initialize(api, state):
    initialize_base(api, state)
    public, expected = state["public"], state["expected"]
    for field, format_name in (("yamlNamespace", "yml"), ("jsonNamespace", "json")):
        name = public[field]
        api.app_namespace(public["targetApp"], name.rsplit(".", 1)[0], format_name)
        api.namespace(public["targetApp"], name)
        content = (
            f"feature:\n  enabled: {str(expected['yamlEnabled']).lower()}\n  limit: {expected['yamlLimit']}\n"
            if format_name == "yml"
            else state["jsonText"]
        )
        api.text(public["targetApp"], name, content)
        api.release(public["targetApp"], format_name + "-format-baseline", name)
    return state


def snapshot(api, state):
    return base_snapshot(api, state)


def grade_variant(context):
    public = context.state["public"]
    checks = Checks(VARIANT_CHECKS)
    checks.add(context.dependency_ok)
    checks.add(
        context.explicit_config
        and bool(re.search(r"getConfigFile\s*\(", context.source))
        and bool(re.search(r"ConfigFileFormat\s*\.\s*JSON", context.source))
    )
    checks.add(
        bool(re.search(r"getBooleanProperty\s*\(", context.source))
        and bool(re.search(r"getIntProperty\s*\(", context.source))
    )
    checks.add(context.compiled)
    code, stdout, stderr = context.run(
        [
            public["targetApp"],
            public["yamlNamespace"],
            public["jsonNamespace"],
            public["yamlBooleanKey"],
            public["yamlIntKey"],
        ]
    )
    checks.add(code == 0 and json_output(stdout) == context.state["expected"], stdout + stderr)
    return checks.finish()
