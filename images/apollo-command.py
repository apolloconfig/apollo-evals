#!/usr/bin/env python3
"""Run the pinned, unmodified Apollo CLI and record arguments for interaction diagnostics.

The trace is agent-side evidence, corroborated with independent service-side requests.
It is not cryptographic proof against an adversarial agent modifying its own workspace.
"""

import json
import os
import subprocess
import sys
import time
from pathlib import Path

fixture = json.loads(Path("/workspace/task.json").read_text())
env = dict(os.environ)
env.setdefault("APOLLO_TOKEN", fixture.get("token", ""))
started = time.time()
result = subprocess.run(["/opt/apollo/bin/apollo", *sys.argv[1:]], env=env, check=False)
trace = Path("/logs/artifacts/cli-commands.jsonl")
trace.parent.mkdir(parents=True, exist_ok=True)
args = list(sys.argv[1:])
token = fixture.get("token", "")
if token:
    args = [value.replace(token, "[REDACTED]") for value in args]
for i, value in enumerate(args):
    if value in ("--token", "--access-token") and i + 1 < len(args):
        args[i + 1] = "[REDACTED]"
with trace.open("a") as stream:
    stream.write(json.dumps({"argv": args, "exitCode": result.returncode, "time": started}) + "\n")
sys.exit(result.returncode)
