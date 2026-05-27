# Test Cases: node-compat-verification

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to design.md or tasks.md section

GIVEN/WHEN/THEN structure (required for each test case):
  **GIVEN** <preconditions>
  **WHEN** <action>
  **THEN** <expected result>

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — required design artifacts (design.md, tasks.md) are missing
-->

## Summary

- **Total**: 15 cases
- **Automated** (unit/integration): 5
- **Manual**: 10
- **Priority**: must: 10, should: 3, could: 2

---

### TC-001: CI ワークフローファイルの存在

**Category**: manual  
**Priority**: must  
**Source**: tasks.md T-01 Acceptance Criteria

**GIVEN** リポジトリのルートに `.github/workflows/` ディレクトリがある  
**WHEN** `.github/workflows/ci.yml` の存在を確認する  
**THEN** ファイルが存在する

---

### TC-002: CI ワークフローのトリガー設定

**Category**: manual  
**Priority**: must  
**Source**: tasks.md T-01 Acceptance Criteria / request.md 要件3

**GIVEN** `.github/workflows/ci.yml` が存在する  
**WHEN** ワークフローの `on:` セクションを確認する  
**THEN** `push: branches: [main]` と `pull_request` の両方がトリガーとして設定されている

---

### TC-003: CI ワークフローの Node.js 20 セットアップ

**Category**: manual  
**Priority**: must  
**Source**: tasks.md T-01 Acceptance Criteria / design.md D4

**GIVEN** `.github/workflows/ci.yml` が存在する  
**WHEN** ジョブのステップを確認する  
**THEN** `actions/setup-node@v4` が `node-version: "20"` で含まれている

---

### TC-004: CI ワークフローに --help ステップが含まれる

**Category**: manual  
**Priority**: must  
**Source**: tasks.md T-01 Acceptance Criteria

**GIVEN** `.github/workflows/ci.yml` が存在する  
**WHEN** ジョブのステップを確認する  
**THEN** `node dist/bin/specrunner.js --help` を実行するステップが含まれている

---

### TC-005: CI ワークフローに Bun API 検出ステップが含まれる

**Category**: manual  
**Priority**: must  
**Source**: tasks.md T-01 Acceptance Criteria / design.md D3

**GIVEN** `.github/workflows/ci.yml` が存在する  
**WHEN** ジョブのステップを確認する  
**THEN** `! grep -rE "from ['\"]bun:" dist/` 相当のステップが含まれており、マッチがあれば CI が失敗する

---

### TC-006: CI ワークフローに typecheck / test ステップが含まれる

**Category**: manual  
**Priority**: must  
**Source**: tasks.md T-01 Acceptance Criteria

**GIVEN** `.github/workflows/ci.yml` が存在する  
**WHEN** ジョブのステップを確認する  
**THEN** `bun run typecheck` と `bun run test` の両ステップが含まれている

---

### TC-007: CI ワークフローが単一ジョブ・順次実行構成である

**Category**: manual  
**Priority**: should  
**Source**: design.md D4

**GIVEN** `.github/workflows/ci.yml` が存在する  
**WHEN** ジョブ構成を確認する  
**THEN** ジョブは単一であり、build → node smoke test → bun test の順で sequential に定義されている

---

### TC-008: Node.js で --help が exit 0 で完了する

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-02 Acceptance Criteria / request.md 受け入れ基準

**GIVEN** `bun run build` が完了し `dist/bin/specrunner.js` が存在する  
**WHEN** `node dist/bin/specrunner.js --help` を実行する  
**THEN** exit code が 0 であり、ヘルプテキストが標準出力に出力される

---

### TC-009: Node.js で doctor コマンドが起動クラッシュしない

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-02 Acceptance Criteria / request.md 受け入れ基準

**GIVEN** `bun run build` が完了し `dist/bin/specrunner.js` が存在する  
**WHEN** `node dist/bin/specrunner.js doctor` を実行する  
**THEN** `ReferenceError`・`SyntaxError`・`ERR_MODULE_NOT_FOUND` 等の起動クラッシュが発生しない（認証エラーによる非 0 exit は許容）

---

### TC-010: dist/ に Bun 固有 API の import が含まれない

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-02 Acceptance Criteria / request.md 受け入れ基準

**GIVEN** `bun run build` が完了した dist/ ディレクトリが存在する  
**WHEN** `grep -rE "from ['\"]bun:" dist/` を実行する  
**THEN** マッチが 0 件であり、コマンドが非 0 で終了する（`!` 否定で CI が green になる）

---

### TC-011: dist/ に Bun グローバル API の実使用がない

**Category**: manual  
**Priority**: should  
**Source**: request.md 受け入れ基準（`Bun.*` 検出）/ design.md D3

**GIVEN** `bun run build` が完了した dist/ ディレクトリが存在する  
**WHEN** dist/ 内の `.js` ファイルを目視または静的解析で確認する  
**THEN** 実行コード中に `Bun.` プレフィックスの API 呼び出しが存在しない（コメント・文字列リテラル内の言及は除外）

---

### TC-012: bun run build が成功する

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-02（検証前提条件）

**GIVEN** `bun install --frozen-lockfile` が完了している  
**WHEN** `bun run build` を実行する  
**THEN** exit code が 0 で `dist/bin/specrunner.js` が生成される

---

### TC-013: bun run typecheck が green

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-02 Acceptance Criteria / request.md 受け入れ基準

**GIVEN** リポジトリのソースコードが存在する  
**WHEN** `bun run typecheck` を実行する  
**THEN** exit code が 0 で型エラーが報告されない

---

### TC-014: bun run test が green

**Category**: manual  
**Priority**: must  
**Source**: tasks.md T-02 Acceptance Criteria / request.md 受け入れ基準

**GIVEN** リポジトリのソースコードと依存関係が存在する  
**WHEN** `bun run test` を実行する  
**THEN** exit code が 0 で全テストが pass する

---

### TC-015: doctor の --json フラグが Node.js で動作する

**Category**: manual  
**Priority**: could  
**Source**: tasks.md T-01 step 7

**GIVEN** `bun run build` が完了し `dist/bin/specrunner.js` が存在する  
**WHEN** `node dist/bin/specrunner.js doctor --json` を実行する  
**THEN** プロセスが起動クラッシュせず、JSON 形式の出力または認証エラーメッセージが標準出力に出力される

---

### TC-016: doctor --json が CI 環境でクラッシュしない（exit code 不問）

**Category**: manual  
**Priority**: could  
**Source**: tasks.md T-01 step 7（exit code は問わない旨の注記）

**GIVEN** CI 環境（GitHub Actions）で `bun run build` が完了している  
**WHEN** `node dist/bin/specrunner.js doctor --json` を実行する  
**THEN** プロセスが起動クラッシュしない（exit code は 0 以外でも許容）

---

### TC-017: CI ワークフローに doctor ステップが含まれる

**Category**: manual  
**Priority**: should  
**Source**: tasks.md T-01 step 7

**GIVEN** `.github/workflows/ci.yml` が存在する  
**WHEN** ジョブのステップを確認する  
**THEN** `node dist/bin/specrunner.js doctor` を実行するステップが含まれており、起動クラッシュを検出するが exit code は無視する設定になっている

---

## Result

```yaml
result: completed
total: 17
automated: 5
manual: 12
must: 10
should: 3
could: 2
blocked_reasons: []
```
