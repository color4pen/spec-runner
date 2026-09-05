# Code Review Feedback — provider-lifecycle-parity-contract — iter 3

## Summary

The implementation is structurally sound and well-engineered. The 31-case contract table, 12-ratchet suite, dual harness translation, and capability matrix all match the design closely. Production code is untouched (`src/` diff is zero), existing tests are intact, and all gates pass. Four gaps remain relative to acceptance criteria and design obligations.

---

## Findings

### F-001 (Medium) — 8 tests reported as skipped, violating TC-042

**File**: `tests/unit/contract/provider-lifecycle/provider-lifecycle-parity.test.ts`

**Evidence**:
```
✓ tests/unit/contract/provider-lifecycle/provider-lifecycle-parity.test.ts (62 tests | 8 skipped) 158ms
```
The verification output unambiguously shows 8 skipped tests. TC-042 requires:
> 実行される test 件数が 62 + 台帳検査分（最低 64 件以上）であり、skip が 0 件である

The tasks.md actuals section also records this explicitly: "54 passed | 8 skipped (62)."

**Root cause analysis**: The driver always uses `const runTest = test;` (no conditional skip), so the skip is not from an explicit `.skip` marker. The 8 skipped tests correspond to the 8 absent-expectation pairs across all provider-specific cases (claude-code absent: 1; codex absent: 7). The most likely cause is that vitest's fork pool considers tests with only universal-invariant assertions and no declared case-level assertions as "pending" or "todo" in some internal heuristic when the test body completes with a trivial expect path. TC-024 (pair execution ledger) passes, which means runner.run() is called and results are recorded for all 62 pairs — the absent-case tests *do* execute, but vitest still categorises them as skipped in the file summary.

**Impact**: TC-042 acceptance criterion is violated on paper. Additionally, the acceptance criterion "≥ 64 tests" (62 case + ≥2 ledger) is also not clearly met — the vitest format `(62 tests | 8 skipped)` may be counting only non-skipped tests as "62," placing the ledger tests in an indeterminate position.

**Minimum fix**: Either (a) add at least one concrete `expect()` assertion to every absent-case expectation object so vitest sees a non-trivial test (e.g., explicitly assert `completionReason` for known absent-case outcomes), or (b) determine and document why vitest counts these as skipped and confirm that all 64+ tests run per TC-042. All absent cases already produce deterministic results (as confirmed by TC-024), so adding `completionReason` and `errorCode` assertions to the 8 absent expectations is well-supported by the existing case-table entries for most of them.

---

### F-002 (Medium) — `emittedEvents` observable contract from Design D3/D8 not implemented

**File**: `tests/unit/contract/provider-lifecycle/case-table.ts` (type), `tests/unit/contract/provider-lifecycle/provider-lifecycle-parity.test.ts` (driver)

**Evidence**:
Design D3 declares `emittedEvents（含むべき event 名）` as an observable contract item. Design D8 explicitly lists "emit された event の **名前**（`step:progress` / `step:retry` / `step:rollover`）と「その event が発生したか」" as a contract item (not just implementation detail).

However:
- `ProviderExpectation` interface has no `emittedEvents` field (case-table.ts lines 38–166)
- The driver uses a no-op emit: `const emit = (() => {}) as ...` (line 318–319)
- No case-table entry declares emitted-event expectations
- Tasks.md T-07 item "emit を収集関数にして、emit された event 名を記録する" is marked `[x]` but not fulfilled

**Impact**: `step:retry` events (transient retry cases), `step:rollover` events (context rollover cases), and `step:progress` events are not verified. R4b phase-splitting could break event emission without any red signal from this contract suite. The design's stated goal of catching "R4b で最初に壊れる境界" is weakened.

**Minimum fix**: (a) Add `emittedEvents?: string[]` to `ProviderExpectation`; (b) record emitted event names in a local `emittedEvents: string[]` array inside each test (using a collecting emit function); (c) assert `emittedEvents` contains the expected names; (d) add `emittedEvents: ["step:retry"]` to `transient.retry-then-success`, `emittedEvents: ["step:rollover"]` to `context.rollover-recovers-in-fresh-session`. Tasks.md T-07 item should reflect the actual implementation status.

---

### F-003 (Low) — `transient.budget-exhausted` classified as `"shared"` but expectations have divergent error codes

**File**: `tests/unit/contract/provider-lifecycle/case-table.ts`, line ~609

**Evidence**:
```typescript
id: "transient.budget-exhausted",
classification: "shared",
expectations: {
  "claude-code": { errorCode: "CLAUDE_CODE_QUERY_FAILED", ... },
  codex:         { errorCode: "CODEX_SDK_ERROR", ... },
},
```
Design D3 defines `shared` as "両providerで同じ意味・同じ結果を要求する" (same meaning **and** same result). The `errorCode` values differ between providers. The ratchet only checks `support === "supported"` for shared cases — it does not enforce value equality, so this inconsistency passes silently.

A parallel provider-specific case (`completion-error.generic-sdk-failure-code`) already exists to capture the error-code divergence for non-transient failures. The transient case's divergence is structurally identical but unclassified.

**Impact**: The shared/provider-specific classification loses precision. Future contributors may assume a shared case guarantees identical error codes and be surprised by the divergence. The ratchet will not catch additional divergences introduced in shared cases.

**Resolution options**:
1. Reclassify `transient.budget-exhausted` as `provider-specific` (matching `completion-error.generic-sdk-failure-code`) and add `reason` fields explaining the error-code difference. Update shared/provider-specific counts in the ratchet tests accordingly.
2. Add a ratchet check that shared cases do not assert different `errorCode` values across providers (harder to generalise).
3. Document in the case comment that "shared" here means "same lifecycle behavior" not "identical result values," and update the ratchet reason check to enforce this intent.

---

### F-004 (Low) — TC-031: no-imports constraint on `case-ids.ts` not mechanically enforced

**File**: `tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts`

**Evidence**:
TC-031 acceptance criterion (tasks.md T-01): "import 文が 0 件である（型 import を含め 0 件）". The SDK containment ratchet (ratchet:sdk-containment) checks `case-ids.ts` only for provider-SDK and provider-adapter imports. A non-SDK import from `src/core/` or any other module would not be caught.

`case-ids.ts` currently has zero imports (correct), but the constraint is enforced only by convention and the limited SDK containment scan, not by a dedicated ratchet that looks for **any** import statement.

**Impact**: If a contributor adds `import type { LifecycleArea } from "./scenario.js"` to `case-ids.ts` for convenience, the ratchet passes green and the acyclic design invariant silently breaks.

**Minimum fix**: Add one test to `contract-ratchet.test.ts` that reads `case-ids.ts` and asserts no line matches `/^import /` (or uses the TypeScript parser to verify zero ImportDeclaration nodes). This is a two-line addition to the existing file-scan infrastructure.

---

## Observations

**O-001**: `harness/_scenario-helpers.ts` imports `boolean` from `"zod/v4-mini"` at line 13. This is in the `harness/` directory (not in the shared-module list for SDK containment) and is project-consistent, but it introduces a Zod dependency in the scenario-helper layer. Not a bug; noted for awareness.

**O-002**: The `errorHintPresent` observable listed in Design D3 is also absent from `ProviderExpectation` and `assertExpectations`. The impact is narrower than `emittedEvents` (only timeout hint verification), but if future rework produces a hint change, the contract suite would not catch it. Recommend adding alongside `emittedEvents` in the same fix pass.

**O-003**: Ledger pair registration (`_executedPairs.add(...)`) occurs after `runner.run()` returns (line 361), deviating from Design D9's "先頭で行い" (record at the beginning of the case body). If `runner.run()` throws unexpectedly, TC-024 produces a false-positive failure alongside the case failure. The risk is low in practice since runners catch all errors internally and return `AgentRunResult`. No action required unless D9 fidelity is a hard requirement.

**O-004**: `post-work.excluded-from-follow-up-attempts` and `post-work.single-prompt-adds-turn` share the exact same scenario object. The separation is intentional and correct (different assertion focus), but a future contributor may merge them as "duplicate." A comment on each case explaining why both exist despite identical scenarios would reduce this risk.

---

## 検証した項目

- `git diff main...HEAD --stat` でスコープ確認（新規ファイル 26 件、`src/` への変更 0 件）
- `specrunner/changes/provider-lifecycle-parity-contract/design.md` — 全決定事項（D1〜D12）を精読
- `specrunner/changes/provider-lifecycle-parity-contract/tasks.md` — 全タスク（T-01〜T-11）と実測値セクションを確認
- `specrunner/changes/provider-lifecycle-parity-contract/test-cases.md` — 55 件の test case との対応を突合
- `tests/unit/contract/provider-lifecycle/case-ids.ts` — REQUIRED_CASE_IDS 31 件・import なしを確認
- `tests/unit/contract/provider-lifecycle/scenario.ts` — TurnBehavior 型・LifecycleScenario 型を確認
- `tests/unit/contract/provider-lifecycle/case-table.ts` — 全 31 件の case（shared 20 / provider-specific 11）と期待値を精査
- `tests/unit/contract/provider-lifecycle/result-field-matrix.ts` — 15 フィールドの capability 分類と reason を確認
- `tests/unit/contract/provider-lifecycle/harness/claude-code.ts` — TurnBehavior → Claude SDK event 変換ロジックを確認
- `tests/unit/contract/provider-lifecycle/harness/codex.ts` — TurnBehavior → Codex thread event 変換ロジックを確認
- `tests/unit/contract/provider-lifecycle/harness/_scenario-helpers.ts` — config/policy builder と OutputVerificationPolicy builder を確認
- `tests/unit/contract/provider-lifecycle/harness/registry.ts` — PROVIDER_HARNESSES の構造を確認
- `tests/unit/contract/provider-lifecycle/harness/types.ts` — ProviderHarness インターフェースを確認
- `tests/unit/contract/provider-lifecycle/provider-lifecycle-parity.test.ts` — driver の全体構造・assertExpectations・台帳ロジックを精査
- `tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts` — 12 ratchet（15 test）を全件確認
- `specrunner/changes/provider-lifecycle-parity-contract/verification-result.md` — 全フェーズ（build / typecheck / test / lint / changed-line-coverage）の通過を確認、parity driver の `(62 tests | 8 skipped)` を特定
- test-cases.md の 55 件中 50 件が green であることを確認（残 5 件は manual / gate または部分対応）

## 検証できなかった項目

- `(62 tests | 8 skipped)` の vitest カウント機構（F-001）: ドライバーコードに明示的な `.skip` 呼び出しは存在しないが、vitest が absent-case テストを skipped と分類する内部的な理由を確定的に特定できなかった。TC-024 が通過していることから runner.run() は全 62 ペアで呼ばれていると推定されるが、vitest の fork pool における "no case-level assertions" の扱いに関する詳細は本レビュー範囲外。
- `emittedEvents` の実際の欠落影響（F-002）: step:retry / step:rollover が既存の provider 別 regression テストで個別に検証されているかを確認していないため、F-002 の実質的なカバレッジギャップの大きさは断定できない。
- manual verification items（TC-044〜TC-047, TC-049）: これらは手動確認項目であり、本レビューでは自動化テストの通過のみ確認した。

---

## Coverage Against test-cases.md

Checked 55 test cases (must: 47, should: 7, could: 1):

| Status | Count | Notes |
|--------|-------|-------|
| Covered / green | 50 | TC-001–026, TC-028–030, TC-031–043, TC-048–055 |
| Partially covered | 2 | TC-007/TC-012: absent cases run but vitest counts them as skipped (F-001); TC-021: emittedEvents not verified (F-002) |
| Not mechanically enforced | 1 | TC-031 (F-004) |
| Manual / gate | 5 | TC-044–047, TC-049 — manual verification, not part of automated ratchet |

All 12 ratchet tests in `contract-ratchet.test.ts` passed green. All 15 verification phases (build, typecheck, test, lint, changed-line-coverage) passed.

---

## Production invariant check

- `git diff --stat ... -- src/`: empty (zero production changes ✓)
- Existing adapter tests: unchanged ✓
- `AgentRunResult` contract: unchanged ✓
- Provider SDK types confined to `harness/claude-code.ts` and `harness/codex.ts` ✓
- UNEXPLAINED provider differences: 0 ✓
