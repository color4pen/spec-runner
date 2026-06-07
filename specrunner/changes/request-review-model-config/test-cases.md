# Test Cases: `specrunner request review` に `--model` フラグを追加する

## Summary

- **Total**: 18 cases
- **Automated** (unit/integration): 16
- **Manual**: 2
- **Priority**: must: 9, should: 8, could: 1

---

### TC-001: `--model` 指定時に config の解決結果を上書きする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request review SHALL accept a `--model` flag that overrides the resolved model > Scenario: `--model` が指定されたとき config の解決結果を上書きする

---

### TC-002: `--model` フラグが Unknown flag にならない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request review SHALL accept a `--model` flag that overrides the resolved model > Scenario: `--model` がフラグとして受理され Unknown flag にならない

---

### TC-003: `--model` 未指定時は config 解決チェーンの結果が使われる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 未指定時は既存の解決チェーン挙動を維持 SHALL する > Scenario: `--model` 未指定時は config の解決チェーン結果が使われる

---

### TC-004: config も `--model` も無い場合はコード定数にフォールバックする

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 未指定時は既存の解決チェーン挙動を維持 SHALL する > Scenario: config も `--model` も無い場合はコード定数にフォールバックする

---

### TC-005: 空文字の `--model` はオーバーライドを発生させない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 空の `--model` 値は未指定として扱う MUST > Scenario: 空文字の `--model` はオーバーライドを発生させない

---

### TC-006: `modelOverride` 指定時 SDK query options の `model` が `modelOverride` の値になる

**Category**: unit
**Priority**: must
**Source**: design.md > D1 / tasks.md > T-01

**GIVEN** `queryOneShot` に `modelOverride: "claude-opus-4-8[1m]"` を渡し、かつ config に `steps["request-review"].model: "claude-sonnet-4-6"` が設定されている
**WHEN** `queryOneShot` を実行する
**THEN** SDK に渡る query options の `model` が `"claude-opus-4-8[1m]"` であり、config の `"claude-sonnet-4-6"` は使われない

---

### TC-007: `modelOverride` 未指定時は `resolvedConfig.model` が SDK に渡る

**Category**: unit
**Priority**: must
**Source**: design.md > D1 / tasks.md > T-01

**GIVEN** `queryOneShot` に `modelOverride` を渡さず、config に `steps["request-review"].model: "claude-sonnet-4-6"` が設定されている
**WHEN** `queryOneShot` を実行する
**THEN** SDK に渡る query options の `model` が `"claude-sonnet-4-6"`（resolvedConfig.model）である

---

### TC-008: config も `modelOverride` も無い場合 SDK options の `model` が stepDefaults にフォールバックする

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-01

**GIVEN** `queryOneShot` に `modelOverride` を渡さず、config に request-review 用のモデル設定が存在しない
**WHEN** `queryOneShot` を実行する
**THEN** SDK に渡る query options の `model` が `opts.model`（stepDefaults: `"claude-opus-4-5"`）になる

---

### TC-009: `runReview` に `modelOverride` を渡すと `client.run` に届く

**Category**: unit
**Priority**: must
**Source**: design.md > D2 / tasks.md > T-02

**GIVEN** mock client を用いた `runReview` テスト
**WHEN** `runReview(content, cwd, mockClient, "claude-opus-4-8[1m]")` を呼ぶ
**THEN** `mockClient.run` が `modelOverride: "claude-opus-4-8[1m]"` を含む options で呼ばれる

---

### TC-010: `runReview` の `modelOverride` 引数なしで `client.run` に `undefined` が渡る

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-02

**GIVEN** mock client を用いた `runReview` テスト
**WHEN** `runReview(content, cwd, mockClient)` を `modelOverride` 引数なしで呼ぶ
**THEN** `mockClient.run` に渡る options の `modelOverride` が `undefined` である

---

### TC-011: `runReview` の stepDefaults `claude-opus-4-5` が不変

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-02

**GIVEN** mock client を用いた `runReview` テスト
**WHEN** `runReview(content, cwd, mockClient)` を `modelOverride` 引数なしで呼ぶ
**THEN** `mockClient.run` に渡る options の `model` が `"claude-opus-4-5"` である（stepDefaults が変更されていない）

---

### TC-012: CLI `--model <name>` を指定すると `executeReview` の `opts.model` に届く

**Category**: unit
**Priority**: must
**Source**: design.md > D2 / tasks.md > T-03, T-04

**GIVEN** `executeReview` を mock した CLI テスト（`runMain` 方式）
**WHEN** `request review --model claude-opus-4-8[1m] <slug>` を実行する
**THEN** `executeReview` が `opts.model: "claude-opus-4-8[1m]"` を含む引数で呼ばれる

---

### TC-013: CLI `--model` なしで実行すると `executeReview` の `opts.model` が `undefined`

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03, T-04

**GIVEN** `executeReview` を mock した CLI テスト（`runMain` 方式）
**WHEN** `request review <slug>`（`--model` なし）を実行する
**THEN** `executeReview` に渡る `opts.model` が `undefined` である

---

### TC-014: CLI `--model ""` (空文字) で `executeReview` の `opts.model` が `undefined`

**Category**: unit
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-03, T-04

**GIVEN** `executeReview` を mock した CLI テスト（`runMain` 方式）
**WHEN** `request review --model "" <slug>` を実行する
**THEN** `executeReview` に渡る `opts.model` が `undefined` である（空文字が未指定に正規化される）

---

### TC-015: CLI `--model=<name>` 等号記法でも `Unknown flag` にならない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `executeReview` を mock した CLI テスト（`runMain` 方式）
**WHEN** `request review --model=claude-opus-4-8[1m] <slug>` を等号記法で実行する
**THEN** `Unknown flag` エラーが発生せず、`executeReview` が `opts.model: "claude-opus-4-8[1m]"` で呼ばれる

---

### TC-016: CLI `--model "  "` (空白のみ) で `executeReview` の `opts.model` が `undefined`

**Category**: unit
**Priority**: could
**Source**: design.md > D4

**GIVEN** `executeReview` を mock した CLI テスト（`runMain` 方式）
**WHEN** `request review --model "  " <slug>` を空白のみの値で実行する
**THEN** `executeReview` に渡る `opts.model` が `undefined` である（空白のみが未指定に正規化される）

---

### TC-017: `step-config.ts` および `getStepExecutionConfig` に変更がない

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-01, T-05

**GIVEN** 実装完了後のブランチ
**WHEN** `git diff main -- src/config/step-config.ts` を実行する
**THEN** diff が空（変更なし）であり、解決チェーン本体が手付かずであることを確認する

---

### TC-018: `bun run typecheck && bun run test` が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** 実装完了後のリポジトリ
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型エラーなし・テスト全件パスで終了する

---

## Result

```yaml
result: completed
total: 18
automated: 16
manual: 2
must: 9
should: 8
could: 1
blocked_reasons: []
```
