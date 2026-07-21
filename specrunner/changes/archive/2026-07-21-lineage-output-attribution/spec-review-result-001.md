# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 1. 根本原因の確認（コードと archive 突合）

`src/core/step/commit-orchestrator.ts` の `applySuccessPostPersistEffects`（L225-252）を確認した。
現行コードは `step.writes(state, deps)` を内部で呼ぶが、引数 `state` はすでに `projectSuccess` → `pushStepResult` でその step の StepRun が追記された後の状態 `s`（L316 で代入）。
`nextIteration(state, stepName)` = `state.steps[stepName].length + 1` であるため、追記後は長さが +1 されており、返るパスが「次回分」になる。

`specrunner/changes/archive/2026-07-20-packaged-smoke-contract/events.jsonl` を確認:
- step-attempt event: `findingsPath=spec-review-result-002.md`, `endedAt=2026-07-20T13:28:47.719Z`
- lineage event（同 ts）: `outputs=[{path: spec-review-result-003.md, hash: null}]`
- inputs は sha256 ハッシュが正しく記録されている（ファイルが存在するため）
- outputs の hash null は誤ったパス（-003 は存在しない）に起因する帰結であり、独立したバグではない

`nextIteration` 実装（`io-iteration.ts`）: `(state.steps?.[stepName]?.length ?? 0) + 1`。追記後評価でオフバイワンが生じることを確認。

### 2. 影響 step の網羅性確認

`writes()` 内で `nextIteration` を使う step を `src/core/step/` から確認:
- `spec-review.ts`: `nextIteration(state, STEP_NAMES.SPEC_REVIEW)` → affected ✓
- `code-review.ts`: `nextIteration(state, STEP_NAMES.CODE_REVIEW)` → affected ✓
- `conformance.ts`: `nextIteration(state, STEP_NAMES.CONFORMANCE)` → affected ✓
- `request-review.ts`: `nextIteration(state, STEP_NAMES.REQUEST_REVIEW)` → affected ✓
- `custom-reviewer.ts`: `nextIteration(state, snapshot.name)` → affected ✓
- `regression-gate.ts`: `nextIteration(state, REGRESSION_GATE_STEP_NAME)` → affected ✓

design.md に列挙された 6 step がすべてコードと一致。

### 3. 設計判断（D1〜D4）の妥当性確認

- **D1**（commitSuccess での事前評価）: `projectSuccess` 前に `preWriteIo = step.writes(state, deps)` を評価することで、pre-push state での `nextIteration` 計算が保証される。私有メソッドの引数追加のみで外部 API 変更なし。
- **D2**（commitRound の同修正）: ループ内で各メンバーの `projectSuccess` 前に `writes()` / `reads()` を評価し、`successEntries` に保持する。メンバー A の `writes()` 評価時点では A の StepRun 未追記であり、正しい iteration が得られる。
- **D3**（applySuccessPostPersistEffects 署名拡張）: private メソッドであり外部テストから直接モックされない。既存テストは `store.appendLineage` をモックしており、メソッドシグネチャ変更の影響を受けない。
- **D4**（`IoRef` import 追加）: `step-types.ts` で定義済み、型安全のために必要。

### 4. spec.md Requirement / Scenario 対応確認

- Req-1（iteration-dependent path 修正）→ D1/D2 で対応、AC で 2 iteration テストが規定されている
- Req-2（hash non-null）→ outputs パスが正しくなれば `digestArtifacts` が既存実装で正しく sha256 を返す。missing optional input の hash: null は `LocalRuntime.digestArtifacts` の既存挙動（L1158-1171）が担保する。
- Req-3（parallel round 同修正）→ D2 で対応

### 5. tasks.md と design.md の対応確認

| Task | Design 対応 | 整合 |
|------|------------|------|
| T-01: applySuccessPostPersistEffects 署名変更 | D3 | ✓ |
| T-02: commitSuccess の事前評価 | D1 | ✓ |
| T-03: commitRound の事前評価 | D2 | ✓ |
| T-04: 回帰テスト（TC-LAO-01/02/03） | AC 全項目をカバー | ✓ |
| T-05: typecheck + test 確認 | 受け入れ基準 | ✓ |

### 6. 受け入れ基準の検証可能性

- 2 iteration テスト（-001/-002 一致）: TC-LAO-01/02 で明確にアサートされる
- hash non-null 確認: mock `digestArtifacts` で実ファイルを読んで sha256 を返す設計
- 破壊確認: TC-LAO-02 内コメントで「修正前は -003 → hash: null」の挙動を記録する方式。request の受け入れ基準の「記録する」という語と整合
- 既存テスト無改変: `commit-orchestrator.test.ts` のモック対象は `store.appendLineage` であり、private メソッドのシグネチャ変更の影響を受けない

## 検証できなかった項目

- **Managed runtime での hash: null 維持**: `ManagedRuntime.digestArtifacts` が常に `hash: null` を返す実装であることは確認したが（`src/core/runtime/managed.ts`）、managed runtime での統合テストは存在しない。design が "no filesystem available; hash: null remains correct" とスコープ外明示しており影響なし。

## Findings 詳細

### F-01 [low / non-blocking]: request.md 背景記述と archive 証拠の不整合

**location**: `request.md` 背景節「outputs / inputs の hash は計算されず null のまま記録されており」

**内容**: archive の lineage event を実測すると、inputs（spec.md / design.md / tasks.md）は sha256 ハッシュが正しく記録されている。hash: null はパスが誤った outputs のみである。パスが誤るとファイルが存在せず `digestArtifacts` が null を返す—これは独立した hash バグではなくパス誤りの帰結。

**影響**: request.md は説明ドキュメントであり仕様ではないため実装方針に影響しない。spec.md / design.md / tasks.md はいずれも「出力パスが正しくなれば hash も正しく計算される」という正しい関係を記述しており整合している。

**推奨**: None（実装上の対処不要）
