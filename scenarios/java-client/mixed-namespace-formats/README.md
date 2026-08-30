# java-client-mixed-namespace-formats

## 评测目标

这个场景评测 agent 能否区分 Apollo Java Client 对 YAML/YML Namespace 的普通配置读取方式与 JSON Namespace 的配置文件读取方式，并保持类型及原始文件内容。

## 用户场景

一个启动自检工具需要同时读取 YAML 中的类型化开关与阈值，以及 JSON 文件的完整原文。用户给出两个 Namespace 和输出合同，但不提供 Apollo Java API 配方。

## 初始状态与可见信息

- 每次 attempt 由 seed 生成目标 AppId、YAML/JSON Namespace、扁平化 YAML key、类型化值和 JSON 原文。
- 两个非 properties AppNamespace 均已创建，对应 Namespace 已写入文本并发布。
- workspace 包含锁定 Apollo Java Client 版本的 `pom.xml` 和仍抛出 TODO 异常的 Java starter。
- agent 获得 `APOLLO_META`、独立 Java runner 中的 `mvn`/`java` 入口和离线仓库 `/m2`，但不会获得管理 token。
- harness 还会创建 shadow 应用，用于验证任务没有产生无关管理副作用。

## 判分标准

一次 attempt 只有在以下检查全部通过时才算成功：

- `pom.xml` 保留锁定版本的 `apollo-client` 依赖。
- YAML 使用普通 Config 入口和类型化读取能力，JSON 使用 JSON 配置文件入口。
- 源码没有使用普通 HTTP 客户端。
- Maven 在隔离 runner 中离线编译成功。
- 输出中的 YAML 布尔值、整数值和 JSON 原文 Base64 与隐藏 seed 状态精确一致。
- shadow 应用保持不变。

## 刻意隐藏的实现细节

- Prompt 不出现 `ConfigService`、`ConfigFileFormat` 或具体 property getter 名称。
- JSON Namespace 以带 `.json` 后缀的真实名称展示；agent 需要遵循 Apollo 配置文件入口对 Namespace 名称的约定。
- JSON 原文通过 Base64 判分，避免空白、引号或换行被 stdout JSON 转义方式干扰。

## 非目标与边界

- 不评测 XML/TXT、配置变更监听、Spring Boot 绑定或 JSON 业务字段解析。
- 不接受 `HttpClient`、`HttpURLConnection` 或 `java.net.http` 旁路。
- 本 README 位于 scenario 根目录，不会随 `workspace/` starter 复制给 agent。

## 验证方式

```bash
pnpm validate -- --scenario java-client-mixed-namespace-formats
pnpm evaluate -- --scenario java-client-mixed-namespace-formats \
  --profile codex-gpt-5.6-sol-medium --attempts 1 --seed 20260830
```
