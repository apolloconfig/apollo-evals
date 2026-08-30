我们拿到了一枚最小权限凭据，需要完成一项 Apollo 动态配置变更。凭据只覆盖一个应用、一个环境、一个 cluster 和一个 Namespace；应用及作用域没有另外写在工单里，请先使用 Apollo CLI 的认证能力查询确认它们，再通过 Apollo CLI 的常规资源能力写入并发布配置。不要猜测 AppId，也不要调用 raw HTTP 或 CLI 的通用 API 透传能力。

- Apollo Server：`{{portalUrl}}`（也已设置 `APOLLO_SERVER`）
- 配置 key：`{{key}}`
- 配置 value（字符串）：`{{value}}`
- 发布说明：`{{releaseTitle}}`

凭据已通过 `APOLLO_TOKEN` 注入。完成后请继续使用 Apollo CLI 核对新值已经生效，并简要说明你从凭据能力中确认到的授权作用域。
