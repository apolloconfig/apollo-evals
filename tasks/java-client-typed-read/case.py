"""Fixture and grading contract for typed Apollo Java Client reads."""

import json
import re
import tomllib

from apollo_testkit.domain import (
    DISTRACTOR_CHECK,
    Random,
    base_definition,
    base_snapshot,
    initialize_base,
)
from apollo_testkit.grading import Checks, json_output

NAME = "java-client-typed-read"
CATEGORY = "java-client"
LABEL = "java-typed"
JAVA_CLASS = "TypedRead"
VARIANT_CHECKS = (
    ("locked apollo-client dependency", "interaction"),
    ("explicit app and namespace ConfigService call", "interaction"),
    ("uses typed getters", "interaction"),
    ("program compiles offline", "outcome"),
    ("program reads correct typed values", "outcome"),
)
CHECKS = VARIANT_CHECKS + (DISTRACTOR_CHECK,)


def definition(seed):
    state = base_definition(NAME, LABEL, seed)
    rng = Random(seed)
    state["public"].update(
        stringKey=rng.token("str-key", 6),
        intKey=rng.token("int-key", 6),
        booleanKey=rng.token("bool-key", 6),
        missingKey=rng.token("missing-key", 6),
        mavenRepo="/m2",
        apolloJavaVersion="2.5.0",
    )
    state["expected"] = {
        "string": rng.token("string-value", 10),
        "int": rng.integer(100, 999),
        "boolean": rng.integer(0, 1) == 1,
        "missing": "fallback-value",
    }
    return state


def initialize(api, state):
    initialize_base(api, state)
    public = state["public"]
    for key_field, field in (("stringKey", "string"), ("intKey", "int"), ("booleanKey", "boolean")):
        value = state["expected"][field]
        api.put(
            public["targetApp"],
            public[key_field],
            str(value).lower() if isinstance(value, bool) else value,
        )
    api.release(public["targetApp"], "java-typed-values")
    return state


def snapshot(api, state):
    return base_snapshot(api, state)


def grade_variant(context):
    public = context.state["public"]
    checks = Checks(VARIANT_CHECKS)
    checks.add(context.dependency_ok)
    checks.add(context.explicit_config)
    checks.add(
        all(
            re.search(method + r"\s*\(", context.source)
            for method in ("getIntProperty", "getBooleanProperty", "getProperty")
        )
    )
    checks.add(context.compiled)
    code, stdout, stderr = context.run(
        [
            public["targetApp"],
            "application",
            public["stringKey"],
            public["intKey"],
            public["booleanKey"],
            public["missingKey"],
        ]
    )
    checks.add(code == 0 and json_output(stdout) == context.state["expected"], stdout + stderr)
    return checks.finish()


def hardcoded_solution(task):
    metadata = tomllib.loads((task / "task.toml").read_text())["metadata"]
    expected = definition(metadata["seed"])["expected"]
    source = task / "solution/TypedRead.java"
    arguments = ", ".join(json.dumps(expected[key]) for key in ("string", "int", "boolean", "missing"))
    text = source.read_text()
    assert "s, i, b, m);" in text
    source.write_text(text.replace("s, i, b, m);", arguments + ");"))


NEGATIVE_CONTROLS = (("java-hardcoded", hardcoded_solution),)
