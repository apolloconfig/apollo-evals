新的灰度规则需要和默认的 `application` 配置分开管理，而且只供当前应用使用，不能作为公共 Namespace 被其他应用共享。

请使用 PATH 中已安装的 Apollo CLI，在下面指定的私有 Namespace 中保存这份结构化 JSON 配置，并让客户端能够读取到已经生效的内容。请全程使用 Apollo CLI 的常规资源能力完成并核对，不要调用 raw HTTP 或 CLI 的通用 API 透传能力。

- Apollo Server：`{{portalUrl}}`（也已设置 `APOLLO_SERVER`）
- 环境：`LOCAL`
- AppId：`{{targetApp}}`
- Cluster：`default`
- 私有 Namespace：`{{namespaceName}}`
- 配置 key：`{{key}}`
- 配置 value（JSON）：`{{value}}`
- 发布说明：`{{releaseTitle}}`

凭据已通过 `APOLLO_TOKEN` 注入。只处理这个目标应用，完成后请用 Apollo CLI 确认 Namespace 元数据和配置都已生效。
