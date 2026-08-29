# cli-config-publish

## 评测目标

这个场景评测 agent 能否把“调整一项数字配置并让客户端读到新值”的用户请求，转换成完整的 Apollo CLI 配置发布流程。重点不是照着 prompt 中的命令配方执行，而是识别数字类型、完成发布，并确认 Config Service 已经暴露新值。

## 用户场景

用户正在本地联调一个服务，需要调整动态参数。用户知道目标应用、配置范围、key、数值和发布说明，但不会替 agent 指定 Apollo CLI 的具体资源子命令或执行顺序。

## 初始状态与可见信息

- 每次 attempt 都由 seed 生成独立的目标 AppId、key、数字 value 和发布说明。
- harness 还会创建名称相近的 shadow 应用，在相同 key 下发布一个不同的值；shadow 应用不会出现在 prompt 中。
- `APOLLO_TOKEN` 只授权目标应用和 `LOCAL` 环境，管理员会话只保留在 harness 内部。
- agent 可以看到目标 Server、环境、AppId、Cluster、Namespace、key、数字 value 和发布说明，并可通过 Apollo CLI 自带帮助发现用法。

## 判分标准

一次 attempt 只有在以下检查全部通过时才算成功：

- Portal 中目标 item 的 value 正确，item type 为数字类型 `1`。
- 最新生效 release 包含目标值。
- Config Service 返回目标值。
- 命令轨迹包含正确的配置写入和发布资源子命令，且没有使用 raw HTTP 旁路。
- shadow 应用中的同名 key 保持原值。

## 刻意隐藏的实现细节

- Prompt 只表达“数字类型”和“需要生效”，不提供 item type 编码、具体子命令或操作顺序。
- 仅修改 Portal 中的未发布 item 不足以通过；客户端可见状态由独立的 Config Service 请求验证。
- judge 不采信 agent 的完成声明，而是读取真实 Apollo 状态和归一化命令轨迹。

## 非目标与边界

- 这个场景不接受 Portal UI、`curl`、`wget`、`http` 或 `apollo api` 作为替代入口。
- 不评测跨环境发布、灰度发布或配置回滚。
- 本 README 面向评测维护者，位于 scenario 根目录，不会复制到 agent workspace。

## 验证方式

```bash
pnpm calibrate -- --scenario cli-config-publish
pnpm campaign -- --scenario cli-config-publish \
  --profile codex-gpt-5.6-sol-xhigh --attempts 1 --seed 20260829
```
