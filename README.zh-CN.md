# Apollo Evals

[English](README.md)

Apollo Evals 旨在构建一套面向 Apollo 实际使用场景的评测框架与任务集，用于衡量不同 agent harness 与模型组合完成 Apollo 真实任务的能力。

本版本直接使用 [Harbor](https://github.com/harbor-framework/harbor) 的任务格式、Docker Compose 环境、内置 Agent、参考解和独立判分流程。仓库维护 10 个任务、60 个具名检查项，不再维护自建 runner、宿主机 Agent 适配器或 TypeScript 桥接。

## 本地运行

需要 Python 3.12+、`uv`、Docker Compose；Docker 虚拟机建议至少 4 核、8 GiB 内存。使用下载的产品制品，不要求本机安装 Apollo 源码、Java 或 Node 工具链。首次构建镜像需要联网。本次本地验收平台为 Linux arm64（macOS / Colima）；其他架构和云端环境尚未验证。公共镜像预装默认的 Codex CLI 0.144.1，避免每个 trial 重复下载；Agent 的配置和执行仍由 Harbor 负责。

```bash
uv sync --frozen
export HARBOR_TELEMETRY=0
uv run python scripts/prepare.py
uv run pytest -q

# 参考解：10 个任务都应得到 reward 1。
uv run harbor run -c jobs/oracle.yaml
uv run python scripts/report.py jobs-output/apollo-oracle

# 空操作：10 个任务都应得到 reward 0，且没有基础设施异常。
uv run harbor run -c jobs/nop.yaml
uv run python scripts/report.py jobs-output/apollo-nop --reward 0

# 通过 Harbor 内置 Codex 使用已有登录凭据。
CODEX_AUTH_JSON_PATH="$HOME/.codex/auth.json" uv run harbor run -c jobs/smoke.yaml
uv run python scripts/report.py jobs-output/apollo-smoke --baseline docs/archive/origin-f312d66-baseline.json
```

再次独立运行时通过 `--job-name` 指定新名字。运行入口是原生 `harbor run`；`scripts/report.py` 只读取结果并执行完整性验收，不负责调度或重试。不能只看 Harbor 命令的退出码：应同时要求任务完整、无基础设施异常、分数符合预期、检查项没有缺失。

若模型连接依赖宿主机代理，使用 Harbor 的 `--ae HTTPS_PROXY=... --ae HTTP_PROXY=... --ae NO_PROXY=localhost,127.0.0.1,gateway,apollo` 将代理显式传入 Agent。容器中的 `127.0.0.1` 指向容器本身；Colima 可使用 `host.lima.internal` 访问宿主机代理，端口取决于本机配置。任务参数和镜像不保存个人代理设置。

`jobs/claude-code.yaml` 通过 Harbor 内置 Claude Code 适配器提供原有 DeepSeek profile；请按 provider 配置 `ANTHROPIC_BASE_URL` 和认证。它与用于验收的 Codex smoke 分开运行。

`jobs/benchmark.yaml` 对每个任务重复执行 3 次，任务数据保持不变。数据 seed 与 Agent 尝试次数是两个不同维度。认证仅在运行时传入，不放进任务和镜像。也可以选择 Harbor 内置 Claude Code，按实际账号配置 OAuth 或 API 认证和模型。

架构边界与目录职责见[原生设计说明](docs/harbor-native-design.md)；本次 10/10 smoke 与逐项基线对比见[验收报告](docs/harbor-native-validation.md)。

## 执行和判分

每个 `tasks/<name>/` 都包含 Harbor 原生的 `instruction.md`、`task.toml`、`environment/`、`solution/`、`tests/`。每个 trial 独占 Apollo 服务和内存数据库，gateway 负责初始化并观测业务请求。Agent 只连接业务网络，管理接口位于独立后端网络。

Agent 以普通用户运行在工作容器中，使用固定版本的 Apollo CLI 0.1.0 或 Apollo Java Client 2.5.0。`apollo` 启动器调用未修改的原始发布二进制，传入场景凭据并记录调用参数。

Agent 完成后，Harbor 收集服务端证据、销毁执行环境，再启动独立判分环境：

- **CLI 任务**检查配置、发布记录、命名空间元数据和无关应用是否保持不变，并用服务端请求印证工具调用记录。
- **Java 任务**只提取源码和 POM，在新环境中离线编译，连接新 Apollo 实例，分别使用原始数据和第二组隐藏数据验证；不复用 Agent 的构建产物和缓存。

公共 Python 包 `apollo_testkit` 只负责 Apollo 初始化、观测和判分。Harbor 调用 `tests/test.sh`，输出标准的 `reward.txt` 和具名检查结果 `checks.json`。环境或判分程序异常不会生成成功分数。

## 评分和可复现性

结果正确性、接口使用、操作边界全部通过，任务才得到 1 分；任一失败则为 0 分。运行后的验收脚本还会拒绝超时、缺失 trial、检查项缺失和基础设施失败。运行元数据与轨迹直接使用 Harbor 原生产物。

60 个检查项保留原有名称和含义；Java 增加了第二组数据验证。任务提示改为描述容器中的工具，因此旧版宿主机 Agent 成绩作为历史基线保留，不视为完全相同的实验。参见[原版 smoke 报告](docs/archive/legacy-smoke.md)。

CLI 参数记录和 Agent 轨迹属于 Agent 侧的诊断证据，使用独立服务端请求交叉核对；可以识别普通的错误工具解法，但不能作为对抗恶意伪造轨迹的可信执行证明。判分代码和预期值不放入 Agent 镜像。

可以生成独立的错误解任务，验证判分器，不修改正式任务：

```bash
uv run python scripts/negative_controls.py
uv run harbor run -c jobs/negative.yaml
uv run python scripts/report.py jobs-output/apollo-negative --expected 3 --reward 0
```

## 开发任务

增加原生任务目录，提供明确任务说明、固定数据 seed、Apollo 初始化、检查和自包含参考解；将检查名称和类别登记到 `tests/fixtures/legacy-checks.json`，供报告验收核对。合入前要求参考解通过、空操作失败、典型错误解失败，再执行真实 Agent smoke。

共享镜像目前由 `scripts/prepare.py` 本地构建，尚未发布到镜像仓库。脚本在 `.cache/images.json` 中记录镜像身份和源码校验和。修改公共镜像或 Python 工具后需重新构建；已缓存的任务镜像可通过 Harbor 的 `--force-build` 更新。云端运行需要单独验证 provider 对 Compose 和独立判分环境的支持。
