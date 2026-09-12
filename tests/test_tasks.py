from pathlib import Path

import yaml
from harbor.models.job.config import JobConfig
from harbor.models.task.task import Task

from apollo_testkit.catalog import case_names, definition, load_case


def test_native_tasks_are_independent_harbor_tasks():
    tasks = sorted(Path("tasks").iterdir())
    assert len(tasks) == 10
    assert set(case_names()) == {path.name for path in tasks}
    for path in tasks:
        case = load_case(path.name)
        task = Task(path)
        assert task.config.verifier.environment_mode.value == "separate"
        assert task.config.agent.user == "agent"
        assert task.config.metadata["seed"] > 0
        instruction = (path / "instruction.md").read_text()
        assert "{{" not in instruction
        public = definition(path.name, task.config.metadata["seed"])["public"]
        assert (public["targetApp"] in instruction) == (path.name != "cli-auth-capability-scope")
        compose = yaml.safe_load((path / "environment/docker-compose.yaml").read_text())
        assert set(compose["services"]) == {"main", "gateway", "apollo"}
        gateway_env = compose["services"]["gateway"]["environment"]
        assert gateway_env["APOLLO_TASK"] == path.name
        assert int(gateway_env["APOLLO_SEED"]) == task.config.metadata["seed"]
        assert compose["services"]["main"]["networks"] == ["frontend"]
        assert compose["services"]["apollo"]["networks"] == ["backend"]
        assert compose["networks"]["backend"]["internal"]
        assert "import_path" not in (path / "task.toml").read_text()
        assert case.CATEGORY == task.config.metadata["category"]


def test_jobs_use_builtin_agents_environments_and_verifier():
    for path in Path("jobs").glob("*.yaml"):
        config = JobConfig.model_validate(yaml.safe_load(path.read_text()))
        assert config.environment.type == "docker"
        assert config.environment.import_path is None
        assert config.verifier.import_path is None
        assert config.retry.max_retries == 0
        for agent in config.agents:
            assert agent.name in ("oracle", "nop", "codex", "claude-code")
            assert agent.import_path is None
