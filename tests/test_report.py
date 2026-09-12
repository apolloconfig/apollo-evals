import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location("report", Path("scripts/report.py"))
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)


def job(tmp_path, *, exception=None, reward=1, checks=None):
    contract = json.loads(Path("tests/fixtures/legacy-checks.json").read_text())["cli-config-publish"]
    trial = tmp_path / "trial"
    (trial / "verifier").mkdir(parents=True)
    (tmp_path / "result.json").write_text(json.dumps({"stats": {"n_completed_trials": 1}}))
    (trial / "result.json").write_text(
        json.dumps(
            {
                "task_name": "apollo/cli-config-publish",
                "trial_name": "trial",
                "task_checksum": "abc",
                "agent_info": {"name": "codex", "version": "test"},
                "exception_info": exception,
                "verifier_result": {"rewards": {"reward": reward}},
            }
        )
    )
    (trial / "verifier/checks.json").write_text(
        json.dumps(
            {
                "seed": 123,
                "checks": checks if checks is not None else [dict(c, passed=True) for c in contract],
            }
        )
    )
    return tmp_path


def test_reward_one_does_not_hide_agent_timeout(tmp_path):
    path = job(tmp_path, exception={"exception_type": "AgentTimeoutError"})
    assert not report.summarize(path, 1)["accepted"]


def test_missing_trials_and_missing_checks_fail_acceptance(tmp_path):
    path = job(tmp_path)
    assert report.summarize(path, 1)["accepted"]
    assert not report.summarize(path, 10)["accepted"]
    (path / "trial/verifier/checks.json").unlink()
    assert not report.summarize(path, 1)["accepted"]


def test_duplicate_or_removed_check_fails_acceptance(tmp_path):
    path = job(tmp_path, checks=[])
    assert not report.summarize(path, 1)["accepted"]


def test_reward_cannot_override_failed_checks(tmp_path):
    contract = json.loads(Path("tests/fixtures/legacy-checks.json").read_text())["cli-config-publish"]
    path = job(tmp_path, checks=[dict(c, passed=False) for c in contract])
    assert not report.summarize(path, 1)["accepted"]


def test_baseline_comparison_detects_seed_and_check_drift():
    from copy import deepcopy

    from scripts.report import compare_baseline

    checks = [{"name": "actual value", "category": "outcome", "passed": True}]
    baseline = {
        "run": "baseline",
        "trials": [{"scenarioId": "task", "seed": 7, "status": "passed", "checks": checks}],
    }
    summary = {
        "trials": [{"task": "task", "seed": 7, "reward": 1, "exception": None, "checks": deepcopy(checks)}]
    }
    assert compare_baseline(summary, baseline)["equivalent_outcomes"]
    summary["trials"][0]["seed"] = 8
    summary["trials"][0]["checks"][0]["passed"] = False
    assert compare_baseline(summary, baseline)["differences"] == [
        "task: seed differs",
        "task: named check outcomes differ",
    ]


def test_reward_zero_cannot_hide_an_all_passing_negative_control(tmp_path):
    assert not report.summarize(job(tmp_path, reward=0), 1, reward=0)["accepted"]
