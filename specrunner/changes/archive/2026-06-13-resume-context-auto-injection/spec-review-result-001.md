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

- **verdict**: needs-fix

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | Functional correctness | `design.md` / `spec.md` | The proposed executor-side builder depends on `state.resumePoint`, but the existing resume command clears it before the pipeline runs. `src/core/command/resume.ts` transitions the job to `running` with `patch: { error: null, resumePoint: null, pid: process.pid }`, and that cleared `JobState` is what `CommandRunner` passes into `StepExecutor`. Therefore D2/D3 and the spec scenarios that require `StepExecutor` to qualify injection with `state.resumePoint?.step` cannot work in the actual lifecycle; a plain resume with no human prompt would still have no automatic context. | Amend the spec/design to preserve or pass a deterministic resume snapshot to the executor before `resumePoint` is cleared, or move automatic context composition to the resume preparation path before clearing. Acceptable designs include adding a `deps.resumeContext`/snapshot alongside the one-shot prompt, delaying `resumePoint` clearing until after first agent-step consumption, or composing the automatic text in `resume.ts` and passing it through the existing `resumePrompt` field. Add an integration-level test that exercises the real `resume.ts` → `runner.ts` → `StepExecutor` path, not only a handcrafted executor state with `resumePoint` present. |
