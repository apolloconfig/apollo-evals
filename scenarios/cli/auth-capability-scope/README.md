# cli-auth-capability-scope

## 评测目标

这个场景评测 agent 能否先通过 Apollo CLI 读取当前 token 的能力与资源范围，再在不预先获知 AppId 的情况下，对唯一授权的 Namespace 完成配置写入、发布和生效核对。

## 用户场景

用户收到一枚最小权限 token 和一项配置变更工单。工单没有重复记录应用与 Namespace，要求操作者从 token 能力中确认精确授权范围，而不是猜测目标资源或请求管理员凭据。

## 初始状态与可见信息

- 每次 attempt 由 seed 生成目标 AppId、shadow AppId、key、字符串 value 和发布说明。
- `APOLLO_TOKEN` 的操作能力仅包含配置读取、修改与发布，资源范围精确到目标应用的 `LOCAL/default/application`。
- Prompt 只展示 Server、key、value 和发布说明，不展示目标 AppId、环境、cluster 或 Namespace。
- setup 过程中产生的宽作用域 bootstrap token 不会注入 agent，并被作为 secret 脱敏；agent 只能使用精确范围 token。
- shadow 应用在相同 key 下有一个已发布的不同值。

## 判分标准

一次 attempt 只有在以下检查全部通过时才算成功：

- 目标 `application` Namespace 中新增字符串类型 item，value 正确。
- 最新生效 release 与 Config Service 均包含目标值。
- 命令轨迹包含 Apollo CLI 的认证能力查询、配置写入与发布资源操作，没有 raw HTTP 旁路。
- 代理观测到当前 token 能力端点的真实请求。
- shadow 应用中的同名 key 保持原值。

## 刻意隐藏的实现细节

- Prompt 不暴露 AppId、环境、cluster 或 Namespace，oracle 也必须先执行能力查询。
- verifier 不采信 agent 对作用域的文字说明，而是检查代理请求轨迹和真实 Apollo 状态。
- 目标 token 不具备应用管理、Namespace 管理或其他应用的访问范围。

## 非目标与边界

- 不评测 token 创建、续期、吊销或管理员权限配置。
- 不接受 Portal UI、`curl`、`wget`、`http` 或 `apollo api` 作为替代入口。
- 本 README 面向评测维护者，不会复制到 agent workspace。

## 验证方式

```bash
pnpm validate -- --scenario cli-auth-capability-scope
pnpm evaluate -- --scenario cli-auth-capability-scope \
  --profile codex-gpt-5.6-sol-medium --attempts 1 --seed 20260830
```
