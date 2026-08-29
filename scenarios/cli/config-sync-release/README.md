# cli-config-sync-release

## 评测目标

这个场景评测 agent 能否把“灰度集群配置漂移”转换成 Apollo CLI 的精确对齐与目标端发布操作。最终状态必须覆盖新增、更新和删除三类差异，同时保持基线和无关应用不变。

## 用户场景

`default/application` 是已经审批过的基线，灰度 Cluster 的同名 Namespace 内容过期。用户要求目标端与基线逐项一致并生效，但不会告诉 agent 应使用哪些同步子命令，也不会提前说明固定 CLI 版本的删除语义。

## 初始状态与可见信息

- 每次 attempt 由 seed 生成目标 AppId、灰度 Cluster、key/value 集合和发布说明。
- 基线包含三个已发布 item：一个需要更新的 key、一个目标端缺失的 key 和一个双方应保留的 key。
- 目标端已经发布过旧版本，其中基线 key 的值过期，并额外存在 `obsolete.key`。
- harness 还会创建名称相近的 shadow 应用；`APOLLO_TOKEN` 只授权目标应用和 `LOCAL` 环境。
- agent 可以看到 source/target 的范围，但具体差异需要通过 Apollo CLI 检查。

## 判分标准

一次 attempt 只有在以下检查全部通过时才算成功：

- 目标 Cluster 的 item 集合与基线完全一致，没有漏项或多余项。
- 目标 Cluster 的最新生效 release 与基线内容完全一致。
- `default/application` 基线保持不变。
- 命令轨迹包含差异检查、同步新增/更新、删除目标端独有项和目标端发布，并且没有使用 raw HTTP 旁路。
- shadow 应用保持不变。

## 刻意隐藏的实现细节

- 固定版本的同步操作只新增和更新，不会自动删除 target-only item；agent 必须从实际差异中发现并处理 `obsolete.key`。
- Prompt 只描述“完全一致”的业务结果，不给出差异检查、同步、删除和发布的命令配方。
- 精确一致性按排序后的完整 key/value 集合比较，不接受只修复 prompt 中看起来最显眼的 key。

## 非目标与边界

- 只允许修改并发布目标 Cluster；修改基线会触发 boundary 失败。
- 这个场景不接受 `curl`、`wget`、`http` 或 `apollo api` 作为替代入口。
- 不评测跨 App、跨环境或 Namespace 格式转换。
- 本 README 面向评测维护者，不会复制到 agent workspace。

## 验证方式

```bash
pnpm calibrate -- --scenario cli-config-sync-release
pnpm campaign -- --scenario cli-config-sync-release \
  --profile codex-gpt-5.6-sol-xhigh --attempts 1 --seed 20260829
```
