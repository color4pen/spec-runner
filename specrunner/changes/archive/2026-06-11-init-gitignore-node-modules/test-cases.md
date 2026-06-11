# Test Cases: init-gitignore-node-modules

## Summary

- **Total**: 6 cases
- **Automated** (unit/integration): 5
- **Manual**: 1
- **Priority**: must: 4, should: 2, could: 0

---

### TC-001: .gitignore が存在しない repo で init すると node_modules/ が生成される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: ensureDotSpecrunnerGitignore は node_modules/ を保証する > Scenario: .gitignore が存在しない repo で init する

---

### TC-002: node_modules/ 既載の .gitignore に対して重複追記しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: ensureDotSpecrunnerGitignore は node_modules/ を保証する > Scenario: node_modules/ が既載の .gitignore に対して重複追記しない

---

### TC-003: .specrunner/* エントリの管理動作に影響しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: ensureDotSpecrunnerGitignore は node_modules/ を保証する > Scenario: .specrunner/* エントリの管理動作に影響しない

---

### TC-004: コメント行として存在する node_modules/ に対して非コメント行を追記する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 > TC-GI-NM-03

**GIVEN** `.gitignore` に `# node_modules/` のみが存在する（コメント行）
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を呼び出す
**THEN** 非コメント行の `node_modules/` が追記され、`.gitignore` に両行が存在する

---

### TC-005: 2 回連続呼び出しで結果が変わらない（idempotent）

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 > TC-GI-NM-04

**GIVEN** `node_modules/` を含まない任意の `.gitignore` が存在する
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を 2 回連続して呼び出す
**THEN** 1 回目と 2 回目の呼び出し後で `.gitignore` の内容が同一であり、`node_modules/` の出現数は 1

---

### TC-006: typecheck && test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** T-01 / T-02 の実装が完了している
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型エラーなし・テスト全件 green でコマンドが正常終了する

---

## Result

```yaml
result: completed
total: 6
automated: 5
manual: 1
must: 4
should: 2
could: 0
blocked_reasons: []
```
