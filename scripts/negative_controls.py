#!/usr/bin/env python3
"""Materialize deliberately wrong solutions as native Harbor tasks for verifier acceptance."""

import json
import shutil
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from apollo_testkit.fixtures import definition


def copy_task(task, name):
    target = ROOT / ".cache/negative-tasks" / name
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(ROOT / "tasks" / task, target)
    return target


def main():
    target = copy_task("cli-config-publish", "cli-unpublished")
    solution = target / "solution/solve.py"
    solution.write_text(
        "\n".join(line for line in solution.read_text().splitlines() if 'run("release", "create"' not in line)
        + "\n"
    )
    target = copy_task("cli-config-publish", "cli-raw-http")
    (target / "solution/solve.py").write_text("""import json
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
""")
    target = copy_task("java-client-typed-read", "java-hardcoded")
    metadata = tomllib.loads((target / "task.toml").read_text())["metadata"]
    expected = definition("java-client-typed-read", metadata["seed"])["expected"]
    source = target / "solution/TypedRead.java"
    arguments = ", ".join(json.dumps(expected[key]) for key in ("string", "int", "boolean", "missing"))
    text = source.read_text()
    assert "s, i, b, m);" in text
    source.write_text(text.replace("s, i, b, m);", arguments + ");"))
    print("Generated three negative-control tasks under .cache/negative-tasks")


if __name__ == "__main__":
    main()
