# Cross-Boundary Invariants Review — reduce-added-agent-turns — Iteration 1

## Meta

- **reviewer**: cross-boundary-invariants
- **verdict**: approved
- **scope**: 35 source/test files changed (+2520 lines)

---

## Purpose

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## Invariants Checked

### INV-1: `followUpAttempts` = `reportRetry + outputRepair` （文書化済み不変条件）

**状態**: ✅ HOLDS

`agent-runner.ts` の各ループで確認：
- reportRetry loop：`followUpAttempts++; reportRetry++;` が常にペアで実行される（early-return なし）
- outputRepair loop：`followUpAttempts++; outputRepair++;` が常にペアで実行される
- `postWork` は `followUpAttempts` に**含まれない**（設計上の除外）

テストで固定済み（T-06テスト: `reportRetry + outputRepair === followUpAttempts`）。

---

### INV-2: `regressionGateActive(state)` — "skipped" verdict 時の戻り値

**状態**: ✅ HOLDS（設計で明示的に想定済み）

`reviewer-chain.ts:251-264` の `regressionGateActive()`:

```typescript
if (verdict === "needs-fix") return true;
if (verdict === "approved") { /* findings check */ }
return false;  // "skipped" はここに落ちる
```

regression-gate の verdict が "skipped"（空 ledger）のとき `regressionGateActive()` は `false` を返す。

code-fixer routing（`reviewer-chain.ts:475-488`）への影響：
- Priority 2: `!conformanceFixInProgress(s) && regressionGateActive(s)` → false（正しい。空 ledger の gate はfixer sourceになり得ない）
- Priority 3 / Priority 4 のフォールスルーへ

**設計文書（design.md Risks）が明示的に "false が正しい" と確認済み**。空 ledger の gate が fixer source になることはない（fixer を trigger した findings がそもそも存在しない）ため、この挙動は正しい。

---

### INV-3: adr-gen "skipped" → pr-create 遷移（追加された遷移）

**状態**: ✅ HOLDS

`STANDARD_TRANSITIONS` に `{ step: ADR_GEN, on: "skipped", to: PR_CREATE }` が追加された（`types.ts`）。

この遷移がない場合、`getStepOutcome` が "skipped" を返した時点でマッチする遷移行が存在せず pipeline が escalate に落ちる。追加により forward progress（→ pr-create）が保たれる。

既存の `on: "success" → pr-create` / `on: "error" → escalate` は変更なし。`STANDARD_TRANSITIONS` 行数も 37→38 に正しく更新済み。

---

### INV-4: regression-gate "skipped" → conformance 遷移（既存）

**状態**: ✅ HOLDS（変更なし）

`reviewer-chain.ts:460-464` の `{ on: "skipped", to: CONFORMANCE }` は既存遷移であり、本 change は変更していない。空 ledger skip の routing は既存配線で完結する。

---

### INV-5: `skipWhen` が `prepareStepArtifacts` / `buildStepContext` の前で短絡する

**状態**: ✅ HOLDS

`executor.ts` の評価順：
1. `activation` gate（:268-284）
2. **`skipWhen` gate（:292-297）** ← 新設
3. `buildStepContext`（:302）
4. `snapshotMainCheckoutGuard`（:311）
5. `captureHeadSha`（:316）
6. `prepareStepArtifacts`（:321）
7. `validateRequiredInputs`（:326）
8. `runner.run`（:338）

`skipWhen` は副作用を持つ操作より前に short-circuit する。skip 時に artifact テンプレートや git 操作の副作用が発生しない。

---

### INV-6: 既存の宣言的 `activation` gate 挙動の不変性

**状態**: ✅ HOLDS

`activation` gate（:268-284）のコードは変更されていない。`skipWhen` gate は activation gate の**直後に**独立したブロックとして追加された（マージされていない）。両者は独立で、いずれかが成立すれば `{ kind: "skipped" }` を返す。既存の `executor-activation.test.ts` は無改変で green（verification result で確認済み）。

---

### INV-7: provider-neutral core prompt の保護

**状態**: ✅ HOLDS

`buildReportToolCompletionDirective` は `src/adapter/claude-code/completion-directive.ts`（新規）にのみ存在し、`ClaudeCodeRunner` のみが import する。`src/adapter/shared/prompt-builder.ts` には MCP tool 名が現れない（テスト TC-011 でファイル内容を静的解析して確認済み）。

---

### INV-8: report_result 再試行 fallback の存続

**状態**: ✅ HOLDS

`agent-runner.ts` の retry loop（`:701-722` 周辺）および `DEFAULT_TOOL_RETRY` 参照が存在することをテスト（ファイル内容 grep）で確認済み。completion directive は "初回で呼ぶ確率を上げる" 施策であり、fallback は safety net として維持される。

---

### INV-9: `deriveImplReviewerChain` + `collectFindingsLedger` の `skipWhen` / `buildMessage` 間の一貫性

**状態**: ✅ HOLDS

`regression-gate.ts` の `skipWhen`（:111-116）と `buildMessage`（:139-140）は同一の呼び出し（`deriveImplReviewerChain(state)` + `collectFindingsLedger(state, chain)`）を使用する。`skipWhen` が null を返した場合（skip しない場合）のみ `buildMessage` が呼ばれ、同一 state を見るため ledger 評価の一貫性は保たれる。

---

### INV-10: `REPORT_MCP_SERVER_NAME` 定数の移動

**状態**: ✅ HOLDS

定数は同一関数スコープ（`ClaudeCodeRunner.run()`）内での移動。旧位置（:387 付近）から新位置（:341）へ前倒しされた。両方の利用箇所（:350: completion directive 合成、:395: MCP サーバー setup）はいずれも宣言後に位置するため問題なし。

---

## Findings

### FINDING-01 [LOW]: postWork 失敗ターンが `addedTurns.postWork` に計上されない

**箇所**: `agent-runner.ts` postWork loop（:763-779）

```typescript
if (followLastResult && followLastResult.subtype !== "success") {
  return {
    ...
    addedTurns: { reportRetry, postWork, outputRepair },  // postWork をインクリメント前に返す
    ...
  };
}
postWork++;  // 成功時のみインクリメント
```

postWork query が `subtype !== "success"` で失敗した場合、early-return で `postWork` は**インクリメント前**の値を返す。失敗したターンは AI リソースを消費したにもかかわらず計上されない。

対照的に `reportRetry` と `outputRepair` は各 loop で無条件にインクリメントされる（失敗時も計上）。

**影響評価**:
- 文書化された不変条件（`reportRetry + outputRepair === followUpAttempts`）は侵害されない
- `addedTurns` は本 change で追加された新フィールドであり、既存コードは読み取らない
- error path に到達した場合の metrics 精度の問題に留まる
- postWork 失敗のテストケースが存在しないため、意図的な設計かどうかが不明瞭

**推奨**: 次回対応で `postWork++` を early-return の前（失敗時にも計上する方向）か、後（成功のみ計上する設計として明示的にコメント）かを確定させると良い。今サイクルのブロッカーにはならない。

---

### FINDING-02 [INFO]: TC-RG e2e テスト流れの意味変化

**箇所**: `tests/custom-reviewers-e2e.test.ts`（TC-RG-01/02/03）

新しい `skipWhen` により空 ledger では regression-gate が skip されるため、security reviewer が "approved"（findings なし）のみを返す旧テスト設定では regression-gate が実行されなくなった。対処として security reviewer の verdicts を `["needs-fix", "approved"]` に変更した。

この変更により各テストは「security: needs-fix → code-fixer → security: approved → regression-gate: needs-fix/decision-needed/exhaustion」という、旧テストより 1 サイクル多い flow をテストすることになった。regression-gate の中核挙動は引き続き検証されている。

**影響評価**: バグではなく、新挙動に合わせた意図的な更新。コメントで明示されている（"Ledger must be non-empty for regression-gate to run"）。

---

## Summary

| Invariant | Status |
|---|---|
| followUpAttempts = reportRetry + outputRepair | ✅ HOLDS |
| regressionGateActive → false for "skipped" | ✅ HOLDS (correct by design) |
| adr-gen "skipped" → pr-create transition | ✅ HOLDS |
| regression-gate "skipped" → conformance transition | ✅ HOLDS (pre-existing) |
| skipWhen short-circuits before side effects | ✅ HOLDS |
| activation gate behavior unchanged | ✅ HOLDS |
| provider-neutral core prompts | ✅ HOLDS |
| report_result fallback preserved | ✅ HOLDS |
| skipWhen / buildMessage ledger consistency | ✅ HOLDS |
| REPORT_MCP_SERVER_NAME relocation | ✅ HOLDS |

- **verdict**: approved

構造的な cross-boundary invariant 違反は検出されなかった。FINDING-01（LOW）は `postWork` 計測の精度問題であり、既存不変条件を侵害せず、新 metric のセマンティクスに関する軽微な不整合に留まる。
