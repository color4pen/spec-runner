# Spec Review Result

- **verdict**: needs-fix

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | Completeness | design.md | All required sections (Context, Goals/Non-Goals, Decisions, Risks/Trade-offs, Open Questions) are empty. The design step produced the template scaffold but filled in no content. | Populate each section. Decisions must include at least: D1 — delete `marker.json` best-effort after Phase 2, D2 — delete `liveness.json` best-effort after Phase 2, rationale (symmetry with cancel/teardown, no new abstraction), and risks (ENOENT silenced). |
| 2 | HIGH | Completeness | tasks.md | `T-01` has no title, no subtask checkboxes, and an empty Acceptance Criteria section. There are no implementable tasks. | Define at minimum: T-01 — add marker.json unlink after Phase 2 in orchestrator.ts (best-effort); T-02 — add liveness.json unlink after Phase 2 (replace current worktreePath-null write with full delete); T-03 — add/extend tests covering both deletion paths and the warning-on-failure case. Each task needs a verifiable Acceptance Criteria section. |
| 3 | HIGH | Completeness | spec.md | The `## Requirements` section is present but contains no requirements or scenarios. | Add at least three requirements with Given/When/Then scenarios: (R1) archive SHALL delete marker.json on success; (R2) archive SHALL delete liveness.json on success; (R3) deletion failure SHALL emit a stderr warning and SHALL NOT fail the archive. |
| 4 | MEDIUM | Consistency | design.md | The current orchestrator.ts Phase 2 writes `liveness.json` with `worktreePath: null` rather than deleting the file. The request.md requirement R2 says to delete it. The design should explicitly acknowledge this behavioral change and reconcile with the existing write-back pattern. | Clarify in Decisions whether the intent is to (a) delete liveness.json entirely or (b) nullify worktreePath and keep the file. The request says "delete", so the design should confirm and explain why full deletion is safe here. |
