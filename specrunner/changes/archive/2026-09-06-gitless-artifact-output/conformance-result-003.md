# Conformance Result — Iteration 003

**Change**: gitless-artifact-output  
**Date**: 2026-09-06  
**Reviewer**: conformance step (iteration 3)

---

## Evidence Summary

| Category | Count |
|----------|-------|
| Normative items checked (request AC + spec Requirements/Scenarios) | 47 |
| Skipped (out-of-scope / env-dependent) | 1 |
| Unverified | 0 |

---

## Normative Verification Results

### Request Acceptance Criteria

| # | AC | Status | Notes |
|---|---|--------|-------|
| AC-01 | ADRでartifact-output profileのauthority、revision identity、lifecycle、保証差分が定義される | ✓ PASS | `specrunner/adr/2026-09-05-gitless-artifact-output.md` covers D1 (authority), D3 (identity), D13 (lifecycle), explicit parity diff |
| AC-02 | Gitが現在担う責務が「snapshotで置換 / profile固有 / 初期unsupported」に分類される | **⚠ PARTIAL** | See Finding F-01 |
| AC-03 | Git repository外のfixtureで最小縦断が完走する | ✓ PASS | `tests/artifact-output-vertical.test.ts` asserts `.git` absent above fixture root |
| AC-04 | 実測中にSpecRunner自身が `git` commandおよびGitHub APIを呼ばないことを機械的に検証できる | ✓ PASS | Spawn recorder in vertical test + architecture grep tests in `artifact-output-git-free.test.ts` |
| AC-05 | 元source directoryが成功時・失敗時とも変更されない | ✓ PASS | `assertSourceUnchanged()` called in every terminal path; tests verify both success and failure cases |
| AC-06 | added / modified / deletedがmanifestへ出力される | ✓ PASS | `deriveChangeSet()` + `buildManifest()` covers all three kinds |
| AC-07 | text patchで表現できない変更がmanifest / payloadから欠落しない | ✓ PASS | D8 9-class patch taxonomy; binary/symlink/mode entries appear in manifest with explicit classification |
| AC-08 | baseline / candidate digestがartifactとverification / review recordへ束縛される | ✓ PASS | `runBoundToCandidateRevision()` + cross-phase digest check (step 8.5) in `run.ts` |
| AC-09 | snapshot取得・比較不能が「変更なし」として通過しない | ✓ PASS | `collectSnapshot()` returns `{kind:"unavailable"}`; `assertSourceUnchanged()` returns `unverifiable` (not `unchanged`) |
| AC-10 | Git依存stepを開始前preflightで列挙し、途中まで実行してから落ちない | ✓ PASS | `planEffectivePipeline()` at phase 1 before any workspace creation; non-executable → `halted` without candidate dir |
| AC-11 | 既存Git/PR profileの挙動は変わらない | ✓ PASS | Architecture test asserts 0 reverse imports from runtime/pipeline/step into new modules |
| AC-12 | CLI / READMEで `--no-worktree` との違い、保証、unsupported operationが説明される | ✓ PASS | Guide topic `artifact-output` in `guide.ts`; README `## Artifact-Output Profile` section; unsupported table derived from `UNSUPPORTED_OPERATIONS` |
| AC-13 | 実測結果と次段階の分割Issue案が記録される | **⚠ PARTIAL** | See Finding F-02 |
| AC-14 | SpecRunner verificationがgreen | ⊘ SKIPPED | PR証跡を正本とする; CI/verification-result.md が記録 |

---

### Spec Requirements and Scenarios

#### Requirement: No git/gh spawn

| Scenario | Status |
|----------|--------|
| The minimal vertical run spawns no git command | ✓ `makeSpawnRecorder()` + assert in vertical test; architecture grep test (TC-068) |
| A git invocation attempted through the guarded seam fails closed | ✓ `createGitDenyingSpawn()` — throws without calling inner; tested in `guarded-spawn.test.ts` |
| A .git directory in the source is not consulted as authority | ✓ `collectSnapshot()` applies `.git/` exclusion from `DEFAULT_EXCLUSIONS`; no git spawn; exclusion recorded in snapshot |

#### Requirement: Source unchanged

| Scenario | Status |
|----------|--------|
| Source is unchanged after a successful run | ✓ `checkSourceUnchanged()` called at end of success path; vertical test asserts |
| Source is unchanged after a failed run | ✓ Same guard called in every `halt`/`fail` path via `finishFailed()` |
| Source mutated during the run is detected | ✓ `assertSourceUnchanged()` → `mutated` arm → `source-mutated` annotation in run.json + `kind:"failed"` result |

#### Requirement: Revision identity

| Scenario | Status |
|----------|--------|
| Two independent snapshots of identical trees produce identical digests | ✓ `computeSnapshotDigest()` excludes timestamps/absolute path/traversal order; digest test confirms |
| An executable bit change alters the digest | ✓ Mode is encoded as `100644`/`100755`; digest test scenario |
| An empty directory is part of the identity | ✓ Empty dirs recorded as entries; `snapshot.entries` includes them; digest changes when removed |
| Symlinks are identified by their target, not by the target's content | ✓ `computeSymlinkDigest(target)` hashes link target string; `lstat`-based traversal does not follow symlinks |

#### Requirement: Snapshot / comparison failures never "no change"

| Scenario | Status |
|----------|--------|
| An unreadable file makes the snapshot unavailable | ✓ `io-error` failure → `unavailable`; collect test verifies |
| An unsupported entry kind makes the snapshot unavailable | ✓ `unsupported-kind` failure |
| A symlink escaping the source root makes the snapshot unavailable | ✓ `symlink-escape` failure checked before materialize |
| An unavailable change set does not become an empty change set | ✓ `deriveChangeSet()` returns `unavailable` on exclusion mismatch; callers check DU arm |

#### Requirement: Change set derived from snapshot, covers non-text

| Scenario | Status |
|----------|--------|
| Added, modified, and deleted files are all derived | ✓ `deriveChangeSet()` produces all three; vertical test end-to-end |
| A binary change appears in the change set | ✓ Binary files classified by `classifyContent()` based on NUL bytes; still appear as `modified` |
| A mode-only change appears as modified | ✓ `compare.ts`: mode differs → `modified`; `mode`+`previousMode` both set |
| A moved file is represented as delete plus add | ✓ No rename inference; delete + add pair; compare tests |

#### Requirement: Non-text changes not dropped

| Scenario | Status |
|----------|--------|
| A binary change is omitted from the patch but present in the payload | ✓ `omitted:binary` classification; payload written by `finalizeArtifact()` |
| A symlink change is recorded in the manifest | ✓ `not-applicable` classification with symlink target in manifest entry |
| A deletion is present in both patch and manifest | ✓ `included:deletion` → deletion hunk in `changes.patch`; vertical test asserts (`changes.patch` contains deletion hunk — TC-010 in vertical test) |
| An unrepresentable entry prevents finalization | ✓ `unsupported` classification → `finalizeArtifact()` throws → artifact/ not created |

#### Requirement: Artifact single unit, atomic, no auto-apply

| Scenario | Status |
|----------|--------|
| A successful run produces the complete artifact set | ✓ `finalizeArtifact()` writes manifest/patch/payload/verification/review/APPLY.md; vertical test asserts all exist |
| A failure before finalization leaves no artifact directory | ✓ staging→rename pattern; partial failure leaves only staging residue |
| Apply instructions declare the baseline-digest precondition | ✓ `APPLY.md` says "NOT applied automatically" and "Baseline digest: ${manifest.baseline.digest}" |

#### Requirement: Verification and review bound to candidate revision

| Scenario | Status |
|----------|--------|
| Verification and review records carry the candidate digest | ✓ `runBoundToCandidateRevision()` sets digest; cross-phase check asserts both equal; manifest candidateDigest = verification bound digest |
| Candidate mutation during verification halts the run | ✓ Pre/post snapshot in `runBoundToCandidateRevision()` → `revision-drift` halt |
| Candidate mutation during review halts the run | ✓ Same mechanism for review phase |

#### Requirement: Preflight before execution

| Scenario | Status |
|----------|--------|
| Unsupported steps are listed before execution | ✓ `planEffectivePipeline()` returns report with `unsupported[]` and `missing[]` |
| A non-executable pipeline stops before any workspace is created | ✓ Phase 1 check → `halted` before `createRunRoot()` or `materializeCandidate()` |
| Issue-originated entry is rejected by preflight | ✓ `assertEntryRouteSupported()` in `execution-profile.ts` |
| The existing git profile reports no unsupported steps | ✓ `planEffectivePipeline(STANDARD_DESCRIPTOR, "git-pr")` → `unsupported: []`; test asserts |

#### Requirement: Lifecycle limits declared

| Scenario | Status |
|----------|--------|
| Run record declares resume as unsupported | ✓ `run.json` initialized with `resume: { supported: false, reason: "..." }` |
| A halted run records its terminal state and evidence | ✓ Every halt path writes final `run.json`; baseline/snapshot.json exists; artifact/ absent |
| Run evidence is not stored only in the agent-writable area | ✓ `run.json` and `baseline/snapshot.json` at run root level, outside `candidate/` |

#### Requirement: Agent/reviewer context from snapshots

| Scenario | Status |
|----------|--------|
| Reviewer context carries the candidate revision and change summary | ✓ `buildSnapshotContext()` includes baselineDigest, candidateDigest, changedPaths, nonTextEntries |
| Missing history is stated, not blank | ✓ `historySection` is always a non-empty explicit statement about no revision history |

#### Requirement: Documentation in CLI and README

| Scenario | Status |
|----------|--------|
| The guide topic lists every unsupported operation from the capability table | ✓ `buildUnsupportedOperationsTable()` derived from `UNSUPPORTED_OPERATIONS`; TC-037 asserts each displayName present |
| The guide topic distinguishes the profile from --no-worktree | ✓ Lines 609–623 in guide.ts: explicit comparison table, explains --no-worktree requires git repo |
| README documents the profile and its preview status | ✓ `## Artifact-Output Profile (Git-Free Mode)` section in README; "not yet wired" note present |

#### Requirement: Existing git profiles unaffected

| Scenario | Status |
|----------|--------|
| Existing runtime modules do not import the new profile modules | ✓ TC-040/TC-041 grep checks in `artifact-output-git-free.test.ts` assert 0 reverse imports from runtime/pipeline/step |
| The default job start path is unchanged | ✓ TC-072: `RUN_JOB_FLAGS` set unchanged from pre-change baseline |

---

## Findings

### F-01 · MEDIUM · fixable — Missing explicit 3-way Git responsibility classification

**Requirement**: Request AC "Gitが現在担う責務が「snapshotで置換 / profile固有 / 初期unsupported」に分類される"

**Failure scenario**: A reader looking for the canonical classification of which Git responsibilities are (a) replaced by snapshot, (b) profile-specific, or (c) initially unsupported finds no explicit table in the ADR or docs. The ADR's context section (call site table) and D3/D12/D13 decisions cover the classification implicitly, but no single location presents the 3-column classification the AC requires.

**Evidence**: `docs/artifact-output-profile.md` (154 lines) has no 3-way classification table. The ADR has a call-site table and D3/D12/D13 but these are not organized into the three required categories. T-12 task explicitly requires this table in docs/artifact-output-profile.md.

**Fix target**: implementer — add the classification table to `docs/artifact-output-profile.md` (and optionally to the ADR) mapping each Git responsibility to one of the three categories.

---

### F-02 · MEDIUM · fixable — Actual measurement results absent from docs

**Requirement**: Request AC "実測結果と次段階の分割Issue案が記録される"

**Failure scenario**: A reader looking for the promised measurement results (duration, capacity, dominant cost, continue/scope-reduce/stop decision) from the T-10 scale fixture run finds no actual values in `docs/artifact-output-profile.md`. The file defines metric fields but shows no observed numbers. T-12 explicitly required "実際に run して転記する". The continue/scope-reduce/stop decision paragraph is also absent from the docs file (though the ADR's migration plan implicitly shows "continue").

**Evidence**: `docs/artifact-output-profile.md` §Metrics (lines 127–135) shows field descriptions only. No timing values, no dominant-cost analysis, no explicit continuation decision statement in that document. The ADR (lines 324–329) shows next-stage issue proposals, satisfying that half of the AC, but docs don't.

**Fix target**: implementer — run the T-10 scale test and transcribe metrics into `docs/artifact-output-profile.md`, add a "Measurement Results" section with observed duration/capacity/dominant-cost, and an explicit continuation decision.

---

## Plan Divergences (non-finding)

- **Guide topic: agent subprocess boundary not mentioned** — T-12 AC requires the guide topic body to explicitly state "agent subprocess 内部の git は対象外". The guide topic in `guide.ts` does not contain this phrase. However, `docs/artifact-output-profile.md` §"Git denial at the spawn boundary" covers the boundary clearly, and the spec's normative guide-topic Scenarios do not explicitly require this text. Noted as plan divergence, not a spec finding.

- **`docs/artifact-output-profile.md` layout diverges from design D5 table**: The docs show `baseline.snapshot.json` but `run-layout.ts` defines `baselineSnapshotPath()` resolving to `<runRoot>/baseline/snapshot.json`. Minor cosmetic mismatch in the output structure diagram; functionally correct.

---

## Overall Assessment

All normative spec.md Requirements and their Scenarios pass. The implementation correctly implements:
- git-denying spawn guard (3-layer: runtime guard + import ratchet + dependency absence)
- fail-closed snapshot unavailability propagation
- atomic artifact finalization (staging → rename)
- cross-phase digest binding (verification + review + cross-phase check)
- preflight before any workspace creation
- explicit lifecycle declaration (resume: {supported: false})
- snapshot-derived context with explicit history statement

Two medium-severity gaps against request.md acceptance criteria remain:
1. Missing explicit 3-way Git responsibility classification table (F-01)
2. Missing actual measurement results and explicit continuation decision in docs (F-02)
