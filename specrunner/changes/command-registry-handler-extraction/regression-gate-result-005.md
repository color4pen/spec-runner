# Regression Gate Result — Iteration 5

## Summary

Checked 7 ledger findings against the current HEAD of `refactor/command-registry-handler-extraction-8e40e1f4`.

| # | Ref | Severity | Status |
|---|-----|----------|--------|
| 1 | `ea1921d9` | LOW | ✅ Fixed |
| 2 | `64a0c9b9` | MEDIUM | ✅ Fixed |
| 3 | `d581ef8e` | LOW | ❌ Still present |
| 4 | `8ac21166` | MEDIUM | ✅ Fixed |
| 5 | `fc81c003` | MEDIUM | ✅ Fixed |
| 6 | `34230411` | LOW | ✅ Fixed |
| 7 | `14176e46` | LOW | ✅ Fixed |

---

## Per-Finding Evidence

### [1] `ea1921d9` — Ratchet Check 3 scope: enumerated vs dynamic file list

**Status: FIXED**

`listCliTsFiles()` at `src/cli/__tests__/architecture-ratchet.test.ts:77–82` uses `fs.readdirSync(CLI_DIR)` to dynamically enumerate all `*.ts` files in `src/cli/`. No hardcoded list. The design.md at line 124 also documents the dynamic approach. Future new handler modules are automatically included.

---

### [2] `64a0c9b9` — Check 3: line-split regex vs @typescript-eslint/parser

**Status: FIXED**

`findValueImportsFrom()` at lines 219–238 uses `tseParse` from `@typescript-eslint/parser` and iterates over `ast.body`, checking `node.type === "ImportDeclaration"` and `node.importKind !== "type"`. No line-splitting or regex. A regression guard test at line 260–266 confirms multi-line imports are detected.

---

### [3] `d581ef8e` — Uses `ctx!.invokerCwd` instead of `process.cwd()` in scaffold-handlers.ts

**Status: STILL PRESENT (regression)**

`src/cli/scaffold-handlers.ts` lines 14 and 20:
```typescript
process.exit(await executeRulesNew(parsed.positionals[0]!, parsed.positionals[1]!, ctx!.invokerCwd));
process.exit(await executeReviewersNew(parsed.positional!, ctx!.invokerCwd));
```

Both calls pass `ctx!.invokerCwd` rather than `process.cwd()` as specified in tasks.md T-14 and TC-023. The requirement "意味を変えずに移動する" is technically violated. While functionally equivalent at dispatch time, the substitution is undocumented and TC-023 asserts `process.cwd()` is used.

---

### [4] `8ac21166` — Check 3 still uses regex; multi-line imports not detected

**Status: FIXED**

Same fix as [2]. `findValueImportsFrom` uses AST traversal via `@typescript-eslint/parser`. Multi-line imports are fully detected.

---

### [5] `fc81c003` — Check 3 uses line-splitting regex; multi-line imports not detected

**Status: FIXED**

Same fix as [2] and [4]. The AST-based `findValueImportsFrom` implementation with regression guard tests is in place.

---

### [6] `34230411` — Ratchet Check 1 misses named inline function expressions

**Status: FIXED**

`findInlineHandlerNodes()` at lines 121–153 walks the AST and flags any `Property` node with key `handler` whose value is a `FunctionExpression` or `ArrowFunctionExpression` (including named function expressions). This is used in the second test of Check 1 (line 169) which parses `command-registry.ts` directly. A regression guard at line 177 verifies `handler: async function myFn() {}` is caught.

---

### [7] `14176e46` — findValueImportsFrom silently passes unparseable files

**Status: FIXED**

`findValueImportsFrom` at line 220–221 has an explicit comment: "Let parse errors propagate". There is no try-catch block wrapping the `tseParse` call. Parse errors bubble up to the test layer. The Check 5 cycle-detection (`buildCliImportGraph`) intentionally uses a try-catch and skips unparseable files, but that is a separate function from `findValueImportsFrom`.

---

## Evidence Metrics

- **Checked**: 7
- **Still present (regressions)**: 1 — finding [3] (`d581ef8e`)
- **Fixed**: 6
