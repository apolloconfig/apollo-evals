# Apollo Evals

[简体中文](README.zh-CN.md)

Apollo Evals measures how well **agent harness + model combinations** complete real Apollo CLI and Java Client tasks. The benchmark uses native [Harbor](https://github.com/harbor-framework/harbor) tasks, Docker Compose environments, installed agents, oracle solutions, and separate verifiers.

The repository contains ten tasks and sixty named checks. It has no custom evaluation runner, host-agent adapter, Harbor environment subclass, or TypeScript bridge.

## Run locally

Requirements: Python 3.12+, `uv`, Docker with Compose, and a Docker VM with at least 4 CPUs / 8 GiB. Product artifacts are downloaded; no Apollo checkout or host Java/Node toolchain is required. Initial image builds need network access. Validation currently covers Linux arm64 on macOS / Colima; other architectures and cloud environments are unverified. The shared image preinstalls the default Codex CLI 0.144.1 to avoid downloading it for every trial; Harbor still owns agent configuration and execution.

```bash
uv sync --frozen
export HARBOR_TELEMETRY=0
uv run python scripts/prepare.py
uv run pytest -q

# Deterministic reference solutions: all ten tasks should receive reward 1.
uv run harbor run -c jobs/oracle.yaml
uv run python scripts/report.py jobs-output/apollo-oracle

# Empty agents: all ten tasks should receive reward 0 without infrastructure errors.
uv run harbor run -c jobs/nop.yaml
uv run python scripts/report.py jobs-output/apollo-nop --reward 0

# Use the built-in Codex agent with existing Codex authentication.
CODEX_AUTH_JSON_PATH="$HOME/.codex/auth.json" uv run harbor run -c jobs/smoke.yaml
uv run python scripts/report.py jobs-output/apollo-smoke --baseline docs/archive/origin-f312d66-baseline.json
```

Use a new `--job-name` when starting another independent evaluation. The examples use Harbor's native CLI; the report command is a post-run acceptance gate and never schedules or retries trials. Do not infer successful evaluation from the Harbor CLI exit code alone: require complete trials, no infrastructure errors, the expected reward, and the full check contract.

Run one task directly:

```bash
uv run harbor run -p tasks/cli-config-publish -a oracle --job-name publish-oracle --jobs-dir jobs-output
uv run python scripts/report.py jobs-output/publish-oracle --expected 1
```

If model access requires a host proxy, pass it explicitly with Harbor's `--ae HTTPS_PROXY=... --ae HTTP_PROXY=... --ae NO_PROXY=localhost,127.0.0.1,gateway,apollo`. Container loopback does not reach the host; Colima exposes the host as `host.lima.internal`. Use the port from your own proxy configuration. Personal proxy settings are not stored in tasks or images.

`jobs/claude-code.yaml` provides the existing DeepSeek profile through Harbor's native Claude Code adapter; configure `ANTHROPIC_BASE_URL` and the appropriate authentication for your provider. This profile is separate from the Codex acceptance smoke.

`jobs/benchmark.yaml` repeats each task three times with the same task data. Model sampling attempts and fixture seeds are separate dimensions. Authentication stays in runtime environment variables, outside task files and images. Harbor's built-in Claude Code adapter also accepts OAuth or API authentication; supply the model and provider appropriate to your account.

See [the native design](docs/harbor-native-design.md) for lifecycle and ownership details and [the validation report](docs/harbor-native-validation.md) for the 10/10 native smoke and baseline comparison.

## Task and environment design

Every `tasks/<name>/` is a Harbor task: `instruction.md`, `task.toml`, `environment/`, `solution/`, and `tests/`. Each trial gets its own Apollo instance and in-memory database. A gateway prepares fixtures and exposes only business APIs on the agent network. Apollo's management endpoints remain on a private backend network.

Harbor installs and runs the selected agent in the `main` container as the unprivileged `agent` user. Agent environments contain the pinned Apollo CLI 0.1.0 and offline Maven dependencies for Apollo Java Client 2.5.0. The `apollo` launcher executes the unmodified release binary, supplies the scoped task credential, and records command arguments.

After the agent finishes, Harbor collects the gateway's authoritative state snapshot and request log, tears down the execution environment, and starts a separate verifier:

- **CLI tasks:** inspect server-side configuration, releases, namespace metadata and unchanged boundaries; corroborate CLI command traces with actual server requests.
- **Java tasks:** transfer only source files and the POM, compile offline in a fresh environment, and run against a fresh Apollo instance using both the original fixture and a second hidden fixture. Agent build outputs, caches, credentials, and tools are not reused.

`apollo_testkit` supplies only domain setup, observation and grading functions. Its grader is invoked by native `tests/test.sh`, producing `/logs/verifier/reward.txt` and `checks.json`. Unexpected setup or verifier errors do not emit a success reward.

## Scoring and evidence

A task receives 1 only if every outcome, interaction and boundary check passes; otherwise it receives 0. The post-run acceptance gate additionally rejects timeouts, missing trials, incomplete diagnostics, and infrastructure failures. Native Harbor results and trajectories remain the source of execution metadata.

The sixty check names preserve the original benchmark contract. Java grading is stricter: results must also hold for a second data variant. Instructions now describe container-local tools, so previous host-agent scores are historical baselines, not identical experiments. See [the legacy smoke report](docs/archive/legacy-smoke.md).

CLI command traces and agent trajectories are diagnostic evidence under the agent's control, corroborated with independent service-side requests. They reject ordinary wrong-tool solutions but are not an attestation system against an adversarial agent forging its own traces. Tests and expected values are kept outside the agent image.

Run representative negative controls without modifying the real tasks:

```bash
uv run python scripts/negative_controls.py
uv run harbor run -c jobs/negative.yaml
uv run python scripts/report.py jobs-output/apollo-negative --expected 3 --reward 0
```

## Authoring and maintenance

1. Add a native task directory with a clear instruction and fixed seed in metadata and fixture environment.
2. Implement the Apollo fixture and checks, plus a self-contained reference solution. Register check names and categories in `tests/fixtures/legacy-checks.json`, the preserved benchmark contract used by the report gate.
3. Require oracle success, NOP failure, and rejection of representative wrong solutions.
4. Run a real agent smoke before changing a task version or publishing a result.

Build helpers produce local shared images; those images have not been published to a registry. `scripts/prepare.py` records resolved image identities and source hashes in `.cache/images.json`. Rebuild them after changing `images/` or `apollo_testkit/`; use Harbor's `--force-build` when task images were previously built against an older shared image. Cloud providers need verified Compose and separate-verifier support.
