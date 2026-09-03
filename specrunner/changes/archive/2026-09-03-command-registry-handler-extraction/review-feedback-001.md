# Code Review Feedback: command-registry-handler-extraction (Iteration 1)

## Overview

The implementation successfully extracts all 29 inline handlers from `command-registry.ts` and achieves the core goals of R3a:
- `command-registry.ts` reduced from 1,696 to 1,083 lines (✅)
- Inline `handler: async` count: 29 → 0 (✅)
- `process.exit` in registry: 67 → 0 (✅)
- Business I/O value imports (`fs`, `path`, `resolveGitHubToken`, `createGitHubClient`, etc.) removed from registry (✅)
- Handler modules do not import from `command-registry` (value imports) (✅)
- CLI contract snapshot established and stable (✅)
- All tests pass (✅)

Three findings below — one medium and two low.

---

## Finding 1 (Medium — Fixable): Architecture Ratchet Check 3 uses regex instead of `@typescript-eslint/parser`

**File**: `src/cli/__tests__/architecture-ratchet.test.ts`  
**Lines**: 106–129

**Issue**:  
The design spec (design.md §D4, tasks.md §T-17) explicitly requires `@typescript-eslint/parser` for AST-based import analysis in Check 3 ("Import graph cycle チェック"). The implementation uses a line-split regex instead:

```ts
const lines = stripped.split("\n");
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("import")) continue;
  if (trimmed.startsWith("import type")) continue;
  if (trimmed.includes("command-registry")) {
    violations.push(...);
  }
}
```

**Blind spot**: A multi-line import statement distributes the `import` keyword and the `from` clause across different lines:

```ts
// This would NOT be caught by the current check:
import {
  COMMANDS
} from "../command-registry.js";
```

The `import {` line starts with `import` but doesn't contain `"command-registry"`. The `} from "../command-registry.js"` line contains `"command-registry"` but doesn't start with `import`. Neither line triggers the violation.

**Design requirement violated**:  
> `@typescript-eslint/parser`（既存 devDep）で ... import 宣言を解析する。... AST 等の構造検査を優先し、コメントや文字列で誤検知する単純 grep だけに依存しないこと。

The implementation also misses a secondary risk: a string literal containing `"command-registry"` (e.g., a comment in an import-like context that survived stripping, or a string constant) could produce false positives, though this is lower-risk since comment stripping is applied.

**Note**: The check works correctly for the current codebase (all handler modules use non-multi-line imports, verified). The blind spot is future-state: if a handler module author writes a reformatted multi-line import, the ratchet would silently miss it.

**Fix**: Replace the line-based regex with `@typescript-eslint/parser` AST traversal to inspect `ImportDeclaration` nodes, matching the design spec. `@typescript-eslint/parser` is already in devDependencies.

---

## Finding 2 (Low — Fixable): `scaffold-handlers.ts` and `usage-handler.ts` use `ctx!.invokerCwd` instead of `process.cwd()`

**Files**:  
- `src/cli/scaffold-handlers.ts` lines 14, 20  
- `src/cli/usage-handler.ts` lines 16, 18

**Issue**:  
The tasks spec (T-14, T-15) and test case TC-023 specify `process.cwd()` as the third argument for `executeRulesNew`, `executeReviewersNew`, `showUsage`, and `showUsageSummary`. The original inline handlers in `command-registry.ts` (main branch) used `process.cwd()`. The extracted implementations use `ctx!.invokerCwd`:

```ts
// Specified (tasks.md T-14, TC-023):
process.exit(await executeRulesNew(parsed.positionals[0]!, parsed.positionals[1]!, process.cwd()))

// Implemented:
process.exit(await executeRulesNew(parsed.positionals[0]!, parsed.positionals[1]!, ctx!.invokerCwd))
```

**Practical impact**:  
`ctx.invokerCwd` is set to `process.cwd()` at dispatch time (`buildCommandContext` captures it), making these functionally equivalent in normal CLI execution. However:

1. It deviates from the documented spec (tasks.md, test-cases.md TC-023).
2. The R3a requirement is "意味を変えずに移動する" (move without changing meaning). Substituting `process.cwd()` with `ctx!.invokerCwd` is technically a semantic change (different capture point), even if equivalent in practice.
3. No test explicitly verifies the third argument value, so the deviation is not caught.

**Note**: Using `ctx!.invokerCwd` is architecturally superior (more testable, consistent with the rest of the codebase) and unlikely to cause runtime issues. If this substitution is intentional, TC-023 should be updated to reflect the actual implementation.

**Fix**: Either revert to `process.cwd()` to match the spec, or update tasks.md T-14/T-15 and TC-023 to document the intentional substitution of `ctx.invokerCwd`.

---

## Finding 3 (Low — Decision Needed): `bin/specrunner.ts` adds duck-type error guards (out of R3a scope)

**File**: `bin/specrunner.ts`  
**Lines**: 12–31, 117, 131, 139

**Issue**:  
R3a is scoped to "コードの純粋な移動と依存整理に限定する" (pure code movement and dependency cleanup). The changes to `bin/specrunner.ts` add two duck-type guard functions (`isFlagParseError`, `isSpecRunnerError`) and replace `instanceof` checks with them:

```ts
// Before:
if (e instanceof FlagParseError) { ... }

// After:
if (isFlagParseError(e)) { ... }
```

The duck-type guards fall back to name-checking (`e.name === "FlagParseError"`) for cross-module-context scenarios (e.g., Vitest `resetModules`). This is a behavior change: `instanceof` is strict prototype-chain check; the duck-type guard accepts any `Error` with matching `.name`, which may include errors from other modules that happen to share the name.

**Assessment**:  
This change appears to have been introduced to fix `instanceof` failures caused by handler extraction. When handler modules are now separate files, module isolation in tests (`vi.resetModules()`) can cause `instanceof` to fail for errors crossing module boundaries. The duck-type guards mitigate this.

- In production: behavior is unchanged (same instance hierarchy, `instanceof` and duck-type succeed the same way).
- In tests with `resetModules`: duck-type guards succeed where `instanceof` would fail.
- Theoretical risk: an `Error` subclass from an unrelated module with `name === "FlagParseError"` and `exitCode` property would be misidentified. This is extremely unlikely.

**Options**:
1. **Accept as companion fix**: The handler extraction exposes the `instanceof` brittleness in test isolation. Accept the duck-type guards as a necessary companion change. Document the out-of-scope nature in the commit message.
2. **Revert and handle separately**: Remove from this PR and address as a separate follow-up (R3a cleanup). Low urgency since tests pass.

---

## 検証した項目

- `command-registry.ts` のインライン `handler: async` がゼロであること（`grep -c "handler: async"` で確認）
- `command-registry.ts` に `process.exit` がゼロであること（`grep -c "process\.exit"` で確認）
- `command-registry.ts` に `import * as fs`・`import * as path`・`resolveGitHubToken`・`createGitHubClient` 等のビジネス I/O value import がないこと（import 一覧を直接確認）
- `ARCHIVE_USAGE` が `command-registry.ts` から re-export されていること（行 26 を確認）
- `command-handler.ts` が `CommandHandler` 型のみを export し、`command-registry.ts` が re-export していること
- handler モジュール（`src/cli/*.ts`）から `command-registry` への value import がゼロであること（`grep -rn` で確認）
- architecture-ratchet.test.ts の 4 チェック実装内容（Check 1〜4 のソースを読み込んで確認）
- CLI contract snapshot テスト（`cli-contract-snapshot.test.ts`）の実装と snapshot ファイルの存在を確認
- `resume.ts` の `handleJobResume` 実装（`--detach/--json` 排他・`--from-issue/positional` 排他・`--prompt-file` 読み込み・分岐フローが維持されていること）
- `archive.ts` の `handleJobArchive` 実装（slug と `--from-issue` の XOR チェック・ `ARCHIVE_USAGE` 移動）
- `scaffold-handlers.ts` の `handleRulesNew`・`handleReviewersNew` 実装（tasks.md T-14 との比較）
- `usage-handler.ts` の `handleUsage` 実装（tasks.md T-15 との比較）
- `ps.ts` の `handleJobLs`・`handleJobStats` 実装
- `cancel.ts` の `VALID_JOB_ID_CHARS` 移動と `handleJobCancel` 実装
- `doctor.ts` の `handleDoctorRepair` が dynamic import を維持していること
- `bin/specrunner.ts` の変更内容（duck-type guards の追加）
- verification-result.md でテスト全件 green を確認
- `src/` 全体の `process.exit` 件数（120 件、R3a で意図せず削減していないこと）

## 検証できなかった項目

- TC-004: `--detach --json` 同時指定時の exit code が抽出前後で変わらないこと（既存テストが green であることで間接的に確認したが、exit code の数値は直接比較していない）
- TC-013: `handleInit`・`handleLogin`・`handleCredentialsSet` の個々の実装内容（handler 関数の存在と named reference であることは確認済みだが、内部の型キャスト等は読み込み対象外）
- TC-015: `handleJobStart` の `--from-issue` 経由の全分岐を完全にトレースしていない（run.ts ソースを確認したが、`runFromIssue` の lazy import が正しく機能するかは実行ベースの確認が必要）
- TC-016: `handleJobLs` の `loadConfigWithOverlay → resolveGitHubToken → createGitHubClient` の呼び出し順が try ブロック内で維持されているかの詳細トレース（ps.ts ソースを確認したが、実行経路の厳密な順序は静的解析のみ）
- TC-019: `handleDoctorRepair` の dynamic import が Bun ランタイムで正しく動作すること（静的ソース確認のみ）

---

## Test Coverage Assessment

| TC | Description | Status |
|---|---|---|
| TC-001 | All handlers are named references (architecture-ratchet Check 1) | ✅ covered |
| TC-002 | Ratchet detects inline handler re-introduction | ✅ covered |
| TC-003 | Registry source has no process.exit (ratchet Check 2) | ✅ covered |
| TC-005 | Handler modules don't value-import command-registry (ratchet Check 3) | ✅ covered (regex, see Finding 1) |
| TC-006 | Ratchet detects import cycle | ✅ covered |
| TC-007 | Only command-registry exports COMMANDS (ratchet Check 4) | ✅ covered |
| TC-008 | CLI contract snapshot stable | ✅ covered |
| TC-009 | All existing CLI tests green | ✅ verified in verification-result.md |
| TC-010 | ARCHIVE_USAGE importable from command-registry | ✅ verified (re-export in place) |
| TC-011 | repo-wide process.exit count unchanged | ✅ (120 calls in src/, net-zero movement) |
| TC-012 | command-handler.ts exists and is re-exported | ✅ verified |
| TC-022 | No fs/path/credential value imports in registry | ✅ verified |
| TC-025 | All 4 ratchet checks green | ✅ (with caveat in Finding 1) |

---

## Summary

The extraction is substantively correct and complete. All acceptance criteria are met. The three findings are:

| # | Severity | Description | Action |
|---|---|---|---|
| 1 | Medium | Ratchet Check 3 uses regex not AST; misses multi-line imports | Fixable: use `@typescript-eslint/parser` |
| 2 | Low | `ctx.invokerCwd` used instead of `process.cwd()` in scaffold/usage handlers; deviates from spec | Fixable: revert or update spec |
| 3 | Low | Duck-type error guards in `bin/specrunner.ts` are out of R3a scope | Decision needed: accept or defer |
