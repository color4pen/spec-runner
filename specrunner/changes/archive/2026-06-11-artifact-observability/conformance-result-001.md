# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✅ | All T-01–T-07 checkboxes marked [x] |
| design.md | ✅ | D1–D6 all implemented as designed |
| spec.md | ✅ | All SHALL/MUST requirements satisfied; all scenarios covered by tests |
| request.md | ✅ | All 5 acceptance criteria met; typecheck and 4056 tests green |

## Detail

### Scope

40 files changed (+2235 / -32). Key implementation files:

- `src/state/artifact-types.ts` — shared `ArtifactRef` type
- `src/state/schema.ts` — `StepName = string`, `version: 1|2`, migration shim in `validateJobState`
- `src/store/event-journal.ts` — `LineageRecord`, `EventRecord` union, `FoldResult.lineage`
- `src/store/job-state-store.ts` — `appendLineage()`
- `src/core/port/runtime-strategy.ts` — `digestArtifacts()` seam
- `src/core/runtime/local.ts` — sha256 content hashing via `node:crypto`
- `src/core/runtime/managed.ts` — `hash: null` stub
- `src/core/step/step-names.ts` — `toStepName()` passthrough + `isStandardStepName()` whitelist
- `src/core/step/executor.ts` — lineage recorded in `finalizeStep` (best-effort outer try/catch)
- `src/cli/job-show.ts` — lineage + cost sections appended after existing key-fields

### Design decisions (D1–D6)

| ID | Verdict | Notes |
|----|---------|-------|
| D1 | ✅ | `LineageRecord` in `EventRecord` union; `FoldResult.lineage` collected; not in `state.json` |
| D2 | ✅ | `validateJobState` accepts v1→normalizes to v2 (identity); `buildInitialJobState` writes v2 |
| D3 | ✅ | `StepName = string`; `toStepName()` is passthrough; `isStandardStepName()` + compile guard maintained |
| D4 | ✅ | `digestArtifacts()` on `RuntimeStrategy`; LocalRuntime: sha256; ManagedRuntime: `hash: null` |
| D5 | ✅ | Lineage appended in `finalizeStep` after `store.persist()`; `job show` reads journal via `fold()` |
| D6 | ✅ | `job show` additive only; 7 key-fields unchanged; sections omitted when no data |

### Spec requirements (SHALL/MUST)

All requirements from spec.md verified against implementation:

- step 完了時に lineage を events.jsonl へ MUST 記録する → `finalizeStep` appends via `store.appendLineage()`
- lineage は state.json に materialize しない → `appendLineage` writes events.jsonl only
- hash 取得不能時は `null`、step 完了を妨げない → catch→`hash: null` in local; always null in managed; outer catch in executor
- lineage 記録失敗が step 完了を妨げない (best-effort) → outer `catch {}` after `store.appendLineage()`
- lineage は step 実行・遷移・artifact 内容を変更しない → appended after `store.persist(state)`, returns same state
- `job show` で lineage と step 別 cost を MUST 表示する → `readLineage()` + `computeStepCosts()` sections implemented
- 既存 key-field 行は変更しない → 7 fields printed unconditionally before any new sections
- lineage/cost 不在時にセクション省略し exit 0 → `lineage.length > 0` and `stepCosts.size > 0` guards
- 任意工程名を例外なく MUST 受理する → `validateJobState` does not validate step content string; `toStepName()` passthrough
- 標準記述子の whitelist 維持 → `isStandardStepName()` checks `ALL_STEP_NAMES_SET`; compile guard intact
- 旧 version を MUST 移行する (後方互換) → `version === 1` normalized to `2` in `validateJobState`
- 新規 job は新 version で書く → `buildInitialJobState` returns `version: 2`

### Acceptance criteria

| Criterion | Verdict |
|-----------|---------|
| `job show` で lineage と step 別 cost が表示される | ✅ TC-005/TC-006 in job-show.test.ts |
| 任意工程名を含む記録が読める | ✅ TC-007 in artifact-observability.test.ts |
| 旧 version の state.json / events.jsonl が移行で読める | ✅ TC-009/TC-013; "history" type silently ignored |
| 既存の標準 pipeline の挙動・画面出力が変わらない | ✅ 326 test files pass; lineage is observation-only |
| `typecheck && test` が green | ✅ tsc exits 0; 4056 tests pass (326 files) |
