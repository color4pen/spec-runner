# Test Cases: finish はプロジェクトの merge gate を bypass せず尊重する

## Summary

- **Total**: 17 cases
- **Automated** (unit/integration): 14
- **Manual**: 3
- **Priority**: must: 12, should: 5, could: 0

---

### TC-001: mergeStateStatus BLOCKED → Phase 3 に進まず escalation

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: finish SHALL detect mergeStateStatus BLOCKED and UNSTABLE before merge > Scenario: mergeStateStatus is BLOCKED

---

### TC-002: mergeStateStatus UNSTABLE → Phase 3 に進まず escalation

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: finish SHALL detect mergeStateStatus BLOCKED and UNSTABLE before merge > Scenario: mergeStateStatus is UNSTABLE

---

### TC-003: mergeStateStatus CLEAN → Phase 3 merge に進む（regression なし）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: finish SHALL detect mergeStateStatus BLOCKED and UNSTABLE before merge > Scenario: mergeStateStatus is CLEAN

---

### TC-004: merge API merged:false → recommendedAction に branch protection hint を含む

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: merge API reject SHALL produce actionable branch-protection hint > Scenario: merge API returns merged:false

---

### TC-005: "required status check ... is expected" → transient（retry 対象）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: isMergeTransientFailure SHALL distinguish pending from failed status checks > Scenario: required status check is expected (pending)

---

### TC-006: "required status check ... has failed" → permanent（retry しない）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: isMergeTransientFailure SHALL distinguish pending from failed status checks > Scenario: required status check has failed

---

### TC-007: "required status check" を含むが既知パターン外 → permanent（安全側）

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: isMergeTransientFailure SHALL distinguish pending from failed status checks > Scenario: unknown required status check pattern

---

### TC-008: admin bypass コメントが codebase に残存しない

**Category**: manual
**Priority**: should
**Source**: spec.md > Requirement: admin bypass intent SHALL be removed from codebase > Scenario: no admin bypass comments remain

---

### TC-009: rules.md に merge gate 設計前提が記載されている

**Category**: manual
**Priority**: should
**Source**: spec.md > Requirement: merge gate design premise SHALL be documented > Scenario: rules.md contains merge gate premise

---

### TC-010: PR 既マージ + change folder 存在 → archive 後に markJobArchived

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: already-merged path SHALL archive change folder before marking archived > Scenario: PR already merged, change folder exists

---

### TC-011: PR 既マージ + change folder 不在 → archive skip で正常 markJobArchived

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: already-merged path SHALL archive change folder before marking archived > Scenario: PR already merged, change folder does not exist

---

### TC-012: PR 既マージ + archive 失敗 → markJobArchived 未呼び出しで escalation

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: already-merged path SHALL archive change folder before marking archived > Scenario: PR already merged, archive fails

---

### TC-013: pollMergeStateAfterPush BLOCKED は retry せず即座に return する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `pollMergeStateAfterPush` の mock が最初のポーリングで `mergeStateStatus: "BLOCKED"` を返す  
**WHEN** `pollMergeStateAfterPush` を呼び出す  
**THEN** retry ループに入らず `{ mergeStateStatus: "BLOCKED" }` を即座に返す  
**AND** sleepFn が呼ばれない

---

### TC-014: pollMergeStateAfterPush UNSTABLE は retry せず即座に return する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `pollMergeStateAfterPush` の mock が最初のポーリングで `mergeStateStatus: "UNSTABLE"` を返す  
**WHEN** `pollMergeStateAfterPush` を呼び出す  
**THEN** retry ループに入らず `{ mergeStateStatus: "UNSTABLE" }` を即座に返す  
**AND** sleepFn が呼ばれない

---

### TC-015: isMergeTransientFailure の既存 transient パターンに regression がない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `isMergeTransientFailure` に以下のメッセージをそれぞれ渡す:  
- `"base branch was modified"`  
- `"unstable state"`  
- `"locked"`  
- `"not mergeable"`  
- `"head branch was modified"`  
**WHEN** `isMergeTransientFailure` が判定する  
**THEN** 全パターンで `true`（transient）を返す

---

### TC-016: mergeFeaturePrPhase3 の catch 句 recommendedAction に "branch protection" が含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** `mergePullRequest` が例外をスローするようにモックする  
**WHEN** `mergeFeaturePrPhase3` を実行する  
**THEN** escalation の `recommendedAction` に `"branch protection"` が含まれる

---

### TC-017: bun run typecheck && bun run test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-08、request.md 受け入れ基準

**GIVEN** 全タスク（T-01〜T-07）の実装が完了した状態  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** typecheck エラーがない  
**AND** 全テストが pass する

---

## Result

```yaml
result: completed
total: 17
automated: 14
manual: 3
must: 12
should: 5
could: 0
blocked_reasons: []
```
