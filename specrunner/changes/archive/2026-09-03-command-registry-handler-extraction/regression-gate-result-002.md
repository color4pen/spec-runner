# Regression Gate Result — Iteration 2

## Summary

All 5 ledger findings verified. No regressions detected.

---

## Finding [1] — ea1921d9 (LOW)
**ratchet check 3 のスコープが列挙ファイルに限定され、将来の新規ハンドラが検査対象外になる**

- **File checked**: `src/cli/__tests__/architecture-ratchet.test.ts`
- **Status**: FIXED

`listCliTsFiles()` (lines 65–70) uses `fs.readdirSync(CLI_DIR)` to dynamically enumerate all `.ts` files in `src/cli/`, excluding `.d.ts` files. Check 3 (line 143) filters out `REGISTRY_FILE` and passes the rest to the AST checker. No hardcoded list is present. Any future `src/cli/` handler is automatically included.

---

## Finding [2] — 64a0c9b9 (MEDIUM)
**Ratchet Check 3 uses line-split regex instead of @typescript-eslint/parser (design spec deviation)**

- **File checked**: `src/cli/__tests__/architecture-ratchet.test.ts` lines 107–139
- **Status**: FIXED

`findValueImportsFrom` now imports `{ parse as tseParse }` from `@typescript-eslint/parser` (line 31) and performs full AST traversal over `ImportDeclaration` nodes, checking `importKind !== "type"` and `node.source.value.includes(needle)`. No line-splitting is used for Check 3.

---

## Finding [3] — d581ef8e (LOW)
**Uses ctx!.invokerCwd instead of process.cwd() as specified in tasks.md T-14 and TC-023**

- **File checked**: `src/cli/scaffold-handlers.ts`
- **Status**: FIXED

Both `handleRulesNew` (line 14) and `handleReviewersNew` (line 20) now pass `process.cwd()` directly to `executeRulesNew` and `executeReviewersNew` respectively. No `ctx!.invokerCwd` references remain.

---

## Finding [4] — 8ac21166 (MEDIUM)
**Check 3 still uses regex; multi-line imports not detected**

- **File checked**: `src/cli/__tests__/architecture-ratchet.test.ts` lines 106–178
- **Status**: FIXED

Same as finding [2]. The AST-based `findValueImportsFrom` helper replaces the prior line-splitting implementation. A dedicated regression-guard test (lines 161–167) verifies that the helper catches a multi-line value import of the form `import {\n  COMMANDS\n} from "../command-registry.js"`.

---

## Finding [5] — fc81c003 (MEDIUM)
**Check 3 uses line-splitting regex — multi-line imports from command-registry are not detected**

- **File checked**: `src/cli/__tests__/architecture-ratchet.test.ts`
- **Status**: FIXED

Same root cause as [2] and [4]. AST traversal via `@typescript-eslint/parser` now covers multi-line imports. The test case at lines 161–167 (`"findValueImportsFrom detects a multi-line value import from command-registry"`) provides automated proof that the pattern is caught.

---

## Evidence

| # | Ledger ref | Severity | Present? |
|---|-----------|----------|----------|
| 1 | ea1921d9  | LOW      | No — Fixed |
| 2 | 64a0c9b9  | MEDIUM   | No — Fixed |
| 3 | d581ef8e  | LOW      | No — Fixed |
| 4 | 8ac21166  | MEDIUM   | No — Fixed |
| 5 | fc81c003  | MEDIUM   | No — Fixed |
