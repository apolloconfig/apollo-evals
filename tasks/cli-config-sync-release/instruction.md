灰度集群的配置和当前基线发生了漂移。`default/application` 是已经确认过的正确版本，`canary-74f708/application` 应与它逐项完全一致，包括清理目标端多出来的配置。

请使用 PATH 中已安装的 Apollo CLI 完成对齐，并让目标集群的新配置生效。请全程使用 Apollo CLI 的常规资源能力完成并核对，不要调用 raw HTTP 或 CLI 的通用 API 透传能力。

- Apollo Server：`http://gateway:8070`（也已设置 `APOLLO_SERVER`）
- 环境：`LOCAL`
- AppId：`scenario-cli-sync-8cfd438a09`
- 基线 Cluster：`default`
- 目标 Cluster：`canary-74f708`
- Namespace：`application`
- 发布说明：`sync-release-a13c968b`

凭据已通过 `APOLLO_TOKEN` 注入。只修改并发布目标 Cluster，不要改变基线或其他应用；完成后请核对两边内容完全一致。


工作目录为 `/workspace`，公开任务参数保存在 `/workspace/task.json`。 `apollo` 会自动读取任务凭据并调用固定版本的原始 Apollo CLI；请使用上面的业务服务器地址。
