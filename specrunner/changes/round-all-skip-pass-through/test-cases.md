# Test Cases: custom reviewer round の全員 skip を構造的 skip として green で通す

## Summary

- **Total**: 19 cases
- **Automated** (unit/integration): 19
- **Manual**: 0
- **Priority**: must: 15, should: 4, could: 0

---

### TC-001: 全 member が担当外 skip → job は awaiting-archive まで到達する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 全員 skip の round は構造的 skip として green で成立する > Scenario: 全 member が担当外 skip → job は awaiting-archive まで到達する

---

### TC-002: 単一 reviewer の全 skip も構造的 skip として通る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 全員 skip の round は構造的 skip として green で成立する > Scenario: 単一 reviewer の全 skip も構造的 skip として通る

---

### TC-003: 集約関数の全 skip は approved

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 全員 skip の round は構造的 skip として green で成立する > Scenario: 集約関数の全 skip は approved

---

### TC-004: skip した member の理由が journal step-attempt record に残る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: per-member の skip 証跡を journal に残す > Scenario: skip した member の理由が journal step-attempt record に残る

---

### TC-005: 全 skip round でも member 証跡が消えない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: per-member の skip 証跡を journal に残す > Scenario: 全 skip round でも member 証跡が消えない

---

### TC-006: skip と error の混在は停止する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: error と skip の区別を維持する > Scenario: skip と error の混在は停止する

---

### TC-007: 集約関数は error 混在で escalation を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: error と skip の区別を維持する > Scenario: 集約関数は error 混在で escalation を返す

---

### TC-008: diff 導出不能で paths 条件付き reviewer が活性化する（既存挙動）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: diff 導出不能時の fail-closed を維持する > Scenario: diff 導出不能で paths 条件付き reviewer が活性化する（既存挙動）

---

### TC-009: 全 skip round 後も member status は pending のまま

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: skip が恒久 free-pass にならない > Scenario: 全 skip round 後も member status は pending のまま

---

### TC-010: 旧 ROUND_ALL_MEMBERS_SKIPPED 状態からの resume が完走する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 後方回復経路 — 旧エラーで停止した job が完走する > Scenario: 旧 ROUND_ALL_MEMBERS_SKIPPED 状態からの resume が完走する

---

### TC-011: aggregateVerdict(["approved","skipped"]) は "approved" を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** member verdict 配列が `["approved", "skipped"]`
**WHEN** `aggregateVerdict` が集約する
**THEN** 戻り値は `"approved"` である（skip が混在しても approved 優先の既存挙動が維持されること）

---

### TC-012: aggregateVerdict(["needs-fix","skipped"]) は "needs-fix" を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** member verdict 配列が `["needs-fix", "skipped"]`
**WHEN** `aggregateVerdict` が集約する
**THEN** 戻り値は `"needs-fix"` である（needs-fix 優先が不変であること）

---

### TC-013: aggregateVerdict([]) は "approved" を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** member verdict 配列が `[]`（空配列）
**WHEN** `aggregateVerdict` が集約する
**THEN** 戻り値は `"approved"` である（空配列の既存挙動が変更されていないこと）

---

### TC-014: aggregateVerdict(["approved","escalation"]) は "escalation" を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** member verdict 配列が `["approved", "escalation"]`
**WHEN** `aggregateVerdict` が集約する
**THEN** 戻り値は `"escalation"` である（escalation 短絡が不変であること）

---

### TC-015: 全 skip round が sticky な ROUND_ALL_MEMBERS_SKIPPED error を null にクリアする

**Category**: unit
**Priority**: must
**Source**: design.md > D2: 全 skip で roundError を設定しない / tasks.md > T-05

**GIVEN** base state に `state.error = { code: "ROUND_ALL_MEMBERS_SKIPPED", … }` と member status `pending` が seed されている
**WHEN** 全員 skip の round を実行する（member 全員が活性化条件不一致で `skipped` を返す）
**THEN** 返却 state の `error` が `null`（sticky error がクリアされる）、outcome が `"approved"`、member status が `pending` のまま維持されている

---

### TC-016: pipeline.ts に ROUND_ALL_MEMBERS_SKIPPED の参照が残らない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** T-03 の実装が完了した `src/core/pipeline/pipeline.ts`
**WHEN** ファイル内に文字列 `"ROUND_ALL_MEMBERS_SKIPPED"` を検索する
**THEN** 一致する参照が 0 件である（終端 seam の dead code 分岐が除去されていること）

---

### TC-017: reviewer-chain.ts に ROUND_ALL_MEMBERS_SKIPPED の参照が残らない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** T-04 の実装が完了した `src/core/pipeline/reviewer-chain.ts`
**WHEN** ファイル内に文字列 `"ROUND_ALL_MEMBERS_SKIPPED"` を検索する
**THEN** 一致する参照が 0 件である（all-members-skipped escalation routing の dead code が除去されていること）

---

### TC-018: canon 束縛テストが無変更で green になる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** `custom-reviewer-canon-binding` の canon 束縛テスト群（invalidation / round-git-scope / `computeCanonHash` / `selectPendingMembers` / `applyRoundResults` の canonHash）
**WHEN** `bun run test` を実行する
**THEN** 全テストが期待値の変更なしに green で通る（本 change が canon 束縛の入出力に触れていないことの回帰確認）

---

### TC-019: executor 活性化テストが無変更で green になる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** `tests/unit/step/executor-activation.test.ts` 等の executor 活性化ゲートテスト群
**WHEN** `bun run test` を実行する
**THEN** 全テストが期待値の変更なしに green で通る（本 change が `executor.ts` の活性化ゲートに触れていないことの回帰確認）

---

## Result

```yaml
result: completed
total: 19
automated: 19
manual: 0
must: 15
should: 4
could: 0
blocked_reasons: []
```
