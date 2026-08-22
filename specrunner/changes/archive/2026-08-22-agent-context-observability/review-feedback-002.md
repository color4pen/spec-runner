# Code Review Feedback — iteration 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### diff 規模確認
- `git diff main...HEAD --stat`: 41 files changed, 7695 insertions(+), 12 deletions(−)
- 追加ファイル（主要）: `src/kernel/context-metrics.ts` / `src/adapter/claude-code/context-observer.ts` / テスト 6 ファイル
- 変更ファイル（主要）: `src/adapter/claude-code/agent-runner.ts` / `src/core/step/commit-orchestrator.ts` / `src/core/step/executor.ts` / `src/core/step/step-halt.ts` / `src/core/usage/types.ts` / `src/core/port/agent-runner.ts` / `src/core/command/usage-show.ts`

### 前回レビュー（review-feedback-001）で指摘された観察事項の対応確認

**観察 1（success path contextMetrics が modelUsage の存在に依存）**

前回 `if (modelUsage && deps.cwd && deps.slug)` だった guard が今回
`if ((modelUsage || contextMetrics !== undefined) && deps.cwd && deps.slug)` に変更され、
`contextMetrics` だけが存在する場合でも `appendInvocation` が呼ばれるようになった。
TC-043（modelUsage 欠落 + contextMetrics あり の成功 step でも entry が書かれる）が追加されてテストで固定済み ✓

**PR #1070 再レビュー由来の High 指摘（agent 成功後の post-run halt で contextMetrics を引き継ぐ）**

- `makeOutputGateHalt` に `contextMetrics?: AgentContextMetrics` パラメータを追加 ✓
- `makeCommitFailHalt` に `contextMetrics?: AgentContextMetrics` パラメータを追加 ✓
- executor.ts の output contract halt 生成箇所で `runResult.contextMetrics` を渡す ✓
- executor.ts の commit/push fail halt 生成箇所で `runResult.contextMetrics` を渡す ✓
- TC-040（output contract halt）・TC-041（commit/push fail halt）を追加しテストで固定済み ✓

ただし **main-checkout drift halt（`makeDriftHalt`）が未対応**（後述 Finding F-1）。

### 型分離（TC-001, TC-002, TC-021, TC-022）
- `src/kernel/context-metrics.ts`: `import` 文なし（pure type module）。`AgentContextMetrics` は `provider`（必須）+ 7 optional field の 8 field 構成 ✓
- `src/kernel/model-usage.ts`: diff なし（`ModelUsage` の 4 field 無変更）✓
- `src/core/port/agent-runner.ts`: `AgentContextMetrics` を re-export・`AgentRunResult.contextMetrics?: AgentContextMetrics` を追加 ✓

### Context Observer（TC-003〜TC-010, TC-025, TC-026, TC-027, TC-042）
- `src/adapter/claude-code/context-observer.ts`: `node:fs` / `child_process` / SDK runtime value の import なし ✓
- `observe()`: assistant message は sub-agent 除外・replay 除外・全-zero の anyPresent チェック付き ✓
- `observe()`: compact_boundary で compactionCount +1、post_tokens 欠落時は contextTokensAfterCompaction を undefined にリセット ✓
- `snapshot()`: `peakActiveContextTokens !== undefined || contextWindowTokens !== undefined` の場合に `compactionCount ?? 0` を明示（TC-042）✓
- 観測ゼロの invocation では undefined を返す ✓

### Agent Runner 配線（TC-028, TC-029, TC-044）
- `createContextObserver` を `run()` 冒頭で生成 ✓
- main work loop、follow-up loop（postWork / report-retry）、output-repair loop の各 message ループで `contextObserver.observe(message)` を 1 回ずつ呼ぶ（二重計上なし）✓
- success / error result 双方で `contextObserver.observeResult(...)` を呼ぶ ✓
- 非 success result / catch 節 / output-repair 非 success result で `contextObserver.markExhaustion(...)` を呼ぶ（TC-044）✓
- 全 return 経路（agent redirect 超過 / 非 success result / postWork error / result file not found / success / grace-abort success / timeout / catch error）で `contextMetrics: contextObserver.snapshot()` を付ける ✓

### StepHalt / Executor（TC-030, TC-031）
- `makeNonSuccessHalt` / `makeTimeoutHalt` が `Pick<AgentRunResult, "error" | "contextMetrics">` を受け取り、runResult.contextMetrics を spread ✓
- `makeOutputGateHalt` / `makeCommitFailHalt` が `contextMetrics?` パラメータを受け取り、halt に含める ✓
- executor の success return で `runResult.contextMetrics` を `StepExecutionResult` に forward ✓
- `apply()` が `commitHalt(step, state, result.halt, deps)` に `deps` を渡す ✓
- **`makeDriftHalt` は `contextMetrics` パラメータを持たない（F-1 参照）**

### CommitOrchestrator 永続化（TC-013, TC-014, TC-017, TC-018, TC-032, TC-033, TC-040, TC-041, TC-043）
- success path: `(modelUsage || contextMetrics !== undefined) && deps.cwd && deps.slug` 条件で `appendInvocation`（TC-043 修正済み）✓
- halt path: `halt.contextMetrics !== undefined && deps?.cwd && deps?.slug` の 3 条件で best-effort append（`modelUsage: null`、invocation metrics なし）✓
- try/catch で握りつぶし、FSM 遷移・rethrow に影響させない ✓
- `contextMetrics` のない halt では usage.json に entry を追加しない ✓

### Usage Show（TC-015, TC-016, TC-034, TC-035）
- `context:` 行を `metrics:` 行の直後に出力 ✓
- 値が undefined の field は出さない ✓
- `contextMetrics` absent の entry では `context:` 行を出さない ✓
- `modelUsage: null` の halt 由来 entry でも `context:` 行が出て例外にならない ✓

### 非対応 Provider（TC-011, TC-012）
- `src/adapter/codex/agent-runner.ts`: `agent-context-observability` doc comment で contextMetrics を設定しない事実と理由を明記 ✓
- `src/adapter/managed-agent/agent-runner.ts` / `usage.ts`: 同上 ✓
- `tests/unit/adapter/codex/agent-runner-context-metrics.test.ts`: `contextMetrics` が undefined であることを固定 ✓
- `tests/unit/adapter/managed-agent/agent-runner-context-metrics.test.ts`: 同上 ✓

### テスト全体（TC-036, TC-037, TC-038, TC-039）
- `bun run typecheck`: 0 errors ✓
- `bun run test`: 826 test files passed、12295 tests passed | 1 skipped | 2 todo ✓
- `tests/unit/architecture/core-invariants.test.ts`: 72 tests passed ✓
- `tests/unit/dead-code-core.test.ts`: 124 tests passed ✓

### test-cases.md カバレッジ確認（TC-001〜TC-044）

| TC | 内容 | 状態 |
|----|------|------|
| TC-001〜002 | ModelUsage 形状・AgentContextMetrics 分離 | ✓ |
| TC-003〜010 | peak / sub-agent除外 / replay除外 / compaction / exhaustion | ✓ |
| TC-011〜012 | Codex/Managed unavailable / 観測ゼロ | ✓ |
| TC-013〜016 | usage.json 永続化・usage show 表示 | ✓ |
| TC-017〜018 | cost 集計不変・contextMetrics なし halt | ✓ |
| TC-019〜020 | core 契約中立性 | ✓ |
| TC-021〜024 | kernel module 構成・round-trip | ✓ |
| TC-025〜027 | context-observer pure module / allowlist / observeResult | ✓ |
| TC-028〜029 | 全 return 経路・postWork observe | ✓ |
| TC-030〜031 | factory 互換・executor 経路通し | ✓ |
| TC-032〜033 | halt entry 内容・I/O 失敗時 throw 継続 | ✓ |
| TC-034〜035 | usage show 全 field / modelUsage:null 表示 | ✓ |
| TC-036〜039 | 全体 gate | ✓ |
| TC-040〜041 | output contract / commit-push fail halt | ✓ |
| TC-042 | compactionCount: 0 の明示 | ✓ |
| TC-043 | modelUsage 欠落 + contextMetrics あり | ✓ |
| TC-044 | output-repair exhaustion | ✓ |

---

## 検証できなかった項目

None

---

## Findings 詳細

### F-1: `makeDriftHalt` が contextMetrics を引き継がず、drift halt の観測証跡が失われる

**場所**: `src/core/step/step-halt.ts` `makeDriftHalt()` 関数 / `src/core/step/executor.ts` L402

design.md D7 は「agent が success を返した後の post-run halt（**main-checkout drift** / output contract violation / step artifact の commit・push 失敗）でも、`runResult.contextMetrics` を `StepHalt.contextMetrics` へ引き継ぐ（PR #1070 再レビュー [High]）」と明示している。

`makeOutputGateHalt` と `makeCommitFailHalt` は正しく実装されたが、`makeDriftHalt` には `contextMetrics?` パラメータが追加されておらず、executor.ts の drift halt 生成箇所でも `runResult.contextMetrics` が渡されていない。

```typescript
// src/core/step/step-halt.ts — 修正前（現状）
export function makeDriftHalt(
  drift: GuardDrift,
  stepName: string,
  slug: string,
  recordOpts?: Omit<StepResultInput, "verdict" | "findingsPath" | "error">,
  // contextMetrics?: AgentContextMetrics パラメータが存在しない
): StepHalt & { kind: "awaiting-resume" } { ... }

// src/core/step/executor.ts L402 — 修正前（現状）
const halt = makeDriftHalt(drift, step.name, deps.slug, { startedAt });
// runResult.contextMetrics が渡されていない
```

結果として、agent が active context を観測した invocation で main-checkout drift が検知されると、観測済みの context lifecycle データが usage.json に記録されず失われる。

spec.md の "halted step SHALL also append one usage entry when — and only when — context metrics were observed" というルールを満たさない。

**修正方法**:
1. `makeDriftHalt` に `contextMetrics?: AgentContextMetrics` パラメータを追加し、halt に spread する（`makeOutputGateHalt` と同パターン）
2. executor.ts の drift halt 生成箇所で `runResult.contextMetrics` を渡す
3. test-cases.md に "main-checkout drift halt でも contextMetrics が usage.json に残る" TC を追加し、回帰固定する

---

## 観察（Findings に昇格しない情報）

### 観察 1: output-repair 成功 result で observeResult が呼ばれない（非対称）

agent-runner.ts の output-repair ループ内（L1154-1168）で、repair turn が成功した場合は `contextObserver.observeResult()` が呼ばれない。非 success 結果（L1172-1176）は `observeResult` を呼ぶ非対称がある。ただし `contextWindowTokens` はメイン work turn の success result（L1029）で既に設定されており、同一セッション内で contextWindow が変化することは実用上ないため実害なし。

### 観察 2: `makeAgentThrowHalt` で contextMetrics が失われる（既知の設計上の限界）

executor.ts で `runner.run()` が例外を throw した場合、`makeAgentThrowHalt` が生成されるが `contextMetrics` は含まれない。spec.md（D7 Note）に明示的に文書化されており設計上 acceptable。ClaudeCodeRunner は context exhaustion を含む全例外を内部で catch して `AgentRunResult` として返すため、観測データが失われる実用上のケースは `SpecRunnerError`（プログラミングエラー）のみ。

### 観察 3: all-zero 明示値で exhaustionAtTokens = 0 になりうる（理論的エッジケース）

SDK が usage field を全て明示的に 0 で返した場合、`anyPresent = true` なので `lastActiveContextTokens = 0` が設定され `exhaustionAtTokens = 0` になりうる。実際の SDK 応答でこのケースは発生しないが、将来の混乱を防ぐため「0 は有効な観測値（provider 報告値そのまま）」を doc comment に追記するとよい（任意改善）。
