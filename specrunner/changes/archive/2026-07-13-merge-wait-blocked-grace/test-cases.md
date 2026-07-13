# Test Cases: merge-wait blocked grace

## Summary

- **Total**: 10 cases
- **Automated** (unit/integration): 9
- **Manual**: 1
- **Priority**: must: 6, should: 3, could: 1

---

### TC-001: checks succeed, transient BLOCKED clears within grace

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Transient BLOCKED grace period after checks succeed > Scenario: checks succeed, transient BLOCKED clears within grace

---

### TC-002: checks succeed, BLOCKED persists beyond grace

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Transient BLOCKED grace period after checks succeed > Scenario: checks succeed, BLOCKED persists beyond grace

---

### TC-003: set-once on first BLOCKED observation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Grace timer is set-once and never reset > Scenario: set-once on first BLOCKED observation

---

### TC-004: conflict escalation is unchanged

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Existing escalation paths are unaffected > Scenario: conflict escalation is unchanged

---

### TC-005: check failure escalation is unchanged

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Existing escalation paths are unaffected > Scenario: check failure escalation is unchanged

---

### TC-006: none-check grace パスが不変

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 (TBG-05)

**GIVEN** `mergeStateStatus === "CLEAN"` かつ `getCheckStatus` が `state: "none"` を返し続け、`nowFn` で `NONE_CHECK_GRACE_MS` を超過させた状態
**WHEN** merge-wait loop が grace 超過を検出する
**THEN** `exitCode: 0` で merge へ進む（CI なしリポジトリとして扱われる）；`blockedAfterChecksEscalation` は返らない

---

### TC-007: grace 中に全体 timeout が先に到達した場合は timeout escalation が優先

**Category**: unit
**Priority**: should
**Source**: design.md > D4

**GIVEN** `rollup.state === "success"` かつ `isBlocked === true` で grace 継続中（`elapsed < BLOCKED_CHECK_GRACE_MS`）、かつ全体 `effectiveTimeoutMs` が到達した状態
**WHEN** loop が次 iteration に進んで全体 timeout を評価する
**THEN** `blockedAfterChecksEscalation` ではなく timeout 系の escalation が返る；`mergePullRequest` は呼ばれない

---

### TC-008: grace 継続中のログ出力フォーマット

**Category**: unit
**Priority**: could
**Source**: design.md > D3

**GIVEN** `rollup.state === "success"` かつ `isBlocked === true` で `elapsed < BLOCKED_CHECK_GRACE_MS` の状態
**WHEN** loop iteration が実行される
**THEN** stdout に `"checks success but mergeStateStatus BLOCKED"` を含み、経過秒数と grace 上限秒数（`30s`）を含むメッセージが出力される

---

### TC-009: `BLOCKED_CHECK_GRACE_MS` 定数が 30_000 ms で定義されている

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `merge-then-archive.ts` がロードされている
**WHEN** `BLOCKED_CHECK_GRACE_MS` の値を参照する
**THEN** 値は `30000`（30 秒）である；`NONE_CHECK_GRACE_MS` の直後に定義されている

---

### TC-010: typecheck と全テストが green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** 実装完了後のソースツリー（T-01、T-02、T-03 がすべて適用済み）
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** TypeScript 型エラーなし；vitest 全テスト（既存 + 新規 TBG-01〜05）が pass する

---

## Result

```yaml
result: completed
total: 10
automated: 9
manual: 1
must: 6
should: 3
could: 1
blocked_reasons: []
```
