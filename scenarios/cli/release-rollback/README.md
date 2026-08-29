# cli-release-rollback

## 评测目标

这个场景评测 agent 能否从“最新配置发布导致故障”的业务描述中识别 Apollo release 回滚语义，发现当前活跃发布，并撤销误发布以恢复上一稳定版本。

## 用户场景

用户知道目标应用和异常 key，但不会提供 release ID、稳定值或错误值，也不会直接给出查询和回滚命令。任务要求撤销误发布本身，而不是手工改值后创建一个替代 release。

## 初始状态与可见信息

- 每次 attempt 由 seed 生成目标 AppId、key、稳定值和错误值。
- arrange 先写入稳定值并发布 `known-good`，随后写入错误值并发布 `accidental-bad-release`；错误 release 在 agent 开始时处于活跃状态。
- 错误 release ID、稳定值和错误值只保存在 judge state 中，不渲染到 prompt。
- harness 还会创建名称相近的 shadow 应用；`APOLLO_TOKEN` 只授权目标应用和 `LOCAL` 环境。
- agent 可以通过 Apollo CLI 查询真实发布历史和当前状态。

## 判分标准

一次 attempt 只有在以下检查全部通过时才算成功：

- Config Service 恢复返回稳定值。
- 当前生效 release 的配置恢复为稳定值。
- 初始的错误 release 不再处于活跃状态。
- 命令轨迹包含发布历史查询和 release 回滚，代理观测到真实 rollback 请求，且没有使用 raw HTTP 旁路。
- shadow 应用保持不变。

## 刻意隐藏的实现细节

- Prompt 不提供两个 release 的 ID 或配置值，agent 必须从 Apollo 状态中辨认当前活跃发布。
- 仅手工覆盖 item 或新建一个 release 不能满足“错误 release 不再活跃”和 required-interface 检查。
- judge 同时验证 Config Service、release 状态、命令轨迹和实际 rollback 请求。

## 非目标与边界

- 不评测按指定目标 release ID 的跨多版本回退。
- 这个场景不接受 `curl`、`wget`、`http` 或 `apollo api` 作为替代入口。
- 不允许修改 shadow 应用或其他 AppId。
- 本 README 面向评测维护者，不会复制到 agent workspace。

## 验证方式

```bash
pnpm calibrate -- --scenario cli-release-rollback
pnpm campaign -- --scenario cli-release-rollback \
  --profile codex-gpt-5.6-sol-xhigh --attempts 1 --seed 20260829
```
