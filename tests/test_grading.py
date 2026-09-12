import copy
from pathlib import Path

from apollo_testkit.catalog import case_names, definition, load_case, negative_controls
from apollo_testkit.grading import raw_http, safe_pom, trajectory_commands


def example():
    state = definition("cli-config-publish", 427860176)
    p = state["public"]
    evidence = {
        "state": state,
        "target": {
            "items": [{"key": p["key"], "value": p["value"], "type": p["type"]}],
            "release": {"configurations": {p["key"]: p["value"]}},
            "config": {p["key"]: p["value"]},
        },
        "distractor": {p["key"]: state["distractorValue"]},
    }
    requests = [{"method": "POST", "path": "/openapi/v1/releases", "status": 200, "surface": "portal"}]
    commands = [{"argv": ["config", "set"], "exitCode": 0}, {"argv": ["release", "create"], "exitCode": 0}]
    return evidence, requests, commands


def test_correct_publication_requires_service_state_and_commands():
    evidence, requests, commands = example()
    grade = load_case("cli-config-publish").grade
    assert all(c["passed"] for c in grade(evidence, requests, commands))
    for field in ("items", "release", "config"):
        wrong = copy.deepcopy(evidence)
        wrong["target"][field] = [] if field == "items" else {}
        assert not all(c["passed"] for c in grade(wrong, requests, commands))
    assert not all(c["passed"] for c in grade(evidence, [], commands))
    assert not all(c["passed"] for c in grade(evidence, requests, []))


def test_boundary_failure_cannot_be_compensated_by_outcomes():
    evidence, requests, commands = example()
    evidence["distractor"] = {}
    checks = load_case("cli-config-publish").grade(evidence, requests, commands)
    assert checks[-1]["category"] == "boundary" and not checks[-1]["passed"]


def test_raw_http_or_failed_cli_does_not_satisfy_interaction():
    evidence, requests, commands = example()
    grade = load_case("cli-config-publish").grade
    for command in [
        "curl http://gateway:8070/openapi/v1/foo",
        "sh -c 'curl example.org'",
        "apollo api put /items",
    ]:
        checks = grade(evidence, requests, commands, [command])
        assert not next(c for c in checks if c["category"] == "interaction")["passed"]
    commands[0]["exitCode"] = 1
    assert not all(c["passed"] for c in grade(evidence, requests, commands))


def test_only_tool_arguments_are_read_as_commands():
    trajectory = {
        "steps": [
            {
                "content": "I will use curl",
                "tool_calls": [{"function": {"arguments": '{"command":"apollo config set"}'}}],
            }
        ]
    }
    assert trajectory_commands(trajectory) == ["apollo config set"]
    assert not raw_http("echo curl")


def test_all_fixtures_are_deterministic_and_keep_private_values_private():
    for task in case_names():
        first, other = definition(task, 1234), definition(task, 1235)
        assert first == definition(task, 1234)
        assert first["public"]["targetApp"] != other["public"]["targetApp"]
        assert "expected" not in first["public"] and "distractorValue" not in first["public"]


def test_pom_rejects_alternate_dependency_and_executable_plugins(tmp_path):
    template = Path("images/pom.xml").read_text()
    file = tmp_path / "pom.xml"
    file.write_text(template)
    assert safe_pom(file)
    for broken in [
        template.replace("2.5.0", "2.4.0"),
        template.replace("maven-compiler-plugin", "exec-maven-plugin"),
    ]:
        file.write_text(broken)
        assert not safe_pom(file)


def test_original_check_contract_has_ten_tasks_and_sixty_checks():
    cases = [load_case(task) for task in case_names()]
    assert len(cases) == 10
    assert sum(len(case.CHECKS) for case in cases) == 60


def test_negative_controls_are_owned_by_their_cases():
    controls = [(task, name) for task, name, _ in negative_controls()]
    assert controls == [
        ("cli-config-publish", "cli-unpublished"),
        ("cli-config-publish", "cli-raw-http"),
        ("java-client-typed-read", "java-hardcoded"),
    ]


def test_capability_task_does_not_disclose_authorization_scope():
    from apollo_testkit.service import public_fixture

    state = definition("cli-auth-capability-scope", 1234)
    public = public_fixture(state)
    assert "targetApp" not in public and "distractorApp" not in public
    assert public["key"] == state["public"]["key"]
