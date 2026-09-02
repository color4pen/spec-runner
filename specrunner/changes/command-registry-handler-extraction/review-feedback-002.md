# Code Review Feedback: command-registry-handler-extraction (Iteration 2)

## Overview

This is the second iteration of code review. The operator made explicit rulings on all three findings from iteration 1. None of the three operator-mandated actions have been implemented. The underlying implementation remains unchanged from iteration 1 (last substantive commit: `implementer: command-registry-handler-extraction` + `code-review: command-registry-handler-extraction`; no `code-fixer` commit has run).

The three operator rulings and their current status:

| Finding | Severity | Operator Ruling | Current Status |
|---|---|---|---|
| F1: Check 3 regex vs AST | Medium | 修正する（@typescript-eslint/parser を使う） | ❌ Not fixed — still regex |
| F2: ctx.invokerCwd doc alignment | Low | 実装側を採用・tasks.md + TC-023 を更新 | ❌ Not updated — still says process.cwd() |
| F3: design.md companion fix doc | Low | design.md に 1 段落記録する | ❌ Not documented |

---

## Finding 1 (Medium — Fixable): architecture-ratchet.test.ts Check 3 still uses regex instead of `@typescript-eslint/parser`

**File**: `src/cli/__tests__/architecture-ratchet.test.ts`
**Lines**: 106–129

**Operator ruling (iter 1)**: 修正する。design.md §D4 / tasks.md T-17 のとおり `@typescript-eslint/parser`（既存 devDependency）で `ImportDeclaration` を走査し、`importKind === 'type'` を除外した value import の source が `command-registry` を指すものを violation とする。複数行 import も検出できることを確認するテストケースを追加する。

**Current state**: Unchanged from iter 1. Check 3 implementation (lines 117–125) still uses line-by-line string splitting:

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

**Blind spot** (unchanged): A multi-line import such as:
```ts
import {
  COMMANDS
} from "../command-registry.js";
```
is not detected, because the `import {` line does not contain `command-registry` and the `} from "../command-registry.js"` line does not start with `import`.

**Required fix**: Replace lines 106–129 with `@typescript-eslint/parser` AST traversal over `ImportDeclaration` nodes, filtering out those with `importKind === 'value'` that reference `command-registry`. Add a test case demonstrating multi-line import detection.

`@typescript-eslint/parser` is already in devDependencies — no new dependency required.

---

## Finding 2 (Low — Fixable): tasks.md T-14 and test-cases.md TC-023 still specify `process.cwd()` instead of `ctx.invokerCwd`

**Files**:
- `specrunner/changes/command-registry-handler-extraction/tasks.md` lines 244–245
- `specrunner/changes/command-registry-handler-extraction/test-cases.md` lines 322–323

**Operator ruling (iter 1)**: 実装側を採用する。`process.cwd()` には戻さず、tasks.md T-14 / T-15 と test-cases.md TC-023 を `ctx.invokerCwd`（dispatch 時に `process.cwd()` を capture、同値）に更新して整合させる。

**Current state**:

- `src/cli/scaffold-handlers.ts` (implementation): correctly uses `ctx!.invokerCwd` ✅
- `src/cli/usage-handler.ts` (implementation): correctly uses `ctx!.invokerCwd` ✅
- `tasks.md T-14` (line 244): still specifies `process.cwd()` ❌

  ```
  `handleRulesNew(parsed: ParsedArgs): Promise<void>` → `process.exit(await executeRulesNew(parsed.positionals[0]!, parsed.positionals[1]!, process.cwd()))`
  ```

- `test-cases.md TC-023` (lines 322–323): still specifies `process.cwd()` ❌

  ```
  AND `handleRulesNew` は `executeRulesNew(parsed.positionals[0]!, parsed.positionals[1]!, process.cwd())` を呼び出し結果を `process.exit` に渡す
  AND `handleReviewersNew` は `executeReviewersNew(parsed.positional!, process.cwd())` を呼び出し結果を `process.exit` に渡す
  ```

**Required fix**:
1. Update `tasks.md` T-14 bullet points to replace `process.cwd()` with `ctx!.invokerCwd`.
2. Update `test-cases.md` TC-023 THEN clause to replace `process.cwd()` with `ctx!.invokerCwd`.
3. Optionally update T-15 acceptance criteria if it implicitly refers to `process.cwd()` for usage-handler.

---

## Finding 3 (Low — Fixable): design.md does not document the duck-type guard companion fix

**File**: `specrunner/changes/command-registry-handler-extraction/design.md`

**Operator ruling (iter 1)**: 受け入れる。handler を別モジュールに抽出したことで、`main()` を `vi.resetModules()` 付きで呼ぶ既存テスト（`tests/unit/cli/*.test.ts`、10 本）で module 境界を跨ぐ error の `instanceof` が落ちるのを回避する companion fix として R3a に含める。production の挙動は不変。差し戻し不要。ただし **design.md に「抽出に伴う companion fix」として 1 段落で記録すること**。

**Current state**: `design.md` contains no mention of the duck-type guards (`isFlagParseError`, `isSpecRunnerError`), the `instanceof` brittleness issue, or the companion fix. The section remains absent.

**Required fix**: Add one paragraph to `design.md` (appropriate location: after D4 or as a new D6 section, or under Risks/Trade-offs) documenting:

- `bin/specrunner.ts` adds `isFlagParseError` and `isSpecRunnerError` duck-type guards as a companion fix to R3a handler extraction
- Rationale: handler extraction into separate modules causes `instanceof FlagParseError` / `instanceof SpecRunnerError` to fail in tests using `vi.resetModules()`, because module instances differ across reset boundaries
- Scope: companion fix is scoped to R3a; production behavior is unchanged
- The duck-type guards fall back to `e.name === "FlagParseError"` / `e.name === "SpecRunnerError"` checks, which are reliable within the same JS engine instance even after module resets

---

## 検証した項目

- `src/cli/__tests__/architecture-ratchet.test.ts` の全文（153 行）を読み込み、Check 3 が行分割 regex のままであることを確認した（`@typescript-eslint/parser` は使用されていない）
- `src/cli/scaffold-handlers.ts` が `ctx!.invokerCwd` を使用していることを確認した（実装は正しい）
- `src/cli/usage-handler.ts` が `ctx!.invokerCwd` を使用していることを確認した（実装は正しい）
- `specrunner/changes/command-registry-handler-extraction/tasks.md` T-14（lines 244–245）が `process.cwd()` を指定したままであることを確認した
- `specrunner/changes/command-registry-handler-extraction/test-cases.md` TC-023（lines 322–323）が `process.cwd()` を記述したままであることを確認した
- `specrunner/changes/command-registry-handler-extraction/design.md`（151 行全文）に companion fix の記述がないことを確認した
- `bin/specrunner.ts` に `isFlagParseError` / `isSpecRunnerError` duck-type guards が引き続き存在することを確認した（lines 18–31）
- `git log --oneline -10` で code-fixer commit が存在しないことを確認した（`code-review` commit の後は `checkpoint` のみ）

## 検証できなかった項目

なし。Iteration 2 の対象はすべて静的ソース読み込みで検証可能な項目（ratchet 実装・spec 文書・design.md の記述有無）であり、実行時確認が必要な項目はない。

## Summary

3 件の operator-mandated fix がすべて未実施。実装コードは iter 1 から変化なし。

| # | Severity | Description | Status |
|---|---|---|---|
| 1 | Medium | Ratchet Check 3 が regex のまま（AST 未実装） | ❌ Pending |
| 2 | Low | tasks.md T-14 / TC-023 が process.cwd() を指定したまま | ❌ Pending |
| 3 | Low | design.md に duck-type guard companion fix の記述なし | ❌ Pending |
