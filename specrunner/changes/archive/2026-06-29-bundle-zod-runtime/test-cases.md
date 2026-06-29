# Test Cases: bundle-zod-runtime

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
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
    failed    — spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**: 10 cases
- **Automated** (unit/integration): 3
- **Manual**: 7
- **Priority**: must: 7, should: 3, could: 0

---

### TC-001: build produces a self-contained bundle

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: dist/specrunner.js SHALL contain no external zod imports > Scenario: build produces a self-contained bundle

---

### TC-002: package.json dependency classification

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: zod SHALL be listed only in devDependencies > Scenario: package.json dependency classification

---

### TC-003: --help succeeds without external zod

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: the CLI SHALL start without a consumer-installed zod > Scenario: --help succeeds without external zod

---

### TC-004: test suite passes after bundling change

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: existing tests and typecheck SHALL remain green > Scenario: test suite passes after bundling change

---

### TC-005: typecheck passes after devDependencies move

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: existing tests and typecheck SHALL remain green > Scenario: typecheck passes after devDependencies move

---

### TC-006: tsup.config.ts contains noExternal: ['zod']

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** T-01 が適用されている
**WHEN** `tsup.config.ts` の内容を確認する
**THEN** `noExternal: ['zod']` が `defineConfig` オブジェクト内に存在し、`external` 配列（`@anthropic-ai/sdk` 等）は変更されていない

---

### TC-007: postbuild スクリプトが存在し自動実行される

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** T-03 が適用されており `bun run build` を実行する前の状態
**WHEN** `bun run build` を実行する
**THEN** `package.json` の `scripts.postbuild` が存在し、ビルド完了後に自動実行されて exit 0 で通過する（zod 外部 import が存在しないため）

---

### TC-008: postbuild は zod 外部 import が混入したバンドルを検出して失敗する

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `bun run build` 完了後の `dist/specrunner.js` が存在する
**WHEN** `dist/specrunner.js` に `import { z } from "zod/v4-mini"` 等の zod 外部 import を手動で追記し、`postbuild` スクリプト（`! grep -qE "from ['\"]zod|require\\(['\"]zod" dist/specrunner.js`）を単体で実行する
**THEN** `postbuild` が exit 非 0 で終了し、zod 外部 import の残存を検出できることを確認する

---

### TC-009: SDK の external 設定が変更されていない

**Category**: manual
**Priority**: should
**Source**: design.md > Non-Goals / D1

**GIVEN** T-01 が適用されている
**WHEN** `bun run build` 後の `dist/specrunner.js` および `tsup.config.ts` を確認する
**THEN** `@anthropic-ai/sdk`、`@anthropic-ai/claude-agent-sdk`、`@openai/codex-sdk` への外部 import が `dist/specrunner.js` に残っており（external のまま）、`tsup.config.ts` の `external` 配列が変更されていない

---

### TC-010: bun.lock が zod の devDependencies 移動後に更新されている

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `package.json` の `zod` が `dependencies` から `devDependencies` へ移動済みの状態
**WHEN** `bun install` を実行する
**THEN** `bun.lock` が更新され（差分が生じる）、その後の `bun install` で差分が発生しない（lock ファイルと package.json の整合が取れている）

---

## Result

```yaml
result: completed
total: 10
automated: 3
manual: 7
must: 7
should: 3
could: 0
blocked_reasons: []
```
