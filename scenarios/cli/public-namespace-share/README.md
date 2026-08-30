# cli-public-namespace-share

## 评测目标

这个场景评测 agent 能否使用 Apollo CLI 创建名称不带应用前缀的公共 Namespace，完成配置发布，并让未拥有该 Namespace 的消费方 AppId 通过 Config Service 读到共享值。

## 用户场景

平台团队希望在一个提供方应用中维护共享 properties 配置，供另一个消费方应用直接订阅。工单要求公共可见性和严格的 Namespace 名称，同时禁止修改消费方自身配置。

## 初始状态与可见信息

- 每次 attempt 由 seed 生成提供方 AppId、消费方 AppId、shadow AppId、Namespace、key、value 和发布说明。
- 提供方尚未创建目标 AppNamespace/Namespace；消费方只有一个已发布的 `application` 基线配置。
- `APOLLO_TOKEN` 只授权提供方应用和 `LOCAL` 环境，管理员会话只保留在 harness 内部。
- shadow 应用在同名 key 下有一个已发布的不同值。
- agent 可以通过 Apollo CLI 自带帮助发现公共可见性及 Namespace 前缀选项。

## 判分标准

一次 attempt 只有在以下检查全部通过时才算成功：

- 提供方存在名称精确匹配、格式为 properties、`isPublic=true` 的 AppNamespace。
- 目标 Namespace 中字符串 item 与最新 release 正确。
- 提供方 AppId 的 Config Service 读取返回目标值。
- 消费方 AppId 在没有复制配置的情况下，通过同名公共 Namespace 读取到目标值。
- 命令轨迹包含 Namespace 创建、配置写入和发布资源操作，且没有 raw HTTP 旁路。
- 消费方 `application` 基线和 shadow 应用保持不变。

## 刻意隐藏的实现细节

- Prompt 描述公共可见性和名称约束，不提供具体子命令或 flag 配方。
- Config Service 的 AppNamespace 元数据存在短暂缓存，verifier 对跨应用读取做有界重试，而不是依赖固定 sleep。
- 仅在提供方能读取、创建成私有 Namespace，或通过前缀生成了另一个实际名称，都无法通过。

## 非目标与边界

- 不评测关联 Namespace 的覆盖、继承顺序、跨环境共享或灰度发布。
- 不接受 Portal UI、`curl`、`wget`、`http` 或 `apollo api` 作为替代入口。
- 本 README 面向评测维护者，不会复制到 agent workspace。

## 验证方式

```bash
pnpm validate -- --scenario cli-public-namespace-share
pnpm evaluate -- --scenario cli-public-namespace-share \
  --profile codex-gpt-5.6-sol-medium --attempts 1 --seed 20260830
```
