# Code Review Findings — gh-cli-to-rest-api (iteration 3)

## Summary

Iteration 3 addressed both major findings from iter-2: `github-client-pr.test.ts` was added with direct unit tests for TC-FM-001..005 and TC-PM-002/003/006. All iter-2 stale-comment minor findings (F-006) were also resolved — `preflight.ts`, `orchestrator.ts`, `types.ts`, `pr-create.ts`, `resolve-target.ts`, and `src/core/preflight.ts` are now updated to REST API wording. The `force` field was removed from `MergePhase3Params`, resolving F-004. The `owner`/`repo` empty-string fallback in `pr-create.ts` was replaced with an explicit `throw`, resolving F-005.

Production behavior is correct: `gh` CLI dependency is fully eliminated from all production paths, retry/rate-limit middleware is correct, field mapping is verified by direct unit tests, and all tests pass (verification-result.md: green).

---

## Findings

### F-001: `finish-adversarial.test.ts` file-header comment still references "gh binary missing"

- **severity**: minor
- **file**: `tests/finish-adversarial.test.ts` (file-level doc comment)
- **description**: The file-level doc comment references `TC-121: gh binary missing → escalation`. The actual `describe` block correctly says `TC-121: git binary missing → escalation`. The stale "gh binary" in the header is a copy-paste carry-over from before the REST migration. It does not affect behavior or test logic but is misleading for readers skimming the file header.
- **recommendation**: Update the file-header comment to `TC-121: git binary missing → escalation` to match the describe block.

### F-002 (note): `outputDryRunPlan` no longer emits `admin-flag` line — iter-2 F-003 resolved

- **severity**: note
- **file**: `src/core/finish/orchestrator.ts`
- **description**: Iter-2 finding F-003 flagged the misleading `admin-flag: yes (via admin token)` output. The current implementation does not emit an `admin-flag` line at all. TC-PM-007 (`merge-strategy: "REST API squash merge"` appears in dry-run plan) is satisfied. The resolution is correct; recording as a note for completeness.

---

## Test Coverage (MUST scenarios from test-cases.md)

### REST_CLIENT (8/8)
- [x] TC-RC-001: `X-GitHub-Api-Version` header — `github-client-request.test.ts`
- [x] TC-RC-002: `Authorization: token` header — `github-client-request.test.ts`
- [x] TC-RC-003: 401 → throw immediately, no retry — `github-client-request.test.ts`
- [x] TC-RC-004: 429 → Retry-After wait + retry — `github-client-request.test.ts`
- [x] TC-RC-005: Retry-After 60s cap — `github-client-request.test.ts`
- [x] TC-RC-006: `X-RateLimit-Remaining=0` → reset wait — `github-client-request.test.ts`
- [x] TC-RC-007: 5xx exponential backoff 3 retry — `github-client-request.test.ts`
- [x] TC-RC-008: 5xx exhausted → throw — `github-client-request.test.ts`

### FIELD_MAPPING (5/5)
- [x] TC-FM-001: `mergeable_state: "clean"` → `mergeStateStatus: "CLEAN"` — `github-client-pr.test.ts`
- [x] TC-FM-002: `mergeable_state: "blocked"` → `mergeStateStatus: "BLOCKED"` — `github-client-pr.test.ts`
- [x] TC-FM-003: `merged: true` → `state: "MERGED"` — `github-client-pr.test.ts`
- [x] TC-FM-004: `state: "open"` → `state: "OPEN"` — `github-client-pr.test.ts`
- [x] TC-FM-005: `mergeable: null` → `mergeable: "UNKNOWN"` — `github-client-pr.test.ts`

### PR_CREATE (3/3)
- [x] TC-PC-001: REST 経由で PR 作成成功 — `runner.test.ts`
- [x] TC-PC-002: 既存 OPEN PR → existing URL 返却 — `runner.test.ts`
- [x] TC-PC-003: `githubToken` なしの型エラー — typecheck

### PR_STATUS (3/3)
- [x] TC-PS-001: `fetchPrViewWithRetry` が `getPullRequest` 使用 — `preflight.test.ts`
- [x] TC-PS-002: `mergeable: "UNKNOWN"` 時 retry — `finish-orchestrator.test.ts`
- [x] TC-PS-003: `pollMergeStateAfterPush` BLOCKED 検出 — `finish-orchestrator.test.ts`

### PR_MERGE (4/4)
- [x] TC-PM-001: squash merge が REST 経由で成功 — `github-client-pr.test.ts` + `finish-orchestrator.test.ts`
- [x] TC-PM-002: 405 → `{ merged: false }` — `github-client-pr.test.ts`
- [x] TC-PM-003: 403 → permission denied メッセージ — `github-client-pr.test.ts`
- [x] TC-PM-004: 保護されていないブランチで merge 成功 — TC-PM-001 で間接担保

### RESOLVE_TARGET (2/2)
- [x] TC-RT-001: PR 番号 → head branch 解決 — `finish-resolve-target.test.ts`
- [x] TC-RT-002: error message に `gh` 言及なし — `resolve-target.ts` で `Run 'specrunner login'`

### PREFLIGHT (2/2)
- [x] TC-PF-001: `checkBinaries` が `["git"]` のみ — `finish-adversarial.test.ts`
- [x] TC-PF-002: `PreflightInput` に `githubClient/owner/repo` — typecheck

### DOCTOR (1/1)
- [x] TC-DC-001: `gh-cli.ts` ファイル削除確認済み

### REGRESSION (3/3)
- [x] TC-RG-001: `finish-orchestrator.test.ts` green
- [x] TC-RG-002: `pr-create/runner.test.ts` green
- [x] TC-RG-003: adversarial / resolve-target green
- [x] TC-RG-005: production code に `gh` 文字列残存なし

### INTEGRATION (2/2)
- [x] TC-IT-001: `gh` なしで finish 完走 — orchestrator テストで間接担保
- [x] TC-IT-002: CLI entry point で `owner/repo` 解決 — `finish.ts`

**Must coverage**: 33 / 33

---

## Verdict

- **verdict**: approved

iter-2 で要求された major 2 件（TC-FM-001..005 フィールドマッピング直接 unit test、TC-PM-002/003 merge 失敗分岐 unit test）がいずれも `github-client-pr.test.ts`（新設、263 行）で完全にカバーされた。iter-2 minor F-003〜F-006 もすべて対処済み。test-cases.md の must 33 件が直接または構造的に検証されており、typecheck + test green を確認。残る F-001 は 1 行コメント修正で merge を blocking しない minor。
