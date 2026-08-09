# Test Cases: モデルカタログ更新 (Claude 5 / GPT-5.6)

## Summary

- **Total**: 14 cases
- **Automated** (unit/integration): 10
- **Manual**: 3
- **Priority**: must: 10, should: 1, could: 3

---

### TC-001: new anthropic models resolve to "anthropic"

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: registry SHALL recognize Claude 5 and GPT-5.6 models > Scenario: new anthropic models resolve to "anthropic"

---

### TC-002: new openai models resolve to "openai"

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: registry SHALL recognize Claude 5 and GPT-5.6 models > Scenario: new openai models resolve to "openai"

---

### TC-003: existing models remain resolvable

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: registry SHALL recognize Claude 5 and GPT-5.6 models > Scenario: existing models remain resolvable

---

### TC-004: computeCostUsd returns request-specified cost for each new model

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: cost computation SHALL use the request-specified rates for new and corrected models > Scenario: computeCostUsd returns request-specified cost for each new model

---

### TC-005: corrected gpt-5.5 cost reflects the real price, not the o3 approximation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: cost computation SHALL use the request-specified rates for new and corrected models > Scenario: corrected gpt-5.5 cost reflects the real price, not the o3 approximation

---

### TC-006: every built-in registry model has pricing

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: cost computation SHALL use the request-specified rates for new and corrected models > Scenario: every built-in registry model has pricing

---

### TC-007: PROVIDER_DEFAULTS.openai holds the successor models

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: openai scaffold defaults SHALL migrate to the GPT-5.6 successors > Scenario: PROVIDER_DEFAULTS.openai holds the successor models

---

### TC-008: openai init scaffold writes the successor models

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: openai scaffold defaults SHALL migrate to the GPT-5.6 successors > Scenario: openai init scaffold writes the successor models

---

### TC-009: anthropic init scaffold is unaffected

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: openai scaffold defaults SHALL migrate to the GPT-5.6 successors > Scenario: anthropic init scaffold is unaffected

---

### TC-010: Claude 5 世代モデルに [1m] SKU が追加されていない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** 更新後の `BUILTIN_MODEL_REGISTRY`
**WHEN** 全レジストリキーを列挙する
**THEN** `claude-opus-5[1m]`、`claude-sonnet-5[1m]`、`claude-fable-5[1m]` のいずれも存在しない（Claude 5 世代は 1M context がデフォルトのため別 SKU は追加しない）

---

### TC-011: gpt-5.5 以外の OpenAI 近似行が無変更

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-03 Acceptance Criteria / design.md > D3

**GIVEN** 更新後の `pricing.ts`
**WHEN** `MODEL_PRICING` 内の `gpt-5.4`、`gpt-5.4-mini`、`gpt-5.3-codex-spark` 各行のコメントと数値を確認する
**THEN** これら行には依然として「approximate」系コメントが残っており、数値も変更前のまま（gpt-5.5 行のみが修正対象）

---

### TC-012: gpt-5.5 行から "o3 tier" コメントが削除されている

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** 更新後の `pricing.ts`
**WHEN** `MODEL_PRICING["gpt-5.5"]` 付近のコメントを目視確認する
**THEN** 「approximate using o3 tier」の文言が存在せず、代わりに「OpenAI 公表値(2026-08-09 確認)」相当の出典が記述されている

---

### TC-013: types.ts コメントに Claude 5 世代が pricing 表に無いという誤記が残っていない

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-05 Acceptance Criteria / design.md > D6

**GIVEN** 更新後の `src/core/usage/types.ts`
**WHEN** `computeCostUsd` 付近のコメント（元 50-54 行）を確認する
**THEN** 「claude-opus-5 / claude-sonnet-5 / claude-fable-5 は pricing 表に無いので computeCostUsd は null」という現状と矛盾する記述が存在せず、「表に無いモデルでは null を返す」という一般則の記述は保持されている

---

### TC-014: typecheck && test 全 green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-07 Acceptance Criteria

verification フェーズの `bun run typecheck && bun run test` が全て green で通過すること。TC-006（D5 で意図的に更新した既存 2 テスト）は新値で green、それ以外の既存テストは無変更で green であることを含む。

---

## Result

```yaml
result: completed
total: 14
automated: 10
manual: 3
must: 10
should: 1
could: 3
blocked_reasons: []
```
