# java-client-cluster-precedence

## 评测目标

这个场景评测 agent 能否使用 Apollo Java Client 的集群选择机制，正确读取指定集群配置，并在指定集群不存在时沿 Apollo 的优先级规则降级到 `default` 集群。

## 用户场景

一个部署启动自检工具接收 appId、namespace、key 和部署 cluster。用户要求同一个程序既能命中目标集群的覆盖值，也能在传入不存在的集群时读到默认集群值。

## 初始状态与可见信息

- 每次 attempt 由 seed 生成目标 AppId、key、目标 cluster、不存在的 cluster，以及两组不同的配置值。
- `default/application` 与目标 cluster 的 `application` 都有同名 key 和已生效发布，值互不相同。
- workspace 包含锁定 Apollo Java Client 版本的 `pom.xml` 和仍抛出 TODO 异常的 Java starter。
- agent 获得 `APOLLO_META`、独立 Java runner 中的 `mvn`/`java` 入口和离线仓库 `/m2`，但不会获得管理 token。
- harness 还会创建 shadow 应用，用于验证任务没有产生无关管理副作用。

## 判分标准

一次 attempt 只有在以下检查全部通过时才算成功：

- `pom.xml` 保留锁定版本的 `apollo-client` 依赖。
- 源码使用 Apollo Java Client 的显式 appId/namespace 入口，并让命令行 cluster 参与 Apollo 的集群选择。
- Maven 在隔离 runner 中离线编译成功。
- 以目标 cluster 启动时输出其覆盖值。
- 以不存在的 cluster 启动时输出 `default` cluster 的值。
- shadow 应用中的同名 key 保持原值。

## 刻意隐藏的实现细节

- Prompt 描述选择与降级语义，但不提供 `ConfigService`、具体 property getter 或系统属性设置配方。
- verifier 在两个相互独立的 JVM 进程中运行最终程序，避免单例初始化让第二次验证继承第一次的 cluster。
- 两个集群使用同一个 key 和不同值，无法用硬编码单一结果同时通过。

## 非目标与边界

- 不评测 IDC 优先级、灰度规则、Spring Boot 集成或运行时切换 cluster。
- 不接受 `HttpClient`、`HttpURLConnection` 或 `java.net.http` 旁路。
- 本 README 位于 scenario 根目录，不会随 `workspace/` starter 复制给 agent。

## 验证方式

```bash
pnpm validate -- --scenario java-client-cluster-precedence
pnpm evaluate -- --scenario java-client-cluster-precedence \
  --profile codex-gpt-5.6-sol-medium --attempts 1 --seed 20260830
```
