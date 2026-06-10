# Test Cases: pipeline error-path テスト拡充

## Summary

- **Total**: 13 cases
- **Automated** (unit/integration): 12
- **Manual**: 1
- **Priority**: must: 11, should: 2, could: 0

---

### TC-001: verification/build-fixer ループ exhaustion → escalation

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: fixer ループ exhaustion は escalation で停止し再開可能にする > Scenario: verification/build-fixer ループの exhaustion

---

### TC-002: spec-fixer ループ exhaustion → escalation

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: fixer ループ exhaustion は escalation で停止し再開可能にする > Scenario: spec-fixer / code-fixer ループの exhaustion

---

### TC-003: code-fixer ループ exhaustion → escalation

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: fixer ループ exhaustion は escalation で停止し再開可能にする > Scenario: spec-fixer / code-fixer ループの exhaustion

---

### TC-004: escalation 停止からの resume 往復

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: escalation で停止した job は resume で再開し完走できる > Scenario: exhaustion 停止からの resume 往復

---

### TC-005: judge 系 no-tool-call → escalation フォールバック

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: follow-up retry 枯渇時は step クラス別にフォールバックする > Scenario: judge 系の no-tool-call フォールバック

---

### TC-006: producer 系 no-tool-call → completionVerdict フォールバック

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: follow-up retry 枯渇時は step クラス別にフォールバックする > Scenario: producer 系の no-tool-call フォールバック

---

### TC-007: decision-needed finding → escalation + awaiting-resume

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: findings 起因の escalation は job を停止させる > Scenario: decision-needed finding による escalation

---

### TC-008: 実在しない file 参照 blocking finding → escalation 上書き

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: findings 起因の escalation は job を停止させる > Scenario: 実在しない file 参照の blocking finding による escalation

---

### TC-009: agent session terminated → SESSION_TERMINATED 記録 + 再開可能停止

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: session 異常終了は SESSION_TERMINATED を記録し再開可能に停止する > Scenario: agent session の terminated 終了

---

### TC-010: verification 部分失敗（build 成功・test 失敗）→ build-fixer ループ入り

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: verification の部分失敗は failed verdict として build-fixer ループに入る > Scenario: build 成功・test 失敗の部分失敗

---

### TC-011: 共有 helper 集約後の既存テスト互換性

**Category**: integration
**Priority**: should
**Source**: tasks.md T-01

**GIVEN** `tests/helpers/pipeline-mock-client.ts` に `buildPipelineMockClient` と `buildMockGithubClient` が集約され、`tests/pipeline-integration.test.ts` と `tests/multi-layer-defense.test.ts` のローカル定義が helper からの import に置き換わっている
**WHEN** `bun run test tests/pipeline-integration.test.ts tests/multi-layer-defense.test.ts` を実行する
**THEN** すべてのテストが従来どおり green であり、型エラーが発生しない

---

### TC-012: nonexistent-ref 分岐で verifyFindingRefs 非空 runtimeStrategy が実際に踏まれる

**Category**: integration
**Priority**: should
**Source**: design.md D6 / tasks.md T-05

**GIVEN** 実在しない file を参照する blocking finding を含む judge step の mock と、`verifyFindingRefs` が非空配列を返す `runtimeStrategy` を注入した pipeline
**WHEN** pipeline が当該 judge step を実行する
**THEN** `verifyFindingRefs` が呼び出されて非空を返し、finding 単体では needs-fix 相当であっても verdict が `escalation` に上書きされ、`result.status` が `awaiting-resume` になる

---

### TC-013: typecheck && test 全件 green

**Category**: manual
**Priority**: must
**Source**: tasks.md T-08

**GIVEN** すべてのテスト追加・helper 集約が完了した状態
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型エラーが 0 件、テストが全件 green であり、`src/` への変更が 0 件である

---

## Result

```yaml
result: completed
total: 13
automated: 12
manual: 1
must: 11
should: 2
could: 0
blocked_reasons: []
```
