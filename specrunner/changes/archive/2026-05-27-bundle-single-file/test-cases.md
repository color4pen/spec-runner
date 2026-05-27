# Test Cases: tsup によるビルド出力の single file バンドル化

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

- **Total**: 19 cases
- **Automated** (unit/integration): 4
- **Manual**: 15
- **Priority**: must: 14, should: 5, could: 0

---

### TC-001: tsup が devDependencies に含まれる

**Category**: manual
**Priority**: must
**Source**: tasks.md T-01

**GIVEN** `bun add -d tsup` が実行された状態  
**WHEN** `package.json` の `devDependencies` を確認する  
**THEN** `tsup` キーが存在し、バージョン文字列が含まれている

---

### TC-002: tsup.config.ts が存在し必須フィールドをすべて含む

**Category**: manual
**Priority**: must
**Source**: tasks.md T-02

**GIVEN** リポジトリルートに `tsup.config.ts` を作成した状態  
**WHEN** `tsup.config.ts` の内容を確認する  
**THEN** 以下がすべて含まれている: `entry: ['bin/specrunner.ts']`, `format: ['esm']`, `target: 'node20'`, `outDir: 'dist'`, `clean: true`, `banner.js: '#!/usr/bin/env node'`, `external: ['@anthropic-ai/sdk', '@anthropic-ai/claude-agent-sdk', '@openai/codex-sdk']`

---

### TC-003: build スクリプトが tsup を実行する

**Category**: manual
**Priority**: must
**Source**: tasks.md T-03

**GIVEN** `package.json` の `scripts.build` を `"tsup"` に変更した状態  
**WHEN** `package.json` の `scripts.build` を確認する  
**THEN** 値が `"tsup"` である（旧値 `"tsc -p tsconfig.build.json"` でない）

---

### TC-004: bin フィールドが新しい出力パスを指している

**Category**: manual
**Priority**: must
**Source**: tasks.md T-03, design.md D2

**GIVEN** `package.json` の `bin.specrunner` を更新した状態  
**WHEN** `package.json` の `bin` フィールドを確認する  
**THEN** `specrunner` キーの値が `"./dist/specrunner.js"` である（旧値 `"./dist/bin/specrunner.js"` でない）

---

### TC-005: exports フィールドが新しい出力パスを指している

**Category**: manual
**Priority**: must
**Source**: tasks.md T-03, design.md D2

**GIVEN** `package.json` の `exports["."]` を更新した状態  
**WHEN** `package.json` の `exports` フィールドを確認する  
**THEN** `"."` キーの値が `"./dist/specrunner.js"` である（旧値 `"./dist/bin/specrunner.js"` でない）

---

### TC-006: typecheck スクリプトが tsc --noEmit のまま維持されている

**Category**: manual
**Priority**: must
**Source**: tasks.md T-03

**GIVEN** `scripts.build` を tsup に変更した状態  
**WHEN** `package.json` の `scripts.typecheck` を確認する  
**THEN** 値が `"tsc --noEmit"` のまま変更されていない

---

### TC-007: bun run build で dist/specrunner.js が単一ファイルとして生成される

**Category**: manual
**Priority**: must
**Source**: tasks.md T-02, T-04

**GIVEN** tsup.config.ts と更新済み package.json が存在する状態  
**WHEN** `bun run build` を実行する  
**THEN** `dist/specrunner.js` が存在し、`dist/` 直下のファイルが `specrunner.js` 1 ファイルのみである

---

### TC-008: dist/specrunner.js の先頭に shebang が付与されている

**Category**: manual
**Priority**: must
**Source**: tasks.md T-02, design.md D4

**GIVEN** `bun run build` が完了した状態  
**WHEN** `dist/specrunner.js` の先頭行を確認する  
**THEN** `#!/usr/bin/env node` が 1 行目に存在する

---

### TC-009: dist/specrunner.js が ESM 形式である

**Category**: integration
**Priority**: must
**Source**: tasks.md T-02, design.md D1

**GIVEN** `bun run build` が完了した状態  
**WHEN** `dist/specrunner.js` の内容を確認する  
**THEN** `import` / `export` 構文が含まれており、`require(` が存在しない

---

### TC-010: external な dependencies がバンドルにインライン化されていない

**Category**: integration
**Priority**: must
**Source**: tasks.md T-02, design.md D3

**GIVEN** `bun run build` が完了した状態  
**WHEN** `dist/specrunner.js` の内容を確認する  
**THEN** `@anthropic-ai/sdk`, `@anthropic-ai/claude-agent-sdk`, `@openai/codex-sdk` のソースコードがインライン化されておらず、`import` 文として参照されている

---

### TC-011: node dist/specrunner.js --help が正常終了する

**Category**: manual
**Priority**: must
**Source**: tasks.md T-04

**GIVEN** `bun run build` が完了し `dist/specrunner.js` が存在する状態  
**WHEN** `node dist/specrunner.js --help` を実行する  
**THEN** プロセスが exit code 0 で終了し、USAGE またはヘルプテキストが stdout に出力される

---

### TC-012: bun run typecheck が green である

**Category**: integration
**Priority**: must
**Source**: tasks.md T-04

**GIVEN** tsup 導入後のコードベース  
**WHEN** `bun run typecheck` を実行する  
**THEN** `tsc --noEmit` がエラーなく exit code 0 で完了する

---

### TC-013: bun run test が green である

**Category**: integration
**Priority**: must
**Source**: tasks.md T-04

**GIVEN** tsup 導入後のコードベース  
**WHEN** `bun run test` を実行する  
**THEN** すべてのテストが pass し、exit code 0 で完了する

---

### TC-014: npm pack --dry-run のパッケージサイズが削減されている

**Category**: manual
**Priority**: must
**Source**: tasks.md T-04

**GIVEN** `bun run build` で tsup バンドルが生成された状態  
**WHEN** `npm pack --dry-run` を実行する  
**THEN** 出力される total size が tsc 出力時（500+ ファイル）より小さい

---

### TC-015: dist/ が clean オプションにより再ビルド前にクリアされる

**Category**: manual
**Priority**: should
**Source**: tasks.md T-02（`clean: true`）

**GIVEN** 旧 tsc 出力（`dist/bin/specrunner.js` 等）が `dist/` に残っている状態  
**WHEN** `bun run build` を実行する  
**THEN** `dist/bin/` などの旧ディレクトリが削除され、`dist/specrunner.js` のみが存在する

---

### TC-016: node:fs/promises の dynamic import が runtime で正常に解決される

**Category**: manual
**Priority**: should
**Source**: design.md Risks（dynamic `await import()` がバンドルに含まれない）

**GIVEN** `bun run build` が完了した状態  
**WHEN** `node dist/specrunner.js` でファイル操作を伴うコマンドを実行する  
**THEN** `node:fs/promises` が external として解決され、runtime エラーが発生しない

---

### TC-017: tsconfig.build.json が削除されずに残っている

**Category**: manual
**Priority**: should
**Source**: design.md D5

**GIVEN** tsup 導入の変更が適用された状態  
**WHEN** リポジトリルートのファイル一覧を確認する  
**THEN** `tsconfig.build.json` が引き続き存在する

---

### TC-018: source map が dist/ に生成されていない（スコープ外）

**Category**: manual
**Priority**: should
**Source**: request.md スコープ外

**GIVEN** `bun run build` が完了した状態  
**WHEN** `dist/` の内容を確認する  
**THEN** `.map` ファイルが存在しない

---

### TC-019: DTS ファイルが dist/ に生成されていない（スコープ外）

**Category**: manual
**Priority**: should
**Source**: request.md スコープ外

**GIVEN** `bun run build` が完了した状態  
**WHEN** `dist/` の内容を確認する  
**THEN** `.d.ts` ファイルが存在しない

---

## Result

```yaml
result: completed
total: 19
automated: 4
manual: 15
must: 14
should: 5
could: 0
blocked_reasons: []
```
