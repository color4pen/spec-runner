# Test Cases: 配布を GitHub Packages から npmjs.com に切り替える

## Summary

- **Total**: 9 cases
- **Automated** (unit/integration): 4
- **Manual**: 5
- **Priority**: must: 8, should: 1, could: 0

---

### TC-001: 素の config で step 既定モデルが CONFIG_INVALID にならない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 素の config で全 pipeline step 既定モデルが解決可能でなければならない > Scenario: 素の config で step 既定モデルが CONFIG_INVALID にならない

---

### TC-002: README 設定例のモデル ID が CONFIG_INVALID にならない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 素の config で全 pipeline step 既定モデルが解決可能でなければならない > Scenario: README 設定例のモデル ID が CONFIG_INVALID にならない

---

### TC-003: global 定義済み環境で merge 結果が不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存環境のモデル解決挙動を変更してはならない > Scenario: global 定義済み環境で merge 結果が不変

---

### TC-004: publishConfig が npmjs public を指す

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: 配布パッケージは npmjs public registry を対象としなければならない > Scenario: publishConfig が npmjs public を指す

---

### TC-005: publish workflow に GitHub Packages 参照が残っていない

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: 配布パッケージは npmjs public registry を対象としなければならない > Scenario: publish workflow に GitHub Packages 参照が残っていない

---

### TC-006: npm pack の内容物が不変

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: パッケージ内容物を変更してはならない > Scenario: npm pack の内容物が不変

---

### TC-007: step 既定値の model 文字列が変更前と同一

**Category**: unit
**Priority**: must
**Source**: design.md > D1: モデル整合は「registry へ ID 追加」で解消し、参照側（step 既定値 / README 例）は変更しない

**GIVEN** `src/core/step/design.ts` / `code-review.ts` / `conformance.ts` / `spec-review.ts` の実装
**WHEN** 各 step の `agent.model` を参照する
**THEN** いずれも `"claude-opus-4-6[1m]"` のままであり、他の ID に変更されていない

---

### TC-008: test が step 定義から model を import している（ドリフト検出構造）

**Category**: manual
**Priority**: should
**Source**: design.md > D5: 素の config でモデル既定値が解決することを test で固定する / tasks.md > T-05

**GIVEN** TC-001 / TC-002 に対応する test ファイルのソース
**WHEN** test 内の model 値取得方法を確認する
**THEN** model 文字列をハードコードせず各 step 定義から import しており、将来 step 既定値が変わると test が落ちる構造になっている

---

### TC-009: typecheck が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-06: 内容物不変性と品質ゲートを確認する

**GIVEN** 本変更を適用したソースツリー
**WHEN** `bun run typecheck` を実行する
**THEN** 型エラーが 0 件で正常終了する

---

## Result

```yaml
result: completed
total: 9
automated: 4
manual: 5
must: 8
should: 1
could: 0
blocked_reasons: []
```
