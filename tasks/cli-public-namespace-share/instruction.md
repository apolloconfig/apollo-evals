我们要为两个本地联调应用提供一项共享动态配置。请使用 PATH 中已安装的 Apollo CLI，在提供方应用中创建一个公共的 properties Namespace，写入配置并发布，让提供方和消费方都能通过各自 AppId 从 Config Service 读取到同一个共享值。Namespace 的实际名称必须严格等于工单给出的名称，不能自动附加提供方 AppId 前缀。请全程使用 Apollo CLI 的常规资源能力完成并核对，不要调用 raw HTTP 或 CLI 的通用 API 透传能力。

- Apollo Server：`http://gateway:8070`（也已设置 `APOLLO_SERVER`）
- 环境：`LOCAL`
- Cluster：`default`
- 提供方 AppId：`scenario-cli-public-8445a066bb`
- 消费方 AppId：`consumer-842c4ac6de`
- 共享 Namespace：`shared-616563494d`
- 配置 key：`key.eed2aaee`
- 配置 value（字符串）：`shared-value-eb71d7cd3af4`
- 发布说明：`shared-release-76342622`

凭据已通过 `APOLLO_TOKEN` 注入，只授权提供方应用。不要修改消费方或其他应用自身的配置；消费方应通过公共 Namespace 的共享语义读取提供方发布的值。


工作目录为 `/workspace`，公开任务参数保存在 `/workspace/task.json`。 `apollo` 会自动读取任务凭据并调用固定版本的原始 Apollo CLI；请使用上面的业务服务器地址。
