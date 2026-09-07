# Regression Gate — optional-github-integration — Iteration 002

## Summary

All 11 ledger findings verified against current branch HEAD. No regressions detected.

---

## Finding-by-Finding Verification

### [1] `0dde9b20` — TC-055 priority "should" → "must"

**File**: `specrunner/changes/optional-github-integration/test-cases.md:123`

Checked: line 123 now reads `| TC-055 | ... | completion | must | T-07 AC |`.
Priority has been updated to **must**. **FIXED.**

---

### [2] `9ab66ee0` — TC-075 priority "should" → "must"

**File**: `specrunner/changes/optional-github-integration/test-cases.md:166`

Checked: line 166 now reads `| TC-075 | ... | archive | must | T-09 AC |`.
Priority has been updated to **must**. **FIXED.**

---

### [3] `7c5f3c49` — bootstrap re-derives github.enabled from current config instead of job state

**Sites**: `src/cli/bootstrap.ts:43`, `src/cli/resume.ts:63`

`bootstrap()` now accepts a `githubEnabledOverride?: boolean` parameter (line 45). When provided, it bypasses `resolveGitHubIntegrationConfig(config)` and uses the supplied value (lines 47-49). `resume.ts` at line 67-72 supplies `getGitHubIntegration(state).enabled` as the override, confirming D1 compliance. **FIXED.**

---

### [4] `04bb24aa` — Completion output missing final OID/attestation path; run-result.ts missing D7 additive fields

**Sites**: `src/core/command/runner.ts:467`, `src/core/command/run-result.ts:16`

`runner.ts` lines 476-492: GitHub-disabled branch shows `finalState.synthesizedCommits?.at(-1)` as final OID (TC-051) and resolves/displays the attestation path. `run-result.ts` lines 21-35: `RunResultContract` now declares `branch?`, `revision?`, `githubIntegration?` additive D7 fields. `buildRunResult` at lines 71-85 populates these for `branch-published` results. **FIXED.**

---

### [5] `27e5b6da` — Redundant null check in traceGitHubIntegration

**File**: `src/config/github-integration.ts:50`

Checked lines 46-64: the outer condition checks `projectLocalRaw !== null && typeof projectLocalRaw === "object"`. The inner scope assigns `const pl = projectLocalRaw as Record<string, unknown>` and then checks `github !== null` (a different variable). There is no redundant `projectLocalRaw !== null` inner check. **FIXED.**

---

### [6] `8e344022` — E2E assertion permits awaiting-resume (TC-120 not definitively verified)

**File**: `tests/github-disabled-e2e.test.ts:429`

Line 497 now reads `expect(completeState.status).toBe("awaiting-archive")`. The weak `toContain(["awaiting-archive", "awaiting-resume"])` assertion has been replaced. Comment at lines 495-496 explicitly states: "TC-120 (must): only awaiting-archive is acceptable — awaiting-resume means the". **FIXED.**

---

### [7] `2fec4ced` — ARCHIVE_USAGE claims plain archive requires GitHub integration

**File**: `src/cli/archive.ts:355`

Lines 355-361: the sentence now reads "For jobs with GitHub integration **enabled**, a merged or open PR is expected on the remote." (descriptive, not prescriptive). The following paragraph explicitly describes the disabled path. The previous language "Requires GitHub integration to be enabled" is absent. **FIXED.**

---

### [8] `541b1af1` — validateJobState skips owner/name check for legacy states lacking githubIntegration

**File**: `src/state/schema/operations.ts:371`

Lines 375-387: the condition `if (!("githubIntegration" in obj) || ...)` now explicitly handles absent/null `githubIntegration` by enforcing non-empty `owner` and `name`. Comment at line 372-374 cites T-02. Legacy state without the field is treated as enabled:true and triggers the same owner/name validation. **FIXED.**

---

### [9] `bdc4753c` — resolveGitHubHost uses unnecessary dynamic import in composeGitHubIntegrationForJob

**File**: `src/cli/github-composition.ts:102`

Line 17: `import { resolveGitHubApiBaseUrl, resolveGitHubHost } from "../config/github-host.js";` — both are now co-located in the static import. Line 102: `const githubHost = resolveGitHubHost(config.github)` calls the statically imported function directly. No dynamic import present. **FIXED.**

---

### [10] `1785e2c5` — PR absence misidentified as GitHub disabled

**File**: `src/core/command/runner.ts:467`

Line 468: `if (finalState.githubIntegration?.enabled !== false)` — the branch now consults the job-state-fixed `githubIntegration` contract, not `pullRequest` presence. Design-only jobs with GitHub enabled that have no PR will correctly follow the GitHub-enabled path. **FIXED.**

---

### [11] `e360a581` — origin digest drops port

**Sites**: `src/git/remote.ts:96`, `src/core/attach/verify-checkpoint.ts:225`

`remote.ts` lines 96-99: comment explicitly states "Use url.host (not url.hostname) so that non-default ports are included in the canonical form"; `const host = url.host.toLowerCase()` uses `url.host` which includes the port. Different-port endpoints produce different digests. `verify-checkpoint.ts` lines 225-237: digest comparison for GitHub-disabled jobs enforces origin digest match, and the digest now includes port. **FIXED.**

---

## Evidence

- **Checked**: 11 (all ledger items verified against current code)
- **Skipped**: 0
- **Unverified**: 0
