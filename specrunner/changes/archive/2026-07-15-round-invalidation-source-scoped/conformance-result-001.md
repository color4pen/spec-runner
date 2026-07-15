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
| tasks.md | ✅ | All T-01 through T-05 checkboxes marked complete |
| design.md | ✅ | D1/D2/D3 all implemented exactly as specified |
| spec.md | ✅ | All 5 requirements have corresponding passing tests |
| request.md | ✅ | All 6 acceptance criteria satisfied; typecheck && test green |

## Detail

### tasks.md

All tasks are `[x]`:
- **T-01**: `excludeChangeFolderPaths` added to `round-git-scope.ts`; unit tests in `round-git-scope.test.ts` cover change-folder exclusion, source retention, boundary (same-prefix sibling retained), and edge cases.
- **T-02**: `parallel-review-round.ts` applies `excludeChangeFolderPaths(touched)` between `listChangedFiles` and `computeInvalidations` at L126. `reviewer-status.ts` / `activation.ts` / `local.ts` / `scope.ts` / `runtime-capability-gate.ts` are unchanged.
- **T-03**: Contract test in `parallel-review-round-invalidation.test.ts` uses a stateful fake (`captureHeadSha` → `"source-sha"`, `commitRoundArtifacts` advances to `"round-commit-sha"`) and asserts `approvedAtCommit === "source-sha"`.
- **T-04**: Behavior tests cover Req 2a (`specrunner/changes/**`), Req 2b (`**`), Req 3 (source path + change-folder path), Req 4 (`activationPaths: undefined`).
- **T-05**: `typecheck` green (no output). `test` green: 503 test files, 6945 tests passed.

### design.md

- **D1** (contract test): `parallel-review-round-invalidation.test.ts` T-03 pins the ordering invariant (capture before `commitRoundArtifacts`). Regression (capture moved after commit) would fail the test.
- **D2** (invalidation site filter): `excludeChangeFolderPaths` uses `changesDirRel()` exactly as designed; condition is `f === root || f.startsWith(root + "/")` — matches D2's boundary spec. Applied only at invalidation site; seam unchanged.
- **D3** (no changes to `computeInvalidations`/`evaluateActivation`): confirmed by empty diff on all out-of-scope files.

### spec.md

| Requirement | Test |
|---|---|
| `approvedAtCommit` SHALL be reviewed source revision | T-03 contract test |
| Round invalidation SHALL exclude change-folder paths | T-04 Req 2a/2b |
| Same-prefix sibling retained | `round-git-scope.test.ts` boundary describe |
| True source changes SHALL still invalidate | T-04 Req 3 |
| Always-activate reviewer SHALL always invalidate | T-04 Req 4 |
| `listChangedFiles` seam SHALL remain unchanged | Seam files untouched; all existing tests green |

### request.md acceptance criteria

- ✅ `approvedAtCommit` contract test fixed (T-03).
- ✅ Pipeline-managed path only → path-constrained / broad-activation reviewer not invalidated (T-04 Req 2).
- ✅ True source change → invalidation fires (T-04 Req 3).
- ✅ always-activate reviewer always invalidates (T-04 Req 4).
- ✅ `listChangedFiles` seam unchanged; scope-check tests unmodified and green.
- ✅ `typecheck && test` green.
