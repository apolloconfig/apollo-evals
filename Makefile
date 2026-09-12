export HARBOR_TELEMETRY := 0

.PHONY: prepare check oracle nop smoke benchmark
prepare:
	uv sync --frozen
	uv run python scripts/prepare.py
check:
	uv run ruff check apollo_testkit tests scripts images tasks/*/case.py
	uv run ruff format --check apollo_testkit tests scripts images tasks/*/case.py
	uv run pytest -q
oracle:
	uv run harbor run -c jobs/oracle.yaml
	uv run python scripts/report.py jobs-output/apollo-oracle
nop:
	uv run harbor run -c jobs/nop.yaml
	uv run python scripts/report.py jobs-output/apollo-nop --reward 0
smoke:
	uv run harbor run -c jobs/smoke.yaml
	uv run python scripts/report.py jobs-output/apollo-smoke
benchmark:
	uv run harbor run -c jobs/benchmark.yaml
	uv run python scripts/report.py jobs-output/apollo-benchmark --expected 30
