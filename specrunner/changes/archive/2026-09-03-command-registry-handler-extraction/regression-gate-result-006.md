# Regression Gate Result — Iteration 6

## Evidence Report

All 7 ledger findings were verified against the current branch state. No regressions detected.

---

### [1] ea1921d9 — Ratchet Check 3 scope limited to enumerated files

**Status: FIXED**

`listCliTsFiles()` at `src/cli/__tests__/architecture-ratchet.test.ts` lines 77–82 uses `fs.readdirSync(CLI_DIR)` to dynamically enumerate all `.ts` files in `src/cli/`. No hardcoded list is present. Future handler modules added to `src/cli/` will automatically be included in Check 3.

Design.md line 124 also confirms the updated intent: "動的に列挙（`fs.readdirSync` 等）し、`command-registry.ts` 自身を除外した全ファイルの import 宣言を解析する。ハードコードリストに依存しないことで、将来 `src/cli/` に新規ハンドラモジュールが追加されても自動的に検査対象に含まれる。"

---

### [2] 64a0c9b9 — Check 3 uses line-split regex instead of @typescript-eslint/parser

**Status: FIXED**

`findValueImportsFrom()` (lines 219–238) now uses `tseParse` from `@typescript-eslint/parser` for AST-based analysis. It iterates `ast.body` looking for `ImportDeclaration` nodes with `importKind !== "type"` and a matching source value. A regression guard test (`"findValueImportsFrom detects a multi-line value import from command-registry"`) verifies that multi-line imports are detected.

---

### [3] d581ef8e — Uses ctx!.invokerCwd instead of process.cwd()

**Status: FIXED**

`src/cli/scaffold-handlers.ts` (the cited file):
- Line 13: `process.exit(await executeRulesNew(parsed.positionals[0]!, parsed.positionals[1]!, process.cwd()))`
- Line 18: `process.exit(await executeReviewersNew(parsed.positional!, process.cwd()))`

Both calls use `process.cwd()` as specified in tasks.md T-14 and TC-023.

Note: `src/cli/usage-handler.ts` still uses `ctx!.invokerCwd` (lines 16 and 18), but that file was mentioned only in the finding rationale as additional context. The cited file `scaffold-handlers.ts:14` is fixed.

---

### [4] 8ac21166 — Check 3 still uses regex; multi-line imports not detected

**Status: FIXED**

Same as finding [2]. `findValueImportsFrom()` uses AST traversal via `@typescript-eslint/parser`. The multi-line import regression guard test confirms correctness.

---

### [5] fc81c003 — Check 3 uses line-splitting regex — multi-line imports from command-registry are not detected

**Status: FIXED**

Same as findings [2] and [4]. The `findValueImportsFrom()` function uses `@typescript-eslint/parser` AST-based traversal. Regression guard tests at lines 261–276 verify both multi-line value import detection and that type-only multi-line imports are excluded.

---

### [6] 34230411 — Ratchet Check 1 misses named inline function expressions

**Status: FIXED**

`findInlineHandlerNodes()` (lines 121–153) uses `isFunctionNode()` which detects both `FunctionExpression` and `ArrowFunctionExpression` nodes via AST traversal. The AST-based check is applied in the test "command-registry.ts source has no handler: <function expression> properties (catches named inline functions)" (lines 169–174). A regression guard test at lines 177–181 verifies that a named inline function expression (`handler: async function myFn() {}`) is detected with length 1.

---

### [7] 14176e46 — findValueImportsFrom silently passes unparseable files

**Status: FIXED**

`findValueImportsFrom()` (lines 219–238) explicitly re-throws parse errors. The comment at lines 220–222 states: "Let parse errors propagate — callers (the ratchet tests) must not swallow them, as that would silently skip import detection on broken files." There is no try-catch block wrapping the `tseParse()` call; syntax errors propagate to the test layer.

---

## Evidence Summary

| Ref | Finding | Status |
|-----|---------|--------|
| ea1921d9 | Check 3 scope hardcoded list | FIXED |
| 64a0c9b9 | Check 3 line-split regex (design spec deviation) | FIXED |
| d581ef8e | ctx!.invokerCwd vs process.cwd() in scaffold-handlers.ts | FIXED |
| 8ac21166 | Check 3 regex; multi-line imports (operator ruling iter 1) | FIXED |
| fc81c003 | Check 3 regex; multi-line imports (operator ruling iter 1+2) | FIXED |
| 34230411 | Check 1 misses named inline function expressions | FIXED |
| 14176e46 | findValueImportsFrom silently passes unparseable files | FIXED |

**Checked**: 7 | **Skipped**: 0 | **Unverified**: 0
