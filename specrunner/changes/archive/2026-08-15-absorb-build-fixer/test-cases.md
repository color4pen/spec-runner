# Test Cases: build-fixer の廃止 — verification 失敗は implementer への継続再入で直す

## Summary

- **Total**: 20 cases
- **Automated** (unit/integration): 19
- **Manual**: 0
- **Priority**: must: 19, should: 1, could: 0

---

### TC-001: 標準経路で verification 失敗が implementer へ遷移する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verification 失敗は implementer へ再入する > Scenario: 標準経路で verification 失敗が implementer へ遷移する

---

### TC-002: chore(fast)経路で verification 失敗が implementer へ遷移する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verification 失敗は implementer へ再入する > Scenario: chore(fast)経路で verification 失敗が implementer へ遷移する

---

### TC-003: 前回 session を継続して失敗内容を渡す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 再入は直前 implementer session の継続として実行し失敗内容を渡す > Scenario: 前回 session を継続して失敗内容を渡す

---

### TC-004: 前回 sessionId が無ければ fresh で継続失敗を吸収する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 継続元 session が無い場合は fresh session に fallback する > Scenario: 前回 sessionId が無ければ fresh で継続失敗を吸収する

---

### TC-005: 回復 message に制約文言が含まれない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 再入指示は失敗解消のみで機械的修正制約を課さない > Scenario: 回復 message に制約文言が含まれない

---

### TC-006: 持続失敗で再入上限に達し escalation する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: verification 再入回数の上限は維持される > Scenario: 持続失敗で再入上限に達し escalation する

---

### TC-007: conformance 再検証は fresh な予算で実行される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: verification 再入回数の上限は維持される > Scenario: conformance 再検証は fresh な予算で実行される

---

### TC-008: build-fixer 実行歴を含む state を読み込み fold する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: build-fixer 実行歴を含む既存 state は互換に扱われる > Scenario: build-fixer 実行歴を含む state を読み込み fold する

---

### TC-009: build-fixer 復帰点は implementer へ写される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: build-fixer 実行歴を含む既存 state は互換に扱われる > Scenario: build-fixer 復帰点は implementer へ写される

---

### TC-010: verificationFailedLast が最新 verification=failed で true を返す

**Category**: unit
**Priority**: must
**Source**: design.md D1 / tasks.md T-01 AC

**GIVEN** state に最新 verification run の verdict が `"failed"` として記録されている
**WHEN** `verificationFailedLast(state)` を呼ぶ
**THEN** `true` を返す

---

### TC-011: verificationFailedLast が最新 verification=passed で false を返す

**Category**: unit
**Priority**: must
**Source**: design.md D1 / tasks.md T-01 AC

**GIVEN** state に最新 verification run の verdict が `"passed"` として記録されている
**WHEN** `verificationFailedLast(state)` を呼ぶ
**THEN** `false` を返す

---

### TC-012: verificationFailedLast が verification 未実行で false を返す

**Category**: unit
**Priority**: should
**Source**: design.md D1 / tasks.md T-01 AC

**GIVEN** state に verification run が一件も存在しない
**WHEN** `verificationFailedLast(state)` を呼ぶ
**THEN** `false` を返す(エラーにならない)

---

### TC-013: 遷移表に BUILD_FIXER への遷移が存在しない(STANDARD / FAST 両経路)

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01 AC / tasks.md T-02 AC

**GIVEN** STANDARD_TRANSITIONS と FAST_TRANSITIONS を参照する
**WHEN** `step === BUILD_FIXER` の行を探す
**THEN** 両遷移表ともに該当行が存在しない

---

### TC-014: loopFixerPairs[VERIFICATION] が IMPLEMENTER を指す(STANDARD / FAST)

**Category**: unit
**Priority**: must
**Source**: design.md D1 / tasks.md T-02 AC

**GIVEN** STANDARD_DESCRIPTOR と FAST_DESCRIPTOR の `loopFixerPairs` を参照する
**WHEN** `VERIFICATION` キーの値を確認する
**THEN** 両 descriptor で値が `"implementer"` である

---

### TC-015: STANDARD の IMPLEMENTER→VERIFICATION(verificationFailedLast) が BITE_EVIDENCE 行より前に並ぶ

**Category**: unit
**Priority**: must
**Source**: design.md D2 / tasks.md T-01 AC

**GIVEN** STANDARD_TRANSITIONS を参照する
**WHEN** `step=IMPLEMENTER, on=success` の行の出現順序を確認する
**THEN** `to=VERIFICATION, when=verificationFailedLast` の行が `to=BITE_EVIDENCE` の行より前に存在する(first-match-wins 順序)

---

### TC-016: 回復再入の implementer 完了後、bite-evidence をバイパスして VERIFICATION に直帰する

**Category**: unit
**Priority**: must
**Source**: design.md D2 / tasks.md T-12 (予算回帰防止)

**GIVEN** 最新 verification が `failed`(verificationFailedLast=true)で、implementer が `success` verdict を返した
**WHEN** STANDARD_TRANSITIONS で次 step を解決する
**THEN** 次 step は `BITE_EVIDENCE` ではなく `VERIFICATION` である

---

### TC-017: verification-result.md 不在でも enrichContext が例外を投げない

**Category**: unit
**Priority**: must
**Source**: design.md D3 / tasks.md T-03 AC

**GIVEN** verification-result.md がファイルシステムに存在しない
**WHEN** implementer の `enrichContext(dynamicContext, cwd, slug)` を呼ぶ
**THEN** 例外を投げず、元の `dynamicContext` をそのまま返す

---

### TC-018: conformance 再入(verificationFailedLast=false)時に implementer が resumeSessionId を持たない

**Category**: unit
**Priority**: must
**Source**: design.md D3 / tasks.md T-04 AC

**GIVEN** 最新 verification が `passed`(conformance 再入後の implementer 起動)
**WHEN** `step-context-builder` が implementer の `resumeSessionId` を算出する
**THEN** `resumeSessionId` が `undefined`(従来通り fresh)であり、前回 implementer sessionId は参照されない

---

### TC-019: --from 候補一覧に build-fixer が含まれない

**Category**: unit
**Priority**: must
**Source**: tasks.md T-06 AC

**GIVEN** `AGENT_STEP_NAMES` と `CLI_STEP_NAMES` を結合した `--from` 候補一覧を生成する
**WHEN** 候補に `"build-fixer"` が含まれるか確認する
**THEN** `"build-fixer"` は含まれない

---

### TC-020: typecheck && test が green

**Category**: gate
**Priority**: must
**Source**: tasks.md T-13 AC / request.md 受け入れ基準

`bun run typecheck && bun run test` が全て通過することを確認する。

## Result

```yaml
result: completed
total: 20
automated: 19
manual: 0
must: 19
should: 1
could: 0
blocked_reasons: []
```
