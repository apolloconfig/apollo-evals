# java-client-change-listener

## 评测目标

这个场景评测 agent 能否把“服务不重启即可感知动态配置更新”的需求转换成 Apollo Java Client 的事件驱动实现，并正确完成 ready 握手、变更报告和有界退出。

## 用户场景

用户提供一个 Maven starter、启动参数和两种 JSON 事件契约。Prompt 要求使用 Apollo Java Client 的配置变更通知能力并禁止轮询，但不提供监听器类名、注册方法或实现代码。

## 初始状态与可见信息

- 每次 attempt 由 seed 生成目标 AppId、key、初始值和更新值。
- arrange 在 `application` Namespace 中发布初始值；更新值和后续 release 对 agent 不可见。
- workspace 包含锁定 Apollo Java Client 版本的 `pom.xml` 和仍抛出 TODO 异常的 `ChangeListenerApp.java`。
- agent 获得 `APOLLO_META`、转发到独立 Java runner 的 `mvn`/`java` 和离线 Maven 仓库，但不会获得管理 token。
- harness 还会创建名称相近的 shadow 应用，用于检查无关副作用。

## 判分标准

一次 attempt 只有在以下检查全部通过时才算成功：

- `pom.xml` 保留锁定版本的 `apollo-client` 依赖。
- 源码使用 Apollo Java Client 的变更监听能力，且没有普通 HTTP 客户端实现。
- Maven 在隔离 runner 中离线编译成功。
- ready 事件包含 seed 生成的初始值。
- ready 后由隐藏 judge 发布新值，change 事件必须精确报告 key、oldValue、newValue 和 `MODIFIED`。
- 程序在限定时间内以退出码 `0` 正常结束。
- shadow 应用保持不变。

## 刻意隐藏的实现细节

- Prompt 和 starter 注释都不出现具体监听器类名或注册方法；这些属于被测的 Apollo Java Client 理解。
- judge 在 agent 结束后重建 Java runner 并重新编译，启动程序后等待 ready，只有握手成功才执行隐藏发布。
- 输出解析会忽略非 JSON 的库日志，但业务事件本身必须符合精确字段合同并主动 flush。

## 非目标与边界

- 不评测轮询、手工刷新、HTTP 长轮询或 Portal 管理操作。
- 不评测多个 key、ADDED/DELETED 事件、Spring 注解或长期驻留进程。
- 本 README 位于 scenario 根目录，不会随 `workspace/` starter 复制给 agent。

## 验证方式

```bash
pnpm calibrate -- --scenario java-client-change-listener
pnpm campaign -- --scenario java-client-change-listener \
  --profile codex-gpt-5.6-sol-xhigh --attempts 1 --seed 20260829
```
