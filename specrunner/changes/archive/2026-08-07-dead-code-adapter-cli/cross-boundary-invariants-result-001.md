# cross-boundary-invariants Review — dead-code-adapter-cli — Iteration 1

**Reviewer**: cross-boundary-invariants  
**Purpose**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

---

## Scope

Verified all 17 tasks (T-01 through T-17). Examined the following cross-boundary surfaces:

| Surface | Check |
|---------|-------|
| barrel re-exports (`managed-agent/index.ts`) | consumers import only preserved symbols |
| `assertBreakAfterCompletion` removal | `break` at `sse-stream.ts:132` still present |
| `checkConfigComplete` removal | no-op confirmed; call-site block cleanly removed |
| `RunArchiveOptions.dryRun` removal | zero read-sites in `runArchive`; inbox/prune untouched |
| `ClaudeCodeRunnerDeps._spawnFn` + `git-exec.ts` removal | all test imports cleaned; `SpawnFn` dropped, not repointed |
| shim repointing (`transient-error.ts`, `session-log-writer.ts`) | `agent-runner.ts` and test `__tests__/` files point to `../shared/` |
| `REPORT_TOOL` → test-local fixture | specific step tools (`PRODUCER_REPORT_TOOL` etc.) untouched; singleton identity checks (`=== JUDGE_REPORT_TOOL`) unaffected |
| `LEVEL_ORDER` un-export | `isLevelEnabled` uses it internally; no external consumer |
| `ConfigStore` interface conformance | `FileConfigStore` had no `implements ConfigStore` declaration; deletion safe |
| bin/specrunner.ts export removal | `RUNTIME_RESET_USAGE` still present in command-registry.ts and COMMANDS |
| `RunConfigEffectiveOptions.cwd` removal | tests correctly updated to `{ repoRoot }` |

---

## Findings

### F-01 — ADR D1 references deleted `assertBreakAfterCompletion` as break-invariant guard

**Severity**: low  
**Resolution**: fixable  
**File**: `specrunner/adr/2026-04-27-cli-core-pipeline.md:24`

**Rationale**: The ADR's D1 decision text reads:

> SSE で `session.status_idle` + `stop_reason: "end_turn"` を観測した時点で **必ず break** する（`completion.ts` の `assertBreakAfterCompletion` ガードで検証）

`assertBreakAfterCompletion` was deleted by T-02. The runtime invariant (break on `end_turn`) is still correctly enforced by the `break` statement at `sse-stream.ts:132`. However, the ADR now references a function that does not exist. Future contributors looking for the "ガード" in `completion.ts` will not find it, potentially concluding the invariant is unenforced.

Note: The ADR's own Design Debt section (L4) explicitly anticipated this deletion — "assertBreakAfterCompletion の dead-doc-only ヘルパを削除またはテスト強化" — confirming the deletion was planned. The D1 text was not updated to reflect the completed deletion.

**Verification artifact**: The `break` statement at line 132 of `sse-stream.ts` was observed directly; `assertBreakAfterCompletion` returns zero grep matches in `src/`, `bin/`, and `tests/`.

---

## Observations (no action required)

| Severity | File | Title | Rationale |
|----------|------|--------|-----------|
| low | `tests/adapter/codex/agent-runner.test.ts:17` | `REPORT_TOOL_FIXTURE` typed as `any` | Intentional design trade-off (design.md Risk section): avoids zod dependency in tests; codex tests don't validate report-tool schema correctness. Future schema divergence is not caught by TypeScript. |
| low | `specrunner/adr/2026-04-27-cli-core-pipeline.md:24` | Stale `assertBreakAfterCompletion` reference in ADR D1 | Documented above as F-01; no runtime impact since `assertBreakAfterCompletion` was confirmed as a literal no-op before deletion |

---

## Evidence summary

- **Tasks verified**: T-01 through T-17 (all 17 tasks)
- **Peripheral checks**: ADR cross-reference, barrel import consumers, singleton identity chains, inbox/prune dry-run preservation
- **Unverified**: 0 items (ADR stale text was observable, categorized as fixable finding)

```
checked:    17
skipped:    0
unverified: 0
```
