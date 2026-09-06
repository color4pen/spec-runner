# Conformance Result: gitless-artifact-output — Iteration 1

## Summary

The implementation is **substantially conformant** with spec.md normative requirements. One medium-severity finding was identified: `docs/artifact-output-profile.md` contains a factually incorrect description of the git-denial boundary that contradicts the spec's SHALL requirement about agent subprocess documentation.

---

## Evidence

### Requirement 1: No git/gh invocation from SpecRunner itself

**Verdict: PASS**

- `src/core/artifact-output/guarded-spawn.ts` — `createGitDenyingSpawn` wraps SpawnFn; rejects `git`/`gh` by basename before calling `inner`.
- `tests/unit/architecture/artifact-output-git-free.test.ts` — TC-040/TC-041 grep `src/core/artifact-output/**` and `src/core/snapshot/**` for `git-exec`, `core/worktree`, `github-client`, `src/git/` imports; TC-068 checks no `node:child_process`; TC-069 checks no `process.cwd()`.
- `tests/artifact-output-vertical.test.ts` — vertical integration test injects a recording spawn and asserts zero `git`/`gh` invocations.
- Guarded spawn error message: "The artifact-output profile does not invoke git or gh through SpecRunner's own spawn paths."

**Finding — agent subprocess documentation (Medium, Fixable):**

Spec §1 normative: *"Subprocesses spawned internally by an agent process (Claude Code CLI / Codex) are outside this boundary and **SHALL be documented as such**."*

`docs/artifact-output-profile.md` §"Git denial at the spawn boundary" says:
> "Agent subprocesses run under a **git-denying spawn wrapper**. Any attempt to call `git` or `gh` from inside an agent subprocess throws an error explaining the boundary:"

This is incorrect on two counts:
1. The guard wraps SpecRunner's own spawn seam; agent subprocesses (Claude Code CLI) run as separate OS processes and are **outside** the guard's scope.
2. The error message block shown (`Error: git is not available in agent subprocess …`) does not match the actual error message in `guarded-spawn.ts`.

The actual error message in `guarded-spawn.ts` correctly reads: *"Note: git calls inside the agent subprocess are out of scope for this guard."* — so the code is correct, but the reference document contradicts the spec.

The guide topic (`src/core/command/guide.ts`, artifact-output body) does not contain an explicit statement that agent subprocess git calls are outside the boundary, which the spec requires to be "documented as such."

### Requirement 2: Source directory unchanged on success and failure

**Verdict: PASS**

- `run.ts` `checkSourceUnchanged()` is called on every exit path (success, halt, failure) via `await checkSourceUnchanged(...)` in every return branch.
- `src/core/artifact-output/source-guard.ts` — `assertSourceUnchanged` re-collects snapshot and compares digest; `"unverifiable"` is fail-closed (not treated as unchanged).
- `run.ts` line 424: final source check on the success path; returns `{ kind: "failed", reason: "Source was mutated during run" }` if mutated.
- Vertical test (`tests/artifact-output-vertical.test.ts`) asserts source digest equals baseline after both success and failure cases.

### Requirement 3: Revision identity — recomputable, machine-independent snapshot digest

**Verdict: PASS**

- `src/core/snapshot/digest.ts` — `computeSnapshotDigest` streams `kind\0path\0mode\0contentDigest\n` per entry, sorted by path UTF-8 byte order; includes schemaVersion and exclusions. No timestamps, absolute paths, inodes, traversal order.
- Dir entries: contentDigest = `""` with the `\0` separator preserved (`dir\0<path>\040000\0\n`), as required by design D3.
- Mode: `100644`/`100755`, symlink `120000`, dir `40000`. Executable bit change alters the digest.
- Digest rendered as `sha256:<64-hex>`.
- `src/core/snapshot/__tests__/digest.test.ts` covers: entry-order independence, executable-bit change, empty-dir change, symlink target vs content.

### Requirement 4: Snapshot and comparison failures never reported as "no change"

**Verdict: PASS**

- `src/core/snapshot/collect.ts` — any I/O failure, unsupported-kind, path-not-utf8, symlink-escape, unreadable file pushes to `failures[]`; if `failures.length > 0`, returns `{ kind: "unavailable" }`. No partial snapshot returned.
- `src/core/snapshot/compare.ts` — `deriveChangeSet` returns `{ kind: "unavailable" }` when exclusion sets differ; no empty-array fallback.
- `src/core/artifact-output/source-guard.ts` — `unverifiable` (snapshot not possible) is returned and treated as failure by caller (not as unchanged).
- `run.ts` — unavailable snapshot at any phase halts the run.
- `src/core/snapshot/__tests__/collect.test.ts` covers: unreadable file → unavailable, unsupported kind → unavailable, symlink escape → unavailable.

### Requirement 5: Change set derived from snapshot comparison; covers non-text changes

**Verdict: PASS**

- `src/core/snapshot/compare.ts` — `deriveChangeSet` classifies: added (in candidate, not baseline), deleted (in baseline, not candidate), modified (same path, same kind, different digest or mode), kind-change → deleted+added pair.
- Mode-only change: `modeChanged = true` triggers `modified` with both `mode` and `previousMode`.
- No rename inference; moves appear as delete+add.
- Binary, symlink, directory, deletion all appear in change set (they are snapshot entries, not text-only).

### Requirement 6: Non-text-patch changes not dropped from artifact

**Verdict: PASS**

- `src/core/artifact-output/patch.ts` — every `ChangeEntry` produces a `PatchEntryResult` with one of 8 classifications (D8 table). No silent drop.
- `buildManifest` maps every change entry to a `ManifestChangeEntry` with `patchClassification`.
- Binary (added/modified) → `omitted:binary` → payload carries bytes; binary deletion → `omitted:binary-deletion` → manifest-only.
- Symlink/dir → `not-applicable` → manifest with `symlinkTarget` metadata.
- Mode-only → `not-applicable` → manifest with both `mode` and `previousMode`.
- `finalizeArtifact` writes payload for `omitted:binary`, `omitted:size`, `omitted:unreadable` (added/modified); throws on unreadable-but-must-be-in-payload (fail-closed via `fs.copyFile` without catch).
- `src/core/artifact-output/__tests__/artifact-writer.test.ts` TC-022: `omitted:unreadable` on missing file causes `finalizeArtifact` to throw and no `artifact/` directory created.

### Requirement 7: Artifact is single output unit, finalized atomically, never auto-applied

**Verdict: PASS**

- `finalizeArtifact` writes to `artifact.staging/` then `fs.rename(stagingDir, artifactDir)`. If any write fails before rename, `artifact/` is never created.
- `APPLY.md` states: "This artifact is NOT applied automatically." and requires baseline digest match before applying.
- `manifest.json` includes `baseline.digest` and `candidate.digest`.
- Artifact is never written to source directory (only written to `runRoot/artifact.staging/`).

### Requirement 8: Verification and review records bound to candidate revision

**Verdict: PASS**

- `src/core/artifact-output/revision-binding.ts` — `runBoundToCandidateRevision` takes pre-snapshot → executes → takes post-snapshot → compares; `revision-drift` if differ.
- `run.ts` Step 6: verification is bound; frozen candidate snapshot reused for Step 7 (no re-scan between verification and change-set derivation).
- `run.ts` Step 8.5: cross-phase digest check asserts `verifyBound.digest === reviewBound.digest`; mismatch halts with `revision-drift`.
- Manifest `candidateDigest` = verification bound digest.
- Review record gets `candidateDigest` = same verification bound digest (since cross-phase check passed).

### Requirement 9: Git-dependent operations enumerated by preflight before execution

**Verdict: PASS**

- `src/core/artifact-output/preflight.ts` — `planEffectivePipeline` returns `{ supported, unsupported, executable }` from capability table before any workspace creation.
- `src/core/artifact-output/execution-profile.ts` — `STEP_CAPABILITY_REQUIREMENTS` data table; `pr-create` requires `git-remote-publish`+`github-api`; artifact-output profile provides no git capabilities.
- `run.ts` — if `!preflightReport.executable`, returns `{ kind: "halted" }` before `createRunRoot`; no candidate workspace created.
- `assertEntryRouteSupported` rejects `--from-issue`/`--issue` for artifact-output profile.
- `git-pr` profile: `unsupported === []`, `executable === true` for all existing pipelines (standard/fast/design-only) — enforced by unit test.

### Requirement 10: Profile lifecycle limits declared explicitly

**Verdict: PASS**

- `run.json` always contains `resume: { supported: false, reason: "…" }`.
- Run state transitions: `running` → `completed`/`halted`/`failed`.
- Run record (`run.json`) and baseline snapshot evidence (`baseline/snapshot.json`) stored outside `candidate/` (design D5 layout verified in run-layout.ts).
- `run.ts` — crashed run leaves candidate; next run creates fresh `runRoot` (fail-closed on existing run root).

### Requirement 11: Agent and reviewer context from snapshots

**Verdict: PASS**

- `src/core/artifact-output/context.ts` — `buildSnapshotContext` produces context block with baseline digest, candidate digest, changed paths, non-text entries.
- `historySection` = *"No revision history available. This run uses snapshot-digest revision identity (artifact-output profile). There is no git commit history, branch history, or commit OID associated with these changes."* — not an empty string.
- Pre-verification context: `changesNotYetDerived: true` renders explicit marker "(not yet derived — change set is computed after verification)" instead of misleading "(no changes)".

### Requirement 12: Profile guarantees documented in CLI and README

**Verdict: PASS with note**

- `src/core/command/guide.ts` — `artifact-output` topic exists (10th topic); body includes:
  - `--no-worktree` comparison table ✓
  - Unsupported operations table derived from `UNSUPPORTED_OPERATIONS` ✓
  - resume.supported = false ✓
  - Preview / design-only pipeline limitation ✓
- `src/core/command/__tests__/guide.test.ts` TC-037: asserts all `UNSUPPORTED_OPERATIONS[i].displayName` appear in topic body ✓
- `README.md` — "Artifact-Output Profile (Git-Free Mode)" section with preview note: "not yet wired in the CLI flag parser" ✓

Note: Guide topic body does not contain the statement that agent subprocess git calls are outside the guard's boundary (see Finding under Requirement 1). This is the same issue — the body omits the boundary clarification the spec requires to be "documented as such."

### Requirement 13: Existing git profiles unaffected

**Verdict: PASS**

- All new code is in `src/core/artifact-output/**`, `src/core/snapshot/**`, `src/util/unified-diff.ts`.
- Changed existing files: `src/core/command/guide.ts` (topic added), `README.md`, `docs/artifact-output-profile.md`, `src/core/command/__tests__/guide.test.ts` (count: 9→10), CLI contract fixtures (guide summary string update only).
- `src/core/runtime/**`, `src/core/pipeline/**`, `src/core/step/**` — unchanged (confirmed by TC-071 reverse-import gate).
- No `--source` flag added to `flag-parser.ts` (confirmed by TC-072).

---

## Findings Summary

| # | Severity | File | Line | Description |
|---|----------|------|------|-------------|
| F-1 | Medium | `docs/artifact-output-profile.md` | 106–112 | "Git denial at the spawn boundary" section incorrectly states agent subprocesses throw on git calls; spec §1 SHALL requires documenting agent subprocess calls as *outside* the boundary |

---

## Acceptance Criteria Traceability

| AC | Status | Evidence |
|----|--------|---------|
| ADR定義 (authority / revision identity / lifecycle / 保証差分) | ⏳ (adr-gen step, post-conformance) | — |
| Git責務の分類 (snapshot置換/profile固有/初期unsupported) | ✅ | docs/artifact-output-profile.md §Unsupported operations |
| Git repository外fixtureで最小縦断完走 | ✅ | tests/artifact-output-vertical.test.ts |
| git/gh呼び出しゼロを機械的検証 | ✅ | artifact-output-git-free.test.ts + guarded spawn |
| 元source不変 (成功時・失敗時) | ✅ | checkSourceUnchanged on every exit path |
| added/modified/deletedがmanifestへ出力 | ✅ | compare.ts + manifest.ts |
| text patch非表現変更がmanifest/payloadから欠落しない | ✅ | patch.ts D8 table; artifact-writer.ts payload |
| baseline/candidate digestがartifact・recordへ束縛 | ✅ | revision-binding.ts + cross-phase check |
| snapshot不能が「変更なし」として通過しない | ✅ | collect.ts fail-closed; compare.ts unavailable |
| Git依存stepを開始前preflightで列挙 | ✅ | preflight.ts; run.ts halts before createRunRoot |
| 既存Git/PRプロファイル挙動不変 | ✅ | TC-071 reverse-import gate; no existing runtime changes |
| CLI/READMEで--no-worktreeとの違い・保証・unsupported説明 | ✅ (with F-1) | guide.ts topic; README preview note |
| 実測結果と次段階Issue案 | ✅ | docs/artifact-output-profile.md |
| Verification green | ✅ | verification-result.md on branch |
