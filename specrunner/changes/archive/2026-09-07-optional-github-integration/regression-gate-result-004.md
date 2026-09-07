# Regression Gate Result — Iteration 004

**Change**: optional-github-integration  
**Date**: 2026-09-07  
**Ledger entries checked**: 17  

## Summary

All 17 ledger findings were verified. No regressions detected.

---

## Evidence by Finding

### [1] `0dde9b20` — TC-055 priority "must"
- **File**: `specrunner/changes/optional-github-integration/test-cases.md:123`
- **Verdict**: FIXED — TC-055 row shows `must` in the Priority column.

### [2] `9ab66ee0` — TC-075 priority "must"
- **File**: `specrunner/changes/optional-github-integration/test-cases.md:166`
- **Verdict**: FIXED — TC-075 row shows `must` in the Priority column.

### [3] `7c5f3c49` — bootstrap re-derives github.enabled from current config
- **Files**: `src/cli/bootstrap.ts:45`, `src/cli/resume.ts:69`
- **Verdict**: FIXED.
  - `bootstrap()` now accepts a `githubEnabledOverride?: boolean` parameter. When set, it uses that value instead of calling `resolveGitHubIntegrationConfig(config)`.
  - `resume.ts` derives `getGitHubIntegration(state).enabled` from the stored job state and passes it as `githubEnabledOverride`.

### [4] `04bb24aa` — Completion output missing final OID / attestation path / D7 fields
- **Files**: `src/core/command/runner.ts:467–493`, `src/core/command/run-result.ts`
- **Verdict**: FIXED.
  - `runner.ts` GitHub-disabled branch now logs `finalState.synthesizedCommits?.at(-1)` (final OID) and the attestation file path (TC-051).
  - `RunResultContract` interface has additive fields `branch?`, `revision?`, `githubIntegration?` (D7). `buildRunResult` populates them for `branch-published` results.

### [5] `27e5b6da` — Redundant null check (project-local) in traceGitHubIntegration
- **File**: `src/config/github-integration.ts:46–64`
- **Verdict**: FIXED — outer guard is `projectLocalRaw !== null && typeof projectLocalRaw === "object"` with no inner duplicate null check.

### [6] `8e344022` — E2E assertion permits awaiting-resume
- **File**: `tests/github-disabled-e2e.test.ts`
- **Verdict**: FIXED.
  - The pipeline mock returns `awaiting-archive` on call 2, and the test asserts `expect(resumeExitCode).toBe(0)` (not a two-element toContain). Reopen–resume phase asserts `expect(finalState!.status).toBe("awaiting-archive")` strictly.

### [7] `2fec4ced` — ARCHIVE_USAGE incorrectly states plain archive requires GitHub integration
- **File**: `src/cli/archive.ts:353–366`
- **Verdict**: FIXED — The sentence now reads "For jobs with GitHub integration enabled, a merged or open PR is expected on the remote." followed by a separate paragraph describing the GitHub-disabled path. No blanket "requires GitHub integration" claim in the plain-archive section.

### [8] `541b1af1` — validateJobState skips owner/name check for legacy states
- **File**: `src/state/schema/operations.ts:375–387`
- **Verdict**: FIXED — When `githubIntegration` is absent/null/undefined, the code now explicitly enforces `repository.owner` and `repository.name` as non-empty strings (T-02 AC).

### [9] `bdc4753c` — resolveGitHubHost uses unnecessary dynamic import
- **File**: `src/cli/github-composition.ts:17,108`
- **Verdict**: FIXED — `resolveGitHubHost` and `resolveGitHubApiBaseUrl` are co-located in the static import at line 17. `composeGitHubIntegrationForJob` calls `resolveGitHubHost(config.github)` without any dynamic import.

### [10] `7557fc74` — Dead export `githubChecks`
- **File**: `src/core/doctor/checks/index.ts`
- **Verdict**: FIXED — No `export const githubChecks` exists in the file. The only reference is a JSDoc comment describing the module's exports. `selectChecks` uses `commonChecks` and `baseChecks` exclusively.

### [11] `f6040f83` — Dead-code fallback for invokerOrigin
- **File**: `src/cli/attach.ts:120–143`
- **Verdict**: FIXED — `invokerOrigin` is assigned at line 133 from `composition.origin`. There is no `if (!invokerOrigin)` fallback block below it; if composition fails the function returns early at line 142.

### [12] `26bb1175` — Redundant `userGlobalRaw !== null` check (user-global)
- **File**: `src/config/github-integration.ts:67–71`
- **Verdict**: FIXED — guard is `userGlobalRaw !== null && typeof userGlobalRaw === "object"` with no duplicate null clause.

### [13] `b0b024fb` — validateJobState allows explicit null for owner/name
- **File**: `src/state/schema/operations.ts:399`
- **Verdict**: FIXED — check is `repo["owner"] !== undefined` (not `typeof ... !== "string"`), so `null !== undefined` is `true` and explicit nulls are rejected.

### [14] `1785e2c5` — PR不在をGitHub無効と誤認
- **File**: `src/core/command/runner.ts:467–468`
- **Verdict**: FIXED — branch condition is `if (finalState.githubIntegration?.enabled !== false)` (checks job-state contract), not presence of `pullRequest`.

### [15] `e360a581` — origin digestがportを捨てる
- **Files**: `src/git/remote.ts:99`, `src/core/attach/verify-checkpoint.ts:238`
- **Verdict**: FIXED.
  - `remote.ts` now uses `url.host` (which includes non-default ports) instead of `url.hostname`; the canonical form is `host/path` so `forge.example:8443` and `forge.example:9443` produce different digests.
  - `verify-checkpoint.ts` compares `stateOrigin.digest !== expectedRepo.origin.digest`, so the stricter digest feeds through correctly.

### [16] `e7b074c5` — attachの検証前compositionが現在configを権威にする
- **Files**: `src/cli/attach.ts:92–131`, `src/cli/github-composition.ts:50–58`
- **Verdict**: FIXED.
  - Phase 1 in `attach.ts` probes the checkpoint state to read `githubIntegration.enabled` before calling `composeGitHubIntegration`.
  - `composeGitHubIntegration` accepts `options.overrideEnabled`; Phase 2 passes `{ overrideEnabled: checkpointGithubEnabled }` so the current config cannot re-route the composition.

### [17] `6455983b` — plain archiveがenabled jobの保存済み契約を現在configで上書きする
- **Files**: `src/cli/archive.ts:285–294`, `src/cli/archive.ts:213–218`
- **Verdict**: FIXED — both the `--with-merge` compose call (line 217) and the plain archive compose call (line 289) pass `{ overrideEnabled: jobGithubEnabled }` derived from the stored job state, not the current config.

---

## Evidence Counts

- **checked**: 17
- **skipped**: 0
- **unverified**: 0

## Verdict

No regressions. All 17 ledger findings are confirmed fixed in iteration 4.
