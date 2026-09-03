# Code Review Feedback: command-registry-handler-extraction (Iteration 3)

## Overview

Iteration 3 reviews the branch after operator-apply commit `098ccab8` which applied canon fixes for
Finding 2 and Finding 3 from iteration 2.

| Finding | Severity | Description | Status |
|---|---|---|---|
| F1 | Medium | Ratchet Check 3 still uses line-splitting regex — not `@typescript-eslint/parser` | ❌ Pending (code-fixer) |
| F2 | Low | tasks.md T-14 / TC-023 `process.cwd()` → `ctx!.invokerCwd` | ✅ Resolved by operator-apply |
| F3 | Low | design.md missing companion fix paragraph for duck-type guards | ✅ Resolved by operator-apply |

---

## Finding 1 (Medium — Fixable): architecture-ratchet.test.ts Check 3 still uses line-splitting regex

**File**: `src/cli/__tests__/architecture-ratchet.test.ts`
**Lines**: 117–125

**Operator ruling (iter 1, confirmed iter 2)**: Replace Check 3 with `@typescript-eslint/parser` AST traversal over `ImportDeclaration` nodes, filtering out those with `importKind === 'type'` that reference `command-registry`. Add a test case demonstrating multi-line import detection.

**Current state** (unchanged from iter 1 and iter 2): Check 3 uses line-by-line string splitting:

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

**Blind spot** (confirmed unchanged): A multi-line import such as:
```ts
import {
  COMMANDS
} from "../command-registry.js";
```
is not detected. The `import {` line does not contain `command-registry` and the `} from "../command-registry.js"` line does not start with `import`. The ratchet silently misses this case.

**Required fix** (per operator ruling):

Replace the line-splitting loop in Check 3 with `@typescript-eslint/parser` AST traversal:

```ts
import { parse } from "@typescript-eslint/parser";

// Inside Check 3:
const ast = parse(src, { range: true });
for (const node of ast.body) {
  if (
    node.type === "ImportDeclaration" &&
    node.importKind !== "type" &&
    String(node.source.value).includes("command-registry")
  ) {
    violations.push(`${path.relative(CLI_DIR, file)}: import from "${node.source.value}"`);
  }
}
```

Add a vitest `it` case inside Check 3's `describe` block that feeds a synthetic multi-line import string through the check and asserts it is caught.

`@typescript-eslint/parser` is already in devDependencies (`"^8"`) — no new dependency required.

---

## Resolved Findings (operator-apply `098ccab8`)

### Finding 2 (Resolved): tasks.md T-14 / TC-023 `process.cwd()` → `ctx!.invokerCwd`

**Operator ruling**: 実装側を採用する。tasks.md T-14 / T-15 と test-cases.md TC-023 を `ctx!.invokerCwd` に更新して整合させる。

**Current state** (after `098ccab8`):

- `tasks.md` line 244: `ctx!.invokerCwd` ✅
- `tasks.md` line 246: explains `invokerCwd` is captured `process.cwd()` at dispatch time ✅
- `test-cases.md` TC-023 line 322: `ctx!.invokerCwd` ✅
- `test-cases.md` TC-023 line 324: explanation added ✅
- `src/cli/scaffold-handlers.ts`: uses `ctx!.invokerCwd` (unchanged, correct) ✅
- `src/cli/usage-handler.ts`: uses `ctx!.invokerCwd` (unchanged, correct) ✅

**Status**: Resolved. Do not re-raise.

### Finding 3 (Resolved): design.md missing companion fix paragraph for duck-type guards

**Operator ruling**: design.md に「抽出に伴う companion fix」として 1 段落で記録すること。

**Current state** (after `098ccab8`):

`design.md` section D6 (line 138) now documents:
- `isFlagParseError` / `isSpecRunnerError` duck-type guards added to `bin/specrunner.ts`
- Rationale: handler extraction causes `instanceof` to fail across `vi.resetModules()` boundaries
- Scope: companion fix in R3a; production behavior unchanged
- Fallback chain: `instanceof` first, then `e.name === "FlagParseError"` / `"exitCode" in e`
- Operator ruling attribution included ✅

**Status**: Resolved. Do not re-raise.

---

## 検証した項目

1. `git log --oneline -10` で `098ccab8 operator-apply` コミットの存在を確認した
2. `tasks.md` lines 244–246 で `ctx!.invokerCwd` への更新を確認した（Finding 2 解消）
3. `test-cases.md` TC-023 lines 322–324 で `ctx!.invokerCwd` への更新を確認した（Finding 2 解消）
4. `design.md` line 138 で D6 セクション（duck-type guard companion fix）の記述を確認した（Finding 3 解消）
5. `src/cli/__tests__/architecture-ratchet.test.ts` lines 117–125 を読み込み、Check 3 が行分割 regex のままであることを確認した（Finding 1 未解消）
6. `package.json` で `@typescript-eslint/parser` が devDependencies に存在することを確認した（AST 修正に追加依存不要）

## 検証できなかった項目

なし。Iteration 3 の対象はすべて静的ソース読み込みで検証可能であり、実行時確認が必要な項目はない。

## Summary

operator-apply コミット `098ccab8` により Finding 2・Finding 3 は解消された。Finding 1（Check 3 が regex のまま）のみ未解消。code-fixer による `@typescript-eslint/parser` 実装が必要。
