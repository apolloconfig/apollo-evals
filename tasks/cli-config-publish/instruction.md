我们在本地联调环境里需要调整一项动态配置。请使用 PATH 中已安装的 Apollo CLI，把下面这项配置按数字类型写入 Apollo，并让客户端能够读取到已经生效的新值。请全程使用 Apollo CLI 的常规资源能力完成并核对，不要调用 raw HTTP 或 CLI 的通用 API 透传能力。

- Apollo Server：`http://gateway:8070`（也已设置 `APOLLO_SERVER`）
- 环境：`LOCAL`
- AppId：`scenario-cli-set-86991122a6`
- Cluster：`default`
- Namespace：`application`
- 配置 key：`key.ee63768f`
- 配置 value（数字）：`77080`
- 发布说明：`release-71049dea`

凭据已通过 `APOLLO_TOKEN` 注入。只处理这个目标应用，完成后请用 Apollo CLI 确认配置已经生效。


工作目录为 `/workspace`，公开任务参数保存在 `/workspace/task.json`。 `apollo` 会自动读取任务凭据并调用固定版本的原始 Apollo CLI；请使用上面的业务服务器地址。
