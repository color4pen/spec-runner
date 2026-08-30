# Verification Result — runtime-mutation-lifecycle-capability-split — iter 1

## Verdict: failed

## Phase Results

| # | Phase | Status | Duration | Exit Code |
|---|-------|--------|----------|-----------|
| 1 | build | passed | 0.6s | 0 |
| 2 | typecheck | passed | 16.4s | 0 |
| 3 | test | failed | 99.4s | 1 |
| 4 | lint | skipped | — | — |
| 5 | changed-line-coverage | skipped | — | — |
| 6 | lockfile-sync | skipped | — | — |

## Phase: build

```
[34mCLI[39m Building entry: bin/specrunner.ts
[34mCLI[39m Using tsconfig: tsconfig.json
[34mCLI[39m tsup v8.5.1
[34mCLI[39m Using tsup config: tsup.config.ts
[34mCLI[39m Target: node20
[34mCLI[39m Cleaning output folder
[34mESM[39m Build start
[32mESM[39m [1mdist/specrunner.js [22m[32m1.58 MB[39m
[32mESM[39m ⚡️ Build success in 228ms

$ tsup
$ ! grep -qE "from ['\"]zod|require\\(['\"]zod" dist/specrunner.js

```

## Phase: typecheck

```
$ tsc --noEmit

```

## Phase: test

Step 'test' failed

```

[1m[30m[46m RUN [49m[39m[22m [36mv4.1.5 [39m[90m.[39m

 [32m✓[39m tests/unit/core/archive/merge-then-archive.test.ts [2m([22m[2m37 tests[22m[2m)[22m[33m 458[2mms[22m[39m
     [33m[2m✓[22m[39m 記帳(runArchiveOrchestrator)と mergePullRequest を呼ばず、runArchiveCleanup を呼ぶ [33m 372[2mms[22m[39m
 [32m✓[39m tests/unit/step/write-scope-bypass-closure.test.ts [2m([22m[2m42 tests[22m[2m)[22m[32m 299[2mms[22m[39m
 [31m❯[39m tests/unit/architecture/core-invariants.test.ts [2m([22m[2m72 tests[22m[2m | [22m[31m1 failed[39m[2m)[22m[33m 647[2mms[22m[39m
     [32m✓[39m grep finds no adapter/ imports in src/core/ domain (excluding runtime/)[32m 17[2mms[22m[39m
     [32m✓[39m grep finds no @anthropic-ai/* imports in src/core/ beyond the allowlist[32m 14[2mms[22m[39m
     [32m✓[39m grep finds no upward imports into core/ from shared-kernel/persistence beyond the allowlist[32m 46[2mms[22m[39m
     [32m✓[39m grep finds no external imports in src/util/ beyond the allowlist[32m 5[2mms[22m[39m
     [32m✓[39m grep finds no direct fs I/O call-sites in src/core/pipeline/[32m 6[2mms[22m[39m
     [32m✓[39m grep finds no child_process imports or execSync/spawnSync call-sites in src/core/pipeline/[32m 7[2mms[22m[39m
     [32m✓[39m grep finds no raw process.env references in src/core/, src/adapter/, and src/util/ beyond the allowlist[32m 24[2mms[22m[39m
     [32m✓[39m grep finds no raw process.(stdout|stderr).write call-sites in src/core/ and src/cli/[32m 17[2mms[22m[39m
     [32m✓[39m grep finds no config.runtime branches outside core/runtime/ beyond the allowlist[32m 13[2mms[22m[39m
     [32m✓[39m grep finds no direct JobState.status writes in src/store/ and src/core/ beyond the allowlist[32m 21[2mms[22m[39m
     [32m✓[39m grep finds no direct node:child_process imports outside the B-12 allowlist[32m 16[2mms[22m[39m
     [32m✓[39m detects new forbidden adapter import not in allowlist (B-1 regression guard)[32m 2[2mms[22m[39m
     [32m✓[39m detects new forbidden SDK import not in allowlist (B-2 regression guard)[32m 0[2mms[22m[39m
     [32m✓[39m detects new raw process.env reference not in allowlist (B-6 regression guard)[32m 0[2mms[22m[39m
     [32m✓[39m does not flag process.env references that use the stripSecrets seam (B-6 seam exemption)[32m 0[2mms[22m[39m
     [32m✓[39m detects new upward import into core/ not in allowlist (B-3 regression guard)[32m 0[2mms[22m[39m
     [32m✓[39m does not flag violations that are correctly allowlisted (B-3 suppression mechanism — synthetic entry)[32m 0[2mms[22m[39m
     [32m✓[39m detects new external import in util/ not in allowlist (B-4 regression guard)[32m 0[2mms[22m[39m
     [32m✓[39m detects new raw process.stderr.write call-site in src/cli/ not in allowlist (B-7 regression guard / TC-021)[32m 0[2mms[22m[39m
     [32m✓[39m does not flag process.stderr.write calls that use the maskSensitive seam (B-7 seam exemption / TC-020)[32m 0[2mms[22m[39m
     [32m✓[39m detects new direct status write not in allowlist (B-9 regression guard)[32m 0[2mms[22m[39m
     [32m✓[39m B-12 detection: direct node:child_process import in non-seam file is detected (T-09)[32m 0[2mms[22m[39m
     [32m✓[39m B-12 suppression: direct node:child_process import in seam module is suppressed (T-09)[32m 0[2mms[22m[39m
     [32m✓[39m B-6 narrowing: cast-bearing raw-env spawn in agent-runner.ts is detected by narrowed entry (T-09)[32m 0[2mms[22m[39m
     [32m✓[39m 全 resolveGitHubToken 呼び出しに host 引数がある (B-10)[32m 9[2mms[22m[39m
     [32m✓[39m 全 createGitHubClient 呼び出しに baseUrl 引数がある (B-10 adapter host-aware)[32m 10[2mms[22m[39m
     [32m✓[39m B-10 regression guard: resolveGitHubToken without host argument is detected[32m 0[2mms[22m[39m
     [32m✓[39m B-10 regression guard: createGitHubClient without baseUrl argument is detected[32m 0[2mms[22m[39m
     [32m✓[39m src/core/runtime/ に bare 'implements RuntimeStrategy' が存在しない (RealRuntimeStrategy のみ許容)[32m 5[2mms[22m[39m
     [32m✓[39m B-11 regression guard: bare implements RuntimeStrategy (without Real prefix) is detected[32m 0[2mms[22m[39m
     [32m✓[39m B-11: RealRuntimeStrategy is not falsely detected as bare implements[32m 0[2mms[22m[39m
     [32m✓[39m executor.ts に store 永続化 API の直接呼び出しが存在しない[32m 5[2mms[22m[39m
     [32m✓[39m B-13 liveness: commit-orchestrator.ts に store 永続化 API 呼び出しが存在する（grep が vacuous でない）[32m 6[2mms[22m[39m
     [32m✓[39m B-13 regression guard: store 永続化 API 呼び出しが executor.ts にあれば検出される[32m 0[2mms[22m[39m
     [32m✓[39m B-13 parallel: parallel-review-round.ts に store 永続化 API の直接呼び出しが存在しない[32m 5[2mms[22m[39m
     [32m✓[39m B-13 parallel liveness: parallel-review-round.ts が CommitOrchestrator.commitRound で round state を一括 commit する[32m 5[2mms[22m[39m
     [32m✓[39m executor.ts に transitionJob / attachStateAndRethrow の直接呼び出しが存在しない[32m 5[2mms[22m[39m
     [32m✓[39m B-14 liveness: commit-orchestrator.ts に transitionJob / attachStateAndRethrow 呼び出しが存在する[32m 5[2mms[22m[39m
     [32m✓[39m B-14 regression guard: transitionJob 呼び出しが executor.ts にあれば検出される[32m 0[2mms[22m[39m
     [32m✓[39m parallel-review-round.ts に indiscriminate な commitAndPush 呼び出しが存在しない[32m 5[2mms[22m[39m
     [32m✓[39m B-15 liveness: parallel-review-round.ts が partitionRoundChanges で宣言/非宣言を分離する[32m 6[2mms[22m[39m
     [32m✓[39m B-15 regression guard: parallel-review-round に commitAndPush があれば検出される[32m 0[2mms[22m[39m
     [32m✓[39m executor.ts / parallel-review-round.ts に deps フィールドへの代入が存在しない[32m 12[2mms[22m[39m
     [32m✓[39m B-16 regression guard: deps フィールドへの代入があれば検出される[32m 1[2mms[22m[39m
     [32m✓[39m allowReopen: true は reopen.ts 以外の src/ ファイルに存在しない[32m 19[2mms[22m[39m
     [32m✓[39m B-17 regression guard: allowReopen: true を reopen.ts 以外で使うと検出される[32m 1[2mms[22m[39m
     [32m✓[39m B-17: reopen.ts 内の allowReopen: true は違反にならない[32m 0[2mms[22m[39m
     [32m✓[39m src/core/request/ に LLM 系 port / adapter / barrel の import が存在しない[32m 45[2mms[22m[39m
     [32m✓[39m src/core/command/request*.ts に LLM 系 port / adapter / barrel の import が存在しない[32m 50[2mms[22m[39m
     [32m✓[39m src/cli/command-registry.ts に LLM 系 port / adapter の import が存在しない[32m 40[2mms[22m[39m
     [32m✓[39m B-18 regression guard: 入口への LLM 系 import 追加が違反として検出される[32m 0[2mms[22m[39m
[31m     [31m×[31m §3 whitelist に無い import edge は存在しない（allowlist 除外後）[39m[32m 116[2mms[22m[39m
     [32m✓[39m src/kernel/ は import ゼロ（leaf 相当）[32m 10[2mms[22m[39m
     [32m✓[39m detects new forbidden adapter→domain import not in allowlist (DSM regression guard)[32m 0[2mms[22m[39m
     [32m✓[39m detects new forbidden shared-kernel→domain import not in allowlist (DSM regression guard)[32m 0[2mms[22m[39m
     [32m✓[39m Gate 1: 'mirrors commit' string is absent from commit-orchestrator.ts[32m 7[2mms[22m[39m
     [32m✓[39m Gate 2: 'matches commit' string is absent from commit-orchestrator.ts[32m 8[2mms[22m[39m
     [32m✓[39m Gate 3 (liveness): projectSuccess( appears at ≥ 2 non-comment call sites in commit-orchestrator.ts[32m 6[2mms[22m[39m
     [32m✓[39m Gate 4 (liveness): projectSkip( appears at ≥ 2 non-comment call sites in commit-orchestrator.ts[32m 5[2mms[22m[39m
     [32m✓[39m TC-010: grep finds no un-allowlisted process.cwd() in src/ beyond the CWD allowlist[32m 17[2mms[22m[39m
     [32m✓[39m TC-018: CWD allowlist liveness — raw match count in src/ is greater than zero[32m 19[2mms[22m[39m
     [32m✓[39m TC-019: a synthetic process.cwd() occurrence covered by a CWD allowlist entry is suppressed[32m 0[2mms[22m[39m
     [32m✓[39m TC-020: the three converted sites do not appear in the CWD allowlist[32m 0[2mms[22m[39m
     [32m✓[39m CWD regression guard: un-allowlisted process.cwd() in src/ is detected (TC-010 mechanism)[32m 0[2mms[22m[39m
     [32m✓[39m CWD regression guard: a comment line with process.cwd() is NOT flagged[32m 0[2mms[22m[39m
     [32m✓[39m TC-003: resolveRepoRoot* in src/cli/ non-test files is confined to RESOLVE_REPO_ROOT_ALLOWED_FILES[32m 9[2mms[22m[39m
     [32m✓[39m TC-004: no direct git rev-parse --show-toplevel in src/cli/ non-test files[32m 7[2mms[22m[39m
     [32m✓[39m TC-005: resolveRepoRoot liveness — raw match count in src/cli/ is greater than zero[32m 6[2mms[22m[39m
     [32m✓[39m TC-015 regression guard: resolveRepoRoot in src/cli/inbox.ts (not in allowlist) is flagged[32m 0[2mms[22m[39m
     [32m✓[39m TC-015 regression guard: resolveRepoRoot in src/cli/cancel.ts (not in allowlist) is flagged[32m 0[2mms[22m[39m
     [32m✓[39m TC-015 regression guard: resolveRepoRoot in src/cli/ps.ts (in allowlist) is suppressed[32m 0[2mms[22m[39m
     [32m✓[39m TC-004 regression guard: show-toplevel in src/cli/init.ts is detected when present[32m 0[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/agent-runner.test.ts [2m([22m[2m76 tests[22m[2m)[22m[33m 562[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/managed-agent/agent-runner.test.ts [2m([22m[2m55 tests[22m[2m)[22m[33m 359[2mms[22m[39m
 [32m✓[39m tests/unit/step/commit-push-write-scope.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 236[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/agent-runner-rollover.test.ts [2m([22m[2m44 tests[22m[2m)[22m[32m 155[2mms[22m[39m
 [32m✓[39m tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts [2m([22m[2m30 tests[22m[2m | [22m[33m1 skipped[39m[2m)[22m[33m 372[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/spec-observation-autofix.test.ts [2m([22m[2m59 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m src/core/archive/__tests__/merge-then-archive.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 60[2mms[22m[39m
 [31m❯[39m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts [2m([22m[2m36 tests[22m[2m | [22m[31m12 failed[39m[2m)[22m[32m 77[2mms[22m[39m
     [32m✓[39m commitRoundArtifacts is called with declared paths when changed ⊆ declared[32m 9[2mms[22m[39m
     [32m✓[39m commitRoundArtifacts stagePaths = changed ∩ declared (not all declared)[32m 3[2mms[22m[39m
     [32m✓[39m outcome is escalation when undeclared path is in changed[32m 1[2mms[22m[39m
     [32m✓[39m commitRoundArtifacts is NOT called when there are offending paths[32m 1[2mms[22m[39m
     [32m✓[39m state.error records ROUND_NONDECLARED_CHANGE with offending paths[32m 1[2mms[22m[39m
     [32m✓[39m synthetic coordinator StepRun outcome has escalation verdict when offending[32m 1[2mms[22m[39m
     [32m✓[39m state.json, events.jsonl, usage.json in changed → not staged, no halt[32m 1[2mms[22m[39m
     [32m✓[39m commitRoundArtifacts is NOT called when worktree has no changes[32m 1[2mms[22m[39m
     [32m✓[39m all pending members receive roundOwnsGitEffects === true[32m 1[2mms[22m[39m
     [32m✓[39m round completes without error when listWorktreeChanges returns no changed paths[32m 1[2mms[22m[39m
     [32m✓[39m outcome is escalation when inspection returns unavailable[32m 1[2mms[22m[39m
     [32m✓[39m state.error.code is ROUND_INSPECTION_UNAVAILABLE when inspection unavailable[32m 1[2mms[22m[39m
     [32m✓[39m commitRoundArtifacts is NOT called when inspection is unavailable[32m 1[2mms[22m[39m
     [32m✓[39m synthetic coordinator StepRun has escalation verdict and ROUND_INSPECTION_UNAVAILABLE error[32m 1[2mms[22m[39m
     [32m✓[39m member statuses stay pending (not approved) when inspection is unavailable[32m 1[2mms[22m[39m
     [32m✓[39m member statuses stay pending (not approved) when there are undeclared changes[32m 1[2mms[22m[39m
     [32m✓[39m member statuses ARE approved when inspection succeeds (positive control)[32m 1[2mms[22m[39m
[31m     [31m×[31m round does NOT throw when commitRoundArtifacts push fails[39m[32m 17[2mms[22m[39m
[31m     [31m×[31m round outcome is escalation and error.code is ROUND_COMMIT_PUSH_FAILED[39m[32m 2[2mms[22m[39m
[31m     [31m×[31m push-fail commit OID is appended to synthesizedCommits (prevents EGRESS_UNKNOWN_COMMIT on resume)[39m[32m 1[2mms[22m[39m
[31m     [31m×[31m round does NOT throw when backstop rejects before commit[39m[32m 7[2mms[22m[39m
[31m     [31m×[31m backstop rejection: outcome is escalation with ROUND_COMMIT_PUSH_FAILED[39m[32m 1[2mms[22m[39m
[31m     [31m×[31m backstop rejection: pre-existing HEAD is NOT recorded in synthesizedCommits (ledger integrity)[39m[32m 1[2mms[22m[39m
[31m     [31m×[31m round does NOT throw when pre-commit capture is null and backstop rejects[39m[32m 2[2mms[22m[39m
[31m     [31m×[31m null pre-observation + backstop rejection: outcome is escalation[39m[32m 1[2mms[22m[39m
[31m     [31m×[31m null pre-observation + backstop rejection: existing HEAD OID NOT in synthesizedCommits (ledger integrity)[39m[32m 1[2mms[22m[39m
[31m     [31m×[31m null pre-observation + backstop rejection: hint reflects evidence-unavailable (not backstop hint)[39m[32m 1[2mms[22m[39m
[31m     [31m×[31m when both HEAD observations are non-null and differ, commit OID IS recorded in synthesizedCommits[39m[32m 1[2mms[22m[39m
[31m     [31m×[31m when both HEAD observations are non-null and differ, outcome is escalation (push failed)[39m[32m 4[2mms[22m[39m
     [32m✓[39m excluded path in worktreeChanges + stagingExcludePatterns → outcome is approved (not escalation)[32m 1[2mms[22m[39m
     [32m✓[39m commitRoundArtifacts called with declared paths only (excluded path NOT staged)[32m 2[2mms[22m[39m
     [32m✓[39m regression guard: same excluded path WITHOUT stagingExcludePatterns → escalation (ROUND_NONDECLARED_CHANGE)[32m 1[2mms[22m[39m
     [32m✓[39m regression guard: protected canon path in worktreeChanges + matching exclusion → still escalation (ROUND_NONDECLARED_CHANGE)[32m 1[2mms[22m[39m
     [32m✓[39m regression guard: undeclared review-feedback-*.md matching 'specrunner/changes/**' exclusion → still ROUND_NONDECLARED_CHANGE[32m 1[2mms[22m[39m
     [32m✓[39m regression guard: undeclared *-result-*.md matching 'specrunner/changes/**' exclusion → still ROUND_NONDECLARED_CHANGE[32m 1[2mms[22m[39m
     [32m✓[39m declared *-result-*.md bypasses exclusion and IS committed (positive control — member must write its declared result)[32m 1[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor.test.ts [2m([22m[2m27 tests[22m[2m)[22m[33m 379[2mms[22m[39m
 [32m✓[39m tests/unit/core/archive/orchestrator.test.ts [2m([22m[2m26 tests[22m[2m)[22m[33m 306[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/scope-escalation.test.ts [2m([22m[2m62 tests[22m[2m)[22m[33m 503[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts [2m([22m[2m85 tests[22m[2m)[22m[33m 365[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/test-case-gen-design-phase.test.ts [2m([22m[2m49 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/spec-review-fixer-routing.test.ts [2m([22m[2m47 tests[22m[2m)[22m[32m 46[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/verdict-channel-unification.test.ts [2m([22m[2m102 tests[22m[2m)[22m[32m 139[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/local.test.ts [2m([22m[2m42 tests[22m[2m)[22m[33m 659[2mms[22m[39m
 [32m✓[39m tests/unit/cli/repo-root-exactly-once.test.ts [2m([22m[2m49 tests[22m[2m)[22m[33m 3101[2mms[22m[39m
     [33m[2m✓[22m[39m TC-024: COMMANDS.init has requiresRepo: true [33m 2399[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/commit-orchestrator-rollover.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 136[2mms[22m[39m
 [32m✓[39m tests/pipeline-integration.test.ts [2m([22m[2m31 tests[22m[2m)[22m[33m 5099[2mms[22m[39m
     [33m[2m✓[22m[39m returns status='awaiting-merge', steps['spec-review'] has 1 element with verdict=approved, no spec-fixer steps [33m 1314[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/post-fix-context.test.ts [2m([22m[2m39 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m tests/unit/step/factcheck-attestation.test.ts [2m([22m[2m84 tests[22m[2m)[22m[33m 581[2mms[22m[39m
 [32m✓[39m tests/core/pipeline/pipeline.test.ts [2m([22m[2m16 tests[22m[2m)[22m[33m 308[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/github-client-pr.test.ts [2m([22m[2m57 tests[22m[2m)[22m[32m 45[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/commit-push-exclusion.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 127[2mms[22m[39m
 [32m✓[39m tests/unit/step/pipeline-sole-committer-synthesis.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 120[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/spec-review-prior-round-context.test.ts [2m([22m[2m30 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/executor-no-op.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 63[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/checkpoint-restack.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 43[2mms[22m[39m
 [32m✓[39m src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts [2m([22m[2m354 tests[22m[2m)[22m[32m 74[2mms[22m[39m
 [31m❯[39m tests/custom-reviewers-e2e.test.ts [2m([22m[2m14 tests[22m[2m | [22m[31m1 failed[39m[2m)[22m[33m 2379[2mms[22m[39m
     [33m[2m✓[22m[39m security reviewer runs after code-review and pipeline completes [33m 494[2mms[22m[39m
     [32m✓[39m security then perf reviewers both run in order[32m 132[2mms[22m[39m
     [32m✓[39m code-fixer goes back to security reviewer after needs-fix[32m 179[2mms[22m[39m
     [32m✓[39m pipeline without reviewers completes with standard code-review only[32m 131[2mms[22m[39m
     [32m✓[39m reviewer with maxIterations=1 exhausts after 1 needs-fix, independent of code-review budget[32m 110[2mms[22m[39m
     [32m✓[39m code-fixer receives findings attributed to the active reviewer (unit check)[32m 235[2mms[22m[39m
     [32m✓[39m reviewers from state.reviewers are used, not re-loaded from disk[32m 138[2mms[22m[39m
     [32m✓[39m ok=false from custom reviewer escalates to awaiting-resume[32m 68[2mms[22m[39m
     [32m✓[39m escalates when custom reviewer finding references a file that does not exist[32m 160[2mms[22m[39m
     [32m✓[39m regression-gate reports high/fixable → code-fixer → gate re-runs → approved → conformance[32m 245[2mms[22m[39m
     [32m✓[39m decision-needed from regression-gate escalates to awaiting-resume[32m 92[2mms[22m[39m
     [32m✓[39m regression-gate with maxIterations=1 exhausts after budget[32m 204[2mms[22m[39m
     [32m✓[39m coordinator skips approved reviewer and runs only the pending reviewer[32m 156[2mms[22m[39m
[31m     [31m×[31m coordinator invalidates approved reviewer whose activation paths were touched by fixer[39m[32m 32[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 163[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/test-coverage.test.ts [2m([22m[2m58 tests[22m[2m)[22m[32m 173[2mms[22m[39m
 [32m✓[39m tests/adapter/managed-agent/agent-runner.test.ts [2m([22m[2m41 tests[22m[2m)[22m[32m 79[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/custom-reviewer-round-context.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/commit-push-egress-invariant.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 116[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.transitions.test.ts [2m([22m[2m71 tests[22m[2m)[22m[33m 388[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/runner-fidelity-gate.test.ts [2m([22m[2m19 tests[22m[2m)[22m[33m 417[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/adr-gen.test.ts [2m([22m[2m51 tests[22m[2m)[22m[32m 52[2mms[22m[39m
 [32m✓[39m tests/store/event-journal.test.ts [2m([22m[2m37 tests[22m[2m)[22m[32m 118[2mms[22m[39m
 [32m✓[39m tests/unit/core/decision/wontfix.test.ts [2m([22m[2m45 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/job-wait.test.ts [2m([22m[2m32 tests[22m[2m)[22m[32m 53[2mms[22m[39m
 [32m✓[39m tests/core/worktree/manager.test.ts [2m([22m[2m40 tests[22m[2m)[22m[32m 72[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/guide.test.ts [2m([22m[2m189 tests[22m[2m)[22m[32m 72[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/resume-operator-guidance.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 51[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/commit-orchestrator-context-metrics.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 100[2mms[22m[39m
 [32m✓[39m tests/package-smoke-contract.test.ts [2m([22m[2m63 tests[22m[2m)[22m[32m 137[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/resume-adopt-commits.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 74[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor.commit.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 224[2mms[22m[39m
 [32m✓[39m tests/unit/core/cancel/runner.test.ts [2m([22m[2m39 tests[22m[2m)[22m[33m 475[2mms[22m[39m
 [32m✓[39m tests/unit/step/commit-and-push.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 210[2mms[22m[39m
 [32m✓[39m tests/unit/no-worktree-mode.test.ts [2m([22m[2m26 tests[22m[2m)[22m[33m 799[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/runner.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 279[2mms[22m[39m
 [32m✓[39m tests/store/job-state-store.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 109[2mms[22m[39m
 [32m✓[39m tests/unit/step/review-exit-contract.test.ts [2m([22m[2m33 tests[22m[2m)[22m[32m 84[2mms[22m[39m
 [32m✓[39m tests/unit/core/prune/sidecar-runner.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.reverification.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 363[2mms[22m[39m
 [31m❯[39m tests/unit/step/unpushable-path-escalation.test.ts [2m([22m[2m25 tests[22m[2m | [22m[31m3 failed[39m[2m)[22m[32m 186[2mms[22m[39m
     [32m✓[39m TC-014: executor gate does NOT halt when validateStepOutputs would return unpushable-path violation[32m 32[2mms[22m[39m
     [32m✓[39m TC-014: validateStepOutputs is NOT called when only unpushable-path contracts are declared[32m 16[2mms[22m[39m
     [32m✓[39m TC-014: step succeeds (step run recorded) when only unpushable-path violations would be present[32m 27[2mms[22m[39m
     [32m✓[39m TC-035: produced halt violation produces STEP_OUTPUT_MISSING error code[32m 22[2mms[22m[39m
     [32m✓[39m TC-035: makeUnpushablePathHalt is NOT called for non-unpushable violations[32m 33[2mms[22m[39m
     [32m✓[39m TC-036: halt hint mentions matched paths[32m 2[2mms[22m[39m
     [32m✓[39m TC-036: halt hint mentions the environment constraint[32m 1[2mms[22m[39m
     [32m✓[39m TC-036: halt hint mentions resume (operator action)[32m 1[2mms[22m[39m
     [32m✓[39m TC-036: halt hint states that changes remain uncommitted in the worktree[32m 1[2mms[22m[39m
     [32m✓[39m TC-036: halt is awaiting-resume kind[32m 1[2mms[22m[39m
     [32m✓[39m halt error code is UNPUSHABLE_PATH_BLOCKED[32m 1[2mms[22m[39m
     [32m✓[39m halt history label contains 'unpushable-path-blocked'[32m 1[2mms[22m[39m
     [32m✓[39m halt interruption reason is 'failure'[32m 1[2mms[22m[39m
[31m     [31m×[31m TC-037: throws UNPUSHABLE_PATH_BLOCKED when workflow file is in publishable set[39m[32m 16[2mms[22m[39m
     [32m✓[39m TC-015: no push git command when workflow file is in publishable set[32m 4[2mms[22m[39m
     [32m✓[39m TC-015: no commit git command when workflow file is in publishable set[32m 3[2mms[22m[39m
[31m     [31m×[31m TC-016: error message contains the matched path and environment constraint[39m[32m 3[2mms[22m[39m
     [32m✓[39m TC-018: non-matching path allows commit/push to proceed (no backstop throw)[32m 3[2mms[22m[39m
     [32m✓[39m TC-017: no pushCapability → collectPublishablePaths git commands not called[32m 4[2mms[22m[39m
     [32m✓[39m factory returns an UnpushablePathBlockedError instance[32m 1[2mms[22m[39m
     [32m✓[39m matchedPaths property carries the exact paths passed to the factory[32m 1[2mms[22m[39m
     [32m✓[39m matchedPaths is the typed array, not derived from regex-parsing message[32m 1[2mms[22m[39m
     [32m✓[39m error code is UNPUSHABLE_PATH_BLOCKED[32m 1[2mms[22m[39m
     [32m✓[39m instanceof check works for executor's UNPUSHABLE_PATH_BLOCKED branch[32m 1[2mms[22m[39m
[31m     [31m×[31m executor receives matchedPaths directly (finalizeErr instanceof UnpushablePathBlockedError)[39m[32m 7[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/step-completion-missing-file-finding.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/spec-fixer-tasks-md-writable.test.ts [2m([22m[2m32 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m tests/adapter/codex/agent-runner.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 97[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/resume-partial-canon.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 161[2mms[22m[39m
 [32m✓[39m tests/unit/inbox/planner.test.ts [2m([22m[2m61 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m tests/unit/inbox/orchestrator.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 60[2mms[22m[39m
 [32m✓[39m src/core/archive/__tests__/orchestrator.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m tests/halt-checkpoint-restack-e2e.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 1434[2mms[22m[39m
     [33m[2m✓[22m[39m pushes restacked checkpoint to origin when direct push is rejected [33m 618[2mms[22m[39m
     [33m[2m✓[22m[39m commitFinalState resolves without throwing when all pushes (direct + restack) are rejected [33m 378[2mms[22m[39m
     [33m[2m✓[22m[39m restack skips with remote-diverged when origin/<branch> has been advanced by another runner [33m 435[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/fixer-push-capability.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m tests/unit/step/test-coverage-violation-detail.test.ts [2m([22m[2m19 tests[22m[2m | [22m[90m2 todo[39m[2m)[22m[32m 87[2mms[22m[39m
 [32m✓[39m tests/unit/core/archive/achieved-assurance-revision-binding-integration.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 181[2mms[22m[39m
 [32m✓[39m tests/unit/core/job-list/operations-view.test.ts [2m([22m[2m48 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/reviewer-chain.test.ts [2m([22m[2m56 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m tests/unit/step/severity-fixability-split.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/parallel-review-round-canon.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m tests/resume-worktree-reconciliation-e2e.test.ts [2m([22m[2m8 tests[22m[2m)[22m[33m 836[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/reopen-command.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.conformance-routing.test.ts [2m([22m[2m9 tests[22m[2m)[22m[33m 414[2mms[22m[39m
 [32m✓[39m src/core/design-layer/__tests__/topic-emission.test.ts [2m([22m[2m36 tests[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/job-stats.test.ts [2m([22m[2m39 tests[22m[2m)[22m[32m 137[2mms[22m[39m
 [32m✓[39m tests/attach/verify-checkpoint.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/core/archive/__tests__/plain-archive.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m tests/core/provider-readiness-gate.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 65[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/changed-line-coverage-type-only.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 76[2mms[22m[39m
 [31m❯[39m tests/pipeline-sole-committer-e2e.test.ts [2m([22m[2m4 tests[22m[2m | [22m[31m2 failed[39m[2m)[22m[33m 368[2mms[22m[39m
     [32m✓[39m src/secret.ts を事前 stage しても checkpoint / finalize commit に含まれない[32m 129[2mms[22m[39m
     [32m✓[39m pipeline 管理パス（state.json）は finalize commit に含まれる（正常系検証）[32m 104[2mms[22m[39m
[31m     [31m×[31m reviewer が自己 commit した場合、escalation halt し HEAD が reset される[39m[32m 73[2mms[22m[39m
[31m     [31m×[31m reviewer が commit しなければ round は正常に進む（非 escalation）[39m[32m 59[2mms[22m[39m
 [32m✓[39m tests/reviewer-activation-e2e.test.ts [2m([22m[2m9 tests[22m[2m)[22m[33m 1126[2mms[22m[39m
 [32m✓[39m tests/unit/core/notify/issue-notifier.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m tests/unit/cli/command-spec-api.test.ts [2m([22m[2m94 tests[22m[2m)[22m[32m 129[2mms[22m[39m
 [32m✓[39m src/git/__tests__/transport-auth.test.ts [2m([22m[2m44 tests[22m[2m)[22m[32m 52[2mms[22m[39m
 [32m✓[39m tests/unit/step/content-format-detection.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 151[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/commit-orchestrator.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m tests/unit/core/attestation/build-attestation.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/request.test.ts [2m([22m[2m41 tests[22m[2m)[22m[32m 166[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.episode-reset.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 213[2mms[22m[39m
 [32m✓[39m tests/unit/pipeline/transition-when.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 68[2mms[22m[39m
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
 [32m✓[39m src/core/command/__tests__/detach-ack.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/context-observer.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/lineage-output-attribution.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/agent-runner-context-metrics.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 105[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/findings-ledger.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/dead-code-adapter-cli.test.ts [2m([22m[2m75 tests[22m[2m)[22m[33m 5950[2mms[22m[39m
     [33m[2m✓[22m[39m assertBreakAfterCompletion has no references [33m 503[2mms[22m[39m
     [33m[2m✓[22m[39m REPORT_TOOL_CUSTOM_TOOL_SPEC has no references [33m 455[2mms[22m[39m
     [33m[2m✓[22m[39m checkConfigComplete has no references [33m 363[2mms[22m[39m
     [33m[2m✓[22m[39m MANAGED_RESET_USAGE has no references [33m 464[2mms[22m[39m
     [33m[2m✓[22m[39m runManagedAgentSession has no references in src/ bin/ tests/ [33m 423[2mms[22m[39m
     [33m[2m✓[22m[39m ManagedAgentSessionInput has no references in src/ bin/ tests/ [33m 391[2mms[22m[39m
     [33m[2m✓[22m[39m ManagedAgentSessionResult has no references in src/ bin/ tests/ [33m 327[2mms[22m[39m
     [33m[2m✓[22m[39m session-runner string has no references in src/ bin/ tests/ [33m 432[2mms[22m[39m
     [33m[2m✓[22m[39m isResultMessage has no references in src/ bin/ tests/ [33m 410[2mms[22m[39m
     [33m[2m✓[22m[39m isTextDelta has no references in src/ bin/ tests/ [33m 329[2mms[22m[39m
     [33m[2m✓[22m[39m no file in src/ bin/ tests/ references checkConfigComplete [33m 555[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline-roles.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 78[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/judge-verdict-canon.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/config/schema.test.ts [2m([22m[2m69 tests[22m[2m)[22m[32m 56[2mms[22m[39m
 [31m❯[39m tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts [2m([22m[2m4 tests[22m[2m | [22m[31m3 failed[39m[2m)[22m[32m 117[2mms[22m[39m
[31m     [31m×[31m fan-out 後に HEAD が前進していれば escalation halt し、ROUND_HEAD_ADVANCED コードが設定される[39m[32m 34[2mms[22m[39m
[31m     [31m×[31m HEAD が前進していなければ round は現行の verdict 算出に進む[39m[32m 6[2mms[22m[39m
[31m     [31m×[31m HEAD 前進が違反として検出された時、退避ファイルが .specrunner/local/<slug>/ に生成される[39m[32m 71[2mms[22m[39m
     [32m✓[39m [DESTRUCTION CONFIRMATION] HEAD guard 未実装の現在は、HEAD 前進が検出されず outcome が escalation にならない[32m 2[2mms[22m[39m
 [32m✓[39m tests/attach/attach-integration.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 2043[2mms[22m[39m
     [33m[2m✓[22m[39m checkpointOid from runAttachVerification matches the commit OID that commitFinalState pushed [33m 346[2mms[22m[39m
     [33m[2m✓[22m[39m worktree HEAD is the pre-advance OID even when origin branch moved after runAttachVerification [33m 355[2mms[22m[39m
 [32m✓[39m tests/unit/dead-code-core.test.ts [2m([22m[2m124 tests[22m[2m)[22m[33m 1420[2mms[22m[39m
 [32m✓[39m tests/error-path-integration.test.ts [2m([22m[2m6 tests[22m[2m)[22m[33m 727[2mms[22m[39m
     [33m[2m✓[22m[39m verification with mixed phase results (build ok, test fail) routes to implementer recovery [33m 324[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/commit-push-guarded-staging.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 73[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/query-one-shot.test.ts [2m([22m[2m23 tests[22m[2m)[22m[32m 93[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.build-fixer-reentry.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 125[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/agent-runner-report-settles.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 51[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/commit-push-staged-bytes-guard.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 47[2mms[22m[39m
 [32m✓[39m tests/operator-canon-apply-on-resume-e2e.test.ts [2m([22m[2m11 tests[22m[2m)[22m[33m 771[2mms[22m[39m
 [32m✓[39m tests/attach/attach-resume-e2e.test.ts [2m([22m[2m1 test[22m[2m)[22m[33m 693[2mms[22m[39m
     [33m[2m✓[22m[39m Machine A creates awaiting-resume checkpoint on origin; Machine B attaches and resumes implementer via real ResumeCommand [33m 691[2mms[22m[39m
 [32m✓[39m tests/unit/core/archive/merge-then-archive-floor.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 178[2mms[22m[39m
 [32m✓[39m tests/canon-binding-e2e.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 629[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/fast-scope-checkpoint.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 290[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/reverification.test.ts [2m([22m[2m37 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/from-issue.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m tests/init.test.ts [2m([22m[2m30 tests[22m[2m)[22m[33m 889[2mms[22m[39m
     [33m[2m✓[22m[39m TC-001: COMMANDS.init.requiresRepo === true（dispatch レベルで repo 必須が宣言されている） [33m 637[2mms[22m[39m
 [32m✓[39m tests/unit/core/archive/achieved-assurance-revision-binding-unit.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/unit/state/lifecycle.test.ts [2m([22m[2m105 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m tests/config/step-config.test.ts [2m([22m[2m36 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/agent-runner-port.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 122[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 97[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/runner-integrity.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 181[2mms[22m[39m
 [32m✓[39m tests/unit/step/code-fixer.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/resume-reconcile.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 73[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/finding-recency.test.ts [2m([22m[2m23 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/prior-round-context.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/job-stats-metrics.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 107[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-verdict.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 184[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/resume-apply-canon.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 89[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/agent-runner-timeout-last-tool.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 60[2mms[22m[39m
 [32m✓[39m tests/unit/core/archive/achieved-assurance-completeness-integration.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 160[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/github-client-request.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m tests/unit/step/write-scope-bypass-closure-integration.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 530[2mms[22m[39m
 [32m✓[39m tests/resume-partial-canon-quarantine-e2e.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 563[2mms[22m[39m
 [32m✓[39m tests/unit/core/archive/achieved-assurance-completeness-unit.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/anthropic-step-model-refresh.test.ts [2m([22m[2m36 tests[22m[2m)[22m[32m 122[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.cli-step-output.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 76[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/test-coverage-gate-exclusion.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 94[2mms[22m[39m
 [32m✓[39m tests/unit/architecture/write-scope-invariants.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 189[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-activation.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 260[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/lockfile-sync.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 75[2mms[22m[39m
 [32m✓[39m src/core/issue-target/__tests__/resume.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m tests/unit/cli/managed.test.ts [2m([22m[2m21 tests[22m[2m)[22m[33m 428[2mms[22m[39m
     [33m[2m✓[22m[39m returns exit code 1 when SPECRUNNER_API_KEY is not set [33m 304[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/runner.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 190[2mms[22m[39m
 [32m✓[39m tests/unit/step/pr-create.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 104[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/runner-reload-egress-e2e.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 567[2mms[22m[39m
     [33m[2m✓[22m[39m reloadJobState returns state with bootstrap OID; verifyEgressLedger passes [33m 329[2mms[22m[39m
 [32m✓[39m tests/unit/cli/progress.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m tests/unit/core/occupancy/guard.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/changed-line-coverage.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 112[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 50[2mms[22m[39m
 [32m✓[39m tests/completion.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 100[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/runner-reload-after-setup.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 59[2mms[22m[39m
 [32m✓[39m tests/unit/cli/job-show.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 109[2mms[22m[39m
 [32m✓[39m src/core/lifecycle/__tests__/exit-guard.test.ts [2m([22m[2m16 tests[22m[2m)[22m[33m 841[2mms[22m[39m
 [32m✓[39m tests/core/pipeline/pipeline.guard-halt.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 83[2mms[22m[39m
 [32m✓[39m tests/unit/architecture/value-import-scc.test.ts [2m([22m[2m23 tests[22m[2m)[22m[33m 1086[2mms[22m[39m
     [33m[2m✓[22m[39m no strongly-connected components with size > 1 exist in src/ [33m 1030[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/resume-from-issue.test.ts [2m([22m[2m30 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m tests/finish-ps-integration.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 94[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/read-file-at-commit.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/reviewer-status-canon.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m src/store/__tests__/event-journal-checkpoint-restack.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/reviewer-status.test.ts [2m([22m[2m42 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/bootstrap-egress-ledger-wm.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 71[2mms[22m[39m
 [32m✓[39m tests/dedup-verified-safe.test.ts [2m([22m[2m24 tests[22m[2m)[22m[33m 2961[2mms[22m[39m
     [33m[2m✓[22m[39m TC-005: 'computeCodeReviewIteration' call/definition is absent from src/ and tests/ [33m 493[2mms[22m[39m
     [33m[2m✓[22m[39m TC-005: 'computeSpecReviewIteration' call/definition is absent from src/ and tests/ [33m 538[2mms[22m[39m
     [33m[2m✓[22m[39m TC-005: 'computeRequestReviewIteration' call/definition is absent from src/ and tests/ [33m 715[2mms[22m[39m
     [33m[2m✓[22m[39m TC-005: 'computeConformanceIteration' call/definition is absent from src/ and tests/ [33m 457[2mms[22m[39m
     [33m[2m✓[22m[39m TC-012: no file in tests/ contains standalone PROBE_SLUG [33m 312[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/executor-verdict.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 177[2mms[22m[39m
 [32m✓[39m tests/pipeline.test.ts [2m([22m[2m8 tests[22m[2m)[22m[33m 446[2mms[22m[39m
     [33m[2m✓[22m[39m records all required history steps on success [33m 320[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/executor.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 150[2mms[22m[39m
 [32m✓[39m tests/unit/step/unpushable-path-contract.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/resolve-scope.test.ts [2m([22m[2m44 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m tests/adapter/claude-code/provider-readiness-probe.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/managed.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 119[2mms[22m[39m
 [32m✓[39m src/core/inbox/__tests__/run-inbox.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m tests/unit/contract/agent-runner-contracts.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 78[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/archive-from-issue.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/unit/core/port/report-result-findings.test.ts [2m([22m[2m47 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/custom-reviewer-step.test.ts [2m([22m[2m23 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/commit-scoped-paths.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 57[2mms[22m[39m
 [32m✓[39m tests/unit/util/detect-pm.test.ts [2m([22m[2m44 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/unit/step/code-review.test.ts [2m([22m[2m33 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-output-gate.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 218[2mms[22m[39m
 [32m✓[39m tests/unit/config/schema.test.ts [2m([22m[2m51 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/apply-canon.test.ts [2m([22m[2m19 tests[22m[2m)[22m[33m 373[2mms[22m[39m
 [32m✓[39m tests/spec-review-step.test.ts [2m([22m[2m8 tests[22m[2m)[22m[33m 342[2mms[22m[39m
 [32m✓[39m tests/unit/core/decision/decision-ledger.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/step/step-io-contracts.test.ts [2m([22m[2m76 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/apply-canon-provenance.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/prompts/__tests__/fragment-coverage.test.ts [2m([22m[2m125 tests[22m[2m)[22m[32m 46[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/adopt-commits.test.ts [2m([22m[2m17 tests[22m[2m)[22m[33m 737[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/result-yaml-ownership.test.ts [2m([22m[2m35 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/step/output-verify.test.ts [2m([22m[2m42 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/executor-sequential-regression.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 46[2mms[22m[39m
 [32m✓[39m tests/unit/git/push-capability.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/shared/artifact-bundle.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 74[2mms[22m[39m
 [32m✓[39m tests/unit/state/pipeline-sole-committer-state.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/absorb-build-fixer/pipeline-exhaustion.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 90[2mms[22m[39m
 [32m✓[39m src/core/port/__tests__/evidence-enforcement.test.ts [2m([22m[2m35 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/config/runtime-config.test.ts [2m([22m[2m26 tests[22m[2m)[22m[33m 381[2mms[22m[39m
 [32m✓[39m tests/adapter/codex/strict-schema.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/pipeline-run-input-completeness.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 65[2mms[22m[39m
 [32m✓[39m src/state/__tests__/artifact-observability.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/staging-containment.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/test-coverage-manual-exclusion.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 84[2mms[22m[39m
 [32m✓[39m tests/unit/cli/resume.test.ts [2m([22m[2m14 tests[22m[2m)[22m[33m 1991[2mms[22m[39m
     [33m[2m✓[22m[39m runs pipeline and returns exit code 0 when job is awaiting-resume [33m 597[2mms[22m[39m
 [32m✓[39m tests/unit/runtime/validate-step-outputs.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 102[2mms[22m[39m
 [32m✓[39m tests/unit/util/copy-artifacts.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 95[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/login.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/step-context-builder.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/staged-bytes-containment.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/exclusion-aware-validation.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/core/archive/__tests__/workflow-ci-detection.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/reconcile-worktree.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m tests/credentials.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 95[2mms[22m[39m
 [32m✓[39m src/adapter/codex/__tests__/completion-contract-injection.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 45[2mms[22m[39m
 [32m✓[39m tests/unit/absorb-build-fixer/implementer-recovery.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/judge-verdict.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/spec-review-scope-exclusion.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 57[2mms[22m[39m
 [32m✓[39m tests/unit/step/staging-exclusion-pipeline-integration.test.ts [2m([22m[2m2 tests[22m[2m)[22m[33m 332[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/git-command-classifier.test.ts [2m([22m[2m94 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/executor-drift-detection.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 69[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/resume.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 80[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/conformance.test.ts [2m([22m[2m51 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/signal-name-in-interruption.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 77[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/round-git-scope.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/agent-runner-inactivity-timeout.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 91[2mms[22m[39m
 [32m✓[39m tests/core/step/step-interface.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 61[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/capability-consumers.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/cli-stdout-snapshot.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 58[2mms[22m[39m
 [32m✓[39m tests/templates/step-output-templates.test.ts [2m([22m[2m48 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-no-op.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 90[2mms[22m[39m
 [32m✓[39m src/core/issue-target/__tests__/archive.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 19[2mms[22m[39m
Detached pipeline started for: my-slug
  Monitor: specrunner job wait my-slug
  Details: specrunner job show my-slug
Detached pipeline started for: my-slug
  Monitor: specrunner job wait my-slug
  Details: specrunner job show my-slug
Detached pipeline started for: my-slug
  Monitor: specrunner job wait my-slug
  Details: specrunner job show my-slug
Detached pipeline started for: my-slug
  Monitor: specrunner job wait my-slug
  Details: specrunner job show my-slug
Detached pipeline started for: my-slug
  Monitor: specrunner job wait my-slug
  Details: specrunner job show my-slug
 [32m✓[39m src/core/command/__tests__/detach.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/unit/cli/doctor-repo-root.test.ts [2m([22m[2m6 tests[22m[2m)[22m[33m 560[2mms[22m[39m
     [33m[2m✓[22m[39m runDoctor with extended opts { repoRoot: null } completes and returns non-zero exit code [33m 425[2mms[22m[39m
 [32m✓[39m src/adapter/codex/__tests__/scope-guidance-injection.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 47[2mms[22m[39m
 [32m✓[39m tests/finish-job-state.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 94[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/parallel-review-round-state-commit.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/judge-verdict-evidence.test.ts [2m([22m[2m30 tests[22m[2m)[22m[32m 129[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/absorb-test-materialize-transitions.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/core/usage/usage-summary.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m src/core/inbox/__tests__/planner.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/verification-phase-outcome-executor.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 61[2mms[22m[39m
 [32m✓[39m tests/unit/core/port/report-result-observations.test.ts [2m([22m[2m30 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/sandbox-scope.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-input-validation.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 59[2mms[22m[39m
 [32m✓[39m tests/attach/checkpoint-policy.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/step/fixer-findings.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-resume-context.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 99[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/managed-runtime-capabilities.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/findings-ledger-canon.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/resume-wontfix.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.notification.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/adapter/codex/agent-runner-transient-retry.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m tests/unit/core/cancel/runner-process-gate.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 157[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/rules-new.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 127[2mms[22m[39m
 [32m✓[39m tests/unit/store/finding-recency-journal.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m tests/unit/step/write-scope.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/unit/core/request/store.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 97[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-drift-detection.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 94[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/pipeline-run-gate.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 55[2mms[22m[39m
 [32m✓[39m tests/state-store.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 176[2mms[22m[39m
 [32m✓[39m tests/unit/core/gate/issue-fidelity-gate.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/safety.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/absorb-build-fixer/transitions.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/store/__tests__/event-journal-operator-event.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/unit/core/design-layer/orchestrator-hook.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 165[2mms[22m[39m
 [32m✓[39m tests/unit/core/sidecar/orphan.test.ts [2m([22m[2m23 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m tests/attach/orchestrator.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m tests/bootstrap-egress-ledger-e2e.test.ts [2m([22m[2m6 tests[22m[2m)[22m[33m 336[2mms[22m[39m
 [32m✓[39m tests/unit/pipeline/transition-parity.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/runner-coverage-gate.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 77[2mms[22m[39m
 [32m✓[39m tests/state/helpers.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/parser.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/executor-cli-entry-oid.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 55[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/canon-write-scope.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 181[2mms[22m[39m
 [32m✓[39m src/util/__tests__/spawn-background-detach.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/runner-lockfile-gate.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 94[2mms[22m[39m
 [32m✓[39m tests/core/usage/pricing.test.ts [2m([22m[2m36 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/local-read-revision-content.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m tests/store/journal-integrity.test.ts [2m([22m[2m23 tests[22m[2m)[22m[32m 65[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/resume-from-exit-code.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/core/resume/resolve-step.test.ts [2m([22m[2m44 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/adapter/codex/__tests__/agent-runner-completion-report.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m tests/prompts/design-system.test.ts [2m([22m[2m44 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/adapter/codex/scope-guidance-provider-isolation.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 190[2mms[22m[39m
 [32m✓[39m src/git/__tests__/push-capability.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/touched-files-recorder.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/local-power-assertion.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 119[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/main-checkout-guard.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 113[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/parallel-review-round-resume.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/type-only.test.ts [2m([22m[2m52 tests[22m[2m)[22m[32m 20[2mms[22m[39m
No jobs found.
[実行中]
JOB_ID	SLUG	STEP	STATUS	NEXT	AGE
job-run-	slug-job-run-1	init	running (stale?)	job resume slug-job-run-1	241d
{
  "categories": []
}
 [32m✓[39m tests/unit/cli/ps-filter.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m tests/unit/inbox/occupancy-propagation.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-commit-mutex.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 136[2mms[22m[39m
 [32m✓[39m tests/unit/cli/flag-parser.test.ts [2m([22m[2m39 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/resume-operator-adjudication.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/config/__tests__/staging-config-validation.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m tests/unit/core/worktree/orphan.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/pipeline-sole-committer-final-state.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/agent-runner-invocation-metrics.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 63[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/commit-push-restack-integration.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/cli/removed-commands.test.ts [2m([22m[2m16 tests[22m[2m)[22m[33m 1566[2mms[22m[39m
     [33m[2m✓[22m[39m specrunner ps → 'Unknown command: ps' を出力し exit 2 で終了 [33m 512[2mms[22m[39m
 [32m✓[39m tests/unit/state/satisfies-floor.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/select-pending-revision-binding.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/core/archive/__tests__/post-merge-integrity.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/util/gitignore.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 63[2mms[22m[39m
 [32m✓[39m tests/unit/generate-chain-removed.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 88[2mms[22m[39m
 [32m✓[39m tests/error-codes.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 203[2mms[22m[39m
 [32m✓[39m tests/unit/core/resume/safety.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/compose-reviewers.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m tests/dispatch-workflow-reopen-action.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m tests/unit/pipeline/descriptor-input-completeness.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/routed-findings.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/adapter/managed-agent/__tests__/prompt-rules-injection.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/core/doctor/orphan-sidecars-check.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/cli/hint-command-references.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 72[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/usage-show-context-metrics.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 61[2mms[22m[39m
 [32m✓[39m tests/unit/agent/syncer.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/logger/__tests__/pipeline-logger.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/pipeline-run-reviewer-snapshot.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/commit-orchestrator-touched-files.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/resume-hard-crash.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/scope-warning.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/conformance-revision-binding.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/post-work-prompt-invariant.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.storeFactory.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/parser/extract-section.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/workspace-materializer-link.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/executor-round-produce.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 48[2mms[22m[39m
 [32m✓[39m tests/unit/cli/request-new-repo-root.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 921[2mms[22m[39m
     [33m[2m✓[22m[39m exits with code 2 when there is no git repository (repoRoot is null) [33m 607[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/canon-escalation.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/local-no-jobs-dir-writes.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 253[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/verify-finding-refs.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 48[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/reopen-approval-invalidation.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/reconcile-worktree-exclusion.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 56[2mms[22m[39m
 [32m✓[39m src/state/__tests__/operator-adjudication-schema.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/doctor/next-steps.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 50[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/run-result.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-skip-when.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 111[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/commit-orchestrator-usage-metrics.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 61[2mms[22m[39m
 [32m✓[39m tests/unit/runtime/unpushable-path-validate.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m tests/unit/cli/resume-help.test.ts [2m([22m[2m20 tests[22m[2m)[22m[33m 1629[2mms[22m[39m
     [33m[2m✓[22m[39m TC-007: job resume --help で exit 0 [33m 495[2mms[22m[39m
 [32m✓[39m tests/unit/core/archive/archive-cleanup.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/config/store.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 81[2mms[22m[39m
 [32m✓[39m src/core/port/__tests__/report-result.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m tests/unit/cli/prune-combined.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/runtime-capability-gate.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-lifecycle-ordering.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 60[2mms[22m[39m
 [32m✓[39m tests/unit/core/cancel/sidecar-teardown.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 97[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/detach-output-contract.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/test-gen-exemption.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/core/steps/spec-review.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 81[2mms[22m[39m
 [32m✓[39m tests/unit/step/pipeline-sole-committer-egress.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/core/lifecycle/exit-guard.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 392[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/resume-member-context.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/runtime/validate-step-inputs.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 78[2mms[22m[39m
 [32m✓[39m src/store/__tests__/job-state-store-list-with-source-dirs.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 48[2mms[22m[39m
 [32m✓[39m src/core/reviewers/__tests__/load-validate.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/regression-gate-false-loop.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/artifact-bundle-injection.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 309[2mms[22m[39m
 [32m✓[39m src/adapter/codex/__tests__/agent-runner-timeout-last-tool.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/bootstrap-egress-ledger-managed.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 92[2mms[22m[39m
 [32m✓[39m tests/dispatch-workflow-archive-action.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/unit/cli/specrunner-resume-dispatch.test.ts [2m([22m[2m13 tests[22m[2m)[22m[33m 1621[2mms[22m[39m
     [33m[2m✓[22m[39m calls runResume with the slug argument [33m 572[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/credential-injection.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m tests/unit/no-worktree-archive.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 79[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/doctor-config-overlay.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 90[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/round-git-scope-pipeline-managed.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/config/schema-minimum-assurance.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/unit/step/pr-create-attestation.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 93[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/types.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/core/prune/runner.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/resolve-step.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/job-stats-cross-slug.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 124[2mms[22m[39m
 [32m✓[39m tests/prompts/test-case-gen-system.test.ts [2m([22m[2m30 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/transient-error.test.ts [2m([22m[2m48 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/resolve-step-test-materialize-alias.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/adapter/managed-agent/error-helpers.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/detach-flag-cli.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/request-review-verdict-evidence.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/cli.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 692[2mms[22m[39m
     [33m[2m✓[22m[39m exits with code 2 when config does not exist (CONFIG_MISSING → ARG_ERROR) [33m 635[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/runner-abort-hub.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/github-client-inbox.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/unit/architecture/invariant-catalog-parity.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/fast-descriptor.test.ts [2m([22m[2m42 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/codex/scoped-codex-auth.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/executor-oid-capture.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m tests/multi-layer-defense.test.ts [2m([22m[2m2 tests[22m[2m)[22m[33m 585[2mms[22m[39m
     [33m[2m✓[22m[39m design → spec-review(approved) → awaiting-merge [33m 412[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/pipeline-run-duplicate-guard.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/prompt-rules-injection.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 293[2mms[22m[39m
 [32m✓[39m tests/test-case-gen-step.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m tests/core/runtime/provider-readiness.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/core/occupancy/scan.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m tests/unit/step/push-capability-notice.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/core/pr-create/runner.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/command-registry-reopen.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 119[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/verification-config-reload.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 53[2mms[22m[39m
Detached pipeline started for: integration-slug
  Monitor: specrunner job wait integration-slug
  Details: specrunner job show integration-slug
Detached pipeline started for: ordering-test-slug
  Monitor: specrunner job wait ordering-test-slug
  Details: specrunner job show ordering-test-slug
Detached pipeline started for: wait-compat-slug
  Monitor: specrunner job wait wait-compat-slug
  Details: specrunner job show wait-compat-slug
 [32m✓[39m src/core/command/__tests__/detach-integration.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/regression-gate-step.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/changed-lines-origin-fallback.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-helpers.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m src/core/attach/__tests__/checkpoint-policy.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/state/__tests__/evidence-backward-compat.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/templates/__tests__/step-output-templates.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/adoption-halt.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/agent/syncer-rollback.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/prompts/test-placement.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/pipeline-one-shot-resume.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/contract/golden-cases.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 58[2mms[22m[39m
 [32m✓[39m tests/unit/core/occupancy/repair.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/cli/job-stats-repo-root.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 962[2mms[22m[39m
     [33m[2m✓[22m[39m reports the same run count when invoked from subdir vs repo root [33m 718[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/local-duplicate-guard.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 57[2mms[22m[39m
 [32m✓[39m tests/adapter/codex/agent-runner-inactivity-timeout.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/scope.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-verbose-log.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 60[2mms[22m[39m
 [32m✓[39m tests/prompts/spec-review-system.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/judge-verdict-conformance.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/core/resume/state-based-resolve.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 68[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/test-coverage-comment-form.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.crash-state.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m tests/core/usage/store.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m src/adapter/shared/__tests__/touched-files-bundle.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/command/request-prompt.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/core/doctor/checks/storage/slug-occupancy.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/fixer-helpers-conformance.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/test-coverage-boundary.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 56[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/fragments.test.ts [2m([22m[2m40 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/commit-final-state.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/runtime/list-changed-files.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/step-completion-canon.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/core/credentials/__tests__/credentials-io.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/prompts/dynamic-context-prompts.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/reload-coverage-config.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m tests/git/checkpoint-ref.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/unit/config/migrate.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/cli/login.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/local-round-git.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m tests/unit/logger/log-level.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/core/archive/__tests__/achieved-assurance.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/verification/runner-test-gen-exemption.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 117[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/spec-exempt-runtime.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m tests/unit/step/judge-verdict.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/verification-step.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/core/archive/__tests__/achieved-assurance-no-base-oid.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/core/usage/context-metrics-types.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m tests/core/step/rules-delivery.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/core/reviewers/__tests__/activation.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/config/schema-coverage.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/no-op-detect-exemption.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/local-runtime-capabilities.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/logger/verbose-log.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m src/adapter/codex/__tests__/touched-files-injection.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/unit/cli/cancel.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 286[2mms[22m[39m
 [32m✓[39m tests/unit/cli/command-context.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m tests/util/copy-artifacts.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 58[2mms[22m[39m
 [32m✓[39m tests/unit/step/test-cases-decouple.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/docs/test-coverage-gate-contract.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/agent/registry.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m tests/unit/cli/doctor-repair.test.ts [2m([22m[2m6 tests[22m[2m)[22m[33m 882[2mms[22m[39m
     [33m[2m✓[22m[39m calls process.exit(2) when no slug is provided [33m 502[2mms[22m[39m
 [32m✓[39m tests/schema.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/remove-session-timeout.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 214[2mms[22m[39m
 [32m✓[39m tests/config/model-registry.test.ts [2m([22m[2m32 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/member-resume-routing.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/capability-contracts.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/cli/help-flag-dispatch.test.ts [2m([22m[2m18 tests[22m[2m)[22m[33m 1724[2mms[22m[39m
     [33m[2m✓[22m[39m exits with code 0 [33m 519[2mms[22m[39m
 [32m✓[39m tests/unit/util/git-exec.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/touched-files-injection.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m tests/unit/architecture/request-entrance-llm-boundary.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 186[2mms[22m[39m
 [32m✓[39m tests/unit/step/spec-review-lightweight.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/cli-run-verdict.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/bootstrap-egress-ledger-local.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 64[2mms[22m[39m
 [32m✓[39m tests/unit/util/glob-match.test.ts [2m([22m[2m32 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/core/port/__tests__/request-review-evidence-parse.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/core/pr-create/body-template.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/cli/archive-minimum-assurance.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 285[2mms[22m[39m
 [32m✓[39m tests/unit/store/job-state-store-changedir.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 43[2mms[22m[39m
 [32m✓[39m src/core/port/__tests__/request-review-legacy-compat.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/step/write-scope-bypass-closure-write-scope.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/prompts/__tests__/evidence-fragment-coverage.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/request-review-step-completion-evidence.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/config/merge.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/core/credentials/anthropic.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 111[2mms[22m[39m
 [32m✓[39m tests/config/type-config.test.ts [2m([22m[2m47 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/attach/verify-checkpoint-r1-assurance.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/state/job-slug.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/managed-agent/agent-runner-verbose-log.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/core/reviewers/__tests__/definition.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/occupancy-e2e.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 67[2mms[22m[39m
 [32m✓[39m tests/local-job-index.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 57[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/reopen-terminal-slug.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 87[2mms[22m[39m
 [32m✓[39m tests/unit/cli/archive-plain-merge-detection.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 272[2mms[22m[39m
 [32m✓[39m tests/core/credentials/github.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 135[2mms[22m[39m
 [32m✓[39m tests/prompts/implementer-system.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/jobs-dir-no-readdir.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/step-names.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/core/doctor/checks/runtime/__tests__/aozu-cli.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/unit/core/port/report-result.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/step/regression-gate-skip-when.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/runner-skip-detect.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 88[2mms[22m[39m
 [32m✓[39m src/state/__tests__/lifecycle-reopen.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/core/attestation/render-comment.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/cli/specrunner-worktree-guard.test.ts [2m([22m[2m8 tests[22m[2m)[22m[33m 1233[2mms[22m[39m
     [33m[2m✓[22m[39m exits with code 2 and prints worktree guard error [33m 592[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/reviewer-capability.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/unit/verification/runner-commands.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 111[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/egress-resolution-options.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/implementer-materialize.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/last-commit-touching-path.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/unit/step/write-scope-rules-consistency.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/cli/issue-flag.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/cli/inbox-run.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m src/core/doctor/checks/config/__tests__/claude-code-token-present.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/session-log-writer.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m tests/unit/core/occupancy/claim.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/github-client-dev-links.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/state/__tests__/touched-files-schema.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/attach/workspace-materializer-attach.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/state/bite-evidence-record-schema.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/hint-command-existence.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m tests/unit/state/profile-roundtrip.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/iteration-display.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/core/usage/store-backward-compat.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor.store-cache.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/core/step/fixer-helpers.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/executor-commit-mutex.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 90[2mms[22m[39m
 [32m✓[39m tests/unit/step/agent-definition.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/runner-path-mask.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 83[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/local-snapshot-guard.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/adapter/codex/__tests__/artifact-bundle-injection.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/design-system.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/usage-show-metrics.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/design-spec-exempt-contract.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/cancel-process-group-integration.test.ts [2m([22m[2m2 tests[22m[2m)[22m[33m 549[2mms[22m[39m
     [33m[2m✓[22m[39m TC-021 (破壊確認): child survives when isGroupLeader returns false [33m 342[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/provider-sdk-loader.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/executor-round-commit.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 53[2mms[22m[39m
 [32m✓[39m src/core/job/__tests__/start-from-issue.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m src/util/__tests__/paths-canonical.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/unit/core/job-access/resolve-state-store.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m tests/unit/core/cancel/pid-kill.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/agent-runner-hub.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/adapter/codex/agent-runner-observability.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/unit/core/usage/invocation-types.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/doctor/xdg-config-file-exists.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/test-case-gen-gate-contract.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/runtime/git-fetch-error.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/registry-invariants.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/runner-git-show-env.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 76[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/agent-redirect-integration.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m tests/unit/util/spawn-background.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/pipeline-run.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/store/__tests__/touched-files-resume.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/cli/doctor-help.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 847[2mms[22m[39m
     [33m[2m✓[22m[39m doctor --help で exit 0 [33m 476[2mms[22m[39m
 [32m✓[39m src/core/archive/__tests__/archived-slug-by-job-id.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m src/adapter/codex/__tests__/prompt-rules-injection.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m tests/unit/git/git-spawn-env.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/issue-fidelity-comparator.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/absorb-build-fixer/state-compat.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/list-pull-request-files.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/step-completion-evidence-diagnostic.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/attach.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/docs/test-coverage-manual-contract.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/managed-verify-finding-refs.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/util/atomic-write.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m tests/unit/step/spec-fixer.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/storage/journal-integrity.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/load-by-job-id.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m tests/unit/core/design-layer/check-gate.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/core/occupancy/errors.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/config/__tests__/staged-bytes-config-validation.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/state/__tests__/transient-retry-state.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/adapter/codex/agent-runner-output-verification.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/core/credentials/__tests__/github.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/github-client-get-issue.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/cli/progress-halt-guidance.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/propagate.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/job-stats-jobid-filter.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/unit/doctor/xdg-integration.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/factory.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/store/compose-split-layout-from-content.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/logger/__tests__/log-retention.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m tests/core/preflight.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline-fatal-codes.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/adapter/shared/__tests__/last-tool-tracker.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/codex/agent-runner-env.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/core/doctor/formatter-detailshuman.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/draft-move.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 45[2mms[22m[39m
 [32m✓[39m tests/doctor-readiness.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/attach/attach-cli.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 866[2mms[22m[39m
     [33m[2m✓[22m[39m command-registry exits 2 when --branch is omitted [33m 737[2mms[22m[39m
 [32m✓[39m tests/unit/core/design-layer/mark-hook.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/core/doctor/orphan-worktrees-check.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 217[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/job-show-detach-log.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/state/session-timeout-migration.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 74[2mms[22m[39m
 [32m✓[39m tests/unit/core/cancel/pid-kill-group.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/report-tool-evidence-schema.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/docs/test-coverage-docs-contract.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/docs/doc-drift-sync.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/core/doctor/doctor-cli.test.ts [2m([22m[2m8 tests[22m[2m)[22m[33m 1156[2mms[22m[39m
     [33m[2m✓[22m[39m TC-062: writes USAGE to stderr and exits 2 when no command given [33m 717[2mms[22m[39m
 [32m✓[39m tests/unit/core/finish/archive-change-folder.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/lcov.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/resolve-job-id.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m tests/core/worktree/detection.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m tests/core/credentials/credentials-io.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 77[2mms[22m[39m
 [32m✓[39m src/adapter/codex/__tests__/resume-prompt-injection.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/core/credentials/__tests__/claude-code.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/parse-result.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/core/worktree/setup.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/util/paths.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/logger/pipeline-logger-rollover.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/unit/state/reviewer-activation-state.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/cli/run-json-flag.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 1238[2mms[22m[39m
     [33m[2m✓[22m[39m calls runRun with json: true when --json is specified [33m 662[2mms[22m[39m
 [32m✓[39m tests/unit/cli/config-effective.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 79[2mms[22m[39m
 [32m✓[39m tests/unit/core/resume/resume-context.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/verification/commands.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m tests/state/io.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 81[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/github-client-issue-comment.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/pipeline-run-inbox-origin.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/regression-gate-source-checks.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/command-registry-apply-canon.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/grep-workflow-actions-pinned.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/cli/ps-pr-hint.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/core/event/event-bus.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/docs/operations-recovery-contract.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/github-device.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/prompts/__tests__/spec-exempt-prompt.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/cli/version-flag.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 815[2mms[22m[39m
     [33m[2m✓[22m[39m exits with code 0 [33m 477[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/config/github-token-present.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/from-flag-no-enum.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/view-commands-worktree-guard.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/core/doctor/formatter.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/command-registry-adopt-commits.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/git/dynamic-context.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 135[2mms[22m[39m
 [32m✓[39m src/prompts/__tests__/spec-review-full-enumeration-prompt.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/grep-no-step-name-hardcode.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/adapter/shared/__tests__/inactivity-watchdog.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/finish-commit-archive.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/prompts/__tests__/request-review-evidence-prompt.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/managed-agent/sse-stream-verbose-log.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/compose-reviewers.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/query-one-shot-metrics.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/step/implementer.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/state/profile.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/git/origin-not-configured.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 54[2mms[22m[39m
 [32m✓[39m tests/unit/logger/verbose-log-errors.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/prompts/__tests__/artifact-hygiene-discipline.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/prompts/request-review-seam.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/state/__tests__/bite-evidence-schema.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/config/design-layer-config.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/cli/version.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/agent-runner-verbose-log.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/config/step-config-trace.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/github-client-graphql.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/state/inbox-origin-schema.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m tests/unit/core/resume/resolve-request-path.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/managed-agent/session-client.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/step/implementer-lockfile.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/fixer-reviewer.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/store/__tests__/job-state-store-archive-skip.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/get-raw-file.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/exit-code-standardization.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/core/archive/protected-paths.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/core/step/rules-resolve.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/rules-md.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/contract/invariants.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m tests/unit/errors/repo-required-error.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/core/resume/resolve-job.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m tests/unit/state/base-branch-roundtrip.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/step/spec-review-reads.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/request-new.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 189[2mms[22m[39m
 [32m✓[39m tests/unit/core/finish/resolve-canonical-state-dir.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m tests/finish-archive-change-folder.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/step/io-iteration.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/executor-resume-context.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/git-remote.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 46[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/verification-hint.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/power-assertion.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/workflow/specrunner-dispatch.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/prompts/__tests__/custom-reviewer-system.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/config/__tests__/transient-retry-config.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/pipeline/round-all-skip-pass-through-static.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/prompts/__tests__/tc-source-contract.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/state/__tests__/reviewers-schema.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/cli/ps-check-pr-merged.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/init-provider-notice.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 236[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/get-ref-sha.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/step/verification.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/util/retry.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/message-types.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/inbox/run-inbox-inbox-origin.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/adapter/shared/prompt-builder.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.conformance-resume.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/adapter/dispatching/agent-runner.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/errors/issue-fidelity-error-codes.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/step/write-scope-error.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/core/doctor/aozu-cli-check.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 297[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/config/file-exists.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/config/__tests__/context-rollover-config.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/config/inbox-config.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/step/step-model-maxturn-config.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/core/cancel/__tests__/runner-branch-delete.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m tests/unit/util/detect-pm-lockfile.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/skip-detect.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/auth/managed-key-valid.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/runtime/codex-cli.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/cli/run-worktree-signal.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/storage/jobs-writable.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/core/lifecycle/query-abort-hub.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/signal-handler-order.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/managed-agent/completion-verbose-log.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/templates/test-cases-template-gate-contract.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/runtime/package-manager.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/issue-fidelity-prompt-contract.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/util/env-filter.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/config/getAgentId.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/changed-lines-filelist.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/command/reviewers-new.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m tests/unit/cli/run-worktree-git-staging.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/core/lifecycle/__tests__/diagnostic.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/core/preflight.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/auth/github-token-valid.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/command-registry-resume.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/cli/runtime-tc.test.ts [2m([22m[2m2 tests[22m[2m)[22m[33m 646[2mms[22m[39m
     [33m[2m✓[22m[39m specrunner runtime status → runManagedStatus が呼ばれる [33m 515[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/validation-tc.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 206[2mms[22m[39m
 [32m✓[39m tests/core/credentials/claude-code.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 79[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/progress-retry.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/util/__tests__/paths.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/common-context-catch.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/base-branch-required.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/doctor/workflow-structure-hint.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/grep-no-bun-imports.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 560[2mms[22m[39m
 [32m✓[39m tests/unit/util/path-mask.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/core/design-layer/template-section.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/resume-context.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/util/spawn.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 223[2mms[22m[39m
 [32m✓[39m src/adapter/github/__tests__/github-client-closing-prs.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/prompts/request-review-system.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/doctor/token-hint.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/repo/workflow-structure.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/init-git-guard.test.ts [2m([22m[2m2 tests[22m[2m)[22m[33m 796[2mms[22m[39m
     [33m[2m✓[22m[39m TC-002: COMMANDS.init.requiresRepo === true (ゲートが dispatch レベルに移動した) [33m 752[2mms[22m[39m
 [32m✓[39m tests/unit/pipeline/reviewer-chain-skipped.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/config/config-source-metadata.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/unit/core/port/issue-fidelity-comparator-layering.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/architecture/module-boundary.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m tests/adapter/shared/follow-up.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/dead-guidance.test.ts [2m([22m[2m2 tests[22m[2m)[22m[33m 327[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/rollover-prompt.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/cli/bootstrap.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 598[2mms[22m[39m
     [33m[2m✓[22m[39m returns config, githubClient, and runtime when config is valid [33m 512[2mms[22m[39m
 [32m✓[39m src/util/__tests__/xdg-read-sidecar-tail.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/agents/definition-drift.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/util/repo-root.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/verify-path.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/workspace-materializer.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/logger/stdout-mask.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/util/paths.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/readme-quickstart.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/step/requires-commit-flags.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/managed-agent/agent-runner-context-metrics.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/adr-tc.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/managed-round-git.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/standard-transitions.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/agent-redirect.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/pipeline-run-canonical.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/changed-lines.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/managed-agent/usage.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/slug-required.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/fragment-coverage.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/core/doctor/runner.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/core/step/rules-followup-prompts.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/config/__tests__/remove-bite-evidence-config-validation.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/init-snippet.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/logger/__tests__/mask-sensitive.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/cli/help-output-tc.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 778[2mms[22m[39m
     [33m[2m✓[22m[39m USAGE には 'Request commands' ブロックが含まれる [33m 771[2mms[22m[39m
 [32m✓[39m tests/unit/cli/doctor-execfile-env.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/agent/hash.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/step/custom-reviewer-activation.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/codex/agent-runner-context-metrics.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/core/credentials/requirements.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/core/validation/registry.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/core/pr-create/__tests__/body-template.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/core/liveness/resolve-pid.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/rule-name-typesafe.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/parser/request-md.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/finish-escalation.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/config/managed-key-present.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/cli/job-start-file-path.test.ts [2m([22m[2m1 test[22m[2m)[22m[33m 580[2mms[22m[39m
     [33m[2m✓[22m[39m 既存ファイルパスが指定された場合は slug lookup をスキップして preflight に進む [33m 578[2mms[22m[39m
 [32m✓[39m src/util/__tests__/xdg-detach-log.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/workspace-materializer-structure.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/config/__tests__/github-host.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/adr.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/git/__tests__/branch.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/config/__tests__/type-config.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/readme-tc.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/repo/github-origin.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/docs/request-authoring-granularity.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/core/credentials/__tests__/requirements.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/cli/prune-usage.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/dependabot-config.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/core/lifecycle/__tests__/keepalive-integration.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/logger/stdout-verbose.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/agent-definition.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 126[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/agents/agents-registered.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/run.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 298[2mms[22m[39m
 [32m✓[39m src/core/verification/__tests__/lockfile-sync-phase-constant.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/completion-directive.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/core/lifecycle/__tests__/keepalive.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/runtime/node.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/docs/security-policy.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/docs/readme-pipeline-sync.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/agents/environment-registered.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/adr-required.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/adr-valid.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/repo/git-repository.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/repo/specrunner-project-md.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/storage/old-state-files.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/builder.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/type-known.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/runtime/git.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/auth/constants.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/env/github-client-id.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/core/port/__tests__/agent-runner.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/registry-integration.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/inbox/draft-writer.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/state/pipeline-id.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/title-required.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/util/__tests__/git-push.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/util/xdg.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/type-required.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/docs/readme-resume-command.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/buildMockPipeline.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m

[2m Test Files [22m [1m[31m6 failed[39m[22m[2m | [22m[1m[32m825 passed[39m[22m[90m (831)[39m
[2m      Tests [22m [1m[31m22 failed[39m[22m[2m | [22m[1m[32m12582 passed[39m[22m[2m | [22m[33m1 skipped[39m[2m | [22m[90m2 todo[39m[90m (12607)[39m
[2m   Start at [22m 16:26:31
[2m   Duration [22m 98.80s[2m (transform 21.04s, setup 14.40s, import 106.76s, tests 103.04s, environment 156ms)[22m


::error file=src/core/pipeline/parallel-review-round.ts,title=tests/custom-reviewers-e2e.test.ts > TC-051%3A invalidation — approved reviewer re-runs when fixer touched their activation paths > coordinator invalidates approved reviewer whose activation paths were touched by fixer,line=379,column=55::TypeError: deps.roundGitEffects.listWorktreeChanges is not a function%0A ❯ ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:379:55%0A ❯ Pipeline.runInternal src/core/pipeline/pipeline.ts:258:27%0A ❯ Pipeline.run src/core/pipeline/pipeline.ts:145:22%0A ❯ tests/custom-reviewers-e2e.test.ts:1146:20%0A%0A

::error file=src/core/pipeline/parallel-review-round.ts,title=tests/pipeline-sole-committer-e2e.test.ts > TC-020%3A R6-2 — parallel reviewer 自己 commit 封鎖（実 git E2E） > reviewer が自己 commit した場合、escalation halt し HEAD が reset される,line=114,column=52::TypeError: deps.roundGitEffects.digestArtifacts is not a function%0A ❯ ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:114:52%0A ❯ tests/pipeline-sole-committer-e2e.test.ts:484:34%0A%0A

::error file=src/core/pipeline/parallel-review-round.ts,title=tests/pipeline-sole-committer-e2e.test.ts > TC-020%3A R6-2 — parallel reviewer 自己 commit 封鎖（実 git E2E） > reviewer が commit しなければ round は正常に進む（非 escalation）,line=114,column=52::TypeError: deps.roundGitEffects.digestArtifacts is not a function%0A ❯ ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:114:52%0A ❯ tests/pipeline-sole-committer-e2e.test.ts:625:34%0A%0A

::error file=tests/unit/architecture/core-invariants.test.ts,title=tests/unit/architecture/core-invariants.test.ts > DSM closure — §3 全層 whitelist enforcement > §3 whitelist に無い import edge は存在しない（allowlist 除外後）,line=1523,column=40::AssertionError: expected [ Array(1) ] to deeply equal []%0A%0A- Expected%0A+ Received%0A%0A- []%0A+ [%0A+   "src/core/port/runtime-strategy.ts:31: import type { PipelineDeps } from \"../types.js\";",%0A+ ]%0A%0A ❯ tests/unit/architecture/core-invariants.test.ts:1523:40%0A%0A

::error file=src/core/pipeline/parallel-review-round.ts,title=tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts > TC-009%3A reviewer が正典を弱化して自己 commit → round halt > fan-out 後に HEAD が前進していれば escalation halt し、ROUND_HEAD_ADVANCED コードが設定される,line=114,column=52::TypeError: deps.roundGitEffects.digestArtifacts is not a function%0A ❯ ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:114:52%0A ❯ tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts:294:32%0A%0A

::error file=src/core/pipeline/parallel-review-round.ts,title=tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts > TC-010%3A reviewer が何も commit しなければ round は現行どおり進む > HEAD が前進していなければ round は現行の verdict 算出に進む,line=114,column=52::TypeError: deps.roundGitEffects.digestArtifacts is not a function%0A ❯ ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:114:52%0A ❯ tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts:349:32%0A%0A

::error file=src/core/pipeline/parallel-review-round.ts,title=tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts > TC-011%3A round HEAD guard 違反時に diff 退避証跡が生成される > HEAD 前進が違反として検出された時、退避ファイルが .specrunner/local/<slug>/ に生成される,line=114,column=52::TypeError: deps.roundGitEffects.digestArtifacts is not a function%0A ❯ ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:114:52%0A ❯ tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts:437:32%0A%0A

::error file=tests/unit/step/unpushable-path-escalation.test.ts,title=tests/unit/step/unpushable-path-escalation.test.ts > TC-037 / TC-015 / TC-016%3A commitAndPush Layer 2 backstop > TC-037%3A throws UNPUSHABLE_PATH_BLOCKED when workflow file is in publishable set,line=591,column=42::TypeError: Cannot read properties of undefined (reading 'code')%0A ❯ tests/unit/step/unpushable-path-escalation.test.ts:591:42%0A%0A

::error file=tests/unit/step/unpushable-path-escalation.test.ts,title=tests/unit/step/unpushable-path-escalation.test.ts > TC-037 / TC-015 / TC-016%3A commitAndPush Layer 2 backstop > TC-016%3A error message contains the matched path and environment constraint,line=666,column=30::TypeError: Cannot read properties of undefined (reading 'message')%0A ❯ tests/unit/step/unpushable-path-escalation.test.ts:666:30%0A%0A

::error file=tests/unit/step/unpushable-path-escalation.test.ts,title=tests/unit/step/unpushable-path-escalation.test.ts > F1 round-trip%3A unpushablePathBlockedError → UnpushablePathBlockedError.matchedPaths > executor receives matchedPaths directly (finalizeErr instanceof UnpushablePathBlockedError),line=863,column=23::AssertionError: expected undefined to be an instance of UnpushablePathBlockedError%0A ❯ tests/unit/step/unpushable-path-escalation.test.ts:863:23%0A%0A

::error file=src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts,title=src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts > ParallelReviewRound git effects — push failure after commit → OID in synthesizedCommits > round does NOT throw when commitRoundArtifacts push fails,line=680,column=6::AssertionError: promise rejected "TypeError: deps.roundGitEffects.digestArt…" instead of resolving%0A ❯ src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:680:6%0A%0ACaused by: Caused by: TypeError: deps.roundGitEffects.digestArtifacts is not a function%0A ❯ ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:114:52%0A ❯ src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:679:13%0A%0A

::error file=src/core/pipeline/parallel-review-round.ts,title=src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts > ParallelReviewRound git effects — push failure after commit → OID in synthesizedCommits > round outcome is escalation and error.code is ROUND_COMMIT_PUSH_FAILED,line=114,column=52::TypeError: deps.roundGitEffects.digestArtifacts is not a function%0A ❯ ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:114:52%0A ❯ src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:692:32%0A%0A

::error file=src/core/pipeline/parallel-review-round.ts,title=src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts > ParallelReviewRound git effects — push failure after commit → OID in synthesizedCommits > push-fail commit OID is appended to synthesizedCommits (prevents EGRESS_UNKNOWN_COMMIT on resume),line=114,column=52::TypeError: deps.roundGitEffects.digestArtifacts is not a function%0A ❯ ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:114:52%0A ❯ src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:709:32%0A%0A

::error file=src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts,title=src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts > ParallelReviewRound git effects — pre-commit backstop rejection → HEAD unchanged → not recorded > round does NOT throw when backstop rejects before commit,line=767,column=6::AssertionError: promise rejected "TypeError: deps.roundGitEffects.digestArt…" instead of resolving%0A ❯ src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:767:6%0A%0ACaused by: Caused by: TypeError: deps.roundGitEffects.digestArtifacts is not a function%0A ❯ ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:114:52%0A ❯ src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:766:13%0A%0A

::error file=src/core/pipeline/parallel-review-round.ts,title=src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts > ParallelReviewRound git effects — pre-commit backstop rejection → HEAD unchanged → not recorded > backstop rejection%3A outcome is escalation with ROUND_COMMIT_PUSH_FAILED,line=114,column=52::TypeError: deps.roundGitEffects.digestArtifacts is not a function%0A ❯ ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:114:52%0A ❯ src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:779:32%0A%0A

::error file=src/core/pipeline/parallel-review-round.ts,title=src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts > ParallelReviewRound git effects — pre-commit backstop rejection → HEAD unchanged → not recorded > backstop rejection%3A pre-existing HEAD is NOT recorded in synthesizedCommits (ledger integrity),line=114,column=52::TypeError: deps.roundGitEffects.digestArtifacts is not a function%0A ❯ ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:114:52%0A ❯ src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:796:32%0A%0A

::error file=src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts,title=src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts > ParallelReviewRound git effects — pre-observation null + backstop rejection → evidence-unavailable > round does NOT throw when pre-commit capture is null and backstop rejects,line=869,column=6::AssertionError: promise rejected "TypeError: deps.roundGitEffects.digestArt…" instead of resolving%0A ❯ src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:869:6%0A%0ACaused by: Caused by: TypeError: deps.roundGitEffects.digestArtifacts is not a function%0A ❯ ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:114:52%0A ❯ src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:868:13%0A%0A

::error file=src/core/pipeline/parallel-review-round.ts,title=src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts > ParallelReviewRound git effects — pre-observation null + backstop rejection → evidence-unavailable > null pre-observation + backstop rejection%3A outcome is escalation,line=114,column=52::TypeError: deps.roundGitEffects.digestArtifacts is not a function%0A ❯ ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:114:52%0A ❯ src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:881:32%0A%0A

::error file=src/core/pipeline/parallel-review-round.ts,title=src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts > ParallelReviewRound git effects — pre-observation null + backstop rejection → evidence-unavailable > null pre-observation + backstop rejection%3A existing HEAD OID NOT in synthesizedCommits (ledger integrity),line=114,column=52::TypeError: deps.roundGitEffects.digestArtifacts is not a function%0A ❯ ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:114:52%0A ❯ src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:902:32%0A%0A

::error file=src/core/pipeline/parallel-review-round.ts,title=src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts > ParallelReviewRound git effects — pre-observation null + backstop rejection → evidence-unavailable > null pre-observation + backstop rejection%3A hint reflects evidence-unavailable (not backstop hint),line=114,column=52::TypeError: deps.roundGitEffects.digestArtifacts is not a function%0A ❯ ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:114:52%0A ❯ src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:920:32%0A%0A

::error file=src/core/pipeline/parallel-review-round.ts,title=src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts > ParallelReviewRound git effects — both HEAD observations non-null%2C different → OID recorded (positive control) > when both HEAD observations are non-null and differ%2C commit OID IS recorded in synthesizedCommits,line=114,column=52::TypeError: deps.roundGitEffects.digestArtifacts is not a function%0A ❯ ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:114:52%0A ❯ src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:979:32%0A%0A

::error file=src/core/pipeline/parallel-review-round.ts,title=src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts > ParallelReviewRound git effects — both HEAD observations non-null%2C different → OID recorded (positive control) > when both HEAD observations are non-null and differ%2C outcome is escalation (push failed),line=114,column=52::TypeError: deps.roundGitEffects.digestArtifacts is not a function%0A ❯ ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:114:52%0A ❯ src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:998:32%0A%0A

$ vitest run
GitHub PR merge retry: Pull Request is not mergeable, retrying (1/3)...
GitHub PR merge retry: Pull Request is not mergeable, retrying (2/3)...
GitHub PR merge retry: Pull Request is not mergeable, retrying (3/3)...
GitHub PR merge retry: Base branch was modified. Review and try the merge again., retrying (1/3)...
GitHub PR merge retry: Repository is in an unstable state. Please wait and try again., retrying (1/3)...
GitHub PR merge retry: Merge failed: branch locked (status 423), retrying (1/3)...
GitHub PR merge retry: Base branch was modified. Review and try the merge again., retrying (1/3)...
GitHub PR merge retry: Base branch was modified. Review and try the merge again., retrying (2/3)...
GitHub PR merge retry: Base branch was modified. Review and try the merge again., retrying (3/3)...
GitHub PR merge retry: Pull Request is not mergeable, retrying (1/3)...
GitHub PR merge retry: Pull request is not mergeable, retrying (1/3)...
GitHub PR merge retry: Head branch was modified. Review and try the merge again., retrying (1/3)...
GitHub PR merge retry: Required status check "ci/build" is expected, retrying (1/3)...
GitHub PR merge retry: Pull Request is not mergeable, retrying (1/3)...
GitHub PR merge retry: Pull Request is not mergeable, retrying (2/3)...
GitHub PR merge retry: Pull Request is not mergeable, retrying (3/3)...
GitHub PR merge retry: Required status check "ci/build" is expected, retrying (1/3)...
GitHub PR merge retry: Pull Request is not mergeable, retrying (1/3)...
GitHub PR merge retry: Pull Request is not mergeable, retrying (2/3)...
GitHub PR merge retry: Pull Request is not mergeable, retrying (3/3)...
[design] write-scope: 境界外の残余変更を検出・復元した (commit から除外済み): vendor/x.js — 退避先: /tmp/fake-repo-exclusion-test/.specrunner/local/test-slug/write-scope-violation-design-1788107199833.md
[design] write-scope: 境界外の残余変更を検出・復元した (commit から除外済み): specrunner/changes/test-slug/spec.md — 退避先: /tmp/fake-repo-exclusion-test/.specrunner/local/test-slug/write-scope-violation-design-1788107199847.md
[design] write-scope: 境界外の残余変更を検出・復元した (commit から除外済み): specrunner/changes/test-slug/spec.md — 退避先: /tmp/fake-repo-exclusion-test/.specrunner/local/test-slug/write-scope-violation-design-1788107199852.md
[design] write-scope: 境界外の残余変更を検出・復元した (commit から除外済み): specrunner/changes/test-slug/review-feedback-001.md — 退避先: /tmp/fake-repo-exclusion-test/.specrunner/local/test-slug/write-scope-violation-design-1788107199883.md
[design] write-scope: 境界外の残余変更を検出・復元した (commit から除外済み): specrunner/changes/test-slug/code-review-result-001.md — 退避先: /tmp/fake-repo-exclusion-test/.specrunner/local/test-slug/write-scope-violation-design-1788107199892.md
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
Warning: checkpoint-restack: journal append failed for test-restack-slug: journal-write-failed
Warning: checkpoint-restack: persistCommit (restack OID) failed for test-restack-slug: ledger-write-failed
Warning: checkpoint-restack: graft: persistCommit (merge OID) failed for test-restack-slug: ledger-write-failed
Warning: checkpoint-restack: containment violation — path outside change folder: src/foo.ts; skipping push for test-restack-slug
Warning: checkpoint-restack: push failed for test-restack-slug to origin/test/restack-branch-abc12345. git stderr: remote: error: push rejected by pre-receive hook
Warning: checkpoint-restack: git read-tree failed for test-restack-slug
Warning: checkpoint-restack: graft: git update-ref failed for test-restack-slug
Warning: checkpoint-restack: remote divergence detected for test-restack-slug — origin/test/restack-branch-abc12345 is not an ancestor of local HEAD; skipping restack to avoid overwriting remote state
Warning: failed to push checkpoint commit for test-slug to origin/fix/test-branch-abc12345. Push manually to ensure state is on the branch.
Info: checkpoint-restack: skipped for test-slug (reason: no-remote-tip)
Warning: checkpoint persistBeforePush failed for test-slug: disk-full: cannot persist. Continuing with push.
Error: No job found for slug: not-found-slug
Hint: If you used --detach, the job may still be initializing or may have failed to start. Check the detach log: /repo/.specrunner/logs/not-found-slug.detach.log
Error: No job found for slug: not-found-slug
Hint: If you used --detach, the job may still be initializing or may have failed to start. Check the detach log: /repo/.specrunner/logs/not-found-slug.detach.log
Error: No job found for slug: not-found-slug
Hint: If you used --detach, the job may still be initializing or may have failed to start. Check the detach log: /repo/.specrunner/logs/not-found-slug.detach.log
Retrying worktree add: lock contention (attempt 1/3)
Retrying worktree add: lock contention (attempt 1/3)
Retrying worktree add: lock contention (attempt 2/3)
Retrying worktree add: lock contention (attempt 1/3)
Retrying worktree add: lock contention (attempt 1/3)
Retrying worktree add: lock contention (attempt 1/3)
Retrying worktree add: lock contention (attempt 2/3)
Retrying worktree add: lock contention (attempt 1/3)
Retrying worktree add: lock contention (attempt 2/3)
Retrying worktree add: lock contention (attempt 1/3)
Retrying worktree add: lock contention (attempt 2/3)
Retrying worktree add: lock contention (attempt 1/3)
Retrying worktree add: lock contention (attempt 2/3)
[codex] completion report parse failed (main turn): no-json-found; fragment: "not valid json"
[codex] completion report parse failed (main turn): no-json-found; fragment: "not valid json"
[codex] completion report parse failed (main turn): no-json-found; fragment: "not json at all"
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: ""
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: ""
[inbox] started job slug=fix-login-bug from issue#1
[inbox] rejected issue#2: missing title (top-level # heading required) in issue#2
[inbox] started job slug=fix-login-bug from issue#1
[inbox] resumed job slug=fix-login-bug (issue#10)
[inbox] dry-run: no effects will be executed.
[inbox] plan: 1 start(s), 0 reject(s), 1 resume(s), 0 recover(s), 0 escalate(s)
  start    issue#1 → slug=fix-login-bug
  resume   fix-login-bug (issue#10)
[inbox] recovered stale job slug=my-feature (attempt 1)
[inbox] escalated stale job slug=my-feature to awaiting-resume
[inbox] dry-run: no effects will be executed.
[inbox] plan: 0 start(s), 0 reject(s), 0 resume(s), 1 recover(s), 1 escalate(s)
  recover  my-feature (attempt 1)
  escalate other-feat (step=design)
[inbox] warn: recover my-feature: disk full
[inbox] resumed job slug=my-feature (issue#30)
[inbox] resumed job slug=my-feature (issue#30)
[inbox] resumed job slug=my-feature (issue#30)
[inbox] resumed job slug=my-feature (issue#30)
[inbox] resumed job slug=old-feature (issue#50)
Warning: issue-notifier: failed to write comment to issue #42: network error
Error: Detached pipeline for 'test-slug' failed to start.
Detach log: /repo/.specrunner/logs/test-slug.detach.log
--- log tail ---
failure reason
Error: Detached pipeline for 'test-slug' failed to start.
Detach log: /repo/.specrunner/logs/test-slug.detach.log
--- log tail ---
stale resume log
Error: Detached pipeline for 'test-slug' failed to start.
Detach log: /repo/.specrunner/logs/test-slug.detach.log
--- log tail ---
line1
line2
failure reason
Error: Detached pipeline for 'test-slug' failed to start.
Detach log: /repo/.specrunner/logs/test-slug.detach.log
--- log tail ---
spawn error: ENOENT
Error: Detached pipeline for 'test-slug' failed to start.
Detach log: /repo/.specrunner/logs/test-slug.detach.log
--- log tail ---
spawn pid undefined
Error: Detached pipeline for 'test-slug' failed to start.
Detach log: /repo/.specrunner/logs/test-slug.detach.log
(detach log is empty)
Error: Detached pipeline for 'test-slug' failed to start.
Detach log: /repo/.specrunner/logs/test-slug.detach.log
--- log tail ---
log content
[specrunner] warn: output verification repair turn 1 failed for 'spec-review'. Continuing.

[specrunner] warn: steps.code-review.byRequestType.unknown-custom-type is not a known request type. Known types: bug-fix, spec-change, new-feature, refactoring, chore.
[specrunner] warn: session resume failed for 'implementer' (session: old-session-id): session not found: old-session-id. Falling back to new session.
Warning: resume-from-issue: skipping branch 'feat/broken': fetch failed (exit 1)
Warning: pr-create: could not read events.jsonl for attestation, skipping comment
Warning: pr-create: could not read events.jsonl for attestation, skipping comment
Warning: pr-create: could not read events.jsonl for attestation, skipping comment
Warning: pr-create: could not read events.jsonl for attestation, skipping comment
Warning: pr-create: could not read events.jsonl for attestation, skipping comment
Warning: pr-create: could not read events.jsonl for attestation, skipping comment
[codex] completion report parse failed (main turn): no-json-found; fragment: "This is plain text. No JSON here at all."
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: "This is plain text. No JSON here at all."
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: "This is plain text. No JSON here at all."
[codex] completion report parse failed (main turn): no-json-found; fragment: "plain prose no json"
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: "plain prose no json"
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: "plain prose no json"
[codex] completion report parse failed (main turn): no-json-found; fragment: "plain prose no json"
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: "plain prose no json"
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: "plain prose no json"
Warning: Could not parse verdict from cli step 'pr-create'. Treating as escalation.
[implementer] no-op detected: no source files changed — overriding verdict to needs-fix
[implementer] no-op detected: no source files changed — overriding verdict to needs-fix
Warning: archive-from-issue: skipping PR #99 (branch 'feat/my-feature'): 4-field identity mismatch (jobId=job-abc, issueNumber=5, branch=feat/my-feature, prNumber=42)
[codex] completion report parse failed (main turn): no-json-found; fragment: "done"
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: "done"
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: "done"
[codex] completion report parse failed (main turn): no-json-found; fragment: "done"
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: "done"
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: "done"
[codex] completion report parse failed (main turn): no-json-found; fragment: "not valid json"
[codex] completion report parse failed (main turn): no-json-found; fragment: "done"
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: "done"
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: "done"
[codex] completion report parse failed (main turn): no-json-found; fragment: "not json"
Mapping resumePoint.step "bite-evidence" → "verification" (legacy alias)
Mapping --from "build-fixer" → "implementer" (legacy alias)
Mapping --from "test-materialize" → "implementer" (legacy alias)
Mapping --from "bite-evidence" → "verification" (legacy alias)
Mapping --from "bite-evidence" → "verification" (legacy alias)
Mapping resumePoint.step "bite-evidence" → "verification" (legacy alias)
Mapping state.step "bite-evidence" → "verification" (legacy alias)
[codex] completion report parse failed (main turn): no-json-found; fragment: "This is just prose, no JSON here at all."
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: "This is just prose, no JSON here at all."
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: "This is just prose, no JSON here at all."
[codex] completion report parse failed (main turn): no-json-found; fragment: "Sorry, no JSON here."
[inbox] skip: occupancy comment for priorJobId=abc-1234-5678-90ab-cdef already posted on issue#1
Warning: checkpoint egress check failed for test-slug-restack: Egress backstop: unknown commit deadbeef-unknown-oid-033 in publish range for branch 'fix/test-branch-restack-int'.. Skipping push to prevent unauthorized commit publication.
Warning: Could not verify change folder: this.githubClient.verifyPath is not a function
Warning: Could not verify change folder: this.githubClient.verifyPath is not a function
Warning: linked branch registration failed: link failed
Warning: Could not parse verdict from agent step 'reviewer-alpha'. Treating as escalation.
Warning: Could not parse verdict from agent step 'reviewer-alpha'. Treating as escalation.
Warning: Could not parse verdict from agent step 'implementer'. Treating as escalation.
Warning: pr-create: attestation comment failed: GitHub API error
Warning: pr-create: could not read events.jsonl for attestation, skipping comment
Mapping resumePoint.step "cross-boundary-invariants" → "custom-reviewers" (member → coordinator)
Mapping --from "cross-boundary-invariants" → "custom-reviewers" (member → coordinator)
Mapping resumePoint.step "security" → "custom-reviewers" (member → coordinator)
Mapping --from "test-materialize" → "implementer" (legacy alias)
Mapping --from "test-materialize" → "implementer" (legacy alias)
Mapping --from "test-materialize" → "implementer" (legacy alias)
Mapping resumePoint.step "test-materialize" → "implementer" (legacy alias)
Mapping resumePoint.step "test-materialize" → "implementer" (legacy alias)
Mapping state.step "test-materialize" → "implementer" (legacy alias)
Mapping state.step "test-materialize" → "implementer" (legacy alias)
Mapping state.step "build-fixer" → "implementer" (legacy alias)
Mapping state.step "build-fixer" → "implementer" (legacy alias)
Error: Detached pipeline for 'failure-slug' failed to start.
Detach log: /repo/.specrunner/logs/failure-slug.detach.log
--- log tail ---
Error: request.md preflight failed
Error: Detached pipeline for 'failure-discoverability-slug' failed to start.
Detach log: /repo/.specrunner/logs/failure-discoverability-slug.detach.log
--- log tail ---
preflight: provider not ready
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix
Mapping resumePoint.step "cross-boundary-invariants" → "custom-reviewers" (member → coordinator)
Mapping resumePoint.step "cross-boundary-invariants" → "custom-reviewers" (member → coordinator)
Mapping --from "cross-boundary-invariants" → "custom-reviewers" (member → coordinator)
Mapping --from "cross-boundary-invariants" → "custom-reviewers" (member → coordinator)
Warning: /tmp/cred-test-Mkk2j6/specrunner/credentials.json has loose permissions (recommend 0600).
Warning: /tmp/cred-test-SSlrrb/specrunner/credentials.json has loose permissions (recommend 0600).
Warning: Could not parse verdict from agent step 'reviewer-A'. Treating as escalation.
Warning: Could not parse verdict from agent step 'reviewer-B'. Treating as escalation.
Warning: Could not parse verdict from agent step 'code-review'. Treating as escalation.
Warning: Could not parse verdict from agent step 'reviewer-alpha'. Treating as escalation.
Warning: Could not parse verdict from agent step 'reviewer-alpha'. Treating as escalation.
Warning: Could not parse verdict from agent step 'reviewer-beta'. Treating as escalation.
Warning: Could not parse verdict from agent step 'implementer'. Treating as escalation.
Warning: Could not parse verdict from agent step 'implementer'. Treating as escalation.
[codex] completion report parse failed (main turn): no-json-found; fragment: "done"
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: "done"
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: "done"
[codex] completion report parse failed (main turn): no-json-found; fragment: "done"
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: "done"
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: "done"
Mapping --from "build-fixer" → "implementer" (legacy alias)
Mapping resumePoint.step "build-fixer" → "implementer" (legacy alias)
ERROR: file not found
spawn ENOENT
Warning: Could not parse verdict from agent step 'design'. Treating as escalation.
Warning: Could not parse verdict from agent step 'spec-review'. Treating as escalation.
[inbox] started job slug=fix-login-bug from issue#99

[31m⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 22 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m tests/custom-reviewers-e2e.test.ts[2m > [22mTC-051: invalidation — approved reviewer re-runs when fixer touched their activation paths[2m > [22mcoordinator invalidates approved reviewer whose activation paths were touched by fixer
[31m[1mTypeError[22m: deps.roundGitEffects.listWorktreeChanges is not a function[39m
[36m [2m❯[22m ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:[2m379:55[22m[39m
    [90m377|[39m         }[33m;[39m
    [90m378|[39m
    [90m379|[39m         const inspection = await deps.roundGitEffects.listWorktreeChan…
    [90m   |[39m                                                       [31m^[39m
    [90m380|[39m
    [90m381|[39m         [35mif[39m (inspection[33m.[39mkind [33m===[39m [32m"unavailable"[39m) {
[90m [2m❯[22m Pipeline.runInternal src/core/pipeline/pipeline.ts:[2m258:27[22m[39m
[90m [2m❯[22m Pipeline.run src/core/pipeline/pipeline.ts:[2m145:22[22m[39m
[90m [2m❯[22m tests/custom-reviewers-e2e.test.ts:[2m1146:20[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/22]⎯[22m[39m

[41m[1m FAIL [22m[49m tests/pipeline-sole-committer-e2e.test.ts[2m > [22mTC-020: R6-2 — parallel reviewer 自己 commit 封鎖（実 git E2E）[2m > [22mreviewer が自己 commit した場合、escalation halt し HEAD が reset される
[31m[1mTypeError[22m: deps.roundGitEffects.digestArtifacts is not a function[39m
[36m [2m❯[22m ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:[2m114:52[22m[39m
    [90m112|[39m     [35mlet[39m currentCanonHash[33m:[39m string [33m|[39m [35mnull[39m [33m|[39m undefined [33m=[39m undefined[33m;[39m
    [90m113|[39m     [35mif[39m (deps[33m.[39mroundGitEffects) {
    [90m114|[39m       [35mconst[39m canonRefs [33m=[39m [35mawait[39m deps[33m.[39mroundGitEffects[33m.[39m[34mdigestArtifacts[39m(
    [90m   |[39m                                                    [31m^[39m
    [90m115|[39m         [34mcanonicalDocPaths[39m(deps[33m.[39mslug)[33m.[39m[34mmap[39m((p) [33m=>[39m ({ path[33m:[39m p }))[33m,[39m
    [90m116|[39m         cwd[33m,[39m
[90m [2m❯[22m tests/pipeline-sole-committer-e2e.test.ts:[2m484:34[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/22]⎯[22m[39m

[41m[1m FAIL [22m[49m tests/pipeline-sole-committer-e2e.test.ts[2m > [22mTC-020: R6-2 — parallel reviewer 自己 commit 封鎖（実 git E2E）[2m > [22mreviewer が commit しなければ round は正常に進む（非 escalation）
[31m[1mTypeError[22m: deps.roundGitEffects.digestArtifacts is not a function[39m
[36m [2m❯[22m ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:[2m114:52[22m[39m
    [90m112|[39m     [35mlet[39m currentCanonHash[33m:[39m string [33m|[39m [35mnull[39m [33m|[39m undefined [33m=[39m undefined[33m;[39m
    [90m113|[39m     [35mif[39m (deps[33m.[39mroundGitEffects) {
    [90m114|[39m       [35mconst[39m canonRefs [33m=[39m [35mawait[39m deps[33m.[39mroundGitEffects[33m.[39m[34mdigestArtifacts[39m(
    [90m   |[39m                                                    [31m^[39m
    [90m115|[39m         [34mcanonicalDocPaths[39m(deps[33m.[39mslug)[33m.[39m[34mmap[39m((p) [33m=>[39m ({ path[33m:[39m p }))[33m,[39m
    [90m116|[39m         cwd[33m,[39m
[90m [2m❯[22m tests/pipeline-sole-committer-e2e.test.ts:[2m625:34[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/22]⎯[22m[39m

[41m[1m FAIL [22m[49m tests/unit/architecture/core-invariants.test.ts[2m > [22mDSM closure — §3 全層 whitelist enforcement[2m > [22m§3 whitelist に無い import edge は存在しない（allowlist 除外後）
[31m[1mAssertionError[22m: expected [ Array(1) ] to deeply equal [][39m

[32m- Expected[39m
[31m+ Received[39m

[32m- [][39m
[31m+ [[39m
[31m+   "src/core/port/runtime-strategy.ts:31: import type { PipelineDeps } from \"../types.js\";",[39m
[31m+ ][39m

[36m [2m❯[22m tests/unit/architecture/core-invariants.test.ts:[2m1523:40[22m[39m
    [90m1521|[39m     expect(forbiddenEdges.length).toBeGreaterThanOrEqual(dsmEntries.le…
    [90m1522|[39m     [35mconst[39m violations [33m=[39m [34mfilterViolations[39m(forbiddenMatches[33m,[39m dsmEntries)[33m;[39m
    [90m1523|[39m     [34mexpect[39m([34mviolationLines[39m(violations))[33m.[39m[34mtoEqual[39m([])[33m;[39m
    [90m   |[39m                                        [31m^[39m
    [90m1524|[39m   })[33m;[39m
    [90m1525|[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/22]⎯[22m[39m

[41m[1m FAIL [22m[49m tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts[2m > [22mTC-009: reviewer が正典を弱化して自己 commit → round halt[2m > [22mfan-out 後に HEAD が前進していれば escalation halt し、ROUND_HEAD_ADVANCED コードが設定される
[31m[1mTypeError[22m: deps.roundGitEffects.digestArtifacts is not a function[39m
[36m [2m❯[22m ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:[2m114:52[22m[39m
    [90m112|[39m     [35mlet[39m currentCanonHash[33m:[39m string [33m|[39m [35mnull[39m [33m|[39m undefined [33m=[39m undefined[33m;[39m
    [90m113|[39m     [35mif[39m (deps[33m.[39mroundGitEffects) {
    [90m114|[39m       [35mconst[39m canonRefs [33m=[39m [35mawait[39m deps[33m.[39mroundGitEffects[33m.[39m[34mdigestArtifacts[39m(
    [90m   |[39m                                                    [31m^[39m
    [90m115|[39m         [34mcanonicalDocPaths[39m(deps[33m.[39mslug)[33m.[39m[34mmap[39m((p) [33m=>[39m ({ path[33m:[39m p }))[33m,[39m
    [90m116|[39m         cwd[33m,[39m
[90m [2m❯[22m tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts:[2m294:32[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/22]⎯[22m[39m

[41m[1m FAIL [22m[49m tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts[2m > [22mTC-010: reviewer が何も commit しなければ round は現行どおり進む[2m > [22mHEAD が前進していなければ round は現行の verdict 算出に進む
[31m[1mTypeError[22m: deps.roundGitEffects.digestArtifacts is not a function[39m
[36m [2m❯[22m ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:[2m114:52[22m[39m
    [90m112|[39m     [35mlet[39m currentCanonHash[33m:[39m string [33m|[39m [35mnull[39m [33m|[39m undefined [33m=[39m undefined[33m;[39m
    [90m113|[39m     [35mif[39m (deps[33m.[39mroundGitEffects) {
    [90m114|[39m       [35mconst[39m canonRefs [33m=[39m [35mawait[39m deps[33m.[39mroundGitEffects[33m.[39m[34mdigestArtifacts[39m(
    [90m   |[39m                                                    [31m^[39m
    [90m115|[39m         [34mcanonicalDocPaths[39m(deps[33m.[39mslug)[33m.[39m[34mmap[39m((p) [33m=>[39m ({ path[33m:[39m p }))[33m,[39m
    [90m116|[39m         cwd[33m,[39m
[90m [2m❯[22m tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts:[2m349:32[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/22]⎯[22m[39m

[41m[1m FAIL [22m[49m tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts[2m > [22mTC-011: round HEAD guard 違反時に diff 退避証跡が生成される[2m > [22mHEAD 前進が違反として検出された時、退避ファイルが .specrunner/local/<slug>/ に生成される
[31m[1mTypeError[22m: deps.roundGitEffects.digestArtifacts is not a function[39m
[36m [2m❯[22m ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:[2m114:52[22m[39m
    [90m112|[39m     [35mlet[39m currentCanonHash[33m:[39m string [33m|[39m [35mnull[39m [33m|[39m undefined [33m=[39m undefined[33m;[39m
    [90m113|[39m     [35mif[39m (deps[33m.[39mroundGitEffects) {
    [90m114|[39m       [35mconst[39m canonRefs [33m=[39m [35mawait[39m deps[33m.[39mroundGitEffects[33m.[39m[34mdigestArtifacts[39m(
    [90m   |[39m                                                    [31m^[39m
    [90m115|[39m         [34mcanonicalDocPaths[39m(deps[33m.[39mslug)[33m.[39m[34mmap[39m((p) [33m=>[39m ({ path[33m:[39m p }))[33m,[39m
    [90m116|[39m         cwd[33m,[39m
[90m [2m❯[22m tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts:[2m437:32[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/22]⎯[22m[39m

[41m[1m FAIL [22m[49m tests/unit/step/unpushable-path-escalation.test.ts[2m > [22mTC-037 / TC-015 / TC-016: commitAndPush Layer 2 backstop[2m > [22mTC-037: throws UNPUSHABLE_PATH_BLOCKED when workflow file is in publishable set
[31m[1mTypeError[22m: Cannot read properties of undefined (reading 'code')[39m
[36m [2m❯[22m tests/unit/step/unpushable-path-escalation.test.ts:[2m591:42[22m[39m
    [90m589|[39m     }
    [90m590|[39m
    [90m591|[39m     expect((thrown as { code?: string }).code).toBe(ERROR_CODES.UNPUSH…
    [90m   |[39m                                          [31m^[39m
    [90m592|[39m   })[33m;[39m
    [90m593|[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/22]⎯[22m[39m

[41m[1m FAIL [22m[49m tests/unit/step/unpushable-path-escalation.test.ts[2m > [22mTC-037 / TC-015 / TC-016: commitAndPush Layer 2 backstop[2m > [22mTC-016: error message contains the matched path and environment constraint
[31m[1mTypeError[22m: Cannot read properties of undefined (reading 'message')[39m
[36m [2m❯[22m tests/unit/step/unpushable-path-escalation.test.ts:[2m666:30[22m[39m
    [90m664|[39m
    [90m665|[39m     [90m// The error message should name the path[39m
    [90m666|[39m     expect((thrown as Error).message).toContain(".github/workflows/ci.…
    [90m   |[39m                              [31m^[39m
    [90m667|[39m     // The error message should name the environment constraint (sourc…
    [90m668|[39m     expect((thrown as Error).message).toContain("Environment constrain…

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/22]⎯[22m[39m

[41m[1m FAIL [22m[49m tests/unit/step/unpushable-path-escalation.test.ts[2m > [22mF1 round-trip: unpushablePathBlockedError → UnpushablePathBlockedError.matchedPaths[2m > [22mexecutor receives matchedPaths directly (finalizeErr instanceof UnpushablePathBlockedError)
[31m[1mAssertionError[22m: expected undefined to be an instance of UnpushablePathBlockedError[39m
[36m [2m❯[22m tests/unit/step/unpushable-path-escalation.test.ts:[2m863:23[22m[39m
    [90m861|[39m     // The error thrown by Layer 2 backstop should be an UnpushablePat…
    [90m862|[39m     [90m// with matchedPaths directly set (no regex involved)[39m
    [90m863|[39m     [34mexpect[39m(thrownErr)[33m.[39m[34mtoBeInstanceOf[39m([33mUnpushablePathBlockedError[39m)[33m;[39m
    [90m   |[39m                       [31m^[39m
    [90m864|[39m     [35mif[39m (thrownErr [35minstanceof[39m [33mUnpushablePathBlockedError[39m) {
    [90m865|[39m       expect(thrownErr.matchedPaths).toContain(".github/workflows/ci.y…

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/22]⎯[22m[39m

[41m[1m FAIL [22m[49m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts[2m > [22mParallelReviewRound git effects — push failure after commit → OID in synthesizedCommits[2m > [22mround does NOT throw when commitRoundArtifacts push fails
[31m[1mAssertionError[22m: promise rejected "TypeError: deps.roundGitEffects.digestArt…" instead of resolving[39m
[36m [2m❯[22m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:[2m680:6[22m[39m
    [90m678|[39m     [35mawait[39m [34mexpect[39m(
    [90m679|[39m       round.run(COORDINATOR, makeState(), makeDeps({ roundGitEffects: …
    [90m680|[39m     )[33m.[39mresolves[33m.[39m[34mtoBeDefined[39m()[33m;[39m
    [90m   |[39m      [31m^[39m
    [90m681|[39m   })[33m;[39m
    [90m682|[39m

[31m[1mCaused by: TypeError[22m: deps.roundGitEffects.digestArtifacts is not a function[39m
[36m [2m❯[22m ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:[2m114:52[22m[39m
[90m [2m❯[22m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:[2m679:13[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[11/22]⎯[22m[39m

[41m[1m FAIL [22m[49m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts[2m > [22mParallelReviewRound git effects — push failure after commit → OID in synthesizedCommits[2m > [22mround outcome is escalation and error.code is ROUND_COMMIT_PUSH_FAILED
[31m[1mTypeError[22m: deps.roundGitEffects.digestArtifacts is not a function[39m
[36m [2m❯[22m ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:[2m114:52[22m[39m
    [90m112|[39m     [35mlet[39m currentCanonHash[33m:[39m string [33m|[39m [35mnull[39m [33m|[39m undefined [33m=[39m undefined[33m;[39m
    [90m113|[39m     [35mif[39m (deps[33m.[39mroundGitEffects) {
    [90m114|[39m       [35mconst[39m canonRefs [33m=[39m [35mawait[39m deps[33m.[39mroundGitEffects[33m.[39m[34mdigestArtifacts[39m(
    [90m   |[39m                                                    [31m^[39m
    [90m115|[39m         [34mcanonicalDocPaths[39m(deps[33m.[39mslug)[33m.[39m[34mmap[39m((p) [33m=>[39m ({ path[33m:[39m p }))[33m,[39m
    [90m116|[39m         cwd[33m,[39m
[90m [2m❯[22m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:[2m692:32[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[12/22]⎯[22m[39m

[41m[1m FAIL [22m[49m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts[2m > [22mParallelReviewRound git effects — push failure after commit → OID in synthesizedCommits[2m > [22mpush-fail commit OID is appended to synthesizedCommits (prevents EGRESS_UNKNOWN_COMMIT on resume)
[31m[1mTypeError[22m: deps.roundGitEffects.digestArtifacts is not a function[39m
[36m [2m❯[22m ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:[2m114:52[22m[39m
    [90m112|[39m     [35mlet[39m currentCanonHash[33m:[39m string [33m|[39m [35mnull[39m [33m|[39m undefined [33m=[39m undefined[33m;[39m
    [90m113|[39m     [35mif[39m (deps[33m.[39mroundGitEffects) {
    [90m114|[39m       [35mconst[39m canonRefs [33m=[39m [35mawait[39m deps[33m.[39mroundGitEffects[33m.[39m[34mdigestArtifacts[39m(
    [90m   |[39m                                                    [31m^[39m
    [90m115|[39m         [34mcanonicalDocPaths[39m(deps[33m.[39mslug)[33m.[39m[34mmap[39m((p) [33m=>[39m ({ path[33m:[39m p }))[33m,[39m
    [90m116|[39m         cwd[33m,[39m
[90m [2m❯[22m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:[2m709:32[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[13/22]⎯[22m[39m

[41m[1m FAIL [22m[49m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts[2m > [22mParallelReviewRound git effects — pre-commit backstop rejection → HEAD unchanged → not recorded[2m > [22mround does NOT throw when backstop rejects before commit
[31m[1mAssertionError[22m: promise rejected "TypeError: deps.roundGitEffects.digestArt…" instead of resolving[39m
[36m [2m❯[22m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:[2m767:6[22m[39m
    [90m765|[39m     [35mawait[39m [34mexpect[39m(
    [90m766|[39m       round.run(COORDINATOR, makeState(), makeDeps({ roundGitEffects: …
    [90m767|[39m     )[33m.[39mresolves[33m.[39m[34mtoBeDefined[39m()[33m;[39m
    [90m   |[39m      [31m^[39m
    [90m768|[39m   })[33m;[39m
    [90m769|[39m

[31m[1mCaused by: TypeError[22m: deps.roundGitEffects.digestArtifacts is not a function[39m
[36m [2m❯[22m ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:[2m114:52[22m[39m
[90m [2m❯[22m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:[2m766:13[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[14/22]⎯[22m[39m

[41m[1m FAIL [22m[49m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts[2m > [22mParallelReviewRound git effects — pre-commit backstop rejection → HEAD unchanged → not recorded[2m > [22mbackstop rejection: outcome is escalation with ROUND_COMMIT_PUSH_FAILED
[31m[1mTypeError[22m: deps.roundGitEffects.digestArtifacts is not a function[39m
[36m [2m❯[22m ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:[2m114:52[22m[39m
    [90m112|[39m     [35mlet[39m currentCanonHash[33m:[39m string [33m|[39m [35mnull[39m [33m|[39m undefined [33m=[39m undefined[33m;[39m
    [90m113|[39m     [35mif[39m (deps[33m.[39mroundGitEffects) {
    [90m114|[39m       [35mconst[39m canonRefs [33m=[39m [35mawait[39m deps[33m.[39mroundGitEffects[33m.[39m[34mdigestArtifacts[39m(
    [90m   |[39m                                                    [31m^[39m
    [90m115|[39m         [34mcanonicalDocPaths[39m(deps[33m.[39mslug)[33m.[39m[34mmap[39m((p) [33m=>[39m ({ path[33m:[39m p }))[33m,[39m
    [90m116|[39m         cwd[33m,[39m
[90m [2m❯[22m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:[2m779:32[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[15/22]⎯[22m[39m

[41m[1m FAIL [22m[49m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts[2m > [22mParallelReviewRound git effects — pre-commit backstop rejection → HEAD unchanged → not recorded[2m > [22mbackstop rejection: pre-existing HEAD is NOT recorded in synthesizedCommits (ledger integrity)
[31m[1mTypeError[22m: deps.roundGitEffects.digestArtifacts is not a function[39m
[36m [2m❯[22m ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:[2m114:52[22m[39m
    [90m112|[39m     [35mlet[39m currentCanonHash[33m:[39m string [33m|[39m [35mnull[39m [33m|[39m undefined [33m=[39m undefined[33m;[39m
    [90m113|[39m     [35mif[39m (deps[33m.[39mroundGitEffects) {
    [90m114|[39m       [35mconst[39m canonRefs [33m=[39m [35mawait[39m deps[33m.[39mroundGitEffects[33m.[39m[34mdigestArtifacts[39m(
    [90m   |[39m                                                    [31m^[39m
    [90m115|[39m         [34mcanonicalDocPaths[39m(deps[33m.[39mslug)[33m.[39m[34mmap[39m((p) [33m=>[39m ({ path[33m:[39m p }))[33m,[39m
    [90m116|[39m         cwd[33m,[39m
[90m [2m❯[22m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:[2m796:32[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[16/22]⎯[22m[39m

[41m[1m FAIL [22m[49m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts[2m > [22mParallelReviewRound git effects — pre-observation null + backstop rejection → evidence-unavailable[2m > [22mround does NOT throw when pre-commit capture is null and backstop rejects
[31m[1mAssertionError[22m: promise rejected "TypeError: deps.roundGitEffects.digestArt…" instead of resolving[39m
[36m [2m❯[22m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:[2m869:6[22m[39m
    [90m867|[39m     [35mawait[39m [34mexpect[39m(
    [90m868|[39m       round.run(COORDINATOR, makeState(), makeDeps({ roundGitEffects: …
    [90m869|[39m     )[33m.[39mresolves[33m.[39m[34mtoBeDefined[39m()[33m;[39m
    [90m   |[39m      [31m^[39m
    [90m870|[39m   })[33m;[39m
    [90m871|[39m

[31m[1mCaused by: TypeError[22m: deps.roundGitEffects.digestArtifacts is not a function[39m
[36m [2m❯[22m ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:[2m114:52[22m[39m
[90m [2m❯[22m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:[2m868:13[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[17/22]⎯[22m[39m

[41m[1m FAIL [22m[49m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts[2m > [22mParallelReviewRound git effects — pre-observation null + backstop rejection → evidence-unavailable[2m > [22mnull pre-observation + backstop rejection: outcome is escalation
[31m[1mTypeError[22m: deps.roundGitEffects.digestArtifacts is not a function[39m
[36m [2m❯[22m ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:[2m114:52[22m[39m
    [90m112|[39m     [35mlet[39m currentCanonHash[33m:[39m string [33m|[39m [35mnull[39m [33m|[39m undefined [33m=[39m undefined[33m;[39m
    [90m113|[39m     [35mif[39m (deps[33m.[39mroundGitEffects) {
    [90m114|[39m       [35mconst[39m canonRefs [33m=[39m [35mawait[39m deps[33m.[39mroundGitEffects[33m.[39m[34mdigestArtifacts[39m(
    [90m   |[39m                                                    [31m^[39m
    [90m115|[39m         [34mcanonicalDocPaths[39m(deps[33m.[39mslug)[33m.[39m[34mmap[39m((p) [33m=>[39m ({ path[33m:[39m p }))[33m,[39m
    [90m116|[39m         cwd[33m,[39m
[90m [2m❯[22m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:[2m881:32[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[18/22]⎯[22m[39m

[41m[1m FAIL [22m[49m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts[2m > [22mParallelReviewRound git effects — pre-observation null + backstop rejection → evidence-unavailable[2m > [22mnull pre-observation + backstop rejection: existing HEAD OID NOT in synthesizedCommits (ledger integrity)
[31m[1mTypeError[22m: deps.roundGitEffects.digestArtifacts is not a function[39m
[36m [2m❯[22m ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:[2m114:52[22m[39m
    [90m112|[39m     [35mlet[39m currentCanonHash[33m:[39m string [33m|[39m [35mnull[39m [33m|[39m undefined [33m=[39m undefined[33m;[39m
    [90m113|[39m     [35mif[39m (deps[33m.[39mroundGitEffects) {
    [90m114|[39m       [35mconst[39m canonRefs [33m=[39m [35mawait[39m deps[33m.[39mroundGitEffects[33m.[39m[34mdigestArtifacts[39m(
    [90m   |[39m                                                    [31m^[39m
    [90m115|[39m         [34mcanonicalDocPaths[39m(deps[33m.[39mslug)[33m.[39m[34mmap[39m((p) [33m=>[39m ({ path[33m:[39m p }))[33m,[39m
    [90m116|[39m         cwd[33m,[39m
[90m [2m❯[22m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:[2m902:32[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[19/22]⎯[22m[39m

[41m[1m FAIL [22m[49m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts[2m > [22mParallelReviewRound git effects — pre-observation null + backstop rejection → evidence-unavailable[2m > [22mnull pre-observation + backstop rejection: hint reflects evidence-unavailable (not backstop hint)
[31m[1mTypeError[22m: deps.roundGitEffects.digestArtifacts is not a function[39m
[36m [2m❯[22m ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:[2m114:52[22m[39m
    [90m112|[39m     [35mlet[39m currentCanonHash[33m:[39m string [33m|[39m [35mnull[39m [33m|[39m undefined [33m=[39m undefined[33m;[39m
    [90m113|[39m     [35mif[39m (deps[33m.[39mroundGitEffects) {
    [90m114|[39m       [35mconst[39m canonRefs [33m=[39m [35mawait[39m deps[33m.[39mroundGitEffects[33m.[39m[34mdigestArtifacts[39m(
    [90m   |[39m                                                    [31m^[39m
    [90m115|[39m         [34mcanonicalDocPaths[39m(deps[33m.[39mslug)[33m.[39m[34mmap[39m((p) [33m=>[39m ({ path[33m:[39m p }))[33m,[39m
    [90m116|[39m         cwd[33m,[39m
[90m [2m❯[22m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:[2m920:32[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[20/22]⎯[22m[39m

[41m[1m FAIL [22m[49m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts[2m > [22mParallelReviewRound git effects — both HEAD observations non-null, different → OID recorded (positive control)[2m > [22mwhen both HEAD observations are non-null and differ, commit OID IS recorded in synthesizedCommits
[31m[1mTypeError[22m: deps.roundGitEffects.digestArtifacts is not a function[39m
[36m [2m❯[22m ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:[2m114:52[22m[39m
    [90m112|[39m     [35mlet[39m currentCanonHash[33m:[39m string [33m|[39m [35mnull[39m [33m|[39m undefined [33m=[39m undefined[33m;[39m
    [90m113|[39m     [35mif[39m (deps[33m.[39mroundGitEffects) {
    [90m114|[39m       [35mconst[39m canonRefs [33m=[39m [35mawait[39m deps[33m.[39mroundGitEffects[33m.[39m[34mdigestArtifacts[39m(
    [90m   |[39m                                                    [31m^[39m
    [90m115|[39m         [34mcanonicalDocPaths[39m(deps[33m.[39mslug)[33m.[39m[34mmap[39m((p) [33m=>[39m ({ path[33m:[39m p }))[33m,[39m
    [90m116|[39m         cwd[33m,[39m
[90m [2m❯[22m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:[2m979:32[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[21/22]⎯[22m[39m

[41m[1m FAIL [22m[49m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts[2m > [22mParallelReviewRound git effects — both HEAD observations non-null, different → OID recorded (positive control)[2m > [22mwhen both HEAD observations are non-null and differ, outcome is escalation (push failed)
[31m[1mTypeError[22m: deps.roundGitEffects.digestArtifacts is not a function[39m
[36m [2m❯[22m ParallelReviewRound.run src/core/pipeline/parallel-review-round.ts:[2m114:52[22m[39m
    [90m112|[39m     [35mlet[39m currentCanonHash[33m:[39m string [33m|[39m [35mnull[39m [33m|[39m undefined [33m=[39m undefined[33m;[39m
    [90m113|[39m     [35mif[39m (deps[33m.[39mroundGitEffects) {
    [90m114|[39m       [35mconst[39m canonRefs [33m=[39m [35mawait[39m deps[33m.[39mroundGitEffects[33m.[39m[34mdigestArtifacts[39m(
    [90m   |[39m                                                    [31m^[39m
    [90m115|[39m         [34mcanonicalDocPaths[39m(deps[33m.[39mslug)[33m.[39m[34mmap[39m((p) [33m=>[39m ({ path[33m:[39m p }))[33m,[39m
    [90m116|[39m         cwd[33m,[39m
[90m [2m❯[22m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:[2m998:32[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[22/22]⎯[22m[39m

error: script "test" exited with code 1

```

## Phase: lint

_(skipped — previous command failed)_

## Phase: changed-line-coverage

_(skipped — previous command failed)_

## Phase: lockfile-sync

_(skipped — previous command failed)_
