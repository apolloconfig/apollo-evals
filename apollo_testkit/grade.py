"""Native tests/test.sh entrypoint for task-local graders and Harbor rewards."""

import json
import os
import shutil
import sys
from pathlib import Path

from .catalog import load_case
from .control import Apollo
from .domain import DISTRACTOR_CHECK, distractor_unchanged
from .grading import (
    WORKSPACE,
    JavaEvidence,
    check,
    read_json_lines,
    run_program,
    safe_pom,
    trajectory_commands,
    validate_checks,
)

EVIDENCE = Path("/var/lib/apollo-evals")
OUTPUT = Path("/logs/verifier")


def grade_java(case, evidence):
    state = evidence["state"]
    source_path = WORKSPACE / "src/main/java/scenario" / (case.JAVA_CLASS + ".java")
    source = source_path.read_text() if source_path.is_file() else ""
    dependency_ok = safe_pom(WORKSPACE / "pom.xml")

    # Symlinks and agent-built binaries are not accepted as submissions.
    paths = list(WORKSPACE.rglob("*"))
    safe_files = not any(path.is_symlink() for path in paths)
    for path in [WORKSPACE, *paths]:
        if not path.is_symlink():
            os.chown(path, 1000, 1000)
    shutil.rmtree(WORKSPACE / "target", ignore_errors=True)
    code, stdout, stderr = (
        run_program(
            [
                "mvn",
                "-o",
                "-q",
                "compile",
                "dependency:build-classpath",
                "-Dmdep.outputFile=target/classpath.txt",
            ],
            timeout=120,
        )
        if dependency_ok and safe_files
        else (-1, "", "Invalid project or symlink")
    )
    compiled = code == 0
    (OUTPUT / "compile.txt").write_text(stdout + stderr)
    classpath = (WORKSPACE / "target/classpath.txt").read_text().strip() if compiled else ""

    api = Apollo()
    api.ready()
    variants = []
    for index, seed in enumerate((state["seed"], state["seed"] ^ 0xA5A5A5A5)):
        fresh = case.initialize(api, case.definition(seed))
        context = JavaEvidence(
            state=fresh,
            api=api,
            compiled=compiled,
            source=source,
            dependency_ok=dependency_ok,
            classpath=classpath,
            variant=index,
            class_name=case.JAVA_CLASS,
        )
        variants.append(case.grade_variant(context))

    merged = []
    for first, second in zip(*variants, strict=True):
        assert (first["name"], first["category"]) == (second["name"], second["category"])
        merged.append(
            check(
                first["name"],
                first["category"],
                first["passed"] and second["passed"],
                {"original": first, "hidden_variant": second},
            )
        )
    merged.append(check(*DISTRACTOR_CHECK, distractor_unchanged(evidence)))
    (OUTPUT / "variants.json").write_text(json.dumps(variants, ensure_ascii=False, indent=2))
    return merged


def main(task):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    case = load_case(task)
    evidence = json.loads((EVIDENCE / "snapshot.json").read_text())
    if evidence["state"]["task"] != task:
        raise ValueError("Snapshot belongs to a different task")
    if case.CATEGORY == "cli":
        requests = read_json_lines(EVIDENCE / "requests.jsonl")
        commands = read_json_lines(Path("/logs/artifacts/cli-commands.jsonl"))
        trajectory_path = Path("/logs/agent/trajectory.json")
        trajectory = (
            trajectory_commands(json.loads(trajectory_path.read_text())) if trajectory_path.exists() else []
        )
        checks = case.grade(evidence, requests, commands, trajectory)
    else:
        checks = grade_java(case, evidence)
    validate_checks(case.CHECKS, checks)
    passed = bool(checks) and all(result["passed"] for result in checks)
    result = {"task": task, "seed": evidence["state"]["seed"], "passed": passed, "checks": checks}
    (OUTPUT / "checks.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
    (OUTPUT / "reward.txt").write_text("1\n" if passed else "0\n")
    print(json.dumps({"task": task, "passed": passed, "checks": len(checks)}))


if __name__ == "__main__":
    main(sys.argv[1])
