我们有一个启动自检小工具，需要从 Apollo 读取几项配置并保留它们的业务类型。请完成 Maven starter 中的 `src/main/java/scenario/TypedRead.java`，使用项目已经锁定的 Apollo Java Client `2.5.0`；不要改用普通 HTTP 客户端。

程序会按下面方式启动：

```text
java scenario.TypedRead <appId> <namespace> <stringKey> <intKey> <booleanKey> <missingKey>
```

本次参数为：

- appId：`scenario-java-typed-75775f265c`
- namespace：`application`
- stringKey：`str-key-3868d4`
- intKey：`int-key-c40d56`
- booleanKey：`bool-key-4db257`
- missingKey：`missing-key-7c8c9a`

程序需要从命令行参数指定的 appId 和 namespace 读取这些 key。stringKey 保持为字符串，intKey 输出为 JSON 数字，booleanKey 输出为 JSON 布尔值；missingKey 不存在时使用默认值 `fallback-value`。只向 stdout 输出一行合法 JSON：

```json
{"string":"...","int":123,"boolean":true,"missing":"fallback-value"}
```

`APOLLO_META` 已指向真实 Config Service。`mvn` 和 `java` 在当前隔离工作容器中执行，Maven 必须离线使用 `/m2`。完成后请实际编译并运行一次自检。


工作目录为 `/workspace`，公开任务参数保存在 `/workspace/task.json`。 评测时只收集 `pom.xml` 和 `src/`，在全新环境中重新编译；程序必须根据传入参数读取配置，不能硬编码测试值。
