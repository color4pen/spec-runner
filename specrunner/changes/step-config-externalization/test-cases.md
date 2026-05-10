# Test Cases: step-config-externalization

## Summary

- **Total**: 22 cases
- **Automated** (unit/integration/e2e): 20
- **Manual**: 2
- **Priority**: must: 12, should: 7, could: 3

## Test Cases

### TC-001: step-level config が最優先で解決される

**Category**: unit
**Priority**: must
**Source**: design.md D2 — 解決順序 step-level > defaults > stepDefaults > SDK fallback

**GIVEN** config に `steps.implementer.model: "claude-opus-4"` と `steps.defaults.model: "claude-sonnet-4-6"` が両方設定されている
**WHEN** `getStepExecutionConfig(config, "implementer", { model: "claude-haiku-3", maxTurns: 30 })` を呼ぶ
**THEN** `model` は `"claude-opus-4"`（step-level 値）が返される

---

### TC-002: step-level 未設定時に defaults が使われる

**Category**: unit
**Priority**: must
**Source**: design.md D2 — 解決順序

**GIVEN** config に `steps.defaults.model: "claude-sonnet-4-6"` があり、`steps.implementer` は未設定
**WHEN** `getStepExecutionConfig(config, "implementer", { model: "claude-haiku-3", maxTurns: 30 })` を呼ぶ
**THEN** `model` は `"claude-sonnet-4-6"`（defaults 値）が返される

---

### TC-003: config defaults 未設定時に stepDefaults が使われる

**Category**: unit
**Priority**: must
**Source**: design.md D2 — 解決順序

**GIVEN** `config.steps` が未定義
**WHEN** `getStepExecutionConfig(config, "implementer", { model: "claude-haiku-3", maxTurns: 30 })` を呼ぶ
**THEN** `model` は `"claude-haiku-3"`（stepDefaults 値）が返される

---

### TC-004: maxTurns の解決順序が model と独立して動作する

**Category**: unit
**Priority**: must
**Source**: design.md D2 — フィールドごとに独立した解決順序

**GIVEN** config に `steps.implementer.maxTurns: 90` と `steps.defaults.model: "claude-sonnet-4-6"` が設定されており、`steps.implementer.model` は未設定
**WHEN** `getStepExecutionConfig(config, "implementer", { model: "claude-haiku-3", maxTurns: 30 })` を呼ぶ
**THEN** `maxTurns` は `90`、`model` は `"claude-sonnet-4-6"` がそれぞれ独立して解決される

---

### TC-005: maxTurns: null が unlimited として扱われる

**Category**: unit
**Priority**: must
**Source**: design.md D2、D3、proposal.md — maxTurns: null → unlimited

**GIVEN** config に `steps.defaults.maxTurns: null` が設定されている
**WHEN** `getStepExecutionConfig(config, "implementer", { model: "claude-haiku-3", maxTurns: 30 })` を呼ぶ
**THEN** `maxTurns` は `null` が返される（stepDefaults の 30 に fallback しない）

---

### TC-006: maxTurns: null のとき SDK query() に maxTurns を渡さない

**Category**: integration
**Priority**: must
**Source**: design.md D3 — maxTurns: null の場合は options.maxTurns を省略

**GIVEN** `getStepExecutionConfig` が `{ maxTurns: null }` を返す状態の config が設定されている
**WHEN** `ClaudeCodeRunner.run()` が step を実行する
**THEN** SDK `query()` の options に `maxTurns` フィールドが含まれない

---

### TC-007: maxTurns に数値が設定されているとき SDK query() に数値が渡される

**Category**: integration
**Priority**: must
**Source**: design.md D3 — 解決済みの maxTurns を SDK query() に渡す

**GIVEN** config に `steps.defaults.maxTurns: 60` が設定されている
**WHEN** `ClaudeCodeRunner.run()` が step を実行する
**THEN** SDK `query()` の options に `maxTurns: 60` が渡される

---

### TC-008: steps セクションなしで既存動作が維持される（後方互換）

**Category**: integration
**Priority**: must
**Source**: design.md Context、Goals — 後方互換: steps セクションがなくても既存動作を維持

**GIVEN** `config.json` に `steps` フィールドが存在しない（既存の config 形式）
**WHEN** `ClaudeCodeRunner.run()` が step を実行する
**THEN** step 定義のハードコード値（stepDefaults）が使われ、エラーなく実行される

---

### TC-009: steps: {} （空オブジェクト）でも後方互換が維持される

**Category**: unit
**Priority**: must
**Source**: design.md D2 — steps 未設定時のフォールバック

**GIVEN** config に `steps: {}` が設定されており、`steps.defaults` も step 個別設定も存在しない
**WHEN** `getStepExecutionConfig(config, "implementer", { model: "claude-haiku-3", maxTurns: 30 })` を呼ぶ
**THEN** `model` は `"claude-haiku-3"`、`maxTurns` は `30` が返される

---

### TC-010: init で steps セクションなしの config に steps.defaults が追加される

**Category**: integration
**Priority**: must
**Source**: design.md D4 — runInitLocal() で steps セクション未存在時に steps.defaults を追加

**GIVEN** `~/.config/specrunner/config.json` に `steps` フィールドが存在しない
**WHEN** `specrunner init --runtime=local` を実行する
**THEN** config に以下の `steps.defaults` が追加される: `{ model: "claude-sonnet-4-6", maxTurns: null, timeoutMs: null }`

---

### TC-011: init で既存の steps がある場合は上書きされない

**Category**: integration
**Priority**: must
**Source**: design.md D4 — 既存 config に steps がある場合は上書きしない

**GIVEN** `~/.config/specrunner/config.json` に `steps: { defaults: { maxTurns: 90 } }` が設定されている
**WHEN** `specrunner init --runtime=local` を実行する
**THEN** config の `steps.defaults.maxTurns` は `90` のまま変更されない

---

### TC-012: 既存の step.maxTurns ?? 30 フォールバックが削除されている

**Category**: integration
**Priority**: must
**Source**: tasks.md 3.3 — 既存の step.maxTurns ?? 30 フォールバックを削除

**GIVEN** config に `steps.defaults.maxTurns: null` が設定されており、step 定義に `maxTurns: 60` が存在する
**WHEN** `ClaudeCodeRunner.run()` が step を実行する
**THEN** SDK に渡される maxTurns は `null` 扱い（省略）となり、step 定義の `60` は使われない

---

### TC-013: maxTurns に 0 を指定すると validateConfig がエラーを返す

**Category**: unit
**Priority**: should
**Source**: tasks.md 2.4、2.5 — maxTurns (number>=1 | null) の値検証

**GIVEN** config に `steps.defaults.maxTurns: 0` が設定されている
**WHEN** `validateConfig(config)` を呼ぶ
**THEN** バリデーションエラーが返される

---

### TC-014: maxTurns に負数を指定すると validateConfig がエラーを返す

**Category**: unit
**Priority**: should
**Source**: tasks.md 2.4、2.5 — maxTurns (number>=1 | null) の値検証

**GIVEN** config に `steps.implementer.maxTurns: -1` が設定されている
**WHEN** `validateConfig(config)` を呼ぶ
**THEN** バリデーションエラーが返される

---

### TC-015: model に空文字列を指定すると validateConfig がエラーを返す

**Category**: unit
**Priority**: should
**Source**: tasks.md 2.4、2.5 — model (non-empty string) の値検証

**GIVEN** config に `steps.defaults.model: ""` が設定されている
**WHEN** `validateConfig(config)` を呼ぶ
**THEN** バリデーションエラーが返される

---

### TC-016: timeoutMs に 0 を指定すると validateConfig がエラーを返す

**Category**: unit
**Priority**: should
**Source**: tasks.md 2.4、2.5 — timeoutMs (number>=1 | null) の値検証

**GIVEN** config に `steps.defaults.timeoutMs: 0` が設定されている
**WHEN** `validateConfig(config)` を呼ぶ
**THEN** バリデーションエラーが返される

---

### TC-017: timeoutMs が解決されるが SDK options に含まれない

**Category**: unit
**Priority**: should
**Source**: design.md D3 — timeoutMs は解決するが options には渡さない（SDK 未対応）

**GIVEN** config に `steps.defaults.timeoutMs: 30000` が設定されている
**WHEN** `getStepExecutionConfig(config, "implementer", { model: "claude-haiku-3" })` を呼ぶ
**THEN** `ResolvedStepConfig.timeoutMs` は `30000` が返されるが、SDK `query()` の options に `timeoutMs` フィールドは含まれない

---

### TC-018: step-level の maxTurns: null が defaults の数値より優先される

**Category**: unit
**Priority**: should
**Source**: design.md D2 — null と undefined の区別。null は明示的な unlimited

**GIVEN** config に `steps.defaults.maxTurns: 30` と `steps.implementer.maxTurns: null` が設定されている
**WHEN** `getStepExecutionConfig(config, "implementer", { model: "claude-haiku-3", maxTurns: 60 })` を呼ぶ
**THEN** `maxTurns` は `null` が返される（defaults の 30 に fallback しない）

---

### TC-019: 存在しない step 名を指定しても defaults にフォールバックする

**Category**: unit
**Priority**: should
**Source**: design.md Risks — 存在しない step 名はサイレントに無視

**GIVEN** config に `steps.defaults.maxTurns: 45` が設定されており、`steps.nonexistent-step` は存在しない
**WHEN** `getStepExecutionConfig(config, "nonexistent-step", { model: "claude-haiku-3", maxTurns: 30 })` を呼ぶ
**THEN** `maxTurns` は `45`（defaults 値）が返され、エラーは発生しない

---

### TC-020: ClaudeCodeRunner が解決済みの model を SDK に渡す

**Category**: integration
**Priority**: should
**Source**: tasks.md 3.1、3.4 — config 経由の model 解決を検証

**GIVEN** config に `steps.defaults.model: "claude-opus-4"` が設定されており、step 定義の model は `"claude-haiku-3"`
**WHEN** `ClaudeCodeRunner.run()` が step を実行する
**THEN** SDK `query()` の options の model に `"claude-opus-4"` が渡される

---

### TC-021: init で steps.defaults の maxTurns が null であることが視覚的に確認できる

**Category**: manual
**Priority**: could
**Source**: design.md D4 — null はデフォルトで unlimited を意味する

**GIVEN** `specrunner init --runtime=local` を実行後
**WHEN** `~/.config/specrunner/config.json` をテキストエディタで開く
**THEN** `"maxTurns": null` が JSON として正しく表示され、コメントなしで意図が伝わる形式になっている

---

### TC-022: ManagedAgentRunner が steps config に影響を受けない

**Category**: manual
**Priority**: could
**Source**: design.md D5 — ManagedAgentRunner は対象外

**GIVEN** config に `steps.defaults.maxTurns: 10` が設定されている managed runtime 環境
**WHEN** managed runtime で pipeline を実行する
**THEN** ManagedAgentRunner の動作が変わらず、steps config の設定は無視される（エラーも発生しない）

---

### TC-023: validateConfig が steps フィールドの型を正しく検証する

**Category**: unit
**Priority**: could
**Source**: tasks.md 2.4、2.5 — maxTurns に文字列を指定した場合

**GIVEN** config に `steps.defaults.maxTurns: "unlimited"` が設定されている（文字列）
**WHEN** `validateConfig(config)` を呼ぶ
**THEN** バリデーションエラーが返される
