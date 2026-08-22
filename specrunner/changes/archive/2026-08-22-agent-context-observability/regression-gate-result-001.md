# Regression Gate Result — agent-context-observability / Iteration 1

## Summary

7 ledger findings verified. 3 have been resolved (LOW documentation items). 4 remain present in the current code (2 distinct code issues, each recorded by 2 ledger entries).

---

## Finding Verdicts

### [1] `96daa733` — tasks.md T-02: テストファイル名未指定 → **FIXED**

`specrunner/changes/agent-context-observability/tasks.md` line 26 now reads:

> `tests/unit/core/usage/context-metrics-types.test.ts` を新規作成し、型 round-trip テストを追加する（`invocation-types.test.ts` と同じスタイルで**同じファイルを拡張するのではなく別ファイルとして作成すること**。…）

ファイル名と「新規作成」方針が明示されており、曖昧さは解消済み。

---

### [2] `c685d6d4` — spec.md: contextWindowTokens の multi-model 解決ロジック未記述 → **FIXED**

`specrunner/changes/agent-context-observability/spec.md` lines 55–59 に Note が追加されている:

> **Note: `contextWindowTokens` の multi-model 解決ロジック**
> (1) resolved model key が存在し `contextWindow` が number なら、その値を採る。
> (2) resolved model key が不在または `contextWindow` が number 以外なら、観測できた全 model の `contextWindow` のうち最大値を採る。

design.md D4 と整合した解決ロジックが spec.md に明記された。

---

### [3] `dd3db3dc` — spec.md: runner throw 経路での contextMetrics 欠落が文書化されていない → **FIXED**

`specrunner/changes/agent-context-observability/spec.md` lines 147–151 に Note が追加されている:

> **Note: runner throw（予期しない例外）経路での contextMetrics**
> runner.run() 自体が予期しない例外を throw した場合、executor は `makeAgentThrowHalt` を生成するが、この経路では `runResult` が得られないため `contextMetrics` は伝播せず、usage.json への追記も行われない。
> context exhaustion は runner 内部で catch されて `AgentRunResult` として返るため、exhaustion 経路がこの制限を受けることはない。

---

### [4] `142aabe8` — commit-orchestrator: contextMetrics が modelUsage ガード内で無言廃棄 → **REGRESSION**

`src/core/step/commit-orchestrator.ts` lines 259–276 を確認した。`contextMetrics` の `appendInvocation` 呼び出しは依然として `if (modelUsage && deps.cwd && deps.slug)` ブロック内に含まれている。`modelUsage` が falsy な成功 run では `contextObserver.snapshot()` が non-undefined を返しても entry は書かれず、`contextMetrics` が無言廃棄される。修正なし。

```typescript
// L259
if (modelUsage && deps.cwd && deps.slug) {
  await appendInvocation(usageAbsPath, {
    ...
    ...(contextMetrics !== undefined ? { contextMetrics } : {}),  // ← modelUsage 必須の guard 内
  });
}
```

---

### [5] `68615fc7` — agent-runner: output-repair 非成功 result で markExhaustion が呼ばれない → **REGRESSION**

`src/adapter/claude-code/agent-runner.ts` lines 1149–1179 を確認した。output-repair ループの `for await` は `subtype === "success"` ブランチしか持たず、非成功 result に対する `contextObserver.observeResult()` も `markExhaustion()` も存在しない。catch ブロック (lines 1172–1179) も `stderrWrite` のみで `markExhaustion` が欠落している。postWork 経路 (L1075–1080) と非対称のまま。修正なし。

```typescript
// L1154 — success のみ処理
if (message.type === "result" && (message as SDKResultMessage).subtype === "success") {
  // ... usage accumulation only
}
// 非成功 result に対する observeResult / markExhaustion の呼び出しなし

// L1172 catch ブロック — markExhaustion なし
} catch (err) {
  if (abortController.signal.aborted) throw err;
  stderrWrite(`[specrunner] warn: ...`);
}
```

---

### [6] `4dab05a8` — commit-orchestrator: modelUsage ガード修正未適用（[4] と同一箇所） → **REGRESSION**

[4] (`142aabe8`) と同一のコード箇所。code-fixer は iteration 1 以降 `commit-orchestrator.ts` のこのガード条件を変更していない。テスト `makeSuccessResultWithContextMetrics` は常に `modelUsage` を含むため、`modelUsage` 不在ケースの回帰テストも存在しない。

---

### [7] `28bdeb9a` — agent-runner: output-repair 非成功パス修正未適用（[5] と同一箇所） → **REGRESSION**

[5] (`68615fc7`) と同一のコード箇所。`for await` ループに非成功 result 処理が追加されていない。catch ブロックにも `markExhaustion` が追加されていない。TC-029 は postWork のみをカバーし、output-repair 非成功パスの回帰テストは存在しない。

---

## Evidence

| # | Ledger Ref | File | Checked | Status |
|---|-----------|------|---------|--------|
| 1 | `96daa733` | specrunner/changes/agent-context-observability/tasks.md:26 | ✓ | FIXED |
| 2 | `c685d6d4` | specrunner/changes/agent-context-observability/spec.md:55-59 | ✓ | FIXED |
| 3 | `dd3db3dc` | specrunner/changes/agent-context-observability/spec.md:147-151 | ✓ | FIXED |
| 4 | `142aabe8` | src/core/step/commit-orchestrator.ts:259-276 | ✓ | REGRESSION |
| 5 | `68615fc7` | src/adapter/claude-code/agent-runner.ts:1149-1179 | ✓ | REGRESSION |
| 6 | `4dab05a8` | src/core/step/commit-orchestrator.ts:259-276 | ✓ | REGRESSION |
| 7 | `28bdeb9a` | src/adapter/claude-code/agent-runner.ts:1149-1179 | ✓ | REGRESSION |
