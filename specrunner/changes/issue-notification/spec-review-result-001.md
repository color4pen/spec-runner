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
- Approval is blocked when CRITICAL ≥ 1 OR HIGH ≥ 1.
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Input Validation | tasks.md T-04 | `parseInt("42abc", 10)` returns `42` (not NaN), so a value like `"42abc"` would silently be accepted as `42` instead of triggering the argument error. The intent is to reject non-numeric input. | Add a trailing-garbage check: after `parseInt`, verify `String(parsed) === value.trim()` (or use `Number(value)` + `Number.isInteger` instead). Affects both `run` and `job start` handlers. |
| 2 | LOW | Security / Injection | design.md D6 | `buildMarker` interpolates `jobId` directly into the HTML comment attribute (`jobId="<jobId>"`). If `state.jobId` ever contains `-->`, it would prematurely close the HTML comment and expose raw marker text in the rendered body. jobId is system-generated (UUID-like), so this is not exploitable in practice, but the invariant is undocumented. | Add a note in D6 / `buildMarker` JSDoc that `jobId` must not contain `-->`. Optionally assert this in `buildMarker` with a cheap `!jobId.includes("-->")` guard. |
| 3 | LOW | Security / Injection | design.md D5 | `buildEscalationComment` embeds `state.resumePoint?.reason` (derived from agent step output or error messages) into the comment body verbatim. A crafted reason containing `<!-- specrunner:notification ... -->` could spoof a marker line when a future inbound parser scans the comment. In v1 (outbound only) this has no immediate impact, but the risk grows once inbound parsing is added. | Document in D5 / D6 that the body text below the marker line is untrusted for machine parsing purposes. Future inbound parser should only recognise a marker on the first line of a comment. |

## Summary

Design is sound and internally consistent. Verified against the current codebase:

- **D1 convergence point**: All three terminal paths (`nextStep === "end"`, `nextStep === "escalate"`, `tryExhaust` exhaustion) execute `break` and fall through to `return state` at pipeline.ts:384. Inserting `await notifyJobTerminal(state, deps)` immediately before that return correctly catches all three paths with no duplication.
- **D3 backward compat**: `validateJobState` already uses `return raw as JobState` pass-through for unknown fields; `issueNumber` will load transparently from existing state files.
- **D5 DSM compliance**: `src/core/notify/` imports only `core/port`, `state/schema`, and `logger/stdout` — within the domain→ports / domain→persistence / domain→kernel allowances of architecture/model.md.
- **PipelineDeps structural match**: `PipelineDeps` declares `githubClient`, `owner`, `repo` (types.ts:38–42), satisfying `NotifyCtx` structurally with no additional wiring.
- **FATAL_ERROR_CODES path**: When `state.status === "failed"` with a fatal error code, the escalation transition is skipped and `state.status` remains `"failed"`. `notifyJobTerminal` correctly no-ops for statuses other than `awaiting-resume` / `awaiting-archive`.
- **Security scope**: No SSRF risk (owner/repo come from system config). Token write-scope failure is caught by best-effort semantics. `--issue` value is never used in a shell command or template that could enable injection beyond the GitHub API body, which GitHub renders safely.

Three LOW findings are noted above; none block implementation.
