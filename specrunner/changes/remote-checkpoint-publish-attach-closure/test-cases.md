# Test Cases: remote checkpoint publish / attach correctness closure

## Summary

- **Total**: 20 cases
- **Automated** (unit/integration): 18
- **Manual**: 2
- **Priority**: must: 15, should: 4, could: 1

---

## Publisher（quiescent checkpoint publish）

### TC-001: escalation 出口で checkpoint が publish される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 制御された awaiting-resume 出口で checkpoint を単一 commit として publish する > Scenario: escalation 出口で checkpoint が publish される

---

### TC-002: exhaustion 出口で checkpoint が publish される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 制御された awaiting-resume 出口で checkpoint を単一 commit として publish する > Scenario: exhaustion 出口で checkpoint が publish される

---

### TC-003: guard halt 出口で checkpoint が publish される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 制御された awaiting-resume 出口で checkpoint を単一 commit として publish する > Scenario: guard halt 出口で checkpoint が publish される

---

### TC-004: push 失敗でも local resume 可能性を保つ

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 制御された awaiting-resume 出口で checkpoint を単一 commit として publish する > Scenario: push 失敗でも local resume 可能性を保つ

---

### TC-005: 正常完了は awaiting-resume publisher を経由しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 制御された awaiting-resume 出口で checkpoint を単一 commit として publish する > Scenario: 正常完了は awaiting-resume publisher を経由しない

---

### TC-006: commit message label が status から正しく導出される

**Category**: unit
**Priority**: should
**Source**: tasks.md T-05 / design.md D5

**GIVEN** `LocalRuntime.commitFinalState` が `state.status = "awaiting-resume"` の state を受け取る
**WHEN** `commitFinalState` が primitive を呼ぶ
**THEN** primitive に渡される `messageLabel` は `"checkpoint"` であり、commit message は `checkpoint: <slug>` となる

---

### TC-007: 既定 label finalize で commit-final-state 既存テストが green

**Category**: unit
**Priority**: should
**Source**: tasks.md T-05 / design.md D5

**GIVEN** `commitFinalState` に `messageLabel` を渡さない（既定）
**WHEN** primitive が commit を作る
**THEN** commit message は従来どおり `finalize: <slug>` であり、既存の `commit-final-state` テストは無改変で green

---

### TC-008: awaiting-resume publish が loop 末尾 seam の 1 箇所のみで起きる

**Category**: integration
**Priority**: should
**Source**: tasks.md T-08 / design.md D5

**GIVEN** pipeline が `awaiting-resume` へ遷移する（escalation / exhaustion / guard halt のいずれか）
**WHEN** `runInternal` の while ループが終端する
**THEN** `deps.runtimeStrategy.commitFinalState` の呼び出しは loop 末尾 seam で 1 回のみ観測され、escalation / exhaustion / commitHalt の個別処理箇所には commit/push が存在しない

---

## OID 固定（immutable checkpoint identity）

### TC-009: fetch 後に解決した OID が read/verify/materialize を貫く

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: attach は fetch 直後に解決した commit OID を read・verify・materialize で貫く > Scenario: fetch 後に解決した OID が read/verify/materialize を貫く

---

### TC-010: 検証後に origin が動いても検証済み OID を materialize する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: attach は fetch 直後に解決した commit OID を read・verify・materialize で貫く > Scenario: 検証後に origin が動いても検証済み OID を materialize する

---

## branch 非破壊（materialization safety）

### TC-011: 既存 local branch は attach 失敗後も残る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: attach は既存 local branch を破壊しない > Scenario: 既存 local branch は attach 失敗後も残る

---

### TC-012: attach が作成した branch は失敗時に掃除される

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: attach は既存 local branch を破壊しない > Scenario: attach が作成した branch は失敗時に掃除される

---

### TC-013: new-run の自己作成 branch cleanup は不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: attach は既存 local branch を破壊しない > Scenario: new-run の自己作成 branch cleanup は不変

---

## checkpoint 述語（predicate closure）

### TC-014: version 2 で events.jsonl 欠落を拒否する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: checkpoint 述語は tree の自己整合を D2 まで検証してから再束縛する > Scenario: version 2 で events.jsonl 欠落を拒否する

---

### TC-015: counter reversal を拒否する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: checkpoint 述語は tree の自己整合を D2 まで検証してから再束縛する > Scenario: counter reversal を拒否する

---

### TC-016: resume step の必須入力欠落を拒否する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: checkpoint 述語は tree の自己整合を D2 まで検証してから再束縛する > Scenario: resume step の必須入力欠落を拒否する

---

### TC-017: attach 対象は awaiting-resume のみ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: checkpoint 述語は tree の自己整合を D2 まで検証してから再束縛する > Scenario: attach 対象は awaiting-resume のみ

---

## cross-environment E2E

### TC-018: publish した checkpoint を別環境が同一 OID で attach・resume する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: cross-environment resume が publish と attach で閉じる > Scenario: publish した checkpoint を別環境が同一 OID で attach・resume する

---

## 既存挙動保存

### TC-019: 既存挙動保存テストが無変更で green

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 既存の attach / commit / worktree 挙動を保存する > Scenario: 既存挙動保存テストが無変更で green

---

## ドキュメント是正

### TC-020: ADR Positive 文言の是正と D7 citation の消去を確認する

**Category**: manual
**Priority**: could
**Source**: tasks.md T-06 / design.md D6

**GIVEN** 本 change の実装が完了している
**WHEN** `architecture/adr/2026-07-15-remote-checkpoint-reattachment-boundary.md` の Positive 文言と `src/` 配下の `ADR-20260715 D7` コメントを目視・grep で確認する
**THEN** Positive 文言は publisher 完成後の事実（cross-env resume が閉じる）と一致し、`src/` 配下に `ADR-20260715 D7` の citation が 0 件である

---

## Result

```yaml
result: completed
total: 20
automated: 19
manual: 1
must: 15
should: 4
could: 1
blocked_reasons: []
```
