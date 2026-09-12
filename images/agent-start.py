#!/usr/bin/env python3
"""Copy only public fixture data into the agent's workspace before Harbor starts it."""

import json
import os
import time
import urllib.request
from pathlib import Path

for _ in range(240):
    try:
        with urllib.request.urlopen("http://gateway:8070/_task", timeout=2) as response:
            data = json.load(response)
        Path("/workspace/task.json").write_text(json.dumps(data, ensure_ascii=False, indent=2))
        os.chown("/workspace/task.json", 1000, 1000)
        Path("/logs/artifacts").mkdir(parents=True, exist_ok=True)
        Path("/logs/artifacts/cli-commands.jsonl").touch()
        os.chown("/logs/artifacts/cli-commands.jsonl", 1000, 1000)
        Path("/tmp/task-ready").touch()
        os.execvp("sleep", ["sleep", "infinity"])
    except OSError:
        time.sleep(1)
raise SystemExit("Apollo fixture initialization timed out")
