# Test Cases: usage / pricing と one-shot デフォルトモデルの provider 中立化

## Summary

- **Total**: 10 cases
- **Automated** (unit/integration): 9
- **Manual**: 1
- **Priority**: must: 8, should: 2, could: 0

---

### TC-001: OpenAI/Codex モデル名で cost が数値になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: OpenAI / Codex 系モデルが数値の USD コストに解決される > Scenario: OpenAI/Codex モデル名で cost が数値になる

---

### TC-002: 4 軸合算式が OpenAI モデルにも成立する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: OpenAI / Codex 系モデルが数値の USD コストに解決される > Scenario: 4 軸合算式が OpenAI モデルにも成立する

---

### TC-003: 全 registry モデルが pricing を持つ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: registry 登録済みモデルは単価未登録のまま残らない > Scenario: 全 registry モデルが pricing を持つ

---

### TC-004: 未知モデルは null を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 未知モデルは従来どおり料金不明（null / "$?"）を維持する > Scenario: 未知モデルは null を返す

---

### TC-005: config の steps.defaults.model が one-shot モデルを駆動する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: one-shot クエリのデフォルトモデルは config 経由で解決される > Scenario: config の steps.defaults.model が one-shot モデルを駆動する

---

### TC-006: config も opts.model も無いときは共有定数にフォールバックする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: one-shot クエリのデフォルトモデルは config 経由で解決される > Scenario: config も opts.model も無いときは共有定数にフォールバックする

---

### TC-007: 既存 Claude コスト計算が不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存 Claude 系コストと型・式の互換を保つ > Scenario: 既存 Claude コスト計算が不変

---

### TC-008: OpenAI エントリの cacheWrite 単価が 0

**Category**: unit
**Priority**: should
**Source**: design.md > D4: OpenAI 系の単価は input / output / cached-input の 3 軸で表現し、cacheWrite 軸は 0 とする

**GIVEN** `MODEL_PRICING` に登録された OpenAI 系モデル（`o3`, `gpt-5.3-codex` 等）のエントリ
**WHEN** 各エントリの `cacheWrite` フィールドを参照する
**THEN** 全 OpenAI エントリの `cacheWrite` が `0` である

---

### TC-009: adapter / ポートに provider 固有のインラインリテラルが残らない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `src/adapter/claude-code/query-one-shot.ts` および `src/core/port/one-shot-query-client.ts`
**WHEN** provider 固有モデル名のハードコードリテラル（例: `"claude-sonnet-4-5"`）を grep する
**THEN** 該当ファイル内にインラインリテラルが存在せず、`DEFAULT_ONE_SHOT_MODEL` 定数が参照されている

---

### TC-010: typecheck && test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** 本変更の全実装が完了した状態
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型エラー・テスト失敗が 0 件で終了する

---

## Result

```yaml
result: completed
total: 10
automated: 9
manual: 1
must: 8
should: 2
could: 0
blocked_reasons: []
```
