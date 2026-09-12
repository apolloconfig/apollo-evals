新的灰度规则需要和默认的 `application` 配置分开管理，而且只供当前应用使用，不能作为公共 Namespace 被其他应用共享。

请使用 PATH 中已安装的 Apollo CLI，在下面指定的私有 Namespace 中保存这份结构化 JSON 配置，并让客户端能够读取到已经生效的内容。请全程使用 Apollo CLI 的常规资源能力完成并核对，不要调用 raw HTTP 或 CLI 的通用 API 透传能力。

- Apollo Server：`http://gateway:8070`（也已设置 `APOLLO_SERVER`）
- 环境：`LOCAL`
- AppId：`scenario-cli-namespace-5ea39bf5f2`
- Cluster：`default`
- 私有 Namespace：`feature-dd0d754a`
- 配置 key：`key.b4fac88a`
- 配置 value（JSON）：`{"enabled":true,"percentage":63,"label":"variant-8ecdc0ee"}`
- 发布说明：`namespace-release-d6cd010e`

凭据已通过 `APOLLO_TOKEN` 注入。只处理这个目标应用，完成后请用 Apollo CLI 确认 Namespace 元数据和配置都已生效。


工作目录为 `/workspace`，公开任务参数保存在 `/workspace/task.json`。 `apollo` 会自动读取任务凭据并调用固定版本的原始 Apollo CLI；请使用上面的业务服务器地址。
