# Spec Review Result: cli-step-observable-progress (round 2)

- **reviewer**: spec-reviewer
- **date**: 2026-05-17
- **verdict**: approved

## Summary

前回 (round 1) の高 severity 指摘 F1（既存テスト 2 件の fixture 更新欠落）は tasks.md §4.2 / §4.3 として追加され解決済み。request.md / design.md / tasks.md の 3 アーティファクト間の整合は取れており、ソースコードの行番号・変数名・step kind 分類の分析も正確。実装可能な状態と判断し approved とする。

## Round 1 指摘の対応確認

| 指摘 | severity | 対応状況 |
|---|---|---|
| F1: pipeline-integration.test.ts:531 / pipeline.test.ts:432 の fixture 更新欠落 | high | ✅ tasks.md §4.2 / §4.3 追加済み |
| F2: request.md の L252 参照が不正確 | low | △ 要件 1 からは L252 除外済み。設計判断 1 / 要件 3 の本文には残存。design.md / tasks.md は正しく除外しており実装に影響なし |
| F3: spec authority の既存フォーマット不一致 (pre-existing) | info | ✅ tasks.md §7.1 で正しいフォーマットに更新予定 |

## 新規検証結果

### V1: step kind 分類の正確性 — ✅

ソースコード上の `kind` フィールドを実際に確認:

| step | kind | loopNames 含 | D4 条件 `cli && !loopNames` |
|---|---|---|---|
| verification | cli | yes | false (loopNames) → `[iter]` 表示 |
| code-review | agent | yes | false (agent) → `[iter]` 表示 |
| delta-spec-validation | cli | no | **true** → `[step]` 表示 |
| pr-create | cli | no | **true** → `[step]` 表示 |
| design | agent | no | false (agent) → silent |
| spec-fixer | agent | no | false (agent) → silent |

design.md D4 の条件 `step.kind === "cli" && !this.loopNames.includes(currentStep)` は全 step で意図通りに機能する。

### V2: bug-fix 軸の変更箇所 — ✅

| 箇所 | 変更 | 正確性 |
|---|---|---|
| L164 guard | `isLoopStep` → `isAnyLoopStep` | ✅ `isAnyLoopStep` は L158 で既に計算済み |
| L166 step name | `this.loopName` → `currentStep` | ✅ |
| L240 guard | `isLoopStep` → `isAnyLoopStep` | ✅ terminal verdict を loopNames 全体に拡大 |
| L242/L244 step name | `this.loopName` → `currentStep` | ✅ |
| L344 guard | `isLoopStep` → `isAnyLoopStep` | ✅ needs-fix 表示を loopNames 全体に拡大 |
| L346 step name | `this.loopName` → `currentStep` | ✅ |
| L304 retries exhausted | `${nextStep}` 追加 | ✅ `nextStep` は L291 で exhaust 対象の loop step |
| L330 retries exhausted | `${exhaustedLoopName}` 追加 | ✅ L328-329 で既に計算済みの変数 |
| L252 Pipeline finished | 変更なし | ✅ `STEP_NAMES.SPEC_REVIEW` ハードコード維持 |
| L361 prevLoopStep | 変更なし | ✅ primary loop の history メッセージ用、変更不要 |

### V3: loopIter 変数のスコープ — ✅

L212 `const loopIter = loopIters.get(currentStep) ?? 0` は per-step counter を取得。`isAnyLoopStep` ガード拡大後も各 step 固有の iter 値を使うため正しい。非 loop step では 0 だが、`[step]` 表示で loopIter は使わないため問題なし。

### V4: verification の verdict 分岐 — ✅

verification は "passed" / "failed" / "escalation" を返す。L240 の terminal verdict block は `outcome === "approved"` と `outcome === "escalation" || outcome === "error"` のみチェック。"passed" → code-review は terminal ではないためこの block に到達しない（nextStep が "end"/"escalate" 以外）。"failed" → build-fixer も同様。"escalation" → escalate のみ terminal に到達し `escalation → halt` が正しく出力される。

### V5: tasks.md のテスト設計 — ✅

- loop-iter-stdout: 5 TC (spec-review 既存維持 / verification bug-fix / code-review bug-fix / verdict 表示 / TC-068 regression note)
- cli-step-output: 7 TC (dsv entry / dsv completion / pr-create entry / pr-create completion / null verdict / verification exclusion / design exclusion)
- fixture 更新: TC-029 + pipeline-integration TC-016 + pipeline.test.ts exhaustion test = 3 箇所

### V6: spec authority 更新 — ✅

tasks.md §7.1 は既存 Requirement "Pipeline Emits Iteration Progress to Stdout" のフォーマット文字列を `<loopName>` → `<currentStep>` に更新し、retries exhausted に `on <exhaustedStep>` を追加。§7.2 は新規 Requirement "Pipeline Emits Step Progress for Non-Loop CliSteps" を追加。spec.md の single source of truth 方針に合致。

### V7: セキュリティ — ✅

stdout 出力の変更のみ。step 名は `STEP_NAMES` 定数と `loopNames` 配列（constructor 引数）由来の内部文字列であり、外部入力のインジェクションリスクなし。

## Findings

### F1: request.md の L252 参照残存 (severity: low, non-blocking, carried forward)

request.md 設計判断 1（L48）に "L242 / L244 / L252 / L346" 、要件 3（L100）に "L242 / L244 / L252 / L346" と L252 が残っているが、L252 は `STEP_NAMES.SPEC_REVIEW` ハードコードであり `this.loopName` を含まない。design.md D2 / tasks.md は正しく L252 を除外しているため実装に影響しない。

### F2: 受け入れ基準の TC 件数 (severity: low, non-blocking)

受け入れ基準（L171）が "cli-step-output 6 件" と記載されているが、要件 4 / tasks.md §6 で列挙された TC は 7 件（§6.1-6.7）。実態は 7 件が正しい。

## Checklist

| 項目 | 判定 |
|---|---|
| request.md ↔ design.md 整合 | ✅ 全設計判断が request の要件をカバー |
| design.md ↔ tasks.md 整合 | ✅ D1-D6 が tasks §1-§7 に対応 |
| tasks.md のコード参照正確性 | ✅ diff が実ソースの行番号・変数名と一致 |
| step kind 分類の正確性 | ✅ V1 で全 step 確認済み |
| テスト網羅性 | ✅ F1 対応済み（§4.2/§4.3 追加）、新規 TC 12 件 |
| spec authority 更新の網羅性 | ✅ 既存 Requirement 更新 + 新規 Requirement 追加 |
| スコープ境界の明確性 | ✅ AgentStep non-loop / --verbose / color を明示的に除外 |
| round 1 指摘の対応 | ✅ F1(high) 解決済み、F2(low) 実装影響なし |
| セキュリティ | ✅ 内部定数由来の stdout 出力のみ |
