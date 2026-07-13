# Test Cases: one-shot SDK query の env を stripSecrets 経由に統一し、env-omission を歯で固定する

## Summary

- **Total**: 11 cases
- **Automated** (unit/integration): 9
- **Manual**: 2
- **Priority**: must: 8, should: 3, could: 0

---

### TC-001: one-shot query options に stripSecrets 由来の env が渡る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: one-shot の SDK query は stripSecrets を通した env を必ず渡す > Scenario: one-shot query options に stripSecrets 由来の env が渡る

---

### TC-002: env 以外の one-shot 挙動は不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: one-shot の SDK query は stripSecrets を通した env を必ず渡す > Scenario: env 以外の one-shot 挙動は不変

---

### TC-003: 事前設定した secret が one-shot env から除去される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: one-shot の SDK env は secret を除去し非 secret を保持する > Scenario: 事前設定した secret が one-shot env から除去される

---

### TC-004: env-omission が違反として検出される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: env-omission を歯が red にすることを検出テストで固定する > Scenario: env-omission が違反として検出される

---

### TC-005: secret 混入が違反として検出される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: env-omission を歯が red にすることを検出テストで固定する > Scenario: secret 混入が違反として検出される

---

### TC-006: strip 済み env は違反なしと判定される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: env-omission を歯が red にすることを検出テストで固定する > Scenario: strip 済み env は違反なしと判定される

---

### TC-007: 既存 B-6 grep 歯が無変更で緑を保つ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存の B-6 grep 歯と arch-allowlist は無変更で green > Scenario: 既存 B-6 grep 歯が無変更で緑を保つ

---

### TC-008: typecheck と test が green

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: codex・agent-runner・one-shot 以外の既存凍結テストは無変更で green > Scenario: typecheck と test が green

---

### TC-009: process.env 変異後のテスト間汚染が起きない

**Category**: unit
**Priority**: should
**Source**: design.md Risks（"env の behavioral テストが process.env を変異させてテスト間汚染"）/ tasks.md T-02

**GIVEN** `TC-OSQ-ENV-02` テストが `process.env.GH_TOKEN` に test 用の値を設定し、`queryOneShot` を実行する  
**WHEN** テストが終了する（`afterEach` または try/finally ブロックが実行される）  
**THEN** `process.env.GH_TOKEN` が設定前の値（または未定義）に復元されており、後続テストの `process.env` に汚染が残っていない

---

### TC-010: 変更ファイルが 2 ファイルに限定される

**Category**: manual
**Priority**: should
**Source**: tasks.md T-04（git diff による編集スコープ確認）

**GIVEN** 本 change の実装が完了した git 作業ツリー  
**WHEN** `git diff main...HEAD --name-only` で変更ファイルを確認する  
**THEN** 変更対象が `src/adapter/claude-code/query-one-shot.ts` と `tests/unit/adapter/claude-code/query-one-shot.test.ts` の 2 ファイルのみである  
**AND** `src/adapter/claude-code/agent-runner.ts` / `src/adapter/codex/**` / `tests/unit/architecture/core-invariants.test.ts` / `tests/unit/architecture/arch-allowlist.ts` / `architecture/**` は未変更である

---

### TC-011: CLAUDE_CODE_OAUTH_TOKEN 注入が one-shot に追加されていない

**Category**: manual
**Priority**: should
**Source**: design.md D1（Non-Goal: agent-runner の token 注入ブロックをコピーしない）/ tasks.md T-01 禁止事項

**GIVEN** `src/adapter/claude-code/query-one-shot.ts` の変更後  
**WHEN** SDK query options に追加された `env` キーの実装を確認する  
**THEN** `CLAUDE_CODE_OAUTH_TOKEN` の設定・注入コードが存在しない  
**AND** 中間可変変数 `const sdkEnv = ...` を持たず、`env: stripSecrets(process.env as Record<string, string | undefined>)` をインラインで渡す形になっている  
**AND** token 注入ブロック（`agent-runner.ts:398-403` 相当）がコピーされていない

---

## Result

```yaml
result: completed
total: 11
automated: 9
manual: 2
must: 8
should: 3
could: 0
blocked_reasons: []
```
