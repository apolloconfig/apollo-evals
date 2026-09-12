#!/usr/bin/env python3
"""Read native Harbor results and apply the benchmark's completeness/acceptance gate."""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from apollo_testkit.catalog import all_contracts


def summarize(job, expected, reward=1):
    job_result = json.loads((job / "result.json").read_text())
    stats = job_result["stats"]
    errors = []
    trials = []
    contract = all_contracts()
    for path in sorted(job.glob("*/result.json")):
        result = json.loads(path.read_text())
        if "task_name" not in result:
            continue
        task = result["task_name"].split("/")[-1]
        exception = result.get("exception_info")
        check_path = path.parent / "verifier/checks.json"
        checks = json.loads(check_path.read_text()) if check_path.exists() else None
        rewards = (result.get("verifier_result") or {}).get("rewards") or {}
        actual_reward = rewards.get("reward")
        if exception:
            errors.append(f"{task}: {exception['exception_type']}")
        if checks is None:
            errors.append(f"{task}: missing checks.json")
        else:
            actual = Counter((c["name"], c["category"]) for c in checks["checks"])
            wanted = Counter((c["name"], c["category"]) for c in contract[task])
            if actual != wanted:
                errors.append(f"{task}: check contract changed")
            calculated_reward = int(bool(checks["checks"]) and all(c["passed"] for c in checks["checks"]))
            if actual_reward != calculated_reward:
                errors.append(f"{task}: reward contradicts named checks")
        if actual_reward != reward:
            errors.append(f"{task}: reward {actual_reward}, expected {reward}")
        trials.append(
            {
                "task": task,
                "trial": result["trial_name"],
                "reward": actual_reward,
                "agent": result["agent_info"],
                "exception": exception,
                "seed": checks["seed"] if checks else None,
                "checks": checks["checks"] if checks else [],
                "task_checksum": result["task_checksum"],
            }
        )
    if len({t["trial"] for t in trials}) != len(trials):
        errors.append("Duplicate trial identity")
    if len(trials) != expected:
        errors.append(f"Found {len(trials)} trials, expected {expected}")
    for key in ("n_errored_trials", "n_pending_trials", "n_running_trials", "n_cancelled_trials"):
        if stats.get(key, 0):
            errors.append(f"{key}: {stats[key]}")
    if expected >= len(contract) and not set(contract).issubset(t["task"] for t in trials):
        errors.append("The full task catalog is not covered")
    if expected >= len(contract) and expected % len(contract) == 0:
        counts = Counter(t["task"] for t in trials)
        if any(counts[task] != expected // len(contract) for task in contract):
            errors.append("Task attempt counts are unbalanced")
    return {
        "accepted": not errors,
        "expected_trials": expected,
        "completed_trials": len(trials),
        "passed_checks": sum(c["passed"] for t in trials for c in t["checks"]),
        "total_checks": sum(len(t["checks"]) for t in trials),
        "errors": errors,
        "trials": trials,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("job", type=Path)
    parser.add_argument("--expected", type=int, default=10)
    parser.add_argument("--reward", type=int, choices=(0, 1), default=1)
    args = parser.parse_args()
    result = summarize(args.job, args.expected, args.reward)
    output = args.job / "apollo-summary.json"
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k != "trials"}, ensure_ascii=False, indent=2))
    sys.exit(0 if result["accepted"] else 1)


if __name__ == "__main__":
    main()
