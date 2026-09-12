import json
from pathlib import Path
import subprocess
p = json.loads(Path("/workspace/task.json").read_text())
base = ["apollo", "--server", p["portalUrl"], "--output", "json", "--yes"]
scope = ["--env", "LOCAL", "--app", p["targetApp"], "--cluster", "default", "--namespace", p.get("namespaceName", "application")]
def run(*args):
    result = subprocess.run(base + list(args), text=True, capture_output=True, check=True)
    print(result.stdout)
    return json.loads(result.stdout) if result.stdout.strip() else None
data = run("release", "list", *scope)
def releases(value):
    if isinstance(value, dict):
        if "id" in value and ("name" in value or "configurations" in value):
            yield value
        for child in value.values():
            yield from releases(child)
    elif isinstance(value, list):
        for child in value:
            yield from releases(child)
entries = list(releases(data))
assert entries, data
run("release", "rollback", "--env", "LOCAL", str(max(int(r["id"]) for r in entries)))
