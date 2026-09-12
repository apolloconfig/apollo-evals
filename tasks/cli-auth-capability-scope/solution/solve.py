import json
from pathlib import Path
import subprocess
p = json.loads(Path("/workspace/task.json").read_text())
base = ["apollo", "--server", p["portalUrl"], "--output", "json", "--yes"]
def find_app(value):
    if isinstance(value, dict):
        if isinstance(value.get("appId"), str): return value["appId"]
        for child in value.values():
            result = find_app(child)
            if result: return result
    if isinstance(value, list):
        for child in value:
            result = find_app(child)
            if result: return result
    return None
capabilities = subprocess.run(base + ["auth", "capabilities"], text=True, capture_output=True, check=True)
p["targetApp"] = find_app(json.loads(capabilities.stdout))
assert p["targetApp"], capabilities.stdout
scope = ["--env", "LOCAL", "--app", p["targetApp"], "--cluster", "default", "--namespace", p.get("namespaceName", "application")]
def run(*args):
    result = subprocess.run(base + list(args), text=True, capture_output=True, check=True)
    print(result.stdout)
    return json.loads(result.stdout) if result.stdout.strip() else None
run("auth", "capabilities")
run("config", "set", *scope, p["key"], p["value"], "--type", str(p.get("type", 0)))
run("release", "create", *scope, "--title", p["releaseTitle"])
