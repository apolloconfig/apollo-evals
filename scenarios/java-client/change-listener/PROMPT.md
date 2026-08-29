我们的服务需要在不重启的情况下感知 Apollo 配置更新。请完成 Maven starter 中的 `src/main/java/scenario/ChangeListenerApp.java`，使用项目已经锁定的 Apollo Java Client `{{apolloJavaVersion}}` 和它的配置变更通知能力；不能通过轮询或普通 HTTP 客户端实现。

程序按以下方式启动：

```text
java scenario.ChangeListenerApp <appId> <namespace> <key>
```

- appId：`{{targetApp}}`
- namespace：`application`
- key：`{{key}}`

程序启动后读取当前值。确认已经能够接收后续变更时，输出并 flush：

```json
{"event":"ready","value":"初始值"}
```

评测环境看到 ready 后会修改并发布这个 key。程序收到推送的变更后，输出并 flush 一行变更记录，然后正常退出：

```json
{"event":"change","key":"...","oldValue":"...","newValue":"...","changeType":"MODIFIED"}
```

等待必须有界，最多 60 秒。`APOLLO_META` 已指向真实 Config Service；`mvn` 和 `java` 会在独立 Java runner 容器中执行，Maven 离线仓库为 `{{mavenRepo}}`。
