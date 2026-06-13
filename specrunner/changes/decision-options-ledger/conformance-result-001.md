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
| tasks.md | ✅ | All T-01–T-09 checkboxes marked [x] |
| design.md | ✅ | D1–D9 faithfully implemented (see details below) |
| spec.md | ✅ | All 8 requirements and scenarios covered by tests |
| request.md | ✅ | All 6 acceptance criteria met; typecheck && test green |

## Detail

### tasks.md — T-01 through T-09 all complete

Every checkbox in all nine task blocks is marked `[x]`.

### design.md — D1–D9 implementation fidelity

| Decision | Implementation |
|----------|---------------|
| D1: `DecisionOption` + optional `Finding.options`, strict only for new tool calls | `src/kernel/report-result.ts` adds types; `parseFindings(raw, strict=true)` rejects decision-needed without ≥2 options; `parseJudgeReportInput`, `parseRequestReviewReportInput`, `parseConformanceReportInput` all pass `strict=true` |
| D2: Legacy reads permissive (non-strict) | `parseFindings` defaults `strict=false`; `validateJobState` does not validate `decisions` content; old tool-result entries remain readable |
| D3: Deterministic finding key `step\|file\|line-or-empty\|normalized-title\|normalized-rationale` | `src/core/decision/decision-ledger.ts` `computeFindingKey` normalizes via trim/collapse/lowercase |
| D4: `JobState.decisions?: DecisionRecord[]` with full snapshot fields | `src/state/schema.ts` adds `DecisionRecord`, `DecisionFindingSnapshot`, `DecisionSelectedOption`; field optional for backward compat |
| D5: Render open decisions with escaping in escalation comment | `buildEscalationComment` calls `getOpenDecisionFindings`, filters to findings with ≥2 options, renders with `escapePlainText()` (escapes `&`, `<`, `>`, flattens newlines) |
| D6: Parse `/resume N=M` tokens; malformed tokens + open decisions → stay awaiting | `parseResumeDecisionInput` extracts selections; `hasInvalidDecisionTokens` flag used by `planResumes` |
| D7: Validate all open decisions covered; persist before resuming | `resolveDecisions` rejects partial/duplicate/out-of-range; `run-inbox.ts` persists `DecisionRecord[]` to state before calling `resumeJob` |
| D8: Filter decided findings before verdict derivation AND reference verification | `filterUndecidedFindings` called at all four verdict sites in `executor.ts` (lines 635, 642, 649, 668) |
| D9: Update `DECISION_NEEDED_DEFINITION` and all judge prompts | `judge-rules.ts` updated; `CONFORMANCE_SYSTEM_PROMPT` updated; fragment-coverage tests confirm all four judge prompts include the options requirement |

### spec.md — all requirements and scenarios covered

| Requirement | Key test |
|-------------|----------|
| decision-needed SHALL include structured options | `report-result-findings.test.ts`: strict mode rejection + valid acceptance |
| Legacy persisted findings SHALL remain readable | Non-strict parse; `orchestrator.test.ts` backward compat |
| Escalation notifications SHALL render open decision choices | `issue-notifier.test.ts` TC-N-017/TC-N-018; legacy graceful TC-N-020 |
| Resume comments SHALL accept structured selections and preserve prose | `planner.test.ts` `parseResumeDecisionInput` suite |
| Selected decisions SHALL be recorded before resume | `orchestrator.test.ts` full flow |
| Decided matching findings SHALL not block verdicts | `executor-verdict.test.ts` TC-VD-006 |
| Undecided decision-needed findings SHALL still escalate | `executor-verdict.test.ts` TC-VD-007 |
| Prompt rules SHALL define decision-needed by options | `fragment-coverage.test.ts` four-prompt suite |

### request.md — acceptance criteria met

| Criterion | Evidence |
|-----------|----------|
| options なしの decision-needed が schema 検証で拒否される | `parseFindings` strict=true; test "decision-needed without options → ok:false in strict mode" |
| escalation 通知に選択肢が描画される | `buildEscalationComment` renders numbered findings and options; notifier tests confirm `/resume N=M` example |
| /resume の選択指定が解釈され state に記録される | `parseResumeDecisionInput` + `resolveDecisions`; `run-inbox.ts` persists before resume; orchestrator test confirms ledger entries |
| 決定済み finding と合致する再報告が verdict を escalation にしない | `filterUndecidedFindings` at all verdict sites; TC-VD-006 confirms approved verdict |
| 旧形式 toolResult の読み込みが後方互換 | `parseFindings` default non-strict; backward compat tests in orchestrator and report-result-findings |
| `typecheck && test` が green | `verification-result.md`: verdict passed — build ✅ typecheck ✅ test ✅ lint ✅ |
