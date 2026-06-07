# Tasks: protected-paths-merge-guard

## T-01: Add `listPullRequestFiles` to the GitHubClient port

- [x] Add `listPullRequestFiles(owner, repo, prNumber): Promise<{ files: string[]; truncated: boolean }>`
      to the `GitHubClient` interface in `src/kernel/github-client.ts` with a doc comment describing
      the 3000-file cap and `truncated` semantics (re-exported by `src/core/port/github-client.ts`).

**Acceptance Criteria**:
- The port interface declares `listPullRequestFiles` with the exact return shape `{ files: string[]; truncated: boolean }`.
- `bun run typecheck` reports the new method as a required member (existing implementers fail until T-02/T-07 add it).

## T-02: Implement `listPullRequestFiles` in the GitHub adapter

- [x] Implement `listPullRequestFiles` in `src/adapter/github/github-client.ts` calling
      `GET /repos/{owner}/{repo}/pulls/{pull_number}/files?per_page=100`, following `Link: rel="next"`
      via the existing `parseNextLink` helper, and collecting the REST `filename` field of each entry.
- [x] Detect truncation: set `truncated: true` when the collected count reaches the 3000-file cap
      or a `next` link still remains after the 30th page (3000 files); otherwise `truncated: false`.
- [x] Throw `githubApiError` on non-200 responses, consistent with `getCheckStatus` / `listPullRequests`
      (401 is already thrown by the shared `request()` layer).

**Acceptance Criteria**:
- A single-page response returns all filenames with `truncated: false`.
- A multi-page response (two pages joined via `Link: rel="next"`) returns the union of filenames with `truncated: false`.
- A response that reaches the 3000-file cap returns `truncated: true`.
- Non-200 status throws `githubApiError`.

## T-03: Add `globMatch` glob predicate utility

- [x] Create `src/util/glob-match.ts` exporting `globMatch(filePath: string, pattern: string): boolean`.
- [x] Translate the glob to an anchored RegExp supporting `*` (single segment, no `/`), `**`
      (cross-segment, includes `/`), `?` (one non-`/` char), and literal characters (regex specials escaped).
- [x] Match against full, repo-root-relative POSIX paths, case-sensitive.
- [x] Do not add any external glob dependency (minimal-deps North Star).

**Acceptance Criteria**:
- `.github/workflows/*` matches `.github/workflows/release.yml` but not `.github/workflows/nested/x.yml`.
- `.github/**` matches `.github/workflows/release.yml`.
- `**/*.yml` matches `a/b/c.yml`.
- `release-please-config.json` matches exactly and not `docs/release-please-config.json`.
- No new entries added to `package.json` dependencies.

## T-04: Add `evaluateProtectedPaths` decision function

- [x] Create `src/core/archive/protected-paths.ts` exporting `ProtectedPathDecision`
      (`{ blocked: boolean; reason: "none" | "match" | "truncated"; matched: string[] }`)
      and `evaluateProtectedPaths({ changedFiles, truncated, patterns })`.
- [x] Decision order: (1) empty `patterns` → not blocked (`reason: "none"`); (2) `truncated` →
      blocked (`reason: "truncated"`); (3) glob-match changed files → blocked (`reason: "match"`,
      `matched` populated) else not blocked. Use `globMatch` from T-03.

**Acceptance Criteria**:
- Empty `patterns` returns `{ blocked: false, reason: "none", matched: [] }` even when `truncated: true`.
- Non-empty `patterns` with `truncated: true` returns `{ blocked: true, reason: "truncated", matched: [] }`.
- A matching changed file returns `{ blocked: true, reason: "match", matched: [<file>] }`.
- No matching changed file returns `{ blocked: false, reason: "none", matched: [] }`.

## T-05: Add `archive.protectedPaths` to config schema and validation

- [x] Add `protectedPaths?: string[]` to the `ArchiveConfig` interface in `src/config/schema.ts`
      with a doc comment (absent/empty = no guard, backward compatible).
- [x] In `validateConfig`'s archive section, validate `protectedPaths`: when present it MUST be an
      array, and every element MUST be a non-empty string; otherwise throw `CONFIG_INVALID`.

**Acceptance Criteria**:
- A valid `archive.protectedPaths` array of non-empty strings passes validation.
- A non-array value throws `CONFIG_INVALID`.
- An array containing a non-string or empty-string element throws `CONFIG_INVALID`.
- Absent key validates successfully (backward compatible).

## T-06: Wire the merge guard into `runMergeThenArchive`

- [x] Add `protectedPaths?: string[]` to `MergeThenArchiveInput` in `src/core/archive/merge-then-archive.ts`.
- [x] After the already-MERGED short-circuit (Step 3) and before the wait loop (Step 4): when
      `protectedPaths` is non-empty, call `githubClient.listPullRequestFiles(owner, repo, prNumber)`,
      pass `{ files, truncated, patterns: protectedPaths }` to `evaluateProtectedPaths`, and on
      `blocked` return `{ exitCode: 1, escalation }` without merging or archiving.
- [x] When `protectedPaths` is empty/undefined, skip the guard entirely (no `listPullRequestFiles` call).
- [x] Handle `listPullRequestFiles` throwing with an escalation (consistent with other API-failure escalations in this file).
- [x] Build the escalation via `formatEscalation` for both reasons:
      - `match`: `failedStep` "merge gate (protected paths)"; `detectedState` listing matched files;
        `recommendedAction` describing review + manual squash merge + archive; `resumeCommand`
        `specrunner job archive --with-merge <slug>`.
      - `truncated`: `failedStep` "merge gate (protected paths — file list truncated)"; `detectedState`
        stating the 3000-file cap was exceeded; same recommended action and resume command.

**Acceptance Criteria**:
- Protected-path match → exit code 1 escalation; `mergePullRequest` and `runArchiveOrchestrator` are not called.
- Truncated list with non-empty patterns → exit code 1 escalation; no merge, no archive.
- No match → existing wait-then-merge-then-archive flow runs unchanged.
- Empty/undefined `protectedPaths` → `listPullRequestFiles` is not called and the existing flow runs unchanged.
- Already-MERGED PR → guard skipped, archive runs directly.
- Escalation output contains the matched files (match case) or truncation notice, plus manual-merge steps.

## T-07: Wire config resolution in the CLI archive command

- [x] In `src/cli/archive.ts` `--with-merge` block, read `config.archive?.protectedPaths` and pass it
      as `protectedPaths` into the `runMergeThenArchive` input.
- [x] In the config-load failure fallback, leave `protectedPaths` undefined (no guard, backward compatible).

**Acceptance Criteria**:
- When `archive.protectedPaths` is configured, it reaches `runMergeThenArchive`.
- When config load fails, no guard is applied and the archive flow still runs.

## T-08: Update GitHubClient test doubles for the new port method

- [x] Add `listPullRequestFiles` (default `vi.fn().mockResolvedValue({ files: [], truncated: false })`,
      or an equivalent stub) to every `GitHubClient` test double / mock factory that is typed against
      the port, so `bun run typecheck` passes (e.g. `tests/unit/core/archive/merge-then-archive.test.ts`
      `makeGitHubClient`, plus other files that construct a typed `GitHubClient`).

**Acceptance Criteria**:
- `bun run typecheck` passes with the extended port.
- No behavioral change to existing tests (default stub returns an empty, non-truncated list).

## T-09: Add unit tests

- [x] `globMatch` tests covering the scenarios in spec.md (single-segment `*`, `**`, `?`, leading
      `**/`, literal exact match, negative cases).
- [x] `evaluateProtectedPaths` tests covering the decision table (empty patterns, truncated,
      match with matched list, no match).
- [x] `listPullRequestFiles` adapter tests covering single page, multi-page via `Link`, and the
      3000-file cap → `truncated: true`.
- [x] `runMergeThenArchive` guard tests: protected-path match → escalation (no merge/archive);
      truncated → escalation; no match → proceeds; empty patterns → guard skipped; already-MERGED → guard skipped.

**Acceptance Criteria**:
- New tests cover every Scenario in spec.md.
- The guard tests assert `mergePullRequest` and `runArchiveOrchestrator` are not called on block.

## T-10: Verify the full build

- [x] Run `bun run typecheck && bun run test` and ensure both are green.

**Acceptance Criteria**:
- `bun run typecheck` passes.
- `bun run test` passes.
