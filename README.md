# Apollo Evals

[简体中文](README.zh-CN.md)

Apollo Evals measures how well agent harness and model combinations complete real Apollo CLI and Java Client tasks. It contains ten native Harbor tasks with sixty named checks, deterministic reference solutions, rejection controls, and separate verifier environments.

The evaluation control plane is Python 3.12. Java remains part of the evaluated product surface: Apollo Server is a Java service, and four tasks compile and run Apollo Java Client programs. The project has no Node.js or TypeScript runtime dependency.

## Quick start

Requirements:

- Python 3.12+
- `uv`
- Docker with Compose
- At least 4 CPUs and 8 GiB available to Docker
- Network access for the first image build

```bash
uv sync --frozen
export HARBOR_TELEMETRY=0
uv run python scripts/prepare.py
make check

# All ten deterministic reference solutions must receive reward 1.
uv run harbor run -c jobs/oracle.yaml --job-name apollo-oracle
uv run python scripts/report.py jobs-output/apollo-oracle

# All ten empty-agent trials must complete and receive reward 0.
uv run harbor run -c jobs/nop.yaml --job-name apollo-nop
uv run python scripts/report.py jobs-output/apollo-nop --reward 0

# Plausible wrong solutions must be rejected without verifier errors.
uv run python scripts/negative_controls.py
uv run harbor run -c jobs/negative.yaml --job-name apollo-negative
uv run python scripts/report.py jobs-output/apollo-negative --expected 3 --reward 0
```

Run one task directly:

```bash
uv run harbor trial start -p tasks/cli-config-publish -a oracle \
  --trial-name publish-oracle --trials-dir trials
```

Use a new job or trial name for each independent run. Do not infer success from the Harbor process exit code alone: `scripts/report.py` verifies completed trials, infrastructure status, expected rewards, and every case's named-check contract.

## Real-agent runs

The default smoke profile uses Harbor's built-in Codex adapter and an existing Codex login:

```bash
CODEX_AUTH_JSON_PATH="$HOME/.codex/auth.json" \
  uv run harbor run -c jobs/smoke.yaml --job-name apollo-smoke
uv run python scripts/report.py jobs-output/apollo-smoke
```

`jobs/benchmark.yaml` runs three attempts per task. Task data seeds and model-sampling attempts are separate dimensions: repeated attempts use the same fixture so agent/model behavior can be compared under the same task inputs.

`jobs/claude-code.yaml` is an additional Harbor Claude Code profile. Configure its provider URL, authentication, and model for your account before running it.

If model access requires a host proxy, pass it explicitly with Harbor's `--ae HTTPS_PROXY=... --ae HTTP_PROXY=... --ae NO_PROXY=localhost,127.0.0.1,gateway,apollo`. Container loopback does not reach the host. Personal proxy settings and credentials are never stored in task definitions or images.

## How a task runs

Each `tasks/<name>/` is a complete Harbor task containing:

- `instruction.md` and `task.toml`;
- an execution Compose environment;
- a task-local `case.py` defining fixture and grading semantics;
- a deterministic `solution/` used by the Oracle agent;
- a separate verifier image and `tests/test.sh` entrypoint.

During execution, the agent runs in a `main` container. A separate `gateway` container initializes an isolated Apollo instance, exposes only the permitted business APIs, and records server-side evidence. After execution, Harbor destroys that environment and grades the collected submission and evidence in a fresh verifier environment.

CLI cases validate Apollo state, releases, namespace metadata, required CLI interactions, and unchanged boundaries. Java cases compile submitted source offline and run it against both the task fixture and a hidden second data variant.

A task receives reward 1 only when every declared `outcome`, `interaction`, and `boundary` check passes. Any failed check produces reward 0.

## Repository map

| Path | Purpose |
| --- | --- |
| `tasks/` | The ten self-contained evaluation tasks. |
| `jobs/` | Harbor configurations for Oracle, NOP, smoke, benchmark, and negative controls. |
| `apollo_testkit/` | Shared Apollo access, gateway, case loading, evidence, and grading mechanisms. |
| `images/` | Agent, control, and verifier image definitions plus bootstrap helpers. |
| `scripts/` | Image preparation, result validation, and negative-control materialization. |
| `docs/architecture.md` | Runtime topology, image roles, gateway endpoints, trust boundaries, and the `case.py` contract. |
| `docs/validation.md` | Reproducible acceptance procedure and report-gate rules. |

See [Architecture](docs/architecture.md) for implementation details and [Validation](docs/validation.md) for the complete verification workflow.

## Adding or changing a case

1. Create or update one directory under `tasks/`.
2. Keep all task-specific fixture, snapshot, grading, and optional negative-control logic in its `case.py`.
3. Keep reusable transport and execution mechanisms in `apollo_testkit`.
4. Run `make check`, Oracle, NOP, negative controls, and a real-agent smoke before publishing task changes.

`scripts/prepare.py` builds the three local images and records their IDs and source hashes in `.cache/images.json`. Rebuild after changing `images/`, `apollo_testkit/`, or any `case.py`; use Harbor's `--force-build` when task images were built from an older local base image.
