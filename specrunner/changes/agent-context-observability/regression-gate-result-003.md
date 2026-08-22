# Regression Gate Result — agent-context-observability (Iteration 3)

## Summary

10 ledger findings verified. 2 findings are still present (unfixed). 8 findings confirmed fixed.

---

## Finding-by-Finding Verification

### [1] `96daa733` — LOW: T-02 テストファイル名が未指定（新規 vs 既存拡張の曖昧さ）

**File checked**: `specrunner/changes/agent-context-observability/tasks.md` line 26

**Verdict**: ✅ Fixed — not a regression

tasks.md T-02 line 26 に以下の記述が存在する（iteration 2 で修正済み、iteration 3 で維持）:

> `tests/unit/core/usage/context-metrics-types.test.ts` を新規作成し、型 round-trip テストを追加する（`invocation-types.test.ts` と同じスタイルで**同じファイルを拡張するのではなく別ファイルとして作成すること**。…）

ファイル名と新規作成方針が明記されており、曖昧さは解消済み。

---

### [2] `c685d6d4` — LOW: spec.md `contextWindowTokens` の multi-model 解決ロジックが記述されていない

**File checked**: `specrunner/changes/agent-context-observability/spec.md` lines 55–59

**Verdict**: ✅ Fixed — not a regression

spec.md に以下の Note が存在する（iteration 2 で追加済み、iteration 3 で維持）:

> **Note: `contextWindowTokens` の multi-model 解決ロジック**  
> (1) resolved model key が存在し `contextWindow` が number なら、その値を採る。  
> (2) resolved model key が不在または `contextWindow` が number 以外なら、観測できた全 model の `contextWindow` のうち最大値を採る。

---

### [3] `dd3db3dc` — LOW: spec.md runner throw 経路での contextMetrics 欠落が文書化されていない

**File checked**: `specrunner/changes/agent-context-observability/spec.md` lines 157–161

**Verdict**: ✅ Fixed — not a regression

spec.md に以下の Note が存在する（iteration 2 で追加済み、iteration 3 で維持）:

> **Note: runner throw（予期しない例外）経路での contextMetrics**  
> `runner.run()` 自体が予期しない例外を throw した場合（SDK 内部エラー等）、executor は `makeAgentThrowHalt` を生成するが、この経路では `runResult` が得られないため `contextMetrics` は伝播せず、usage.json への追記も行われない。  
> この挙動は設計上 acceptable であり、runner throw 経路に限った既知の限界である。

---

### [4] `dd7ed402` — MEDIUM: `makeDriftHalt` が contextMetrics を受け取らず drift halt の観測証跡が失われる

**File checked**: `src/core/step/step-halt.ts` lines 220–268; `src/core/step/executor.ts` line 404

**Verdict**: ✅ Fixed — not a regression

`makeDriftHalt` のシグネチャが以下に変更されている:

```typescript
export function makeDriftHalt(
  drift: GuardDrift,
  stepName: string,
  slug: string,
  recordOpts?: Omit<StepResultInput, "verdict" | "findingsPath" | "error">,
  contextMetrics?: AgentContextMetrics,   // ← 追加
): StepHalt & { kind: "awaiting-resume" }
```

`executor.ts` 呼び出し箇所（drift detection ブロック）:

```typescript
const halt = makeDriftHalt(drift, step.name, deps.slug, { startedAt }, runResult.contextMetrics);
```

`contextMetrics` が存在する場合は halt に spread される:
```typescript
...(contextMetrics !== undefined ? { contextMetrics } : {}),
```

drift halt でも context metrics が usage.json に書かれる経路が成立している。

---

### [5] `142aabe8` — MEDIUM: success 経路の contextMetrics 永続化が modelUsage ガードに従属し無言廃棄される

**File checked**: `src/core/step/commit-orchestrator.ts` lines 258–279

**Verdict**: ✅ Fixed — not a regression

`applySuccessPostPersistEffects` のガード条件が以下に変更されている:

```typescript
// Write when modelUsage is available OR contextMetrics were observed — whichever is present.
if ((modelUsage || contextMetrics !== undefined) && deps.cwd && deps.slug) {
```

以前の `if (modelUsage && deps.cwd && deps.slug)` から OR 条件に変わり、modelUsage が falsy でも contextMetrics が存在すれば appendInvocation が呼ばれる。

---

### [6] `68615fc7` — LOW: output-repair ターンの非成功 result / error で markExhaustion が呼ばれない

**File checked**: `src/adapter/claude-code/agent-runner.ts` lines 1170–1185

**Verdict**: ✅ Fixed — not a regression

output-repair ループの for-await に non-success result ブランチが追加されている:

```typescript
} else if (message.type === "result") {
  const errorResult = message as SDKResultMessage & { errors?: string[] };
  contextObserver.observeResult(errorResult as Record<string, unknown>);
  const errorJoined = (errorResult.errors ?? []).join(" ").trim();
  if (errorJoined) contextObserver.markExhaustion(errorJoined);
}
```

catch ブロックにも markExhaustion が追加されている:
```typescript
const errText = err instanceof Error ? err.message : String(err);
contextObserver.markExhaustion(errText);
```

postWork 経路との非対称性は解消されている。

---

### [7] `4dab05a8` — MEDIUM: success 経路の contextMetrics 永続化が modelUsage ガードに従属し無言廃棄される（未修正判定だったもの）

**File checked**: `src/core/step/commit-orchestrator.ts` lines 258–279

**Verdict**: ✅ Fixed — not a regression

Finding [5] と同一箇所の同一修正が確認できる。OR 条件への変更により構造的 coupling は解消されている。

---

### [8] `28bdeb9a` — LOW: output-repair ターンの非成功 result / catch 経路で observeResult と markExhaustion が呼ばれない（未修正判定だったもの）

**File checked**: `src/adapter/claude-code/agent-runner.ts` lines 1170–1185

**Verdict**: ✅ Fixed — not a regression

Finding [6] と同一箇所の同一修正が確認できる。

---

### [9] `05d7ed08` — MEDIUM: build-attestation.ts の stepHasUnpriced フラグがリジューム再試行シナリオで step cost を null にする

**File checked**: `src/core/attestation/build-attestation.ts` lines 145–190

**Verdict**: ❌ Still present — regression

`build-attestation.ts` の step コスト集計ループは変更されていない。該当コード:

```typescript
for (const inv of invocations) {
  if (inv.modelUsage === null) {
    // No usage data — cost stays null direction
    stepHasUnpriced = true;
    continue;
  }
  // ... accumulate cost from valid modelUsage entries ...
}

// If any invocation was unpriced, the step cost is null
if (stepHasUnpriced) {
  stepCostUsd = null;
}
```

F-1 fix（contextMetrics を持つ halt が `modelUsage: null` で usage.json に append される）が適用された結果、リジューム再試行シナリオでは同一 stepName に:
1. halt entry: `modelUsage: null` → `stepHasUnpriced = true`
2. 再試行成功 entry: `modelUsage: { ... }` → `stepCostUsd` に正しい値が積まれる

しかしループ後に `if (stepHasUnpriced) stepCostUsd = null` が実行されるため、成功ランの cost が null で上書きされる。spec「halt entry が cost 集計を動かさない」（"Scenario: halt entry が cost 集計を動かさない"）は `usage summary / job stats` を対象としているが、`build-attestation.ts` の PR コメントコスト表示も混在ケースで不正確な値を表示する状態が残っている。

**証拠**: `build-attestation.ts` の `stepHasUnpriced` ロジックが変更されていないことを確認。iteration 3 で `code-fixer` がタッチしたファイル一覧（`src/core/step/step-halt.ts`, `src/core/step/executor.ts`, `tests/unit/core/step/commit-orchestrator-context-metrics.test.ts`, `src/core/step/main-checkout-guard.ts`）に `build-attestation.ts` は含まれていない。

---

### [10] `6968cea7` — LOW: report_result retry ループが非成功 result の observeResult / markExhaustion を呼ばない

**File checked**: `src/adapter/claude-code/agent-runner.ts` lines 1032–1052

**Verdict**: ❌ Still present — regression

report_result retry ループは変更されていない:

```typescript
for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt++) {
  const retryPrompt = retryPolicy.buildPrompt({ attempt, reason: "no-tool-call" });
  const retryOptions: Record<string, unknown> = { ...queryOptions, resume: extractedSessionId };
  // Remove MCP server from retry options to avoid re-registering
  await runFollowUpQueryWithRetry(retryPrompt, retryOptions);  // ← 返り値を捨てている
  followUpAttempts++;
  reportRetry++;
  if (capturedToolResult !== null) break;
  if (attempt === retryPolicy.maxAttempts) break;
}
```

`runFollowUpQueryWithRetry` は `SDKResultMessage | null` を返すが、返り値が検査されない。非成功 result に対して `contextObserver.observeResult()` も `contextObserver.markExhaustion()` も呼ばれない。

`runFollowUpQueryWithRetry` の内部では `contextObserver.observe(message)` は呼ばれる（assistant message の peak 更新には対応する）が、result message の `contextWindowTokens` 抽出（`observeResult`）と exhaustion 分類（`markExhaustion`）は行われない。

postWork ターン（L1075–1096）は返り値を検査して両方を呼ぶ。output-repair ループ（finding [6]/[8]）は iteration 3 で修正された。report_result retry ループのみが唯一の未修正経路として残っている。

---

## Evidence Summary

| # | Ref | Severity | Status |
|---|-----|----------|--------|
| 1 | `96daa733` | LOW | ✅ Fixed |
| 2 | `c685d6d4` | LOW | ✅ Fixed |
| 3 | `dd3db3dc` | LOW | ✅ Fixed |
| 4 | `dd7ed402` | MEDIUM | ✅ Fixed |
| 5 | `142aabe8` | MEDIUM | ✅ Fixed |
| 6 | `68615fc7` | LOW | ✅ Fixed |
| 7 | `4dab05a8` | MEDIUM | ✅ Fixed |
| 8 | `28bdeb9a` | LOW | ✅ Fixed |
| 9 | `05d7ed08` | MEDIUM | ❌ Still present |
| 10 | `6968cea7` | LOW | ❌ Still present |

**Checked**: 10 / **Skipped**: 0 / **Unverified**: 0

2 regressions detected (findings [9] and [10] still present).
