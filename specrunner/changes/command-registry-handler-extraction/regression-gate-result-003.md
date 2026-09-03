# Regression Gate Result — Iteration 3

## Summary

All 7 ledger findings verified. No regressions detected.

---

## Finding [1] — ea1921d9 (LOW)
**ratchet check 3 のスコープが列挙ファイルに限定され、将来の新規ハンドラが検査対象外になる**

- **File checked**: `src/cli/__tests__/architecture-ratchet.test.ts` lines 65–70; `specrunner/changes/command-registry-handler-extraction/design.md` line 121
- **Status**: FIXED — no regression

`listCliTsFiles()` (lines 65–70) uses `fs.readdirSync(CLI_DIR)` to dynamically enumerate all `.ts` files (excluding `.d.ts`) in `src/cli/`. No hardcoded list exists. Check 3 (line 223) then filters out `REGISTRY_FILE` and inspects the rest via the AST helper. Any future `src/cli/` handler is automatically included. design.md line 121 also documents this dynamic enumeration approach.

---

## Finding [2] — 64a0c9b9 (MEDIUM)
**Ratchet Check 3 uses line-split regex instead of @typescript-eslint/parser (design spec deviation)**

- **File checked**: `src/cli/__tests__/architecture-ratchet.test.ts` lines 200–219
- **Status**: FIXED — no regression

`findValueImportsFrom` imports `{ parse as tseParse }` from `@typescript-eslint/parser` (line 31) and performs full AST traversal. It iterates over `ast.body` nodes, checking `node.type === "ImportDeclaration"`, `node.importKind !== "type"`, and `node.source.value.includes(needle)`. No line-splitting is used. Parse errors are intentionally re-thrown (no catch block), satisfying the structural-inspection requirement.

---

## Finding [3] — d581ef8e (LOW)
**Uses ctx!.invokerCwd instead of process.cwd() as specified in tasks.md T-14 and TC-023**

- **File checked**: `src/cli/scaffold-handlers.ts` lines 14, 20; `src/cli/usage-handler.ts` lines 16, 18; `specrunner/changes/command-registry-handler-extraction/tasks.md` lines 244–246; `specrunner/changes/command-registry-handler-extraction/test-cases.md` lines 322–324
- **Status**: FIXED — no regression

The code uses `ctx!.invokerCwd` in all four call sites. Critically, tasks.md T-14 (lines 244–246) and TC-023 (lines 322–324) were updated to explicitly specify `ctx!.invokerCwd` and include the operator ruling: "`buildCommandContext` が dispatch 時に `process.cwd()` を capture した値であり同値。operator 裁定: code-review iter 1 Finding 2". Spec and implementation are now aligned; the original finding about an undocumented divergence is resolved.

---

## Finding [4] — 8ac21166 (MEDIUM)
**Check 3 still uses regex; multi-line imports not detected**

- **File checked**: `src/cli/__tests__/architecture-ratchet.test.ts` lines 200–258
- **Status**: FIXED — no regression

Same resolution as findings [2] and [5]. The AST-based `findValueImportsFrom` replaces any prior line-splitting approach. A dedicated regression-guard test at lines 241–248 (`"findValueImportsFrom detects a multi-line value import from command-registry"`) uses a `import {\n  COMMANDS\n} from "../command-registry.js"` fixture and asserts `toHaveLength(1)`, proving multi-line imports are caught.

---

## Finding [5] — fc81c003 (MEDIUM)
**Check 3 uses line-splitting regex — multi-line imports from command-registry are not detected**

- **File checked**: `src/cli/__tests__/architecture-ratchet.test.ts` lines 200–258
- **Status**: FIXED — no regression

Identical root cause to [2] and [4]. AST traversal via `@typescript-eslint/parser` handles multi-line imports correctly. The regression-guard test (lines 241–248) and the type-only exclusion test (lines 250–257) provide automated proof of both the positive and negative detection paths.

---

## Finding [6] — 34230411 (LOW)
**Ratchet Check 1 misses named inline function expressions**

- **File checked**: `src/cli/__tests__/architecture-ratchet.test.ts` lines 82–168
- **Status**: FIXED — no regression

`isFunctionNode` (lines 82–94) detects both `ArrowFunctionExpression` and `FunctionExpression` AST node types. `findInlineHandlerNodes` (lines 105–134) walks the AST, checks for `handler:` property keys, and flags any value that is a function node — catching `handler: async function myFn() {}` (which has `.name === "myFn"` at runtime and evades the pure runtime check). Two regression-guard tests are present:
- Line 158–162: `"findInlineHandlerNodes detects a named inline function expression on handler:"` — asserts `toHaveLength(1)`.
- Line 164–168: `"findInlineHandlerNodes does NOT flag a handler: identifier reference"` — asserts `toHaveLength(0)`.

---

## Finding [7] — 14176e46 (LOW)
**findValueImportsFrom silently passes unparseable files in Check 3**

- **File checked**: `src/cli/__tests__/architecture-ratchet.test.ts` lines 200–219 (comment at lines 196–200)
- **Status**: FIXED — no regression

`findValueImportsFrom` contains no try-catch block. The JSDoc comment at lines 196–200 explicitly states: "Let parse errors propagate — callers (the ratchet tests) must not swallow them, as that would silently skip import detection on broken files." A parse failure on any `src/cli/*.ts` file will surface as a test failure, not be silently skipped.

---

## Evidence

| # | Ledger ref | Severity | Regression? |
|---|------------|----------|-------------|
| 1 | ea1921d9   | LOW      | No — Fixed  |
| 2 | 64a0c9b9   | MEDIUM   | No — Fixed  |
| 3 | d581ef8e   | LOW      | No — Fixed  |
| 4 | 8ac21166   | MEDIUM   | No — Fixed  |
| 5 | fc81c003   | MEDIUM   | No — Fixed  |
| 6 | 34230411   | LOW      | No — Fixed  |
| 7 | 14176e46   | LOW      | No — Fixed  |

**Checked**: 7 / **Skipped**: 0 / **Unverified**: 0
