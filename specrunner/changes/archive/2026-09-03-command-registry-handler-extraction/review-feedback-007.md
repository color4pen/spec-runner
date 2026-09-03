# Code Review — Iteration 7

**Branch**: refactor/command-registry-handler-extraction  
**Scope**: `src/cli/` handler extraction, architecture ratchet, CLI contract snapshot  
**Reviewer**: code-review step (automated)

---

## Summary

The R3a refactoring is substantially complete. All 29 inline handlers have been extracted to named functions; `command-registry.ts` contains zero `process.exit` calls and zero inline handler expressions; the architecture ratchet (6 checks) is in place; the CLI contract snapshot compares against the base fixture from `483c75f7`; and the `bin/specrunner.ts` entrypoint is diff-zero from base (D6/TC-029).

Two findings are reported below.

---

## Findings

### F1 — `scaffold-handlers.ts` uses `process.cwd()` instead of `ctx!.invokerCwd` (T-14 / TC-023 deviation)

**Severity**: Medium  
**File**: `src/cli/scaffold-handlers.ts` lines 13, 18  
**Category**: correctness / spec conformance

**Observation**:

Tasks.md T-14 is explicit:

> `handleRulesNew` → `process.exit(await executeRulesNew(parsed.positionals[0]!, parsed.positionals[1]!, ctx!.invokerCwd))`  
> `handleReviewersNew` → `process.exit(await executeReviewersNew(parsed.positional!, ctx!.invokerCwd))`  
> cwd は `process.cwd()` を直接呼ばず `ctx!.invokerCwd` を渡す（operator 裁定: code-review iter 1 Finding 2）

TC-023 THEN clause also asserts `ctx!.invokerCwd` in both calls.

The implementation diverges:

```ts
// current implementation (scaffold-handlers.ts)
export async function handleRulesNew(parsed: ParsedArgs, _ctx?: CommandContext): Promise<void> {
  process.exit(await executeRulesNew(parsed.positionals[0]!, parsed.positionals[1]!, process.cwd()));
}

export async function handleReviewersNew(parsed: ParsedArgs, _ctx?: CommandContext): Promise<void> {
  process.exit(await executeReviewersNew(parsed.positional!, process.cwd()));
}
```

The `_ctx` prefix marks the parameter as intentionally unused, directly contradicting T-14's "ctx!.invokerCwd を渡す" requirement.

**Impact**:

- In production the values are equivalent since `buildCommandContext(process.cwd())` captures `process.cwd()` at dispatch time and `process.cwd()` hasn't changed when the handler runs. No user-visible behavioral difference.
- However, in unit tests that inject a custom `CommandContext` with a different `invokerCwd` (e.g. a temp directory), the handler silently ignores the injected value and reads the real process cwd, making such tests unreliable.
- `handleUsage` in `usage-handler.ts` (extracted in the same task, T-15) correctly uses `ctx!.invokerCwd`, making the two newly created files inconsistent.
- Setting `_ctx` as the parameter name signals "not used here," which is a misleading signal for future maintainers who may wonder why the context type is present.

**Resolution**: Replace `process.cwd()` with `ctx!.invokerCwd` and rename `_ctx` → `ctx` in both `handleRulesNew` and `handleReviewersNew`.

```ts
// corrected
export async function handleRulesNew(parsed: ParsedArgs, ctx?: CommandContext): Promise<void> {
  process.exit(await executeRulesNew(parsed.positionals[0]!, parsed.positionals[1]!, ctx!.invokerCwd));
}

export async function handleReviewersNew(parsed: ParsedArgs, ctx?: CommandContext): Promise<void> {
  process.exit(await executeReviewersNew(parsed.positional!, ctx!.invokerCwd));
}
```

---

### F2 — `listCliTsFiles` and `listCliTsFilesNoTests` are identical implementations (architecture-ratchet.test.ts)

**Severity**: Low  
**File**: `src/cli/__tests__/architecture-ratchet.test.ts`  
**Category**: simplification / maintenance

**Observation**:

The ratchet test defines two functions with different names but identical bodies:

```ts
// line 77
function listCliTsFiles(): string[] {
  return fs
    .readdirSync(CLI_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
    .map((f) => path.join(CLI_DIR, f));
}

// line 401
function listCliTsFilesNoTests(): string[] {
  return fs
    .readdirSync(CLI_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
    .map((f) => path.join(CLI_DIR, f));
}
```

The `NoTests` name implies the function omits test files, but neither function actually filters `__tests__/`. The exclusion works implicitly because `fs.readdirSync` is non-recursive and `__tests__` is a directory (does not end with `.ts`). This behavior is correct but non-obvious.

**Impact**:

- If a developer changes one function to add explicit filtering (e.g. `!f.includes("__tests__")`) without changing the other, the two ratchet groups silently diverge in their file sets.
- The name mismatch misleads readers into thinking there is a real difference.

**Resolution**: Remove `listCliTsFilesNoTests` and replace both call sites with `listCliTsFiles`. Optionally add a comment explaining why explicit `__tests__` exclusion is unnecessary (non-recursive readdir).

---

## Positive observations

- **Ratchet quality**: All 6 checks in `architecture-ratchet.test.ts` are well-designed. The dual approach (runtime `handler.name` check + AST `findInlineHandlerNodes` for named inline functions) closes the gap that the runtime check alone would leave. Regression guards for both the AST helpers and the Tarjan SCC detector strengthen confidence.
- **Cycle elimination**: The three new `job-*-handler.ts` modules correctly break the `run.ts ↔ from-issue.ts` et al. cycles using static imports. Check 5 (Tarjan SCC) and Check 6 (`./` dynamic import) mechanically enforce this going forward.
- **CLI contract fixture**: Using the base commit's COMMANDS output as the expected fixture (`fixtures/cli-contract.base.json`) rather than a candidate-side snapshot is the correct approach — it proves the candidate matches the pre-refactoring contract.
- **bin/specrunner.ts**: Correctly has zero diff from base `483c75f7` — the D6 ruling (keep `instanceof` checks) is honoured.
- **metrics.md**: Provides production-only `process.exit` counts (before T-19: 98, after T-19: 98) which directly supports the TC-011 invariant without relying on the noisier total count.

---

## 検証した項目

- **TC-001**: `command-registry.ts` の全 handler 参照が named function であることを grep で確認（`handler: async` = 0件、`handler:` プロパティ = 30件すべて named）
- **TC-003**: `command-registry.ts` ソースの `process.exit` が 0 件であることを grep で確認
- **TC-006 / TC-025 / TC-026**: `architecture-ratchet.test.ts` の 6 チェック実装（inline handler AST 検出、process.exit ゼロ検証、import cycle ゼロ検証、COMMANDS 唯一性、Tarjan SCC、`./` dynamic import ゼロ）をソースレビューで検証
- **TC-008 / TC-028**: `cli-contract-snapshot.test.ts` が base fixture（`483c75f7`）との `toEqual` 比較を行っていることを確認。`normalizeCommandsTree` が flags の type/min/values/deprecated、args、help、hasHandler、children を網羅することを確認
- **TC-012**: `command-handler.ts` が `CommandHandler` 型のみを export し、`command-registry.ts` が `export type { CommandHandler }` で再エクスポートしていることを確認
- **TC-015**: `job-start-handler.ts` に `handleJobStart` と `resolveSlugForDetach` が存在し、`run.ts`・`from-issue.ts` からの static import を使用していることを確認
- **TC-017 / TC-018**: `job-resume-handler.ts` の `--prompt`/`--prompt-file` 排他チェック（FlagParseError 投入）と `--from-issue` 経由の `runResumeFromIssue` static import を確認
- **TC-019**: `job-archive-handler.ts` に `runArchive`・`runArchiveFromIssue` の static import があることを確認
- **TC-022**: `command-registry.ts` import 宣言に fs/path/credential/GitHub client 関連の value import が存在しないことを確認
- **TC-023**: `scaffold-handlers.ts` の実装を確認 → F1 finding として報告
- **TC-029**: `bin/specrunner.ts` が `instanceof FlagParseError` / `instanceof SpecRunnerError` を使用し、duck-type guard が存在しないことを確認（git diff 483c75f7 が空）
- **TC-030**: `metrics.md` の全 10 セクションを確認。production process.exit カウント（95→98→98）、inline handler 数（29→0）、handler 参照数（30→30）等を検証

---

## 検証できなかった項目

- **TC-009 / TC-011 (gate)**: `bun run test` の実際の実行結果は本レビューでは確認できない。verification phase のグリーン状態は verification-result.md を参照のこと
- **TC-027**: 7 テストファイルの mock factory に handler 本体の複製がないことの完全検証（from-issue.test.ts は先頭 60 行を確認したが、残りのテストファイルは個別に読んでいない）
- **TC-028 の fixture 再生成**: base `483c75f7` から fixture を再生成して既存 fixture との diff が空かを実際に実行して確認していない
