# Code Review Feedback — provider-lifecycle-parity-contract — iter 1

## Scope

- **Change**: `tests/unit/contract/provider-lifecycle/` (24 new files, 6892 lines)
- **Production changes**: none (`git diff main...HEAD -- src/` is empty ✓)
- **Verification**: all phases passed (build, typecheck, test, lint, coverage)

---

## Findings

### F-001 [high] — `support:"absent"` cases are skipped, not asserted — violates TC-012 / TC-042 (must)

**File**: `tests/unit/contract/provider-lifecycle/provider-lifecycle-parity.test.ts` line 247

**Issue**: The parity driver uses `test.skip` for every provider expectation that has `support: "absent"`:

```typescript
const runTest = expectation.support === "absent" ? test.skip : test;
```

The spec requirement (spec.md §"absent support is asserted rather than skipped") explicitly states:

> "The case executes and **asserts** the documented absent behavior instead of being skipped."

TC-012 (must) and TC-042 (must, "skip が 0 件") both require absent cases to run with assertions, not to be silently omitted. Concretely:

- 8 absent provider slots are currently SKIPPED (not run): one for each of `report.settle-on-abort-with-captured-report[codex]`, `report.parse-failure-diagnostics[claude-code]`, `context.rollover-recovers-in-fresh-session[codex]`, `context.rollover-budget-exhausted[codex]`, `metrics.invocation-metrics-presence[codex]`, `metrics.context-metrics-presence[codex]`, `metrics.touched-files-presence[codex]`, `metrics.added-turns-invariant[codex]`.
- For an absent case the test should still run and at a minimum assert that each "absent" field in `RESULT_FIELD_MATRIX` is `undefined` in the actual result, locking the absence rather than merely documenting it.

**Consequence**: Absent provider behaviors are not mechanically verified. A future regression that accidentally populates an absent field (e.g. Codex suddenly setting `addedTurns`) would go undetected because those tests are skipped rather than asserting `toBeUndefined()`.

**Fix direction**: Replace `test.skip` with a real test for `absent` cases. The assertions can be lightweight: run the scenario, then for every field in `RESULT_FIELD_MATRIX` whose `providers[providerId] === "absent"`, assert `result[field] === undefined`. Alternatively, accept the absence as the only assertion (no `completionReason` check) so that the absent provider's behavior is still anchored.

---

### F-002 [medium] — Ratchet has no mechanical check for "every LIFECYCLE_AREA has at least one case"

**File**: `tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts` line 110

**Issue**: The area ratchet tests only one direction:

```typescript
// ratchet:area — "all CONTRACT_CASES areas are in LIFECYCLE_AREAS"
test("all CONTRACT_CASES areas are in LIFECYCLE_AREAS", () => {
  const areasSet = new Set<string>(LIFECYCLE_AREAS);
  const invalid = CONTRACT_CASES.filter((c) => !areasSet.has(c.area));
  ...
```

There is no test for the reverse: "all LIFECYCLE_AREAS have at least one case". The spec requirement (spec.md §"every lifecycle area has at least one case") and TC-005 (must) both require:

> "each declared lifecycle area maps to one or more cases"

The current implementation satisfies this in practice (all 9 areas are covered), but the ratchet doesn't enforce it mechanically. If someone adds a new entry to `LIFECYCLE_AREAS` without adding any case IDs, no test will fail.

**Consequence**: A future `LIFECYCLE_AREAS` addition silently passes the ratchet even if the new area has zero coverage.

**Fix direction**: Add a ratchet test to `contract-ratchet.test.ts`:

```typescript
test("every LIFECYCLE_AREA has at least one case", () => {
  const coveredAreas = new Set(CONTRACT_CASES.map((c) => c.area));
  const uncovered = LIFECYCLE_AREAS.filter((a) => !coveredAreas.has(a));
  expect(uncovered, `Lifecycle areas with no cases`).toHaveLength(0);
});
```

---

### F-003 [low] — `HarnessBuildOpts.resultFileContent` is dead interface surface area

**File**: `tests/unit/contract/provider-lifecycle/harness/types.ts` line 23

```typescript
/** Result file content: path → content. Written to tempDir before run(). */
resultFileContent?: { path: string; content: string } | null;
```

This field is declared in `HarnessBuildOpts` but is never passed by the driver (`provider-lifecycle-parity.test.ts`) and never read by either harness (`claude-code.ts`, `codex.ts`). The driver creates result files itself (via `writeFile`) before calling `harness.build()`, making this field redundant.

**Consequence**: Future harness implementations may incorrectly assume file creation is the harness's responsibility (via this field) and skip writing files to `tempDir` — causing silent test mismatches.

**Fix direction**: Remove `resultFileContent` from `HarnessBuildOpts`, or add a comment explaining why file creation is the driver's responsibility (not the harness's). If the field is kept for future extensibility, add a note that the driver currently ignores it.

---

### F-004 [low] — `ProviderExpectation.fieldPresence` uses untyped string keys

**File**: `tests/unit/contract/provider-lifecycle/case-table.ts` line 151

```typescript
fieldPresence?: Partial<Record<string, "present" | "absent">>;
```

The key type is `string` rather than `keyof AgentRunResult`. A typo in a field name (e.g., `"invocationMetric"` instead of `"invocationMetrics"`) would compile without error and silently not assert anything.

**Consequence**: Field presence assertions can silently miss their target without any TypeScript error.

**Fix direction**: Tighten the key type:

```typescript
fieldPresence?: Partial<Record<keyof AgentRunResult, "present" | "absent">>;
```

(Import `AgentRunResult` type at the top of `case-table.ts`.)

---

## Observations (non-blocking)

**O-1** — `import { boolean } from "zod/v4-mini"` in `harness/_scenario-helpers.ts` line 13 uses the v4-mini subpath directly. This is unconventional (other project files typically import from `"zod"`). Typecheck and tests pass, so it is functional, but the import may break if the dependency alias changes. If the project standardizes on one zod subpath, this should follow that convention.

**O-2** — `agentBranch` is classified as `"supported"` by both providers in `result-field-matrix.ts`, but the reason text acknowledges that "local adapters may leave it undefined". No test case in the contract suite observes `agentBranch` as "present". The classification is technically correct (the field is contractually available), but adding a brief clarifying note that local runners do not populate it in practice would reduce reader confusion.

**O-3** — The overall architecture of the contract suite is well-structured: provider-neutral scenarios, separate harnesses for translation, a frozen ID registry, nine structural ratchets, and a single parity driver. The dependency graph (`case-ids.ts → no imports`, `scenario.ts → core port only`) is correctly acyclic. These are good design choices.

---

## Coverage check against test-cases.md must scenarios

| TC | Priority | Status |
|----|----------|--------|
| TC-001 ID ratchet | must | ✓ ratchet:id |
| TC-002 Deleting case fails ratchet | must | ✓ ratchet:id |
| TC-003 Duplicate ID fails ratchet | must | ✓ ratchet:duplicate |
| TC-004 Area prefix valid | must | ✓ ratchet:area |
| TC-005 Every area has a case | must | ✗ **not mechanically verified (F-002)** |
| TC-006 Report settle/budget represented | must | ✓ report.* cases |
| TC-007 One scenario drives both | must | ✓ parity driver structure |
| TC-008 No real SDK loaded | must | ✓ injected _queryFn/_codexFactory |
| TC-009 Timeout without wall-clock | must | ✓ fake timers |
| TC-010 Shared requires both | must | ✓ ratchet:shared |
| TC-011 Provider-specific needs reason | must | ✓ ratchet:reason/unexplained |
| TC-012 Absent asserted not skipped | must | ✗ **test.skip used (F-001)** |
| TC-013 Matrix covers AgentRunResult | must | ✓ ratchet:field-matrix |
| TC-014 Adding field fails matrix ratchet | must | ✓ ratchet:field-matrix |
| TC-015 Absent fields stay undefined | must | partial — only for cases that run |
| TC-016 Supported fields observed ≥1 | must | ✓ metrics cases |
| TC-017 Transient retry bounded | must | ✓ transient.budget-exhausted |
| TC-018 Non-transient not retried | must | ✓ transient.non-transient-not-retried |
| TC-019 Abort not retried | must | ✓ timeout.abort-not-retried |
| TC-020 Post-work excluded from followUp | must | ✓ post-work.excluded-from-follow-up-attempts |
| TC-021 addedTurns invariant | must | ✓ metrics.added-turns-invariant |
| TC-022 Missing harness fails registry ratchet | must | ✓ ratchet:registry |
| TC-024 Full cross-product | must | partial — 8 absent cases skipped (F-001) |
| TC-025 Unexplained diff blocks suite | must | ✓ ratchet:unexplained |
| TC-026 No unexplained diffs in delivered contract | must | ✓ all reasons present |
| TC-027 No production src modified | must | ✓ git diff src/ empty |
| TC-028 Provider SDK imports contained | must | ✓ harness files only |
| TC-029 Neutral modules stay provider-free | must | ✓ (scenario.ts, case-table.ts) |
| TC-030 Existing provider tests intact | must | ✓ no existing tests modified |
| TC-031 case-ids.ts has no imports | must | ✓ |
| TC-032 REQUIRED_CASE_IDS 31 non-duplicate | must | ✓ |
| TC-034 Claude harness complete-with-report | must | ✓ report.first-turn-success |
| TC-035 Claude harness stall-until-abort | must | ✓ timeout cases |
| TC-036 Codex harness complete-with-report | must | ✓ report.first-turn-success |
| TC-037 PROVIDER_HARNESSES keys match | must | ✓ ratchet:registry |
| TC-038 Case table 31 cases with both expectations | must | ✓ ratchet:area count |
| TC-040 case-table does not import case-ids | must | ✓ (imports type only from case-ids) |
| TC-041 field-matrix 15 entries, absent reasons | must | ✓ 15 entries, all reasons ≥40 chars |
| TC-042 Zero skips in parity driver | must | ✗ **8 skips present (F-001)** |
| TC-043 Stable across 3 runs | must | ✓ fake timers + injected sleepFn |

**Must scenarios not satisfied**: TC-005, TC-012, TC-042 (all linked to F-001 and F-002 above).

---

## 検証した項目

- `git diff main...HEAD -- src/` が空であること（production コード無変更）を確認
- `case-ids.ts` に import 文が 0 件であることを確認（TC-031）
- `REQUIRED_CASE_IDS` の要素数が 31、重複なしであることを確認（TC-032）
- `contract-ratchet.test.ts` の 9 つのratchet（id / duplicate / area / shared / reason / unexplained / skip / registry / field-matrix）の実装内容を確認
- `ratchet:area` が LIFECYCLE_AREAS → case 方向のチェックを欠いていることを確認（F-002）
- `provider-lifecycle-parity.test.ts` の `test.skip` 使用箇所（line 247）を確認し、spec.md §"absent support is asserted rather than skipped" との矛盾を確認（F-001）
- `HarnessBuildOpts.resultFileContent` が driver・両 harness のいずれからも参照されていないことを確認（F-003）
- `ProviderExpectation.fieldPresence` のキー型が `string` であることを確認（F-004）
- `case-table.ts` 全 31 件の内訳（shared 20 / provider-specific 11）および absent スロット 8 件を確認
- `result-field-matrix.ts` の 15 フィールドエントリ、全 absent エントリに ≥40 文字の reason があることを確認（TC-041）
- `harness/registry.ts` が CONTRACT_PROVIDERS と一致するキーを持つことを確認（ratchet:registry）
- `scenario.ts` / `harness/types.ts` が adapter/claude-code・adapter/codex をimport していないことを確認（TC-029）
- verification-result.md にて build / typecheck / test / lint / changed-line-coverage 全フェーズ passed を確認
- test-cases.md の must シナリオ 38 件について実装との対応を確認

## 検証できなかった項目

- TC-043（3 回連続 stable）: CI 上での繰り返し実行結果を直接観測できないため、fake timers / 注入 sleepFn の設計から安定性を推定するにとどまる
- TC-044 / TC-045 / TC-046（手動破壊テスト）: ratchet の fail メッセージ内容を直接実行して確認していない（manual カテゴリのため）
- TC-023（skip / focus マーカー検出）: vitest の `.skip` / `.only` マーカーを静的に検出するratchetが実装されているかどうかを確認できていない（`contract-ratchet.test.ts` に該当テストが見当たらない）
