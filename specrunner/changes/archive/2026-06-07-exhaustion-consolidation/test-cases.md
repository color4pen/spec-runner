# Test Cases: ループ枯渇判定を1箇所に集約する

## Summary

- **Total**: 11 cases
- **Automated** (unit/integration): 9
- **Manual**: 2
- **Priority**: must: 8, should: 2, could: 1

---

### TC-001: 対の fixer を持たない loop step が枯渇する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 枯渇判定は単一メソッドに集約される > Scenario: 対の fixer を持たない loop step が枯渇する

---

### TC-002: reviewer/fixer ペアで fixer 上限到達後の +1 review が needs-fix を返す

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 枯渇判定は単一メソッドに集約される > Scenario: reviewer/fixer ペアで fixer 上限到達後の +1 review が needs-fix を返す

---

### TC-003: fixer 上限到達済みなら bypass で +1 review が許可される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 枯渇判定は単一メソッドに集約される > Scenario: fixer 上限到達済みなら bypass で +1 review が許可される

---

### TC-004: メインループにインラインの maxIterations 比較が存在しない

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: 枯渇判定は単一メソッドに集約される > Scenario: メインループにインラインの maxIterations 比較が存在しない

---

### TC-005: tryExhaust が iteration < maxIterations のとき exhausted: false を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `Pipeline.tryExhaust` を `{ iteration: n, stepName: "some-step", phase: "review-exhausted" }` で呼び出す（`n < maxIterations`）
**WHEN** メソッドが実行される
**THEN** `{ exhausted: false, state: <入力 state そのまま> }` が返り、`pipeline:iteration:exhausted` は emit されず、`handleExhausted` も呼ばれない

---

### TC-006: tryExhaust が bypassIteration >= maxIterations のとき副作用なしで bypass する

**Category**: unit
**Priority**: must
**Source**: design.md > D2, tasks.md > T-01 Acceptance Criteria

**GIVEN** `Pipeline.tryExhaust` を `{ iteration: maxIterations, stepName: "code-review", phase: "review-exhausted", bypassIteration: maxIterations }` で呼び出す
**WHEN** メソッドが実行される
**THEN** `{ exhausted: false, state: <入力 state そのまま> }` が返り、`pipeline:iteration:exhausted` は emit されず、`handleExhausted` も呼ばれない

---

### TC-007: reportIteration 省略時の emit iteration が opts.iteration と一致する

**Category**: unit
**Priority**: should
**Source**: design.md > D4, tasks.md > T-01 Acceptance Criteria

**GIVEN** `Pipeline.tryExhaust` を `{ iteration: maxIterations, stepName: "spec-review", phase: "review-exhausted" }`（`reportIteration` 省略）で呼び出す
**WHEN** 枯渇が発火する
**THEN** `pipeline:iteration:exhausted` イベントの `iteration` フィールドが `opts.iteration`（= `maxIterations`）と等しい

---

### TC-008: reportIteration 指定時の emit iteration が reportIteration と一致する

**Category**: unit
**Priority**: should
**Source**: design.md > D4, tasks.md > T-01 Acceptance Criteria

**GIVEN** `Pipeline.tryExhaust` を `{ iteration: maxIterations, stepName: "code-review", phase: "review-after-final-fix", reportIteration: maxIterations }` で呼び出す（Site C 相当）
**WHEN** 枯渇が発火する
**THEN** `pipeline:iteration:exhausted` イベントの `iteration` フィールドが `reportIteration`（= `maxIterations`）と等しい

---

### TC-009: 既存枯渇関連テストが全て green のまま通る

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** リファクタ後の `pipeline.ts`（`tryExhaust` 集約済み）
**WHEN** 以下のテストファイルを変更せずに実行する: `tests/core/pipeline/pipeline.test.ts`（TC-063 / TC-069）、`tests/pipeline-integration.test.ts`（TC-012 / TC-016 / TC-061 等）、`tests/unit/core/pipeline/pipeline.transitions.test.ts`、`tests/unit/core/pipeline/pipeline.episode-reset.test.ts`、`tests/error-codes.test.ts`
**THEN** 全テストが green であり、`error.code`・`status`・`resumePoint.exhaustionPhase`・iteration 回数・`pipeline:iteration:exhausted` payload の各 assertion が緩められていない

---

### TC-010: bun run typecheck が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** リファクタ後の `pipeline.ts`（`tryExhaust` シグネチャ追加・3箇所呼び出し置換済み）
**WHEN** `bun run typecheck` を実行する
**THEN** 型エラーが0件で終了する

---

### TC-011: Site C 枯渇時に pipeline:loop:exhausted 診断ログが tryExhaust 内から出力される

**Category**: unit
**Priority**: could
**Source**: design.md > D5

**GIVEN** `SPECRUNNER_DEBUG=pipeline` かつ debug ログレベルが有効な環境で `Pipeline.tryExhaust` を Site C 相当の引数（fixer exhaustion）で呼び出す
**WHEN** 枯渇が発火する
**THEN** `logPipelineDiag("pipeline:loop:exhausted", ...)` が呼ばれ、`step=<stepName>` を含むメッセージが出力される

---

## Result

```yaml
result: completed
total: 11
automated: 9
manual: 2
must: 8
should: 2
could: 1
blocked_reasons: []
```
