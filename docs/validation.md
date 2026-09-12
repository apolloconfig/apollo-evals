# Validation

Validation has four layers: static tests, deterministic reference solutions, rejection controls, and a real-agent smoke run. Generated job outputs stay local and are not committed.

## Prerequisites

- Python 3.12+
- `uv`
- Docker with Compose
- A Docker environment with at least 4 CPUs and 8 GiB of memory
- Network access for the initial pinned-artifact and image download

Prepare dependencies and images:

```bash
uv sync --frozen
export HARBOR_TELEMETRY=0
uv run python scripts/prepare.py
make check
```

`make check` runs Ruff, formatting verification, unit tests, task structure validation, case loading, and the 60-check catalog assertions.

## Oracle acceptance

The deterministic reference solution must pass every check in all ten tasks:

```bash
uv run harbor run -c jobs/oracle.yaml --job-name apollo-oracle
uv run python scripts/report.py jobs-output/apollo-oracle
```

Acceptance requires ten completed trials, no exceptions, all 60 named checks present, and reward 1 for every task.

## Empty-agent rejection

The NOP agent verifies that unchanged initial state cannot accidentally pass a task:

```bash
uv run harbor run -c jobs/nop.yaml --job-name apollo-nop
uv run python scripts/report.py jobs-output/apollo-nop --reward 0
```

All ten trials must complete normally and receive reward 0. Some boundary or static interaction checks may individually pass; at least one required check must fail in every task.

## Negative-control rejection

Task-local negative controls exercise plausible but incorrect solutions without changing the formal task directories:

```bash
uv run python scripts/negative_controls.py
uv run harbor run -c jobs/negative.yaml --job-name apollo-negative
uv run python scripts/report.py jobs-output/apollo-negative --expected 3 --reward 0
```

The current controls cover an unpublished CLI edit, a direct-HTTP solution that bypasses the required CLI, and a Java program that calls Apollo APIs but prints values tied to the visible fixture. All must finish without infrastructure exceptions and receive reward 0.

## Real-agent smoke

The smoke job uses Harbor's built-in Codex adapter and the configured account credentials:

```bash
CODEX_AUTH_JSON_PATH="$HOME/.codex/auth.json" \
  uv run harbor run -c jobs/smoke.yaml --job-name apollo-smoke
uv run python scripts/report.py jobs-output/apollo-smoke
```

This run consumes model quota. A release-quality smoke run should complete all ten tasks with no infrastructure errors; individual task rewards describe agent performance rather than verifier health.

## Report gate

`scripts/report.py` does not schedule or retry trials. It reads Harbor output and rejects a job when any of the following is true:

- the completed trial count differs from `--expected`;
- a trial has an agent, environment, or verifier exception;
- `checks.json` is missing;
- check names or categories differ from the owning case's `CHECKS` contract;
- the Harbor reward disagrees with the conjunction of named checks;
- a reward differs from the requested `--reward`;
- a full-catalog run omits a task or has unbalanced attempts;
- Harbor reports pending, running, cancelled, or errored trials.

Use a new `--job-name` for each independent run. Detailed results, trajectories, submitted files, and verifier diagnostics remain under `jobs-output/<job-name>/`; `scripts/prepare.py` records locally built image identities and source hashes in `.cache/images.json`.

## Supported scope

Local Docker Compose execution is the maintained path. Image definitions support Linux arm64 and amd64 for the Apollo CLI download. Cloud providers must support Compose tasks, service artifact collection, and a separate verifier environment before their results can be treated as equivalent validation.
