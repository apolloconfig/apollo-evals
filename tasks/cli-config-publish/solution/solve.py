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
run("config", "set", *scope, p["key"], p["value"], "--type", str(p.get("type", 0)))
run("release", "create", *scope, "--title", p["releaseTitle"])
