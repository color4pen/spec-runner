# Code Review Feedback — command-registry-handler-extraction — iter 4

## Scope

Reviewed all changed implementation files against:
- `specrunner/changes/command-registry-handler-extraction/design.md`
- `specrunner/changes/command-registry-handler-extraction/tasks.md`
- `specrunner/changes/command-registry-handler-extraction/test-cases.md`
- Acceptance criteria in `request.md`

## Summary

The implementation correctly achieves all acceptance criteria. The 29 inline handlers have been extracted to 19 per-command or per-family modules. `command-registry.ts` (1,083 lines, down from 1,696) is now a pure declaration file with zero `process.exit` calls and no filesystem/credential/GitHub client value imports. Architecture ratchet and CLI contract snapshot are in place. Verification passed (build, typecheck, 101.9s test suite, lint, coverage — all green).

Two low-severity theoretical gaps in the architecture ratchet warrant attention.

---

## Findings

### Finding 1 — Architecture ratchet Check 1 does not detect named inline function expressions

**Severity**: low
**File**: `src/cli/__tests__/architecture-ratchet.test.ts`, line 82

**Description**

Check 1 detects inline handlers by testing `spec.handler.name === "handler"`. This correctly catches anonymous arrow functions (`handler: async (parsed, ctx) => {}`) because V8 infers the property name as the function name. However, it does not catch explicitly named inline function expressions:

```typescript
// Would NOT be flagged:
handler: async function handleJobFoo(parsed, ctx) { ... }
```

Such a function has `.name === "handleJobFoo"`, so the check passes even though the implementation is still embedded inline in the registry.

**Impact**

Low. No current code uses this pattern. A developer would have to deliberately write a named function expression in the registry literal — an unusual style — to bypass the ratchet. The named export pattern (`export async function handleXxx(...)`) that the refactoring establishes produces declared names that are impossible to confuse with registry property names. The risk of accidental regression via this bypass route is negligible.

**Recommendation**

If stronger coverage is desired (R3b or a future cleanup pass), supplement Check 1 with a static AST check that flags any `FunctionDeclaration` or `FunctionExpression` node embedded directly in the COMMANDS literal, rather than relying solely on the runtime `.name` property. For now, the runtime check is sufficient for the stated goal.

---

### Finding 2 — `findValueImportsFrom` silently passes unparseable files in Check 3

**Severity**: low
**File**: `src/cli/__tests__/architecture-ratchet.test.ts`, line 119–122

**Description**

```typescript
} catch {
    // If the file fails to parse we conservatively return no violations —
    // a broken file will surface through compilation, not this ratchet.
    return [];
}
```

If any `src/cli/*.ts` file contains syntax that `@typescript-eslint/parser` cannot parse (e.g., a future language feature not yet supported by the installed parser version), Check 3 silently skips it and reports zero violations. A value import from `command-registry` in that file would go undetected.

**Impact**

Low. All files in `src/cli/` are already type-checked by `tsc --noEmit` (verification phase 2), which uses the same TypeScript version. A file that passes `tsc` should also parse cleanly with `@typescript-eslint/parser`. The defence-in-depth gap only opens if a file is syntactically broken enough to fail the ratchet parser but still passes `tsc`, which is an extremely unlikely scenario.

**Recommendation**

Optionally convert the silent catch to a `console.warn` or add a test assertion that `listCliTsFiles()` produces a non-empty list (so a misconfigured CLI_DIR does not silently pass). No change required for this iteration.

---

## Acceptance Criteria Verification

| Criterion | Status |
|-----------|--------|
| `command-registry.ts` inline handlers: 0 | ✅ Verified (grep: 0 `handler: async` patterns; all 29+ entries are named references) |
| registry is CLI metadata + named handler reference declarations | ✅ Verified |
| registry: 0 filesystem/credential/GitHub client value imports | ✅ Verified (import list: handler modules, USAGE constants, type-only imports) |
| registry: 0 `process.exit` calls | ✅ Verified (grep count: 0) |
| exit conditions/order/exit codes unchanged | ✅ Handler implementations preserve original semantics |
| handler → registry value-import cycles: 0 | ✅ Architecture ratchet Check 3 (AST-based) confirms this |
| CommandSpec is the single CLI contract source | ✅ Architecture ratchet Check 4 confirms only `command-registry.ts` exports `COMMANDS` |
| CLI contract snapshot committed | ✅ `src/cli/__tests__/__snapshots__/cli-contract-snapshot.test.ts.snap` present |
| All tests green | ✅ Verification: 101.9s test suite passed |
| Architecture ratchet (4 checks) in place | ✅ `architecture-ratchet.test.ts` implements all 4 checks |
| `ARCHIVE_USAGE` re-exported from `command-registry.ts` | ✅ Lines 25–26, 856 (used locally in help.detail) |
| `CommandHandler` type in neutral `command-handler.ts` | ✅ Correct neutral module; registry re-exports for backward compat |
| `VALID_JOB_ID_CHARS` moved to `cancel.ts` | ✅ TC-020 satisfied |
| `command-registry.ts` line count reduced | ✅ 1,696 → 1,083 lines |
| `resolveRepoRoot` allowlist updated for `ps.ts` | ✅ `RESOLVE_REPO_ROOT_ALLOWED_FILES` updated in `arch-allowlist.ts` |
| Duck-type guards in `bin/specrunner.ts` for cross-module-boundary test isolation | ✅ D6 companion fix present |
| Observable user-facing behaviour unchanged | ✅ No command names, flags, help text, exit codes changed |

## Notable Design Decisions Validated

- **D3 (ARCHIVE_USAGE)**: Imported locally (line 25) for use in `help.detail` (line 856) and re-exported (line 26) for backward compat. Both usages justified.
- **D4 (ratchet)**: Check 1 (runtime `.name`), Check 2 (source text after comment stripping), Check 3 (AST-based import graph), Check 4 (text scan for `export const COMMANDS`). All four implemented correctly. Regression guards for Check 3 (multi-line import detection + type-only exclusion) are present and passing.
- **D6 (duck-type guards)**: `isFlagParseError` and `isSpecRunnerError` in `bin/specrunner.ts` correctly fall back to name/property checks when `instanceof` fails across module reset boundaries (Vitest `vi.resetModules()`). Production path retains `instanceof` as the primary check.
- **handleGuide**: Parameter-less function `(parsed: ParsedArgs): Promise<void>` is assignable to `CommandHandler` since TypeScript allows functions to have fewer parameters than the target type requires. No type error.
- **handleRequestLs / handleRequestPrompt**: Zero-parameter signatures are likewise assignable to `CommandHandler`. Consistent with original inline handlers that also ignored arguments.

## 検証した項目

- `command-registry.ts` の `process.exit` 件数: grep で 0 件を確認
- `command-registry.ts` の `handler: async` パターン: grep で 0 件を確認（29 件がすべて named reference に置換済み）
- `command-registry.ts` の import 一覧: fs / path / credential / GitHub client value import が存在しないことを直接確認
- `architecture-ratchet.test.ts` の 4 チェック実装内容: ソースを通読して設計意図との整合を確認
- `bin/specrunner.ts` の duck-type guard (D6): `isFlagParseError` / `isSpecRunnerError` の実装と fallback ロジックを確認
- `cancel.ts` への `VALID_JOB_ID_CHARS` 移動 (TC-020): ソースで定義位置を確認
- `ARCHIVE_USAGE` のローカル使用 (line 856) と re-export (line 26) の両立 (D3): ソースで確認
- `command-handler.ts` の中立型モジュール構成 (D2): ソースを確認
- `scaffold-handlers.ts` / `usage-handler.ts` / `guide-handler.ts` / `request-handlers.ts` 等の新規モジュール: ソースを通読して handler の意味的同一性を確認
- `ps.ts` の `handleJobLs` / `handleJobStats`: ctx usage パターンと requiresRepo の対応を確認
- CLI contract snapshot テストの存在: `cli-contract-snapshot.test.ts` および `.snap` ファイルを確認
- `arch-allowlist.ts` の `RESOLVE_REPO_ROOT_ALLOWED_FILES` 更新 (ps.ts 追加): 確認
- Verification result: build / typecheck / test (101.9s) / lint / coverage すべて passed を確認

## 検証できなかった項目

- TC-011 (repository 全体の `process.exit` 件数が変化しない): before 値が本レビュー時点では main ブランチを直接参照できないため、before/after の数値比較は実施せず。verification-result.md の passed 記録をもって代替とした。
- 実行時の exit code・stdout/stderr の完全な等価性: handler 抽出は純粋なコード移動であり意味変更がないことをソースレベルで確認したが、全コマンドの E2E 出力比較は実施していない。CLI contract snapshot と既存テスト suite の green をもって代替とした。

## Conclusion

The refactoring is structurally correct and the acceptance criteria are fully met. The two findings are theoretical ratchet gaps that do not affect current correctness. No blocking issues identified.
