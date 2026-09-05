# Review Feedback 002 — provider-lifecycle-parity-contract

**Iteration**: 2  
**Reviewer**: code-review  
**Scope**: `tests/unit/contract/provider-lifecycle/` (all new files)

---

## Summary

The implementation is structurally sound: 31 cases × 2 providers are declared, the static ratchet covers 9 structural invariants, production code is untouched (0-line diff in `src/`), and all tests pass. However, four gaps exist between the design spec and what was delivered. Two are high-priority coverage holes (the execution ledger and the universal absent-field check), two are medium-priority missing ratchet checks (skip-marker grep and SDK containment grep), and three are lower-priority documentation/assertion gaps.

---

## Findings

### F-001 — Missing execution ledger in driver (HIGH)

**Files**: `tests/unit/contract/provider-lifecycle/provider-lifecycle-parity.test.ts`  
**Violated specs**: TC-024, TC-016, TC-042  
**Design refs**: D9 items 7 and 8

TC-042 explicitly requires "実行される test 件数が 64 件以上（62 case test + 台帳検査 `it` 最低 2 件）" and "skip が 0 件". The driver currently generates exactly 62 `test` calls and no additional `it` blocks. Two ledger checks are absent:

1. **Execution-pair completeness** (TC-024): A final `it` that verifies the set of executed `(caseId, provider)` pairs equals `REQUIRED_CASE_IDS × CONTRACT_PROVIDERS`. Without this, a `test` body crash that exits before registration would silently drop the pair.

2. **Supported-field observation** (TC-016): A final `it` that verifies each `RESULT_FIELD_MATRIX` entry classified as `"supported"` for a given provider was actually observed (non-undefined) in at least one run for that provider. Without this, a capability promise in the matrix can be empty — a provider field declared `"supported"` might never be populated across the entire suite.

D9 states: "台帳は vitest がファイル内の it を宣言順に直列実行する性質に依存するため、台帳検査は driver と同一ファイルに置く（ファイル分離すると module 状態が共有されない）". Both ledger `it` blocks must be in `provider-lifecycle-parity.test.ts`.

**Fix**: Add a module-level `Set<string>` for executed pairs and a `Map<string, boolean>` for observed fields. Populate them inside each test body before assertions. Add two ledger `it` calls at the bottom of the file (after the loop) that assert the pair set equals the cross-product and the observation map has no gaps.

---

### F-002 — Missing universal absent-field check in driver (HIGH)

**Files**: `tests/unit/contract/provider-lifecycle/provider-lifecycle-parity.test.ts`  
**Violated specs**: TC-015  
**Design refs**: D4, D7

Design D4 states: "driver はすべての case 実行結果に対して次を検査する（case 側の宣言に関係なく常に適用）: matrix が `absent` と宣言した field は、その provider の結果で常に `undefined` であること."

The current driver imports only `CONTRACT_CASES`, `PROVIDER_HARNESSES`, `CONTRACT_PROVIDERS`, and `buildBaseContext`. It does **not** import `RESULT_FIELD_MATRIX` and does **not** apply the global absent constraint. Per-case `fieldPresence` declarations are the only guard. Consider the Codex cases for `main-work.success-minimal`, `report.first-turn-success`, etc. — none of them declare `fieldPresence: { addedTurns: "absent", contextMetrics: "absent", ... }`. If CodexAgentRunner were to accidentally start populating these fields, no test would catch it.

D7 reinforces this: "D4 の field matrix で `absent` の field は undefined" is listed as a **universal invariant** (always applied), not a per-case opt-in.

**Fix**: In `assertExpectations`, after per-case assertions, iterate `RESULT_FIELD_MATRIX` entries for the given `providerId` and assert that each `absent` field is `undefined` in the result. This requires importing `RESULT_FIELD_MATRIX` into the driver.

---

### F-003 — Missing skip/focus marker ratchet in static ratchet (MEDIUM)

**Files**: `tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts`  
**Violated specs**: TC-023  
**Design refs**: D9 item 5

Design D9 item 5: "contract ディレクトリのソースに `it.skip` / `describe.skip` / `test.skip` / `it.todo` / `.only` が出現しないこと（暗黙 skip の静的検出）."

The 9 ratchets in `contract-ratchet.test.ts` do not include a grep-based check over the contract directory source files. The driver comment correctly says "test.skip is prohibited by TC-042" and the code uses `const runTest = test`, but there is no *machine enforcement* preventing a future commit from re-introducing a `test.skip`. Note also that the top-of-file JSDoc of the driver (line 6) incorrectly states "absent provider gets test.skip" — a stale note from an earlier draft — which a static grep would have caught.

**Fix**: Add a 10th ratchet in `contract-ratchet.test.ts` that reads each `.ts` file under `tests/unit/contract/provider-lifecycle/` with `readFileSync` and asserts that none contains `/it\.skip|describe\.skip|test\.skip|it\.todo|\.only\(/`.

---

### F-004 — Missing SDK containment ratchet in static ratchet (MEDIUM)

**Files**: `tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts`  
**Violated specs**: TC-028, TC-029  
**Design refs**: D9 item 6

Design D9 item 6: "共有モジュール（`case-ids.ts` / `scenario.ts` / `case-table.ts` / `result-field-matrix.ts` / `harness/types.ts` / driver）が `src/adapter/claude-code/` / `src/adapter/codex/` / provider SDK パッケージを import しないこと（provider 依存は `harness/claude-code.ts` と `harness/codex.ts` にのみ許可）."

The current implementation respects containment in practice: none of the shared modules import provider SDK packages. However, there is **no ratchet** enforcing this. A future change that accidentally pulls a `ClaudeCodeRunner` import into `case-table.ts` or the driver would go undetected until something breaks at runtime. TC-028 and TC-029 call for explicit mechanical enforcement.

**Fix**: Add a ratchet that reads each shared module file and asserts no line matches `adapter/claude-code|adapter/codex|@anthropic-ai/claude-agent-sdk|@openai/codex-sdk`. Also verify that only `harness/claude-code.ts` and `harness/codex.ts` contain those imports within the contract directory.

---

### F-005 — `case-table.ts` imports from `case-ids.ts` (MEDIUM)

**Files**: `tests/unit/contract/provider-lifecycle/case-table.ts` line 23  
**Violated specs**: TC-040  
**Design refs**: D5

```typescript
import type { REQUIRED_CASE_IDS, LIFECYCLE_AREAS } from "./case-ids.js";
```

Design D5: "case-table.ts はこれを import しない（逆方向の依存のみ: ratchet が両方を import して突合）." TC-040 tests this: "case-ids.ts への import が存在しない".

The import is type-only (`import type`) and uses `REQUIRED_CASE_IDS` and `LIFECYCLE_AREAS` as type-level constraints on `ContractCase.id` and `ContractCase.area`. While this adds TypeScript safety, it couples `case-table` to `case-ids` in a direction that D5 explicitly forbids. The ratchet already enforces that every case ID in the table exists in `REQUIRED_CASE_IDS` — the compile-time constraint is therefore redundant with the ratchet and violates the intended acyclic dependency.

**Fix**: Remove the `import type` from `case-table.ts`. Change `id: (typeof REQUIRED_CASE_IDS)[number]` to `id: string` and `area: (typeof LIFECYCLE_AREAS)[number]` to `area: string`. Runtime correctness is enforced by the ratchet; compile-time coupling is unneeded.

---

### F-006 — Stale JSDoc in driver contradicts implementation (LOW)

**Files**: `tests/unit/contract/provider-lifecycle/provider-lifecycle-parity.test.ts` line 6  
**Design refs**: TC-012, TC-042

The top-of-file JSDoc states:

```
 * - provider-specific cases: "absent" provider gets test.skip; "supported" runs
```

This directly contradicts the implementation: `const runTest = test` (not `test.skip`), and a comment 244 lines later explicitly says "test.skip is prohibited by TC-042". The JSDoc description is a stale artifact from an earlier design iteration where `test.skip` was considered for absent cases.

A reader following the JSDoc description would believe absent cases are skipped — the opposite of the actual behavior required by TC-012 and D3.

**Fix**: Update the JSDoc bullet to: `- all cases (including absent-support): run and assert universal invariants; absent expectations assert the absent behavior without skip.`

---

### F-007 — Codex absent expectations don't assert what actually happens (LOW)

**Files**: `tests/unit/contract/provider-lifecycle/case-table.ts`  
**Design refs**: D3 ("absent を明示的な期待値にすれば、provider が将来その機能を得たときに必ず red になり")

Three Codex absent expectations carry only `support: "absent"` and `reason` — no observable assertions:

| Case ID | Missing assertions |
|---|---|
| `context.rollover-recovers-in-fresh-session` (codex) | `completionReason: "error"`, `errorCode: "CODEX_SDK_ERROR"`, `fieldPresence: { sessionRollovers: "absent" }` |
| `context.rollover-budget-exhausted` (codex) | `completionReason: "error"`, `errorCode: "CODEX_SDK_ERROR"`, `fieldPresence: { sessionRollovers: "absent" }` |
| `report.settle-on-abort-with-captured-report` (codex) | `completionReason: "success"`, `toolResult: { ok: true }` (Codex completes turn 0 normally) |

D3 states these absent cases should pin "「rollover せず 1 invocation で error, `sessionRollovers` は undefined」を assert する". Without these assertions, if Codex were to gain rollover support or the harness behavior changed, the absent tests would still pass (universal invariants only) and the behavioral change would go undetected.

**Fix**: Add the concrete observable assertions listed above to each affected absent expectation. These match the actual current behavior of the Codex harness for these scenarios and will turn red when Codex gains the feature.

---

## Acceptance Condition Status

| Condition | Status | Notes |
|---|---|---|
| Stable case ID table with 31 IDs | ✅ pass | `REQUIRED_CASE_IDS`, `CONTRACT_CASES` both 31 |
| 8 lifecycle areas covered | ✅ pass | All areas represented |
| Shared cases run both providers | ✅ pass | 20 shared × 2 = 40 shared executions |
| provider-specific / absent with reasons ≥40 chars | ✅ pass | Ratchet 5 enforces |
| Coverage ratchet: ID match, duplicate, provider, skip | ⚠️ partial | Static structure ✓; execution ledger absent (F-001); absent-field universal check absent (F-002); source skip-marker grep absent (F-003) |
| Deterministic (no real SDK / wall-clock) | ✅ pass | Fake timers + DI seams |
| Existing provider tests unmodified | ✅ pass | No deletions/changes to existing test files |
| Production behavior unchanged | ✅ pass | `src/**` diff = 0 lines |
| `AgentRunner` / `AgentRunResult` contract unchanged | ✅ pass | Port untouched |
| SDK types not in shared production modules | ✅ pass | Containment holds in practice; ratchet missing (F-004) |
| SpecRunner verification green | ✅ pass | All phases passed |
| R4b can use suite as regression baseline | ⚠️ partial | Suite exists; absent-field universal check and ledger missing weakens the regression guarantee |

---

## Metrics (from verification-result.md and diff)

| Metric | Value |
|---|---|
| Contract case count | 31 |
| shared / provider-specific | 20 / 11 |
| Claude executions | 31 |
| Codex executions | 31 |
| Total test combinations | 62 |
| Production `agent-runner.ts` change lines | 0 |
| UNEXPLAINED diffs | 0 |
| Fixable findings (this review) | 7 (F-001 to F-007) |

---

## 検証した項目

- `case-ids.ts`: `REQUIRED_CASE_IDS` の要素数（31）、重複なし、area プレフィックス妥当性、import 文ゼロを確認
- `scenario.ts` / `harness/types.ts`: provider SDK import がないこと、`ProviderHarness.build` の戻り値型を確認
- `harness/claude-code.ts`: 全 `TurnBehavior` ブランチの翻訳ロジック、`stallAfterReport` パス、`_queryFn` 呼び出し回数カウントを確認
- `harness/codex.ts`: 全 `TurnBehavior` ブランチ、`stallAfterReport` 無視の明記、`runStreamed` カウントを確認
- `harness/_scenario-helpers.ts`: `buildScenarioConfig` / `buildScenarioPolicy` / `buildOutputVerificationPolicy` の実装を確認
- `harness/registry.ts`: `PROVIDER_HARNESSES` が `CONTRACT_PROVIDERS` と一致することを確認
- `result-field-matrix.ts`: 全 15 フィールドの capability 分類と absent 理由（≥40 文字）を確認
- `case-table.ts`: 31 ケース全件の scenario、classification、両 provider 期待値を確認
- `contract-ratchet.test.ts`: 9 つの ratchet チェックの実装を確認（ID 一致、重複なし、area 妥当性、shared 両対応、reason 長、UNEXPLAINED、skip-all-absent、registry、field matrix）
- `provider-lifecycle-parity.test.ts`: ドライバーのテスト生成ループ、`assertExpectations` の全アサーション分岐、fake timer パターンを確認
- `git diff main...HEAD --stat` で `src/**` への変更がゼロであることを確認
- `verification-result.md` で build / typecheck / test / lint / changed-line-coverage が全 passed であることを確認
- `design.md` / `tasks.md` の設計決定（D1〜D12）と受け入れ条件を照合
- `test-cases.md` の TC-001〜TC-042 と実装の対応を確認

## 検証できなかった項目

- `transient.disabled-omits-attempts-field` での `transientRetryAttempts` absent の実機動作（vitest 実行結果から間接的に確認）
- `report.settle-on-abort-with-captured-report` の Claude fake timer パスで grace settle が正しく発火するかの詳細（既存 `agent-runner-rollover.test.ts` の hangingQueryFn パターンに依拠）
- 3 回連続実行での flakiness 確認（TC-043 は manual / should）
- `metrics.touched-files-presence` で Claude が実際に空配列ではなく定義済み値を返すことの実測（ファイル操作なし scenario のため空配列 `[]` が `defined` として pass する可能性あり）
