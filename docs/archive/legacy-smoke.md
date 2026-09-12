# Apollo Evals Smoke Benchmark

## 评分

| Profile | 总分 | 场景通过 | 检查通过 |
|---|---:|---:|---:|
| `codex-gpt-5.6-sol-medium` | **100/100** | 10/10 | 60/60 |
| `claude-code-deepseek-v4-flash-medium` | **80/100** | 8/10 | 56/60 |

评分口径：每个场景 10 分；`outcome`、`interaction`、`boundary` 检查全部通过才得分。每个 profile、每个场景执行 1 次。

## 分项成绩

<table>
  <thead>
    <tr>
      <th rowspan="2">产品入口</th>
      <th rowspan="2">场景</th>
      <th colspan="2"><code>codex-gpt-5.6-sol-medium</code></th>
      <th colspan="2"><code>claude-code-deepseek-v4-flash-medium</code></th>
    </tr>
    <tr>
      <th>分数</th>
      <th>耗时</th>
      <th>分数</th>
      <th>耗时</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Apollo CLI</td><td><code>cli-auth-capability-scope</code></td><td>10/10</td><td>139.9s</td><td>10/10</td><td>79.2s</td></tr>
    <tr><td>Apollo CLI</td><td><code>cli-config-publish</code></td><td>10/10</td><td>117.6s</td><td>10/10</td><td>46.0s</td></tr>
    <tr><td>Apollo CLI</td><td><code>cli-config-sync-release</code></td><td>10/10</td><td>150.3s</td><td>10/10</td><td>107.6s</td></tr>
    <tr><td>Apollo CLI</td><td><code>cli-namespace-create-publish</code></td><td>10/10</td><td>118.0s</td><td>10/10</td><td>55.5s</td></tr>
    <tr><td>Apollo CLI</td><td><code>cli-public-namespace-share</code></td><td>10/10</td><td>150.3s</td><td>10/10</td><td>109.6s</td></tr>
    <tr><td>Apollo CLI</td><td><code>cli-release-rollback</code></td><td>10/10</td><td>134.3s</td><td>10/10</td><td>144.3s</td></tr>
    <tr><td>Apollo Java Client</td><td><code>java-client-change-listener</code></td><td>10/10</td><td>197.8s</td><td>10/10</td><td>380.0s</td></tr>
    <tr><td>Apollo Java Client</td><td><code>java-client-cluster-precedence</code></td><td>10/10</td><td>143.4s</td><td>0/10</td><td>269.9s</td></tr>
    <tr><td>Apollo Java Client</td><td><code>java-client-mixed-namespace-formats</code></td><td>10/10</td><td>221.7s</td><td>0/10</td><td>268.2s</td></tr>
    <tr><td>Apollo Java Client</td><td><code>java-client-typed-read</code></td><td>10/10</td><td>165.6s</td><td>10/10</td><td>124.9s</td></tr>
  </tbody>
</table>

### 检查结果

| 检查类别 | Codex | Claude Code |
|---|---:|---:|
| Outcome | 31/31 | 28/31 |
| Interaction | 17/17 | 16/17 |
| Boundary | 12/12 | 12/12 |
| **合计** | **60/60** | **56/60** |

### 失败项

| Profile | 场景 | Stop reason | 未通过检查 |
|---|---|---|---|
| `claude-code-deepseek-v4-flash-medium` | `java-client-cluster-precedence` | `timeout` | cluster-aware 读取；首选集群覆盖；缺失集群回退 |
| `claude-code-deepseek-v4-flash-medium` | `java-client-mixed-namespace-formats` | `timeout` | YAML 类型和值与 JSON 文件原文读取 |

## 效率指标

通过 attempt 中位数：

| Profile | 耗时 | Input tokens | Output tokens | Tool calls |
|---|---:|---:|---:|---:|
| `codex-gpt-5.6-sol-medium` | 146.9s | 181,151.5 | 2,941.5 | 22 |
| `claude-code-deepseek-v4-flash-medium` | 108.6s | 399,967 | 10,089 | 18 |

全部 attempt 合计：

| Profile | 耗时 | Input tokens | Output tokens | Tool calls | Apollo HTTP calls |
|---|---:|---:|---:|---:|---:|
| `codex-gpt-5.6-sol-medium` | 1,539.0s | 2,002,750 | 32,082 | 242 | 60 |
| `claude-code-deepseek-v4-flash-medium` | 1,585.1s | 8,760,010 | 84,260 | 222 | 77 |

## 运行信息

| 项目 | Codex | Claude Code |
|---|---|---|
| 完成时间 | 2026-08-30 13:41:38 CST | 2026-08-30 14:12:22 CST |
| Adapter / CLI | Codex / `0.151.0` | Claude Code / `2.1.251` |
| Model | `gpt-5.6-sol` | `deepseek-v4-flash` |
| Reasoning effort | `medium` | `medium` |
| Suite | `smoke` | `smoke` |
| Attempts | 每场景 1 次 | 每场景 1 次 |

| 共同环境 | 版本 |
|---|---|
| Git HEAD | `9c6f681ace52`（工作区含未提交改动） |
| Node.js / pnpm | `v22.23.2` / `10.24.0` |
| Apollo Server | `3.0.0-SNAPSHOT` |
| Apollo CLI | `0.1.0` |
| Apollo Java Client | `2.5.0` |
| Docker | `29.7.2` |

运行前检查：`pnpm check`，11 个测试文件、24 个测试通过。
