# Test Cases: egress-ledger-push-failure

## Summary

- **Total**: 15 cases
- **Automated** (unit/integration): 15
- **Manual**: 0
- **Priority**: must: 11, should: 3, could: 1

---

### TC-001: scoped モードで push が失敗した場合に persistBeforePush が呼ばれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: synthesis commit の OID は push 試行前に store へ永続化される > Scenario: scoped モードで push が失敗する

---

### TC-002: guarded モードで push が失敗した場合に persistBeforePush が呼ばれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: synthesis commit の OID は push 試行前に store へ永続化される > Scenario: guarded モードで push が失敗する

---

### TC-003: commitFinalState が push 成功する場合に persistBeforePush が push 前に呼ばれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: commitFinalState の checkpoint / finalize commit OID は push 試行前に store へ永続化される > Scenario: commitFinalState が push 成功する場合

---

### TC-004: commitFinalState が push 失敗した場合も persistBeforePush が呼ばれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: commitFinalState の checkpoint / finalize commit OID は push 試行前に store へ永続化される > Scenario: commitFinalState が push 失敗する場合

---

### TC-005: push 失敗 → halt → resume の egress 検証 pin

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: push 失敗後の resume で synthesis commit / checkpoint commit が egress unknown にならない > Scenario: push 失敗 → halt → resume の egress 検証 pin

---

### TC-006: git push が stderr を出力して失敗した場合に pushFailedError に stderr が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: pushFailedError のメッセージに git の stderr が含まれる > Scenario: git push が stderr を出力して失敗する

---

### TC-007: verifyEgressLedger が branch 付きで呼ばれた場合に EGRESS_UNKNOWN_COMMIT メッセージに branch 名が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: EGRESS_UNKNOWN_COMMIT エラーに実 branch 名が含まれる > Scenario: verifyEgressLedger が branch 付きで呼ばれる

---

### TC-008: scoped モードで push が成功した場合も persistBeforePush が egress check 前に呼ばれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-09

**GIVEN** scoped モードで `commitAndPush` が呼ばれ、commit が正常に作成されている
**WHEN** `pushOnly` が 1 回目で成功する
**THEN** `persistBeforePush` が `runInlineEgressCheck` より前に synthesis commit の OID で呼ばれており、呼び出し順序が「記録 → egress 検証 → push」になっている

---

### TC-009: persistBeforePush が throw した場合に commitAndPush が throw し push が実行されない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-09

**GIVEN** scoped モードで `commitAndPush` が呼ばれ、commit が作成されている
**WHEN** `persistBeforePush` が例外を throw する
**THEN** `commitAndPush` はその例外を rethrow し、`pushOnly` は呼ばれない（fail-closed）

---

### TC-010: commitFinalState の persistBeforePush が throw しても push が試行される（best-effort）

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-10

**GIVEN** `commitFinalState` が呼ばれ、commit が作成されている
**WHEN** `persistBeforePush` が例外を throw する
**THEN** `commitFinalState` は例外を warn として記録し push 試行を継続する（best-effort パス）

---

### TC-011: commitFinalState の push 失敗警告に git stderr が含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** `commitFinalState` が呼ばれ、commit が作成されている
**WHEN** push が 2 回とも失敗し、最終試行の git stderr に "remote: repository not found" のようなメッセージが返る
**THEN** stderrWrite に書き出される push 失敗警告文字列に git stderr のテキストが含まれる

---

### TC-012: verifyEgressLedger に branch を渡さない場合は空文字でフォールバックする

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-08

**GIVEN** `verifyEgressLedger` に `branch` フィールドを渡さず呼ぶ
**WHEN** publish range に台帳未登録の commit が検出される
**THEN** throw される `EGRESS_UNKNOWN_COMMIT` エラーが生成され、branch 箇所が空文字になる（既存動作と同等）

---

### TC-013: parallel-review-round の既存テストが無変更で green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-14

**GIVEN** `CommitPushInfra` に `persistBeforePush` オプショナルフィールドが追加されている
**WHEN** `parallel-review-round-git-effects.test.ts` をそのまま実行する
**THEN** すべてのテストが pass する（既存テストへの影響なし）

---

### TC-014: commit-scoped-paths および executor-oid-capture の既存テストが無変更で green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-14

**GIVEN** `commitAndPush` の実装に persist-before-push ロジックが追加されている
**WHEN** `commit-scoped-paths.test.ts` および `executor-oid-capture.test.ts` をそのまま実行する
**THEN** すべてのテストが pass する（`persistBeforePush` 未指定時は no-op として動作する）

---

### TC-015: typecheck && test 全体が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-14

**GIVEN** T-01 〜 T-13 のすべての実装変更が適用されている
**WHEN** `typecheck && test` をフルで実行する
**THEN** 型エラーなし、テストスイート全体が green で完了する

---

## Result

```yaml
result: completed
total: 15
automated: 15
manual: 0
must: 11
should: 3
could: 1
blocked_reasons: []
```
