# java-client-typed-read

## 评测目标

这个场景评测 agent 能否把启动自检需求转换成正确的 Apollo Java Client 读取逻辑：使用显式 appId/namespace、保持字符串/整数/布尔类型，并为不存在的配置提供默认值。

## 用户场景

用户给出一个 Maven starter、程序启动参数和 stdout JSON 契约，希望工具从真实 Apollo Config Service 读取配置。Prompt 说明使用锁定的 Apollo Java Client，但不提供类名、方法名或 typed getter 配方。

## 初始状态与可见信息

- 每次 attempt 由 seed 生成目标 AppId、四个 key、字符串值、整数值和布尔值；missingKey 不会被写入。
- 三个实际值在 `application` Namespace 中写入并发布后，agent 才开始工作。
- workspace 包含锁定 Apollo Java Client 版本的 `pom.xml` 和仍抛出 TODO 异常的 `TypedRead.java`。
- agent 获得 `APOLLO_META`、转发到独立 Java runner 的 `mvn`/`java`，以及容器内离线 Maven 仓库 `/m2`，但不会获得管理 token。
- harness 还会创建 shadow 应用，用于验证任务没有产生无关管理副作用。

## 判分标准

一次 attempt 只有在以下检查全部通过时才算成功：

- `pom.xml` 保留锁定版本的 `apollo-client` 依赖。
- 源码通过 Apollo Java Client 的显式 appId/namespace 入口读取配置，没有使用普通 HTTP 客户端。
- 源码使用字符串、整数和布尔值对应的读取能力。
- Maven 在隔离 runner 中离线编译成功。
- 程序输出的第一行 JSON 与 seed 生成的 string/int/boolean/default 值精确一致。
- shadow 应用保持不变。

## 刻意隐藏的实现细节

- Prompt 只描述业务类型和输出契约，不出现 `ConfigService` 或具体 property getter 名称。
- judge 在 agent 结束后重建 Java runner，再离线编译和运行最终 workspace，避免 agent 遗留进程或 Maven 状态影响结果。
- 正确的 JSON 字段类型属于结果合同；把整数或布尔值作为字符串输出会失败。

## 非目标与边界

- 不评测 Spring Boot 集成、配置注入注解、缓存文件降级或远程管理操作。
- 不接受 `HttpClient`、`HttpURLConnection` 或 `java.net.http` 旁路。
- 本 README 位于 scenario 根目录，不会随 `workspace/` starter 复制给 agent。

## 验证方式

```bash
pnpm calibrate -- --scenario java-client-typed-read
pnpm campaign -- --scenario java-client-typed-read \
  --profile codex-gpt-5.6-sol-xhigh --attempts 1 --seed 20260829
```
