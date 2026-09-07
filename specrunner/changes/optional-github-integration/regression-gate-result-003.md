# Regression Gate — optional-github-integration — Iteration 003

## Summary

17 ledger items verified. 3 regressions detected (findings [13], [16], [17]). All other 14 findings confirmed FIXED.

---

## Finding-by-Finding Verification

### [1] `0dde9b20` — TC-055 priority "should" → "must"

**File**: `specrunner/changes/optional-github-integration/test-cases.md:123`

Line 123: `| TC-055 | ... | completion | must | T-07 AC |`. Priority is **must**. **FIXED.**

---

### [2] `9ab66ee0` — TC-075 priority "should" → "must"

**File**: `specrunner/changes/optional-github-integration/test-cases.md:166`

Line 166: `| TC-075 | ... | archive | must | T-09 AC |`. Priority is **must**. **FIXED.**

---

### [3] `7c5f3c49` — bootstrap re-derives github.enabled from current config instead of job state

**Sites**: `src/cli/bootstrap.ts:43`, `src/cli/resume.ts:63`

`bootstrap()` accepts `githubEnabledOverride?: boolean` (line 45); when provided, bypasses `resolveGitHubIntegrationConfig(config)` (lines 47-49). `resume.ts` line 69 supplies `getGitHubIntegration(state).enabled` as override. D1 satisfied. **FIXED.**

---

### [4] `04bb24aa` — Completion output missing final OID/attestation path; run-result.ts D7 fields absent

**Sites**: `src/core/command/runner.ts:469`, `src/core/command/run-result.ts:16`

`runner.ts` lines 476-492: GitHub-disabled branch displays `synthesizedCommits.at(-1)` as final OID (TC-051) and resolves/displays attestation path. `run-result.ts` lines 21-35: `RunResultContract` declares `branch?`, `revision?`, `githubIntegration?` additive D7 fields; `buildRunResult` populates them for `branch-published` results (lines 71-85). **FIXED.**

---

### [5] `27e5b6da` — Redundant null check in traceGitHubIntegration (projectLocalRaw)

**File**: `src/config/github-integration.ts:50`

Lines 47-50: outer condition is `projectLocalRaw !== null && typeof projectLocalRaw === "object"`. No inner redundant `projectLocalRaw !== null` check exists in the body. **FIXED.**

---

### [6] `8e344022` — E2E assertion permits awaiting-resume (TC-120 not definitively verified)

**File**: `tests/github-disabled-e2e.test.ts:429`

Line 473: `expect(resumeExitCode).toBe(0)` combined with `expect(pipelineCallState.count).toBe(2)` definitively verifies completion to `awaiting-archive`. The weak `toContain(["awaiting-archive", "awaiting-resume"])` assertion is absent. **FIXED.**

---

### [7] `2fec4ced` — ARCHIVE_USAGE claims plain archive requires GitHub integration

**File**: `src/cli/archive.ts:355`

Lines 355-364: plain archive section reads "For jobs with GitHub integration **enabled**, a merged or open PR is expected on the remote." — descriptive of enabled-job behavior, not a gate. The disabled path is explicitly described next. The old "Requires GitHub integration to be enabled" language is absent. **FIXED.**

---

### [8] `541b1af1` — validateJobState skips owner/name check for legacy states lacking githubIntegration

**File**: `src/state/schema/operations.ts:371`

Lines 375-387: condition `if (!("githubIntegration" in obj) || ...)` explicitly handles absent/null `githubIntegration` by enforcing non-empty `owner` and `name` (cites T-02). Legacy state without the field is treated as `enabled: true` and triggers same owner/name validation. **FIXED.**

---

### [9] `bdc4753c` — resolveGitHubHost uses unnecessary dynamic import in composeGitHubIntegrationForJob

**File**: `src/cli/github-composition.ts:102`

Line 17: `import { resolveGitHubApiBaseUrl, resolveGitHubHost } from "../config/github-host.js"` — both co-located in the static import. Line 108: `resolveGitHubHost(config.github)` calls the statically imported function. No dynamic import present. **FIXED.**

---

### [10] `7557fc74` — Dead export `githubChecks` not used by `selectChecks`

**File**: `src/core/doctor/checks/index.ts:91`

Grep for `githubChecks` returns only a JSDoc comment reference (JSDoc line 6 of the file); no `export const githubChecks` declaration exists. `selectChecks` uses `commonChecks` and `baseChecks` as intended. Dead export removed. **FIXED.**

---

### [11] `f6040f83` — Dead-code fallback for `invokerOrigin` is unreachable

**File**: `src/cli/attach.ts:120`

Lines 91-114: `invokerOrigin` is set from `composition.origin` inside the try block. There is no subsequent `if (!invokerOrigin)` fallback block. Dead code removed. **FIXED.**

---

### [12] `26bb1175` — Redundant `userGlobalRaw !== null` check in `traceGitHubIntegration`

**File**: `src/config/github-integration.ts:67`

Lines 67-71: condition is `userGlobalRaw !== null && typeof userGlobalRaw === "object"`. No duplicate `!== null` clause. **FIXED.**

---

### [13] `b0b024fb` — `validateJobState` allows explicit `null` for owner/name on disabled jobs

**File**: `src/state/schema/operations.ts:399`

**REGRESSION CONFIRMED.**

Line 399: `if (repo && (repo["owner"] != null || repo["name"] != null))`.

In JavaScript, `null != null` evaluates to `false` (loose inequality treats `null` and `null` as equal). Therefore, when `repo["owner"] === null` (explicit JSON null), the condition `repo["owner"] != null` is `false`. If both owner and name are explicit `null`, the overall condition is `false || false === false`, and no error is thrown. The state `{"repository": {"owner": null, "name": null, "origin": {...}}, "githubIntegration": {"enabled": false}}` passes validation despite the invariant requiring owner/name to be absent.

The fix requires distinguishing `null` from `undefined`, e.g. using `repo["owner"] !== undefined || repo["name"] !== undefined` or `"owner" in repo || "name" in repo`.

---

### [14] `1785e2c5` — PR absence misidentified as GitHub disabled

**File**: `src/core/command/runner.ts:467`

Lines 467-468: `if (finalState.status === "awaiting-archive") { if (finalState.githubIntegration?.enabled !== false)` — the branch now consults the job-state-fixed `githubIntegration` contract, not `pullRequest` presence. Design-only GitHub-enabled jobs with no PR follow the GitHub-enabled path correctly. **FIXED.**

---

### [15] `e360a581` — origin digest drops port

**Sites**: `src/git/remote.ts:96`, `src/core/attach/verify-checkpoint.ts:225`

`remote.ts` lines 96-99: comment explicitly states "Use url.host (not url.hostname) so that non-default ports are included in the canonical form"; `url.host.toLowerCase()` includes port. Verify-checkpoint lines 225-243: digest comparison for GitHub-disabled jobs enforces origin digest match including port. **FIXED.**

---

### [16] `e7b074c5` — attachの検証前compositionが現在configを権威にする

**Sites**: `src/cli/attach.ts:98`, `src/cli/github-composition.ts:48`

**REGRESSION CONFIRMED.**

`src/cli/github-composition.ts:48` correctly added the `overrideEnabled` option to `composeGitHubIntegration`. However, the call site at `src/cli/attach.ts:98` does NOT pass `overrideEnabled`:

```typescript
const composition = await composeGitHubIntegration(
  config,
  cwd,
  process.env as Record<string, string | undefined>,
  // ← no overrideEnabled supplied
);
```

Failure scenario: A job started with `github.enabled: false` using a non-GitHub HTTPS origin creates a checkpoint. The user then changes config to `github.enabled: true`. On `job attach --branch`, `composeGitHubIntegration` resolves `enabled: true` from the current config, calls `resolveJobGitHubIntegration` with `enabled: true`, which in turn calls `parseRemoteUrl(originUrl, host)`. Since the origin is a non-GitHub URL, `parseRemoteUrl` throws `remoteNotGitHubError()`. The attach fails before the checkpoint is ever read, violating the invariant that the stored contract in the checkpoint is authoritative.

The fundamental challenge is that the checkpoint must be fetched before its githubIntegration contract is known, but authentication composition occurs before the fetch. The fix requires a two-phase approach: first fetch the checkpoint with minimal/no GitHub-specific auth, read the stored githubIntegration contract, then re-compose with `overrideEnabled` from the checkpoint state.

---

### [17] `6455983b` — plain archiveがenabled jobの保存済み契約を現在configで上書きする

**Sites**: `src/cli/archive.ts:285`, `src/cli/archive.ts:217`

**REGRESSION CONFIRMED.**

`src/cli/archive.ts:217` (the `--with-merge` path) correctly passes `{ overrideEnabled: jobGithubEnabled }`. However, the plain archive path at line 285 does NOT:

```typescript
const plainCompose = await composeGitHubIntegration(
  config,
  opts.cwd,
  process.env as Record<string, string | undefined>,
  // ← no overrideEnabled supplied
);
archiveToken = plainCompose.githubToken;
```

Failure scenario: A job was started with `github.enabled: true` (stored in job state). The user changes config to `github.enabled: false`. On `job archive <slug>`, `jobGithubEnabled` is `true` (from job state), so we enter the `if (jobGithubEnabled)` block. `composeGitHubIntegration` is called without `overrideEnabled`, so it reads the current config (`enabled: false`) and returns `{ githubToken: undefined }`. `archiveToken` is set to `undefined`. The archive record push proceeds without a GitHub token. For HTTPS origins requiring the token for authentication, the push fails and the archive cannot complete per the stored job contract.

The fix requires `{ overrideEnabled: jobGithubEnabled }` on line 285, matching the pattern already applied at line 217.

---

## Evidence

- **Checked**: 17 (all ledger items verified against current code)
- **Skipped**: 0
- **Unverified**: 0
