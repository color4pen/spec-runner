# Test Cases: lineage-output-attribution

## Summary

- **Total**: 11 cases
- **Automated** (unit/integration): 11
- **Manual**: 0
- **Priority**: must: 9, should: 2, could: 0

---

## A: パス帰属（逐次）

### TC-001: 初回 attempt のパスが -001

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: lineage.outputs must reference files produced by the current attempt > Scenario: first attempt of an iteration-dependent step

---

### TC-002: 2 回目 attempt のパスが -002

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: lineage.outputs must reference files produced by the current attempt > Scenario: second attempt of the same step

---

### TC-010: 3 回目 attempt のパスが -003

**Category**: unit
**Priority**: should
**Source**: design.md > D1

**GIVEN** 同一 iteration-dependent step が 2 回完了し `state.steps[stepName].length === 2` である
**WHEN** 3 回目の `commitSuccess` を呼ぶ
**THEN** `store.appendLineage` に渡される `outputs[0].path` が `-003` で終わる

---

## B: ハッシュ計算

### TC-003: 出力ファイル存在時に sha256 が記録される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: lineage.outputs and inputs hash must be non-null for files that exist > Scenario: output file exists at the correct (fixed) path

---

### TC-004: 任意入力ファイルが存在しない場合 hash は null

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: lineage.outputs and inputs hash must be non-null for files that exist > Scenario: optional input file does not exist

---

## C: 並列ラウンド

### TC-005: 並列 round の単一メンバーが -001 のパスを得る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: parallel round path has the same attribution fix > Scenario: parallel reviewer with iteration-dependent writes

---

### TC-011: 2 メンバー並列 round — フォールド順序の独立性

**Category**: unit
**Priority**: should
**Source**: design.md > D2

**GIVEN** 2 つの iteration-dependent step（step-A, step-B）が `commitRound` のメンバーで、それぞれ先行 run がゼロ
**WHEN** `commitRound` を呼ぶ
**THEN** step-A の `lineage.outputs[0].path` は step-A の `-001` で終わり、step-B の `lineage.outputs[0].path` は step-B の `-001` で終わる（互いの state 追記の影響を受けない）

---

## D: 破壊確認

### TC-006: state 追記後に writes() を評価すると初回で -001 ではなく -002 が記録される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 TC-LAO-02 / request.md > 受け入れ基準

**GIVEN** `applySuccessPostPersistEffects` が pre-push IO を受け取らず、メソッド内で `step.writes(s, deps)` を post-push state `s` で再評価するよう実装を意図的に元に戻した（修正前の挙動）
**WHEN** 先行 run がゼロの状態で初回 `commitSuccess` を実行する
**THEN** `store.appendLineage` に渡される `outputs[0].path` が `-002` で終わる（`-001` でない）→ TC-001 が fail となることを確認する

*注: テストコード内のコメントとして「before this fix, the post-push state had length 1 → nextIteration=2 → path=-002 (missing) → hash=null」と文書化する。*

---

## E: 後方互換

### TC-007: writes() を持たない step では appendLineage が呼ばれない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `step.writes` が `undefined`（write を持たない step）で `commitSuccess` を呼ぶ
**WHEN** `applySuccessPostPersistEffects` が `preWriteIo === []` を受け取る
**THEN** `store.appendLineage` が一切呼ばれない（ガード条件 `preWriteIo.length > 0` が short-circuit する）

---

### TC-008: 既存 commit-orchestrator テストが無改変で green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05 / request.md > 受け入れ基準

**GIVEN** T-01〜T-04 の変更を適用した状態で、`commit-orchestrator.test.ts` の既存テストコードは一切変更しない
**WHEN** `bun run test` を実行する
**THEN** 既存テスト全件が green で、新規 TC-LAO-* も green

---

### TC-009: typecheck がゼロエラーで完了する

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** T-01〜T-04 の変更を適用した状態（`IoRef` インポート追加、`applySuccessPostPersistEffects` シグネチャ変更、`commitSuccess` / `commitRound` の pre-evaluation 追加を含む）
**WHEN** `bun run typecheck` を実行する
**THEN** エラーゼロ（exit code 0）で終了する

---

## Result

```yaml
result: completed
total: 11
automated: 11
manual: 0
must: 9
should: 2
could: 0
blocked_reasons: []
```
