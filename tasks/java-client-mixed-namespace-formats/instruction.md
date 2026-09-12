我们有一个启动自检工具，需要从同一 Apollo 应用读取两种格式的 Namespace。请完成 Maven starter 中的 `src/main/java/scenario/MixedNamespaceFormats.java`，使用项目已经锁定的 Apollo Java Client `2.5.0`；不要改用普通 HTTP 客户端，也不要引入新的解析依赖。

程序会按下面方式启动：

```text
java scenario.MixedNamespaceFormats <appId> <yamlNamespace> <jsonNamespace> <yamlBooleanKey> <yamlIntKey>
```

本次参数为：

- appId：`scenario-java-formats-23bdc1af6c`
- YAML Namespace：`yaml-cdcfc62f.yml`
- JSON Namespace：`json-c907d986.json`
- YAML 布尔 key：`feature.enabled`
- YAML 整数 key：`feature.limit`

YAML Namespace 需要按 Apollo 的普通配置模型读取两个已扁平化的 key，并保留布尔和整数类型。JSON Namespace 需要按 Apollo 的配置文件模型读取完整原文；为了让任意 JSON 内容都能安全进入结果，请将 UTF-8 原文编码为标准 Base64。只向 stdout 输出一行合法 JSON：

```json
{"yamlEnabled":true,"yamlLimit":123,"jsonBase64":"..."}
```

`APOLLO_META` 已指向真实 Config Service。`mvn` 和 `java` 在当前隔离工作容器中执行，Maven 必须离线使用 `/m2`。完成后请实际编译并运行一次自检。


工作目录为 `/workspace`，公开任务参数保存在 `/workspace/task.json`。 评测时只收集 `pom.xml` 和 `src/`，在全新环境中重新编译；程序必须根据传入参数读取配置，不能硬编码测试值。
