# Apollo Evals

[English](README.md)

Apollo Evals 用于衡量不同 agent harness 与模型组合完成 Apollo CLI 和 Java Client 真实任务的能力。仓库包含 10 个 Harbor 原生任务、60 个具名检查、确定性参考解、错误解控制和独立判分环境。

评测控制层使用 Python 3.12，但被评测的产品能力不全是 Python：Apollo Server 是 Java 服务，其中 4 个任务会编译并运行 Apollo Java Client 程序。本项目不依赖 Node.js 或 TypeScript 运行时。

## 快速开始

环境要求：

- Python 3.12+
- `uv`
- Docker Compose
- Docker 至少可使用 4 核 CPU、8 GiB 内存
- 首次构建镜像时可以联网

```bash
uv sync --frozen
export HARBOR_TELEMETRY=0
uv run python scripts/prepare.py
make check

# 10 个确定性参考解都必须得到 reward 1。
uv run harbor run -c jobs/oracle.yaml --job-name apollo-oracle
uv run python scripts/report.py jobs-output/apollo-oracle

# 10 个空操作 trial 都必须正常结束并得到 reward 0。
uv run harbor run -c jobs/nop.yaml --job-name apollo-nop
uv run python scripts/report.py jobs-output/apollo-nop --reward 0

# 典型错误解必须在判分器正常工作的情况下被拒绝。
uv run python scripts/negative_controls.py
uv run harbor run -c jobs/negative.yaml --job-name apollo-negative
uv run python scripts/report.py jobs-output/apollo-negative --expected 3 --reward 0
```

单独运行一个任务：

```bash
uv run harbor trial start -p tasks/cli-config-publish -a oracle \
  --trial-name publish-oracle --trials-dir trials
```

每次独立运行应使用新的 job 或 trial 名称。不能只根据 Harbor 进程退出码判断成功；`scripts/report.py` 会检查 trial 数量、基础设施异常、预期 reward 和各 case 的完整具名检查契约。

## 真实 Agent 运行

默认 smoke 配置使用 Harbor 内置 Codex 适配器和已有 Codex 登录信息：

```bash
CODEX_AUTH_JSON_PATH="$HOME/.codex/auth.json" \
  uv run harbor run -c jobs/smoke.yaml --job-name apollo-smoke
uv run python scripts/report.py jobs-output/apollo-smoke
```

`jobs/benchmark.yaml` 为每个任务执行 3 次尝试。任务数据 seed 与模型采样次数是两个维度：重复尝试使用相同 fixture，以便在相同任务输入下观察 agent/model 行为。

`jobs/claude-code.yaml` 提供另一个 Harbor Claude Code profile；运行前需要按实际账号配置 provider URL、认证和模型。

如果模型访问依赖宿主机代理，通过 Harbor 的 `--ae HTTPS_PROXY=... --ae HTTP_PROXY=... --ae NO_PROXY=localhost,127.0.0.1,gateway,apollo` 显式传入。容器中的 loopback 不能访问宿主机。任务和镜像不会保存个人代理设置或认证信息。

## 任务如何执行

每个 `tasks/<name>/` 都是完整的 Harbor 任务，包含：

- `instruction.md` 与 `task.toml`；
- 执行阶段的 Compose 环境；
- 定义 fixture 与判分语义的任务内 `case.py`；
- 供 Oracle agent 使用的确定性 `solution/`；
- 独立 verifier 镜像和 `tests/test.sh` 入口。

执行阶段，Agent 运行在 `main` 容器中。独立的 `gateway` 容器负责初始化隔离的 Apollo 实例、只开放允许的业务接口，并记录服务端证据。Agent 结束后，Harbor 销毁执行环境，再在全新的 verifier 环境中对收集到的提交和证据进行判分。

CLI case 会验证 Apollo 状态、发布、命名空间元数据、规定的 CLI 交互和未被修改的边界。Java case 会离线编译提交的源码，并分别使用任务数据与第二组隐藏数据运行。

只有全部 `outcome`、`interaction` 和 `boundary` 检查通过时，任务才得到 reward 1；任意一项失败即为 0。

## 仓库结构

| 路径 | 用途 |
| --- | --- |
| `tasks/` | 10 个自包含评测任务。 |
| `jobs/` | Oracle、NOP、smoke、benchmark 和 negative control 的 Harbor 配置。 |
| `apollo_testkit/` | 共享的 Apollo 访问、gateway、case 加载、证据和判分机制。 |
| `images/` | Agent、control、verifier 镜像定义及启动辅助程序。 |
| `scripts/` | 镜像准备、结果验收和错误解生成。 |
| `docs/architecture.md` | 运行拓扑、镜像职责、gateway 接口、信任边界和 `case.py` 契约。 |
| `docs/validation.md` | 可复现验收流程与报告门禁规则。 |

完整实现说明见[架构文档](docs/architecture.md)，验收步骤见[验证文档](docs/validation.md)。

## 新增或修改 case

1. 在 `tasks/` 下新增或修改一个任务目录。
2. 所有任务专属的 fixture、snapshot、判分和可选负例逻辑都放在该目录的 `case.py`。
3. 可跨任务复用的传输和执行机制才放进 `apollo_testkit`。
4. 发布任务变更前运行 `make check`、Oracle、NOP、negative controls 和真实 Agent smoke。

`scripts/prepare.py` 构建三个本地镜像，并把镜像 ID 与源码哈希写入 `.cache/images.json`。修改 `images/`、`apollo_testkit/` 或任何 `case.py` 后需要重新构建；若任务镜像基于旧的本地基础镜像构建，可使用 Harbor 的 `--force-build`。
