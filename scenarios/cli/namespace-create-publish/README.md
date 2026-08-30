# cli-namespace-create-publish

## 评测目标

这个场景评测 agent 能否把“应用私有的结构化灰度规则需要独立管理并生效”转换成 Apollo CLI 的 Namespace、配置和发布操作，同时正确保留 Namespace 可见性、格式和 JSON item type。

## 用户场景

业务不希望把灰度规则混入默认 `application`，也不希望其他应用共享该 Namespace。用户提供 Namespace 名、配置 key、JSON 内容和发布说明，但不会告诉 agent 具体子命令、item type 编码或执行顺序。

## 初始状态与可见信息

- 每次 attempt 由 seed 生成目标 AppId、私有 Namespace 名、key、JSON value 和发布说明。
- JSON value 包含布尔开关、百分比和随机标签，用于证明结构化内容被原样保存。
- 目标应用中尚不存在该非默认 Namespace。
- harness 还会创建名称相近的 shadow 应用；`APOLLO_TOKEN` 只授权目标应用和 `LOCAL` 环境。
- agent 可以看到完整目标范围和 JSON 内容，并可通过 Apollo CLI 自带帮助发现 Namespace、配置与发布能力。

## 判分标准

一次 attempt 只有在以下检查全部通过时才算成功：

- AppNamespace 元数据为私有 `properties` 格式。
- 目标 item 的 value 与输入 JSON 完全一致，item type 为 JSON 类型 `3`。
- 最新生效 release 包含目标值。
- Config Service 能从新 Namespace 读取目标值。
- 命令轨迹包含 Namespace 创建、配置写入和发布，且没有使用 raw HTTP 旁路。
- shadow 应用保持不变。

## 刻意隐藏的实现细节

- Prompt 用“只供当前应用使用”表达私有可见性，不直接给出 Namespace 创建参数。
- Prompt 用“结构化 JSON”表达类型要求，不提供 Apollo item type 编码。
- Namespace 已创建但未写配置、配置已写但未发布，或错误创建为公共 Namespace，都会被真实状态检查识别。

## 非目标与边界

- 不评测公共 Namespace、关联 Namespace 或多应用共享。
- 这个场景不接受 `curl`、`wget`、`http` 或 `apollo api` 作为替代入口。
- 不允许修改 shadow 应用或默认 `application` 内容。
- 本 README 面向评测维护者，不会复制到 agent workspace。

## 验证方式

```bash
pnpm validate -- --scenario cli-namespace-create-publish
pnpm evaluate -- --scenario cli-namespace-create-publish \
  --profile codex-gpt-5.6-sol-medium --attempts 1 --seed 20260829
```
