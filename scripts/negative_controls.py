#!/usr/bin/env python3
"""Materialize task-owned wrong solutions as native Harbor tasks."""

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from apollo_testkit.catalog import negative_controls


def copy_task(task, name):
    target = ROOT / ".cache/negative-tasks" / name
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(ROOT / "tasks" / task, target)
    return target


def main():
    output = ROOT / ".cache/negative-tasks"
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    controls = list(negative_controls())
    for task, name, mutate in controls:
        mutate(copy_task(task, name))
    print(f"Generated {len(controls)} negative-control tasks under .cache/negative-tasks")


if __name__ == "__main__":
    main()
