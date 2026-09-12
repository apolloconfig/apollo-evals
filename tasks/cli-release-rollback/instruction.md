刚刚上线的一次配置发布引发了故障，上一版配置是稳定的。请使用 PATH 中已安装的 Apollo CLI 查清当前发布记录，撤销这次误发布，让客户端恢复读取上一稳定版本。我们需要撤销误发布本身，而不是再手工覆盖一个新值。请全程使用 Apollo CLI 的常规资源能力完成并核对，不要调用 raw HTTP 或 CLI 的通用 API 透传能力。

- Apollo Server：`http://gateway:8070`（也已设置 `APOLLO_SERVER`）
- 环境：`LOCAL`
- AppId：`scenario-cli-rollback-3250d98c50`
- Cluster：`default`
- Namespace：`application`
- 出现异常的配置 key：`key.8aafa8b8`

凭据已通过 `APOLLO_TOKEN` 注入。只处理这个目标应用，完成后请确认当前生效配置已经恢复。


工作目录为 `/workspace`，公开任务参数保存在 `/workspace/task.json`。 `apollo` 会自动读取任务凭据并调用固定版本的原始 Apollo CLI；请使用上面的业务服务器地址。
