# Test Cases: config schema zod migration

## Summary

- **Total**: 25 cases
- **Automated** (unit/integration): 23
- **Manual**: 2
- **Priority**: must: 13, should: 10, could: 2

---

### TC-001: 妥当な config がスキーマ検証を通る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: validateConfig は zod スキーマで構造検証する > Scenario: 妥当な config がスキーマ検証を通る

---

### TC-002: 型不一致をスキーマが検出する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: validateConfig は zod スキーマで構造検証する > Scenario: 型不一致をスキーマが検出する

---

### TC-003: 検証失敗は CONFIG_INVALID code とパス入りメッセージを持つ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: エラー契約（code / exit code / hint / メッセージ形式）を維持する > Scenario: 検証失敗は CONFIG_INVALID code とパス入りメッセージを持つ

---

### TC-004: model registry 不在は CONFIG_INVALID code を持ち store で CONFIG_INVALID になる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: エラー契約（code / exit code / hint / メッセージ形式）を維持する > Scenario: model registry 不在は CONFIG_INVALID code を持ち store で CONFIG_INVALID になる

---

### TC-005: no-code 例外サイトの挙動を忠実に再現する（maxRetries）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: エラー契約（code / exit code / hint / メッセージ形式）を維持する > Scenario: no-code 例外サイトの挙動を忠実に再現する

---

### TC-006: nested byRequestType を後段チェックが拒否する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 複雑条件はスキーマ後段の独立チェックとして分離する > Scenario: nested byRequestType を後段チェックが拒否する

---

### TC-007: byRequestType の空文字キーを後段チェックが拒否する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 複雑条件はスキーマ後段の独立チェックとして分離する > Scenario: byRequestType の空文字キーを後段チェックが拒否する

---

### TC-008: managed runtime での OpenAI model を後段チェックが拒否する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 複雑条件はスキーマ後段の独立チェックとして分離する > Scenario: managed runtime での OpenAI model を後段チェックが拒否する

---

### TC-009: 未知 request type キーは throw しない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 未知 request type は警告のみで拒否しない > Scenario: 未知 request type キーは throw しない

---

### TC-010: 旧 config の未知フィールドを拒否せず保持する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 未知/レガシーフィールドを保持し load / migration 挙動を変えない > Scenario: 旧 config の未知フィールドを拒否せず保持する

---

### TC-011: runtime 未設定は migration で local になり検証を通る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 未知/レガシーフィールドを保持し load / migration 挙動を変えない > Scenario: runtime 未設定は migration で local になり検証を通る

---

### TC-012: root 非オブジェクトで no-code エラー

**Category**: unit
**Priority**: must
**Source**: design.md > D3: エラー翻訳層 / tasks.md > T-02

**GIVEN** `validateConfig` に配列 `[1, 2, 3]` を渡す
**WHEN** `validateConfig` を呼ぶ
**THEN** throw された error の `message` は `Config must be a JSON object.` であり、`.code` プロパティを持たない

---

### TC-013: version !== 1 で no-code エラー

**Category**: unit
**Priority**: must
**Source**: design.md > D3: エラー翻訳層 / tasks.md > T-02

**GIVEN** `{ version: 2, agents: {} }`
**WHEN** `validateConfig` を呼ぶ
**THEN** throw された error の `message` は `Config version must be 1.` であり、`.code` プロパティを持たない

---

### TC-014: multi-constraint 数値フィールドの型違反が同一 reason を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `{ version: 1, specReview: { pollIntervalMs: 1.5 } }`（float は int 制約違反）
**WHEN** `validateConfig` を呼ぶ
**THEN** error の `message` は `specReview.pollIntervalMs must be a positive integer.` を含み、型不一致・非整数・範囲外いずれの違反も同一 reason を返す

---

### TC-015: agents.<k> value が非 object で CONFIG_INVALID + path

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `{ version: 1, agents: { implementer: "string-value" } }`
**WHEN** `validateConfig` を呼ぶ
**THEN** error の `message` は `CONFIG_INVALID` と `agents.implementer` と `must be an object.` を含み、`.code` は `"CONFIG_INVALID"` である

---

### TC-016: verification.commands[i] union 全滅時のメッセージ

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `{ version: 1, verification: { commands: [123] } }`（number は string でも object でもない）
**WHEN** `validateConfig` を呼ぶ
**THEN** error の `message` は `verification.commands[0]` と `must be a string or object with a run field.` を含む

---

### TC-017: github.apiBaseUrl が https:// で始まらない場合を拒否する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `{ version: 1, github: { apiBaseUrl: "http://api.github.example.com" } }`
**WHEN** `validateConfig` を呼ぶ
**THEN** error の `message` は `github.apiBaseUrl` と `must start with https://.` を含む

---

### TC-018: logs.maxJobs が範囲外を拒否する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `{ version: 1, logs: { maxJobs: 0 } }`（1–1000 範囲外）
**WHEN** `validateConfig` を呼ぶ
**THEN** error の `message` は `logs.maxJobs` と `must be an integer between 1 and 1000.` を含む

---

### TC-019: archive.protectedPaths[i] の空文字を拒否する

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-01

**GIVEN** `{ version: 1, archive: { protectedPaths: ["valid", ""] } }`
**WHEN** `validateConfig` を呼ぶ
**THEN** error の `message` は `archive.protectedPaths[1]` と `must be a non-empty string.` を含む

---

### TC-020: byRequestType 内の model が registry 不在で CONFIG_INVALID

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `{ version: 1, steps: { "code-review": { byRequestType: { "spec-change": { model: "nonexistent-model" } } } } }`
**WHEN** `validateConfig` を呼ぶ
**THEN** error の `message` は `steps.code-review.byRequestType.spec-change.model` と `is not in the model registry` を含み、`.code` は `"CONFIG_INVALID"` である

---

### TC-021: step.model が registry 不在で CONFIG_INVALID（unit 直接呼び出し）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `{ version: 1, steps: { implementer: { model: "nonexistent-model" } } }`
**WHEN** `validateConfig` を直接呼ぶ
**THEN** error の `message` は `steps.implementer.model` と `is not in the model registry` を含み、`.code` は `"CONFIG_INVALID"` である

---

### TC-022: nested オブジェクト内の未知フィールドが return value に保持される

**Category**: unit
**Priority**: could
**Source**: design.md > D2: validation-only

**GIVEN** `{ version: 1, steps: { implementer: { model: "claude-sonnet-4-5", customProp: "keep-me" } } }`
**WHEN** `validateConfig` を呼ぶ
**THEN** 例外を throw せず、返り値の `steps.implementer.customProp` は `"keep-me"` を保持している

---

### TC-023: store.ts / migrate.ts の既存テストが無改変で green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** `src/config/store.ts` と `src/config/migrate.ts` を変更しない実装
**WHEN** `tests/config/store.test.ts`（overlay / deep merge / standalone / CONFIG_MISSING / invalid JSON）と `tests/unit/config/migrate.test.ts` を実行する
**THEN** 全テストが green であり、テストファイル自体に変更が不要である

---

### TC-024: typecheck && test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** 実装完了後の `src/config/schema.ts`
**WHEN** `tsc --noEmit && vitest run` を実行する
**THEN** typecheck エラーも test 失敗も 0 件である

---

### TC-025: report-result.ts / report-tool.ts に差分なし

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** 本変更の実装
**WHEN** `src/core/port/report-result.ts` と `src/core/step/report-tool.ts` の差分を確認する
**THEN** いずれのファイルにも変更が存在しない（スコープ外の手書き parseInput 方針が維持されている）

---

## Result

```yaml
result: completed
total: 25
automated: 23
manual: 2
must: 13
should: 10
could: 2
blocked_reasons: []
```
