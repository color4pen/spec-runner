# Conformance Result — operator-commit-adoption — Iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### J1 — Task Completion (tasks.md)

All checkboxes across T-01 through T-09 are marked `[x]`. No incomplete item found.

| Task | Description | Status |
|------|-------------|--------|
| T-01 | `egressResolutionOptions` helper + `egressUnknownCommitError` update | ✓ |
| T-02 | `src/core/resume/adopt-commits.ts` (new leaf module) | ✓ |
| T-03 | CLI flag wiring (`command-registry.ts`, `resume.ts`) | ✓ |
| T-04 | Adopt gate in `ResumeCommand.prepare()` | ✓ |
| T-05 | Unit tests (`adopt-commits.test.ts`) | ✓ |
| T-06 | Integration tests (`resume-adopt-commits.test.ts`) | ✓ |
| T-07 | CLI flag test (`command-registry-adopt-commits.test.ts`) | ✓ |
| T-08 | `egressUnknownCommitError` message test coverage | ✓ |
| T-09 | `typecheck && test` green | ✓ — verification-result.md: build/typecheck/test/lint all passed (10 655 tests passed, 1 skipped) |

### J2 — Design Decisions (design.md)

**D1** — New leaf module `src/core/resume/adopt-commits.ts` mirrors `apply-canon.ts`.
`detectUnadoptedCommits` and `buildAdoptEscalationMessage` are exported. Imports match spec (`runSubprocess`, `gitExec`, `SpawnFn` from `util/git-exec.js`; `egressResolutionOptions` from `errors.js`; no `defaultSpawnFn`). ✓

**D2** — Detection unconditional; adoption requires `--adopt-commits`.
`detectUnadoptedCommits` is called regardless of flags. The `adoptCommits` flag gates only the ledger-append branch. Without it, `PrepareError(1)` is thrown immediately. ✓

**D3** — Gate placement: after apply-canon sub-block, before pipeline launch; exit-128 carve-out applied.
Code block at `resume.ts:350-394` sits after the apply-canon sub-block (lines 291-347) and before `reconcileWorktreeArtifacts`. Ledger read uses `updatedState.synthesizedCommits ?? []` (post-apply-canon value). Exit-128 carve-out pattern matches the apply-canon gate. ✓

**D4** — `--apply-canon` semantics unchanged; flags orthogonal and composable.
When `applyCanon: true` with clean worktree, apply-canon sub-block is a no-op; adopt gate then fires and halts. TC-013 verifies composability: apply-canon OID is already in ledger when `detectUnadoptedCommits` is called, so it is not re-flagged. ✓

**D5** — `--adopt-commits` persist fail-closed; no git rollback.
Null `runStore` → `PrepareError(1)`. `runStore.persist` throws → `PrepareError(1)`. No `git reset` is attempted (adoption never changes git history). ✓

**D6** — Single shared source `egressResolutionOptions` in `src/errors.ts`.
`egressUnknownCommitError` embeds `egressResolutionOptions()` in its hint (default `<slug>` placeholder). `buildAdoptEscalationMessage` calls `egressResolutionOptions(slug)` with the real slug. ✓

**D7** — CLI wiring identical shape to `--apply-canon`.
`command-registry.ts` flag map, `runResume` call, and USAGE string all updated. `cli/resume.ts` and `core/command/resume.ts` both have `adoptCommits?: boolean` in `ResumeOptions`. ✓

### J3 — Spec Requirements (spec.md)

**Requirement 1 — resume reconciles publish range before any step runs.**
Gate is in `prepare()` before pipeline launch. Empty range → no-op; exit-128 → continue; other git failure → `PrepareError(1)`. TC-002 / TC-012 verify. ✓

**Requirement 2 — flag-less halt presents each unknown commit and three resolution options.**
`buildAdoptEscalationMessage` emits short SHA, subject, author, paths per commit; then `egressResolutionOptions(slug)`. TC-003 asserts all four attributes in output. TC-U5 verifies message builder in isolation with real slug substitution. ✓

**Requirement 3 — `--adopt-commits` records unknown OIDs then launches the pipeline.**
Each OID appended via `appendSynthesizedCommit`; `runStore.persist(updatedState)` called; `prepare()` resolves. Persist failure or null `runStore` → `PrepareError(1)`. TC-004 / TC-005 / TC-011 verify. ✓

**Requirement 4 — `--apply-canon` does not adopt committed operator commits.**
Separate flags with independent logic. TC-006 asserts: clean worktree + unknown commit + `applyCanon: true` → `prepare()` throws; `commitOperatorCanon` not called; OID not appended. ✓

**Requirement 5 — `egressUnknownCommitError` names the three resolution options.**
`egressUnknownCommitError("abc", "b").hint` contains `egressResolutionOptions()` output. TC-007 / TC-015 verify all three options in the hint. ✓

### J4 — Acceptance Criteria (request.md)

| Criterion | Test | Verified |
|-----------|------|----------|
| ledger に無い commit が publish range に存在し `--adopt-commits` なし → step が 1 つも実行されない | TC-001 (prepare() throws before pipeline) | ✓ |
| 同条件の escalation メッセージが short SHA と 3 つの解決手段を含む | TC-003 | ✓ |
| `--adopt-commits` 指定時に OID が synthesizedCommits に追加され persist される | TC-004 | ✓ |
| `--adopt-commits` かつ persist が失敗したとき pipeline が起動しない | TC-005, TC-011 | ✓ |
| `--apply-canon` のみで commit 済み operator commit がある場合、採択されずに停止 | TC-006 | ✓ |
| publish range が空の通常経路で resume の挙動が変わらない (既存テスト無変更 green) | TC-002; verification-result.md: 10 655 tests passed | ✓ |
| `typecheck && test` が green | verification-result.md: build ✓ typecheck ✓ test ✓ lint ✓ | ✓ |

## 検証できなかった項目

None.

## Findings 詳細

None. 全4判定項目が適合。
