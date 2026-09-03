# Regression Gate Result — Iteration 4

## Summary

All 7 ledger findings verified. No regressions detected.

---

## Finding [1] — ea1921d9 (LOW)
**ratchet check 3 のスコープが列挙ファイルに限定され、将来の新規ハンドラが検査対象外になる**

- **File checked**: `src/cli/__tests__/architecture-ratchet.test.ts` lines 65–70
- **Status**: FIXED — no regression

`listCliTsFiles()` uses `fs.readdirSync(CLI_DIR)` to dynamically enumerate all `.ts` files (excluding `.d.ts`) in `src/cli/`. No hardcoded list exists. Check 3 filters out `REGISTRY_FILE` and inspects the rest via the AST helper. Any future `src/cli/` handler is automatically included.

---

## Finding [2] — 64a0c9b9 (MEDIUM)
**Ratchet Check 3 uses line-split regex instead of @typescript-eslint/parser (design spec deviation)**

- **File checked**: `src/cli/__tests__/architecture-ratchet.test.ts` lines 207–226
- **Status**: FIXED — no regression

`findValueImportsFrom` imports `{ parse as tseParse }` from `@typescript-eslint/parser` (line 31) and performs full AST traversal over `ast.body` nodes, checking `node.type === "ImportDeclaration"`, `node.importKind !== "type"`, and `node.source.value.includes(needle)`. No line-splitting or regex is used. The comment at lines 207–210 explicitly documents the AST-based approach.

---

## Finding [3] — d581ef8e (LOW)
**Uses ctx!.invokerCwd instead of process.cwd() as specified in tasks.md T-14 and TC-023**

- **File checked**: `src/cli/scaffold-handlers.ts` lines 14, 20; `src/cli/usage-handler.ts` lines 16, 18
- **Status**: FIXED — no regression

Code still uses `ctx!.invokerCwd`. As resolved in iteration 3, tasks.md T-14 and TC-023 were updated to explicitly specify `ctx!.invokerCwd` with operator ruling: `buildCommandContext` captures `process.cwd()` at dispatch time making them functionally identical. Spec and implementation remain aligned.

---

## Finding [4] — 8ac21166 (MEDIUM)
**Check 3 still uses regex; multi-line imports not detected**

- **File checked**: `src/cli/__tests__/architecture-ratchet.test.ts` lines 207–264
- **Status**: FIXED — no regression

Same resolution as findings [2] and [5]. The AST-based `findValueImportsFrom` replaces any prior line-splitting approach. The regression-guard test at lines 248–255 uses a `import {\n  COMMANDS\n} from "../command-registry.js"` fixture and asserts `toHaveLength(1)`, proving multi-line imports are detected.

---

## Finding [5] — fc81c003 (MEDIUM)
**Check 3 uses line-splitting regex — multi-line imports from command-registry are not detected**

- **File checked**: `src/cli/__tests__/architecture-ratchet.test.ts` lines 207–264
- **Status**: FIXED — no regression

Identical root cause to [2] and [4]. AST traversal via `@typescript-eslint/parser` handles multi-line imports correctly. The multi-line regression-guard test (lines 248–255) and type-only exclusion test (lines 257–264) provide automated proof of both detection paths.

---

## Finding [6] — 34230411 (LOW)
**Ratchet Check 1 misses named inline function expressions**

- **File checked**: `src/cli/__tests__/architecture-ratchet.test.ts` lines 85–175
- **Status**: FIXED — no regression

`isFunctionNode` (lines 85–98) detects both `ArrowFunctionExpression` and `FunctionExpression` AST node types. `findInlineHandlerNodes` (lines 109–141) walks the full AST, checks for `handler:` property keys, and flags any value that satisfies `isFunctionNode` — catching `handler: async function myFn() {}`. Two regression-guard tests confirm correct behavior:
- Line 165–169: `"findInlineHandlerNodes detects a named inline function expression on handler:"` — asserts `toHaveLength(1)`.
- Line 171–175: `"findInlineHandlerNodes does NOT flag a handler: identifier reference"` — asserts `toHaveLength(0)`.

---

## Finding [7] — 14176e46 (LOW)
**findValueImportsFrom silently passes unparseable files in Check 3**

- **File checked**: `src/cli/__tests__/architecture-ratchet.test.ts` lines 207–226
- **Status**: FIXED — no regression

`findValueImportsFrom` contains no try-catch block. The JSDoc at lines 207–210 explicitly states: "Let parse errors propagate — callers (the ratchet tests) must not swallow them, as that would silently skip import detection on broken files." A parse failure on any `src/cli/*.ts` file surfaces as a test failure, not a silent skip.

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
