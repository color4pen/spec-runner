# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Style | spec.md | `# Spec:` heading has no title text after the colon. | Cosmetic only; append a short title (e.g. `# Spec: resume-from-progress`). |
| 2 | LOW | Style | resume.ts / resolve-step.ts | Error message language switches from Japanese in the deleted guard (`"再開位置が不明です。"`) to English in the new `resolveResumeStep` throw. End-user facing, minor inconsistency. | No action required; the design explicitly accepts this tradeoff for minimum diff. |

## Review Notes

### Correctness

The root-cause analysis is accurate and verified against source:

- `executor.ts:206` — `store.update(jobState, { step: step.name })` runs **before** the agent session starts, so `state.step` reliably reflects the last-started step even after a hard crash. ✅
- `resume.ts:148` — the escalation-check already computes `resumePoint?.step ?? toStepName(state.step)`, confirming `state.step` is accessible and trusted at that call site. ✅
- `ALL_STEP_NAMES_SET` in `resolve-step.ts` is built from `AGENT_STEP_NAMES ∪ CLI_STEP_NAMES`. `"init"` is absent from both arrays, so `ALL_STEP_NAMES_SET.has("init")` correctly returns `false` → the "no progress" path still throws. ✅
- After the stale-running transition (`transitionJob` with `patch: { pid: null }`), `state.step` is unchanged. The `state` variable referenced at the point of the `resolveResumeStep` call in `resume.ts` is therefore the post-recovery state with the same `step` value. ✅
- Inbox planner: first recovery attempt uses `effective = 0` (since `job.staleRecovery` is `null`), so the job enters the `recovers` path, not `escalates`. After the fix, `resumeJob` will succeed on the first attempt, so `staleRecovery.attempts` never reaches `MAX_STALE_RECOVERY_ATTEMPTS = 3`. ✅

### Design Soundness

- **D1–D3**: Consolidating fallback logic into `resolveResumeStep` (rather than scattering it in callers) is the correct architectural choice.
- **D2**: `ALL_STEP_NAMES_SET` whitelist is more robust than a hard-coded `"init"` special-case.
- **D3**: The preguard deletion is safe because the `resolveResumeStep` throw (priority 5) is functionally equivalent, with the added capability of handling the `state.step` fallback.
- **D4**: Leaving `resumeContext` as `undefined` on hard-crash resume is intentional and acceptable — no functional regression.

### Task Coverage

All four acceptance criteria from the request are covered by distinct tasks (T-01 through T-05 map 1-to-1 with the AC rows). T-06 ensures the green build gate. No gap found.

### Security

No new attack surface introduced. `state.step` originates from persisted job state written by the pipeline itself (not user-controlled input). The `ALL_STEP_NAMES_SET.has(stateStep)` check acts as a whitelist validator before the value is used as a step selector. No authentication, external I/O, or privilege paths are modified.
