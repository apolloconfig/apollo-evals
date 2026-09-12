# Harbor 原生重写验收

验收于 2026-09-12 完成（Asia/Shanghai）。实现位于 `codex/harbor-native`，基于最新远端 `origin/main` 的 `f312d66bf3d0ab09f640c8f3cc1dab9ec19d16ff`；本次验收在提交前的工作区上执行，交付源码校验和记录于 `runtime-manifest.json`。原有 `codex/harbor-migration` 工作区保持保留。

## 验收结果

| 验证 | 结果 | 基础设施异常 | 证据 |
| --- | --- | --- | --- |
| 真实 Codex smoke | 10/10 场景，60/60 检查 | 0 | [smoke.json](validation/smoke.json) |
| 原生 Oracle 参考解 | 10/10 场景，60/60 检查 | 0 | [oracle.json](validation/oracle.json) |
| 原生 NOP 空操作 | 10/10 正确拒绝，所有任务 reward 0 | 0 | [nop.json](validation/nop.json) |
| 三个错误解 | 3/3 正确拒绝，所有任务 reward 0 | 0 | [negative.json](validation/negative.json) |
| Python 与任务契约测试 | 20 passed | — | `make check` |
| Ruff 与格式检查 | 全部通过 | — | `make check` |

正式验收 job 的重试次数均为 0。真实 smoke 每场景执行一次，保留原任务时间预算，没有增加超时倍率。三个错误解分别为“只写未发布”“用直接 HTTP 完成正确状态”“调用真实 Java API 但硬编码返回值”。第三个错误解通过原始数据，但被第二组数据识别。

NOP 中仍有 20/60 个具名检查为真，例如固定依赖和未改变的无关应用；所有任务都至少有一项必要检查失败，因此任务分数均为 0。负例验收同时要求程序正常完成判分，基础设施错误不能充当正确拒绝。

## 与原版逐项对比

本次对照是基于 `f312d66` 实际重跑的 `origin-f312d66-baseline-smoke-20260911`，见[原版基线快照](archive/origin-f312d66-baseline.json)。`archive/legacy-smoke.md` 保存的是更早的已发布历史报告，与本次对照运行分开保留。

同一场景的 seed、最终通过状态、具名检查名称、类别和布尔结果全部一致；对比脚本未发现差异。

| 场景 | Seed | 原版 reward | Harbor reward | Harbor 检查 |
| --- | ---: | ---: | ---: | ---: |
| `cli-auth-capability-scope` | 3044810093 | 1 | 1 | 6/6 |
| `cli-config-publish` | 427860176 | 1 | 1 | 5/5 |
| `cli-config-sync-release` | 609367624 | 1 | 1 | 5/5 |
| `cli-namespace-create-publish` | 4192184091 | 1 | 1 | 6/6 |
| `cli-public-namespace-share` | 2333623773 | 1 | 1 | 8/8 |
| `cli-release-rollback` | 1044323262 | 1 | 1 | 5/5 |
| `java-client-change-listener` | 1572645312 | 1 | 1 | 7/7 |
| `java-client-cluster-precedence` | 3213051928 | 1 | 1 | 6/6 |
| `java-client-mixed-namespace-formats` | 2427684527 | 1 | 1 | 6/6 |
| `java-client-typed-read` | 3762446315 | 1 | 1 | 6/6 |

两次 smoke 都使用 Codex CLI 0.144.1、`gpt-5.6-sol`、`medium` 推理强度。Apollo 服务镜像和 Java Client 制品也相同；新版本使用 Linux arm64 Apollo CLI，旧版使用 macOS arm64 制品，均为 0.1.0。

本次证明的是固定十场景的结果一致。Agent 执行位置改为容器，Java 判分增加第二组数据，因此两版不是完全相同的实验，耗时与 token 数也不能直接互换。单次 smoke 不代表多次采样的统计表现相同。

## 实现和复现

执行入口为 Harbor 原生 CLI；详细边界见[原生设计说明](harbor-native-design.md)。Python 只实现 Apollo 数据准备、业务网关、观测与判分，以及结果完整性验收；没有自建 Agent、Environment、Verifier 或调度器。

```bash
uv sync --frozen
export HARBOR_TELEMETRY=0
uv run python scripts/prepare.py
make check

uv run harbor run -c jobs/oracle.yaml --job-name native-oracle-final
uv run python scripts/report.py jobs-output/native-oracle-final

uv run harbor run -c jobs/nop.yaml --job-name native-nop-final
uv run python scripts/report.py jobs-output/native-nop-final --reward 0

uv run python scripts/negative_controls.py
uv run harbor run -c jobs/negative.yaml --job-name native-negative-01
uv run python scripts/report.py jobs-output/native-negative-01 --expected 3 --reward 0

CODEX_AUTH_JSON_PATH="$HOME/.codex/auth.json" uv run harbor run -c jobs/smoke.yaml --job-name native-smoke-final
uv run python scripts/report.py jobs-output/native-smoke-final --baseline docs/archive/origin-f312d66-baseline.json
```

再次独立运行时换一个 job 名称。本机还通过 Harbor 的 `--ae` 显式传入了宿主机代理，配置方式见 README；个人代理端口和凭据不固化到任务配置中。

原始 Harbor 结果、轨迹和判分输出保存在本地 `jobs-output/<job-name>/`，不纳入 Git。此文档引用的 JSON 为精简的检查证据；[runtime-manifest.json](validation/runtime-manifest.json) 记录交付源码校验和和已构建的共享镜像身份。

## 验收范围与环境调整

- 已验证的平台为 macOS / Colima 上的 Linux arm64，Docker 28.3.3；其他 CPU 架构和云端 provider 尚未验证。
- Claude Code + DeepSeek 配置已经提供，本轮未运行该 profile。
- 首次运行发现现有 Docker Compose 未被 `docker compose` 识别，已将既有 `/usr/local/bin/docker-compose` 链接到用户的 Docker CLI 插件目录；没有安装新的系统软件包。
- 开发期修正了 Apollo active releases 返回数组的处理，以及镜像构建遗留的 Codex 配置目录所有权问题；容器模型连接则通过显式代理配置解决。早期探测记录与这里的正式验收 job 分开保留。
- Agent 侧轨迹和 CLI 参数记录用于诊断，并与独立服务端请求交叉核对；它们不构成对抗恶意伪造的可信执行证明。

验收时的 Git 状态保留在运行快照中；发布提交可通过本文所在分支追溯。
