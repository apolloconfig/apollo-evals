"""Fixture and grading contract for publishing one typed CLI configuration."""

from apollo_testkit.domain import (
    DISTRACTOR_CHECK,
    Random,
    base_definition,
    base_snapshot,
    distractor_unchanged,
    initialize_base,
)
from apollo_testkit.grading import Checks, CliEvidence

NAME = "cli-config-publish"
CATEGORY = "cli"
LABEL = "cli-set"
CHECKS = (
    ("item value and type", "outcome"),
    ("active release contains value", "outcome"),
    ("Config Service exposes value", "outcome"),
    ("used apollo config set and release create", "interaction"),
    DISTRACTOR_CHECK,
)


def definition(seed):
    state = base_definition(NAME, LABEL, seed)
    rng = Random(seed)
    state["public"].update(value=str(rng.integer(10000, 99999)), type=1, releaseTitle=rng.token("release", 8))
    return state


def initialize(api, state):
    return initialize_base(api, state, token=True)


def snapshot(api, state):
    return base_snapshot(api, state)


def grade(evidence, requests, commands, trajectory=()):
    context = CliEvidence(evidence, requests, commands, trajectory)
    public, key = context.public, context.public["key"]
    checks = Checks(CHECKS)
    checks.add(context.item.get("value") == public["value"] and context.item.get("type") == public["type"])
    checks.add(context.release.get(key) == public["value"])
    checks.add(context.config.get(key) == public["value"])
    checks.add(context.used("config set", "release create"))
    checks.add(distractor_unchanged(evidence))
    return checks.finish()


def unpublished_solution(task):
    solution = task / "solution/solve.py"
    solution.write_text(
        "\n".join(line for line in solution.read_text().splitlines() if 'run("release", "create"' not in line)
        + "\n"
    )


def raw_http_solution(task):
    (task / "solution/solve.py").write_text(
        """import json
from pathlib import Path
import urllib.request
p = json.loads(Path("/workspace/task.json").read_text())
base = p["portalUrl"] + "/openapi/v1/envs/LOCAL/apps/" + p["targetApp"] + "/clusters/default/namespaces/application"
def request(url, method, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method=method,
        headers={"Content-Type":"application/json", "Authorization":"Bearer " + p["token"]})
    with urllib.request.urlopen(req, timeout=30) as response:
        print(response.read().decode())
request(base + "/items?operator=apollo", "POST", {"key":p["key"], "value":p["value"], "type":p["type"], "dataChangeCreatedBy":"apollo", "dataChangeLastModifiedBy":"apollo"})
request(base + "/releases?operator=apollo", "POST", {"releaseTitle":p["releaseTitle"], "releasedBy":"apollo", "isEmergencyPublish":False})
"""
    )


NEGATIVE_CONTROLS = (
    ("cli-unpublished", unpublished_solution),
    ("cli-raw-http", raw_http_solution),
)
