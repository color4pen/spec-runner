# Regression Gate — optional-github-integration (Iteration 1)

## Summary

Checked all 11 ledger findings. 9 are confirmed fixed. 2 regressions remain.

---

## Finding-by-finding evidence

### [1] TC-055 priority "should" → "must" (test-cases.md:123) — FIXED

`test-cases.md` line 123 now reads `| TC-055 | ... | completion | **must** | T-07 AC |`. Priority matches the required AC.

### [2] TC-075 priority "should" → "must" (test-cases.md:166) — FIXED

`test-cases.md` line 166 now reads `| TC-075 | ... | archive | **must** | T-09 AC |`. Priority matches.

### [3] bootstrap re-derives github.enabled from current config (bootstrap.ts:43, resume.ts:63) — FIXED

`bootstrap()` now accepts a `githubEnabledOverride?: boolean` parameter (bootstrap.ts lines 40-45).  
When provided, it short-circuits `resolveGitHubIntegrationConfig` — the override wins.  
`resume.ts` line 67 now reads:
```ts
const githubEnabledOverride = getGitHubIntegration(state).enabled;
```
and passes it to `bootstrap(cwd, repo, options.repoRoot ?? null, githubEnabledOverride)` at line 72.  
D1 invariant is satisfied: resume derives the value from job state, not current config.

### [4] Completion output missing final OID / attestation path; JSON contract missing D7 fields (runner.ts:469, run-result.ts:16) — FIXED

`runner.ts` lines 474–487 now display:
- `Final revision: <oid>` (from `synthesizedCommits.at(-1)`) 
- `Attestation: <relAttest>` (when file exists on disk)

`run-result.ts` interface `RunResultContract` now has optional D7 additive fields `branch`, `revision`, `githubIntegration`, and `buildRunResult` populates them for `branch-published` results (lines 70–85).

### [5] Redundant null check in traceGitHubIntegration (github-integration.ts:50) — FIXED

The project-local block (original site at line 50) no longer has an inner `projectLocalRaw !== null` check — the outer `if (projectLocalRaw !== null && typeof projectLocalRaw === "object")` is the only guard (lines 47-50).  
Note: the user-global block at lines 69-72 still has a cosmetically redundant `userGlobalRaw !== null` on line 72 after checking on line 70, but this is a new minor smell outside the ledger site.

### [6] E2E assertion permits awaiting-resume (github-disabled-e2e.test.ts:429) — FIXED

`github-disabled-e2e.test.ts` line 497 now uses a strict assertion:
```ts
expect(completeState.status).toBe("awaiting-archive");
```
The weak `toContain(["awaiting-archive", "awaiting-resume"])` is gone. TC-120 (must) is now definitively verified.

### [7] ARCHIVE_USAGE says plain archive requires GitHub integration (archive.ts:355) — FIXED

The problematic sentence "Requires GitHub integration to be enabled (a merged or open PR is expected on the remote)." is gone.  
The new text (archive.ts lines 354-361) reads:
```
Plain archive (without --with-merge): pushes an archive record commit to the feature branch,
transitions the job to archived status, and removes the worktree — all in a single run.
For jobs with GitHub integration enabled, a merged or open PR is expected on the remote.

For jobs with GitHub integration disabled: the archive record is pushed to the feature branch
and the job transitions to archived in one step. The remote feature branch is preserved for
manual review or merge. Note that "archived" does not imply the branch has been merged into
the base branch — that step must be performed externally.
```
This correctly describes both paths without claiming plain archive requires GitHub.

### [8] validateJobState skips owner/name check for legacy states (operations.ts:371) — FIXED

`operations.ts` lines 375-387 now handle the absence case explicitly:
```ts
if (!("githubIntegration" in obj) || obj["githubIntegration"] === null || ...) {
  // Legacy/absent field: enforce owner + name as if enabled: true
  ...
}
```
T-02 AC — enabled:true (field absent) + owner absent → validation rejected — is now enforced.

### [9] resolveGitHubHost uses unnecessary dynamic import (github-composition.ts:102) — FIXED

`github-composition.ts` line 17 now includes a static import:
```ts
import { resolveGitHubApiBaseUrl, resolveGitHubHost } from "../config/github-host.js";
```
`composeGitHubIntegrationForJob` at line 102 calls `resolveGitHubHost(config.github)` directly with no dynamic `import(...)`. Invariant satisfied.

### [10] PR absence misidentified as GitHub disabled (runner.ts:467) — **REGRESSION**

`runner.ts` lines 467-471:
```ts
if (finalState.status === "awaiting-archive") {
    if (finalState.pullRequest?.url) {
        // PR path
    } else {
        // "GitHub integration disabled — branch published locally, no PR created."
```

The branch condition is `finalState.pullRequest?.url` — PR URL presence, not job state contract.  
A GitHub-**enabled** design-only job reaches `awaiting-archive` without a PR  
(`finalState.githubIntegration` would be `{enabled: true}` or absent, `finalState.pullRequest` is undefined).  
This causes the `else` branch to fire, displaying `"Pipeline completed (GitHub integration disabled)"` — which is wrong.  
The fix is to use `finalState.githubIntegration?.enabled === false` as the gate.

### [11] origin digest drops port (remote.ts:96, verify-checkpoint.ts:225) — **REGRESSION**

`remote.ts` line 96:
```ts
const host = url.hostname.toLowerCase();
```
`url.hostname` returns the host **without** the port (e.g. `forge.example`).  
`url.host` returns host **with** port (e.g. `forge.example:8443`).  
As a result, `https://forge.example:8443/team/repo.git` and `https://forge.example:9443/team/repo.git` both produce canonical `forge.example/team/repo` → same SHA-256 digest.  
`verify-checkpoint.ts:238` compares `stateOrigin.digest !== expectedRepo.origin.digest` — the comparison is correct, but the digest it receives is defective (port-stripped), so the mismatch is not caught.  
Fix: replace `url.hostname` with `url.host` at line 96.

---

## Evidence

| # | Status | Site | Note |
|---|--------|------|------|
| [1] | Fixed | test-cases.md:123 | priority now "must" |
| [2] | Fixed | test-cases.md:166 | priority now "must" |
| [3] | Fixed | bootstrap.ts:43, resume.ts:67 | githubEnabledOverride parameter |
| [4] | Fixed | runner.ts:474-487, run-result.ts:29-34 | OID, attestation, D7 fields added |
| [5] | Fixed | github-integration.ts:47-50 | redundant null removed at site |
| [6] | Fixed | github-disabled-e2e.test.ts:497 | strict toBe assertion |
| [7] | Fixed | archive.ts:349-365 | phrase removed, dual-path doc |
| [8] | Fixed | operations.ts:375-387 | legacy state validation added |
| [9] | Fixed | github-composition.ts:17,102 | static import only |
| [10] | **REGRESSION** | runner.ts:468 | pullRequest?.url gate must be githubIntegration?.enabled |
| [11] | **REGRESSION** | remote.ts:96 | url.hostname drops port |
