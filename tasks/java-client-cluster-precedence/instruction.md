我们有一个部署启动自检工具，需要验证 Apollo 的集群配置选择与默认集群降级行为。请完成 Maven starter 中的 `src/main/java/scenario/ClusterPrecedence.java`，使用项目已经锁定的 Apollo Java Client `2.5.0`；不要改用普通 HTTP 客户端。

程序会按下面方式启动：

```text
java scenario.ClusterPrecedence <appId> <namespace> <key> <cluster>
```

本次参数为：

- appId：`scenario-java-cluster-993cb89b80`
- namespace：`application`
- key：`key.5f105e9d`
- 已配置的目标 cluster：`canary-10d720fc`
- 不存在、用于验证降级的 cluster：`missing-53d04d98`

程序必须让 Apollo Java Client 按第四个命令行参数选择 cluster，再从指定 appId 和 namespace 读取 key。只向 stdout 输出一行合法 JSON：

```json
{"cluster":"传入的 cluster","value":"实际读取值"}
```

`APOLLO_META` 已指向真实 Config Service。`mvn` 和 `java` 在当前隔离工作容器中执行，Maven 必须离线使用 `/m2`。完成后请实际编译，并分别用上面的两个 cluster 运行自检：已配置 cluster 应读取其专属值，不存在的 cluster 应降级读取 `default` cluster 的值。


工作目录为 `/workspace`，公开任务参数保存在 `/workspace/task.json`。 评测时只收集 `pom.xml` 和 `src/`，在全新环境中重新编译；程序必须根据传入参数读取配置，不能硬编码测试值。
