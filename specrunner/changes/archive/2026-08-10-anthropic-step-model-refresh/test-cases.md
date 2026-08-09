# Test Cases: Anthropic step 既定モデルの世代更新

## Summary

- **Total**: 14 cases
- **Automated** (unit/integration): 10
- **Manual**: 0
- **Priority**: must: 13, should: 1, could: 0

---

### TC-001: config 無しで test-case-gen step の既定モデルが解決される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 非 design step の built-in 既定モデルは claude-sonnet-5 である > Scenario: config 無しで test-case-gen step の既定モデルが解決される

---

### TC-002: 全 13 step の built-in 既定が同一世代である

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 非 design step の built-in 既定モデルは claude-sonnet-5 である > Scenario: 全 13 step の built-in 既定が同一世代である

---

### TC-003: design step の既定モデルが claude-opus-5 に解決される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: design step の built-in 既定モデルは claude-opus-5 である（[1m] を付けない）> Scenario: design step の既定モデルが claude-opus-5 に解決される

---

### TC-004: 新規 anthropic scaffold が sonnet-5 を書き既存の design block を持たない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: anthropic init scaffold は claude-sonnet-5 を書き出し steps.design を省略する > Scenario: 新規 anthropic scaffold が sonnet-5 を書き既存の design block を持たない

---

### TC-005: 既存 config は init で上書きされない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: anthropic init scaffold は claude-sonnet-5 を書き出し steps.design を省略する > Scenario: 既存 config は init で上書きされない

---

### TC-006: config でモデル未指定の one-shot query が sonnet-5 を使う

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: one-shot query の fallback モデルは claude-sonnet-5 である > Scenario: config でモデル未指定の one-shot query が sonnet-5 を使う

---

### TC-007: 新既定モデルが provider anthropic に解決される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 新既定モデルは registry で解決可能でなければならない > Scenario: 新既定モデルが provider anthropic に解決される

---

### TC-008: 旧モデル key も解決可能なまま残る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 新既定モデルは registry で解決可能でなければならない > Scenario: 旧モデル key も解決可能なまま残る

---

### TC-009: PROVIDER_DEFAULTS.anthropic.designModel が undefined である

**Category**: unit
**Priority**: must
**Source**: design.md > D3: PROVIDER_DEFAULTS.anthropic.defaultModel を更新、designModel は省略維持

**GIVEN** model-registry.ts の `PROVIDER_DEFAULTS.anthropic` を参照する
**WHEN** `designModel` プロパティの値を確認する
**THEN** `designModel` は `undefined`（プロパティが定義されていない）であり、`defaultModel` は `"claude-sonnet-5"` である

---

### TC-010: init.test.ts の preserve 系 fixture・期待値が据え置かれる

**Category**: unit
**Priority**: must
**Source**: design.md > D7: test 期待値の更新は fresh-scaffold 出力のみ。preserve 系 test の期待値は据え置く

**GIVEN** tests/init.test.ts の input fixture 行（`claude-sonnet-4-6` を持つ existingConfig）および「provider flag ignored（既存 config を上書きしない）」test の期待値行
**WHEN** `bun run test` を実行する
**THEN** preserve 系 test が green であり、該当 fixture 行・期待値行の `claude-sonnet-4-6` は変更されていない

---

### TC-011: step/command ディレクトリに旧モデル文字列が残らない

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06: 検証（grep 掃討 + typecheck + test）

`grep -rnE 'claude-sonnet-4-6|claude-opus-4-6\[1m\]|claude-sonnet-4-5' src/core/step src/core/command --include='*.ts' | grep -v '__tests__'` が 0 件であること

---

### TC-012: model-registry.ts の旧モデル文字列が registry key 行のみに残る

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06: 検証（grep 掃討 + typecheck + test）

`grep -nE 'claude-sonnet-4-6|claude-opus-4-6\[1m\]|claude-sonnet-4-5' src/config/model-registry.ts` の出力が `BUILTIN_MODEL_REGISTRY` の key リテラル行のみ（default 定数・one-shot 定数・コメントに旧モデル名が残らない）であること

---

### TC-013: typecheck が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06: 検証（grep 掃討 + typecheck + test）

verification phase `bun run typecheck` が 0 errors で完了すること

---

### TC-014: test suite が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06: 検証（grep 掃討 + typecheck + test）

verification phase `bun run test` が全テスト pass で完了すること（preserve 系テストを含む）

---

## Result

```yaml
result: completed
total: 14
automated: 10
manual: 0
must: 13
should: 1
could: 0
blocked_reasons: []
```
