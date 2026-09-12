# Apollo Evals Smoke Benchmark

## 评分

| Profile | 总分 | 场景通过 | 检查通过 |
|---|---:|---:|---:|
| `codex-gpt-5.6-sol-medium` | **100/100** | 10/10 | 60/60 |
| `claude-code-deepseek-flash-medium` | **100/100** | 10/10 | 60/60 |

评分口径：每个场景 10 分；`outcome`、`interaction`、`boundary` 检查全部通过才得分。每个 profile、每个场景执行 1 次。

## 分项成绩

<table>
  <thead>
    <tr>
      <th rowspan="2">产品入口</th>
      <th rowspan="2">场景</th>
      <th colspan="2"><code>codex-gpt-5.6-sol-medium</code></th>
      <th colspan="2"><code>claude-code-deepseek-flash-medium</code></th>
    </tr>
    <tr>
      <th>分数</th>
      <th>耗时</th>
      <th>分数</th>
      <th>耗时</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Apollo CLI</td><td><code>cli-auth-capability-scope</code></td><td>10/10</td><td>139.9s</td><td>10/10</td><td>43.2s</td></tr>
    <tr><td>Apollo CLI</td><td><code>cli-config-publish</code></td><td>10/10</td><td>117.6s</td><td>10/10</td><td>43.5s</td></tr>
    <tr><td>Apollo CLI</td><td><code>cli-config-sync-release</code></td><td>10/10</td><td>150.3s</td><td>10/10</td><td>56.7s</td></tr>
    <tr><td>Apollo CLI</td><td><code>cli-namespace-create-publish</code></td><td>10/10</td><td>118.0s</td><td>10/10</td><td>50.7s</td></tr>
    <tr><td>Apollo CLI</td><td><code>cli-public-namespace-share</code></td><td>10/10</td><td>150.3s</td><td>10/10</td><td>66.7s</td></tr>
    <tr><td>Apollo CLI</td><td><code>cli-release-rollback</code></td><td>10/10</td><td>134.3s</td><td>10/10</td><td>181.3s</td></tr>
    <tr><td>Apollo Java Client</td><td><code>java-client-change-listener</code></td><td>10/10</td><td>197.8s</td><td>10/10</td><td>457.4s</td></tr>
    <tr><td>Apollo Java Client</td><td><code>java-client-cluster-precedence</code></td><td>10/10</td><td>143.4s</td><td>10/10</td><td>160.0s</td></tr>
    <tr><td>Apollo Java Client</td><td><code>java-client-mixed-namespace-formats</code></td><td>10/10</td><td>221.7s</td><td>10/10</td><td>162.9s</td></tr>
    <tr><td>Apollo Java Client</td><td><code>java-client-typed-read</code></td><td>10/10</td><td>165.6s</td><td>10/10</td><td>92.0s</td></tr>
  </tbody>
</table>

### 检查结果

| 检查类别 | Codex | Claude Code |
|---|---:|---:|
| Outcome | 31/31 | 31/31 |
| Interaction | 17/17 | 17/17 |
| Boundary | 12/12 | 12/12 |
| **合计** | **60/60** | **60/60** |

### 失败项

两个 profile 均无失败项。

## 效率指标

通过 attempt 中位数：

| Profile | 耗时 | Input tokens | Output tokens | Tool calls |
|---|---:|---:|---:|---:|
| `codex-gpt-5.6-sol-medium` | 146.9s | 181,151.5 | 2,941.5 | 22 |
| `claude-code-deepseek-flash-medium` | 79.4s | 347,504.5 | 9,735.5 | 21 |

全部 attempt 合计：

| Profile | 耗时 | Input tokens | Output tokens | Tool calls | Apollo HTTP calls |
|---|---:|---:|---:|---:|---:|
| `codex-gpt-5.6-sol-medium` | 1,539.0s | 2,002,750 | 32,082 | 242 | 60 |
| `claude-code-deepseek-flash-medium` | 1,314.5s | 7,824,966 | 165,126 | 265 | 78 |

## 运行信息

| 项目 | Codex | Claude Code |
|---|---|---|
| Run ID | `smoke-rerun-2026-08-30-1315` | `smoke-deepseek-v4.1-flash-2026-09-12` |
| 完成时间 | 2026-08-30 13:41:38 CST | 2026-09-12 22:12:09 CST |
| Adapter / CLI | Codex / `0.151.0` | Claude Code / `2.1.251` |
| Model | `gpt-5.6-sol` | `deepseek-flash`（DeepSeek-V4.1-Flash） |
| Reasoning effort | `medium` | `medium` |
| Suite | `smoke` | `smoke` |
| Attempts | 每场景 1 次 | 每场景 1 次 |
| Root seed | `20260830` | `20260830` |
| Git HEAD | `9c6f681ace52`（工作区含未提交改动） | `f312d66bf3d0`（工作区含 profile 与文档更新） |
| Node.js / pnpm | `v22.23.2` / `10.24.0` | `v24.20.0` / `10.24.0` |
| Docker | `29.7.2` | `29.7.2` |

| 固定评测依赖 | 版本 |
|---|---|
| Apollo Server | `3.0.0-SNAPSHOT` |
| Apollo CLI | `0.1.0` |
| Apollo Java Client | `2.5.0` |

运行前检查：`pnpm check`，11 个测试文件、24 个测试通过。
