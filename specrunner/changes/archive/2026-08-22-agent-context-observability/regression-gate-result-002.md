# Regression Gate Result — agent-context-observability (Iteration 2)

## Summary

All 7 ledger findings verified. No regressions detected.

---

## Finding-by-Finding Verification

### [1] `96daa733` — LOW: T-02 テストファイル名が未指定（新規 vs 既存拡張の曖昧さ）

**File checked**: `specrunner/changes/agent-context-observability/tasks.md` line 26

**Verdict**: ✅ Fixed — not a regression

tasks.md T-02 は現在、明示的に次の文言を含む:

> `tests/unit/core/usage/context-metrics-types.test.ts` を新規作成し、型 round-trip テストを追加する（`invocation-types.test.ts` と同じスタイルで**同じファイルを拡張するのではなく別ファイルとして作成すること**。…）

別ファイルとして作成する方針が tasks.md に明記されており、実際に `tests/unit/core/usage/context-metrics-types.test.ts` が存在する。曖昧さは解消済み。

---

### [2] `c685d6d4` — LOW: spec.md `contextWindowTokens` の multi-model 解決ロジックが記述されていない

**File checked**: `specrunner/changes/agent-context-observability/spec.md` lines 55–59

**Verdict**: ✅ Fixed — not a regression

spec.md に以下の Note が追加された:

> **Note: `contextWindowTokens` の multi-model 解決ロジック**  
> result message の `modelUsage` が複数 model を含む場合、`contextWindowTokens` の解決順序は次の通り:  
> (1) resolved model key が存在し `contextWindow` が number なら、その値を採る。  
> (2) resolved model key が不在または `contextWindow` が number 以外なら、観測できた全 model の `contextWindow` のうち最大値を採る。  
> number 以外の値は無視する。この解決ロジックは adapter（`context-observer.ts`）が担い、core 型には関与しない。

design.md D4 のロジックが spec.md にも反映されている。

---

### [3] `dd3db3dc` — LOW: spec.md runner throw 経路での contextMetrics 欠落が文書化されていない

**File checked**: `specrunner/changes/agent-context-observability/spec.md` lines 147–151

**Verdict**: ✅ Fixed — not a regression

spec.md に以下の Note が追加された:

> **Note: runner throw（予期しない例外）経路での contextMetrics**  
> 上記 "exhaustion で halt した step の metrics が usage.json に残る" シナリオは、`runner.run()` が `AgentRunResult`（`completionReason: "error"`）を返す正常失敗経路を指す。  
> これに対して `runner.run()` 自体が予期しない例外を throw した場合（SDK 内部エラー等）、executor は `makeAgentThrowHalt` を生成するが、この経路では `runResult` が得られないため `contextMetrics` は伝播せず、usage.json への追記も行われない。  
> context exhaustion は runner 内部で catch されて `AgentRunResult` として返るため、exhaustion 経路がこの制限を受けることはない。  
> この挙動は設計上 acceptable であり、runner throw 経路に限った既知の限界である。

---

### [4] `142aabe8` — MEDIUM: success 経路の contextMetrics が modelUsage ガードに従属し無言廃棄される

**File checked**: `src/core/step/commit-orchestrator.ts` lines 258–279

**Verdict**: ✅ Fixed — not a regression

元の条件:
```typescript
if (modelUsage && deps.cwd && deps.slug) {
```

修正後:
```typescript
// Write when modelUsage is available OR contextMetrics were observed — whichever is present.
// Using `modelUsage &&` alone would silently discard contextMetrics in runs where
// modelUsage happens to be absent (e.g. provider does not return usage on a turn).
if ((modelUsage || contextMetrics !== undefined) && deps.cwd && deps.slug) {
```

modelUsage が falsy であっても contextMetrics が存在する場合は appendInvocation が呼ばれるよう修正済み。

---

### [5] `68615fc7` — LOW: output-repair ターンの非成功 result / error で markExhaustion が呼ばれない

**File checked**: `src/adapter/claude-code/agent-runner.ts` lines 1170–1185

**Verdict**: ✅ Fixed — not a regression

output-repair ループの for-await に `else if (message.type === "result")` ブランチが追加された:
```typescript
} else if (message.type === "result") {
  // agent-context-observability: non-success result — observe for contextWindow
  // and check whether the error indicates context exhaustion (mirrors postWork path).
  const errorResult = message as SDKResultMessage & { errors?: string[] };
  contextObserver.observeResult(errorResult as Record<string, unknown>);
  const errorJoined = (errorResult.errors ?? []).join(" ").trim();
  if (errorJoined) contextObserver.markExhaustion(errorJoined);
}
```

catch ブロックにも markExhaustion が追加された:
```typescript
const errText = err instanceof Error ? err.message : String(err);
contextObserver.markExhaustion(errText);
```

postWork 経路との非対称性が解消されている。

---

### [6] `4dab05a8` — MEDIUM: success 経路の contextMetrics が modelUsage ガードに従属し無言廃棄される（未修正判定だったもの）

**File checked**: `src/core/step/commit-orchestrator.ts` lines 258–279

**Verdict**: ✅ Fixed — not a regression

[4] と同一の修正が確認できる。code-fixer が iteration 2 でガード条件を `(modelUsage || contextMetrics !== undefined)` に変更している。`modelUsage ?? null` により modelUsage が undefined でも entry に null として書かれる。テストについては `makeSuccessResultWithContextMetrics` の実態は確認していないが、ガード条件の修正により構造的 coupling は解消されている。

---

### [7] `28bdeb9a` — LOW: output-repair ターンの非成功 result / catch 経路で observeResult と markExhaustion が呼ばれない（未修正判定だったもの）

**File checked**: `src/adapter/claude-code/agent-runner.ts` lines 1167–1188

**Verdict**: ✅ Fixed — not a regression

[5] と同一の修正が確認できる。code-fixer が iteration 2 で `else if (message.type === "result")` ブランチと catch ブロックへの markExhaustion を追加している。

---

## Evidence Summary

| # | Ref | Severity | Status |
|---|-----|----------|--------|
| 1 | `96daa733` | LOW | ✅ Fixed |
| 2 | `c685d6d4` | LOW | ✅ Fixed |
| 3 | `dd3db3dc` | LOW | ✅ Fixed |
| 4 | `142aabe8` | MEDIUM | ✅ Fixed |
| 5 | `68615fc7` | LOW | ✅ Fixed |
| 6 | `4dab05a8` | MEDIUM | ✅ Fixed |
| 7 | `28bdeb9a` | LOW | ✅ Fixed |

**Checked**: 7 / **Skipped**: 0 / **Unverified**: 0

No regressions. No contradictions detected.
