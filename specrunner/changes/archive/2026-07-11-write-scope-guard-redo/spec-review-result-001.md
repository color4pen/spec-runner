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
| 1 | MEDIUM | Test ID collision | tasks.md | T-06 proposes creating a new test named `TC-FW-07` for the MCP tool-name inclusion freeze. However, `TC-FW-07` already exists in `tests/unit/adapter/claude-code/query-one-shot.test.ts` (line 445–474) as the "one-shot options carry no canUseTool guard" regression test added in a prior change. T-09 then references the existing `TC-FW-07` as one that must remain unedited and green. The same ID is thus used for two different tests with contradictory instructions. | Renumber the new MCP inclusion test in T-06/T-07 AC to `TC-FW-08` (or the next available ID). Update T-09's invariance checklist to reference `TC-FW-07` (one-shot) and `TC-FW-08` (MCP inclusion) separately. |
| 2 | LOW | Test coverage — optional vs mandatory | tasks.md T-06 | The spec.md §"guard propagates to follow-up turns" is a SHALL requirement, but T-06 marks the corresponding round-trip assertion ("Optionally assert the captured `canUseTool` denies an out-of-workspace write and allows an in-workspace write") as optional. The spread-based propagation is correct by design analogy with the `stderr` callback, but leaving the test optional gives the requirement no mandatory test anchor. | Promote the `canUseTool` round-trip check in TC-FW-06 (or a TC-FW-09 sibling) from optional to mandatory. |

## Review Notes

**Security assessment — approved.** The proposed containment logic (`path.resolve(cwd, file_path)` + `path.relative(cwd, resolved)`, deny when the relative path starts with `..` or is itself absolute) is the standard, correct approach to path traversal prevention for both absolute and relative `file_path` inputs. All edge cases are handled correctly:

- Absolute out-of-workspace path (`/etc/passwd`) → relative starts with `..` → deny ✓
- Relative escape (`../outside.txt`) → resolves outside cwd, relative starts with `..` → deny ✓
- Sibling-of-cwd path (`/workspace/sibling.ts` when cwd is `/workspace/foo`) → relative starts with `..` → deny ✓
- In-workspace child (`cwd/bar.ts`) → relative is `bar.ts`, no `..`, not absolute → allow ✓
- `cwd` itself → relative is `""` → allow ✓
- Missing / non-string `file_path` → allow (deferred to tool's own validation) ✓
- Non-write tools (Read / Bash / Grep / Glob / MCP tools) → allow ✓

The symlink-bypass residual is acknowledged in design D2 Risks and marked as an accepted residual covered by the OS-level sandbox and the detection backstop. No new OWASP gap is introduced.

**Architecture assessment — sound.** The design decisions (D1–D7) are well-reasoned, all backed by the given measured SDK facts. Key correctness points:

- D1 (`default` mode + Edit/Write off `allowedTools`): the only measured configuration in which `canUseTool` fires for those tools (facts 3+4). Alternatives (`bypassPermissions`, `dontAsk`, leave on `allowedTools`) are each correctly rejected with reference to the specific measured fact that rules them out.
- D3 (MCP pre-approval via `mcp__specrunner_report__<name>` on `allowedTools`): correctly isolates the pipeline lifeline (report tool) from the guard, so future guard changes cannot break it by accident. The server-name constant (`specrunner_report`) is already single-sourced in the existing wiring; the MCP entry construction reuses it.
- D4 (`allowUnsandboxedCommands: false`): properly added to `buildWorkspaceSandbox`, which is already isolated in a single exported function. The network assessment (step-agent Bash is local; `git push` lives outside the agent query in `StepExecutor.commitAndPush`) adequately justifies adopting this without a waiver.
- D7 (two TC-023 assertion lines, not one): the deviation from the request.md AC is transparently disclosed. This is correct — the TC-023 test freezes both `allowedTools` and `permissionMode`, both of which this change rewrites.

**Spec / tasks consistency — verified (except finding #1).** request.md requirements R1–R7 ↔ design decisions D1–D7 ↔ spec.md scenarios ↔ tasks T-01–T-09 all trace cleanly. The sole inconsistency is the TC-FW-07 naming collision (finding #1), which is a documentation error, not a logical gap. The implementer can resolve it independently by incrementing to TC-FW-08; no design decision needs to change.

**Probe artifact requirement — correctly scoped.** The design's decision to place the probe under `scripts/probes/` (outside `tsconfig` `include`, eslint globs, vitest `include`, and tsup `entry`) correctly keeps it out of the offline verification gate while ensuring a durable execution trace exists in `design.md`. The placeholder in §Probe Execution Log is expected at spec time and must be filled by the implementer before conformance.

**One-shot and LocalRuntime paths — correctly frozen.** `query-one-shot.ts` (`bypassPermissions`, no `canUseTool`, no sandbox) and `LocalRuntime.query()` (`bypassPermissions`) are explicitly out of scope, with existing regression tests (TC-SB-05, TC-FW-07 in `query-one-shot.test.ts`, `local.test.ts:609`) cited as the freeze anchors. The codex adapter is also out of scope.
