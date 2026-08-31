# Verification Result — runtime-mutation-lifecycle-capability-split — iter 1

## Verdict: passed

## Phase Results

| # | Phase | Status | Duration | Exit Code |
|---|-------|--------|----------|-----------|
| 1 | build | passed | 0.5s | 0 |
| 2 | typecheck | passed | 12.0s | 0 |
| 3 | test | passed | 75.0s | 0 |
| 4 | lint | passed | 11.4s | 0 |
| 5 | changed-line-coverage | passed | 93.1s | 0 |
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
[32mESM[39m ⚡️ Build success in 164ms

$ tsup
$ ! grep -qE "from ['\"]zod|require\\(['\"]zod" dist/specrunner.js

```

## Phase: typecheck

```
$ tsc --noEmit

```

## Phase: test

```

[1m[30m[46m RUN [49m[39m[22m [36mv4.1.5 [39m[90m.[39m

 [32m✓[39m tests/unit/core/archive/merge-then-archive.test.ts [2m([22m[2m37 tests[22m[2m)[22m[33m 353[2mms[22m[39m
 [32m✓[39m tests/unit/step/write-scope-bypass-closure.test.ts [2m([22m[2m42 tests[22m[2m)[22m[32m 240[2mms[22m[39m
 [32m✓[39m tests/unit/architecture/core-invariants.test.ts [2m([22m[2m72 tests[22m[2m)[22m[33m 471[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/agent-runner.test.ts [2m([22m[2m76 tests[22m[2m)[22m[33m 488[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/managed-agent/agent-runner.test.ts [2m([22m[2m55 tests[22m[2m)[22m[32m 280[2mms[22m[39m
 [32m✓[39m tests/unit/step/commit-push-write-scope.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 157[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/agent-runner-rollover.test.ts [2m([22m[2m44 tests[22m[2m)[22m[32m 111[2mms[22m[39m
 [32m✓[39m tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts [2m([22m[2m30 tests[22m[2m | [22m[33m1 skipped[39m[2m)[22m[33m 390[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/spec-observation-autofix.test.ts [2m([22m[2m59 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/core/archive/__tests__/merge-then-archive.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 293[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts [2m([22m[2m36 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m tests/unit/core/archive/orchestrator.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 171[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts [2m([22m[2m85 tests[22m[2m)[22m[32m 225[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/scope-escalation.test.ts [2m([22m[2m62 tests[22m[2m)[22m[33m 493[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/test-case-gen-design-phase.test.ts [2m([22m[2m49 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/spec-review-fixer-routing.test.ts [2m([22m[2m47 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/verdict-channel-unification.test.ts [2m([22m[2m102 tests[22m[2m)[22m[32m 108[2mms[22m[39m
 [32m✓[39m tests/unit/cli/repo-root-exactly-once.test.ts [2m([22m[2m49 tests[22m[2m)[22m[33m 2194[2mms[22m[39m
     [33m[2m✓[22m[39m TC-024: COMMANDS.init has requiresRepo: true [33m 1715[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/commit-orchestrator-rollover.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 83[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/local.test.ts [2m([22m[2m42 tests[22m[2m)[22m[33m 732[2mms[22m[39m
 [32m✓[39m tests/core/pipeline/pipeline.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 270[2mms[22m[39m
 [32m✓[39m tests/unit/step/factcheck-attestation.test.ts [2m([22m[2m84 tests[22m[2m)[22m[33m 445[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/post-fix-context.test.ts [2m([22m[2m39 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/github-client-pr.test.ts [2m([22m[2m57 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/commit-push-exclusion.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 63[2mms[22m[39m
 [32m✓[39m tests/unit/step/pipeline-sole-committer-synthesis.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 75[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/executor-no-op.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/spec-review-prior-round-context.test.ts [2m([22m[2m30 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts [2m([22m[2m354 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/checkpoint-restack.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/test-coverage.test.ts [2m([22m[2m58 tests[22m[2m)[22m[32m 130[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 299[2mms[22m[39m
 [32m✓[39m tests/adapter/managed-agent/agent-runner.test.ts [2m([22m[2m41 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.transitions.test.ts [2m([22m[2m71 tests[22m[2m)[22m[33m 351[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/commit-push-egress-invariant.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 53[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/custom-reviewer-round-context.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/runner-fidelity-gate.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 250[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/adr-gen.test.ts [2m([22m[2m51 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/guide.test.ts [2m([22m[2m189 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m tests/store/event-journal.test.ts [2m([22m[2m37 tests[22m[2m)[22m[32m 85[2mms[22m[39m
 [32m✓[39m tests/unit/core/decision/wontfix.test.ts [2m([22m[2m45 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/job-wait.test.ts [2m([22m[2m32 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/resume-operator-guidance.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m tests/pipeline-integration.test.ts [2m([22m[2m31 tests[22m[2m)[22m[33m 7629[2mms[22m[39m
     [33m[2m✓[22m[39m returns status='awaiting-merge', steps['spec-review'] has 1 element with verdict=approved, no spec-fixer steps [33m 1064[2mms[22m[39m
     [33m[2m✓[22m[39m persisted state has step='spec-review' after spec-fixer completes [33m 356[2mms[22m[39m
     [33m[2m✓[22m[39m returns status='awaiting-merge', code-review has 2 entries, code-fixer has 1 entry [33m 602[2mms[22m[39m
     [33m[2m✓[22m[39m sets error.code=CODE_REVIEW_RETRIES_EXHAUSTED and escalation verdict on last code-review (3 reviews) [32m 300[2mms[22m[39m
     [33m[2m✓[22m[39m SpecReviewStep.enrichContext is called and returns dynamicContext unchanged [33m 376[2mms[22m[39m
     [33m[2m✓[22m[39m baselineSpecs is undefined when no spec context is available [33m 487[2mms[22m[39m
     [33m[2m✓[22m[39m allowlist steps have projectContext === undefined when project.md does not exist [33m 480[2mms[22m[39m
     [33m[2m✓[22m[39m sets error.code=VERIFICATION_RETRIES_EXHAUSTED, escalation verdict on last verification, resumePoint.step=implementer [33m 438[2mms[22m[39m
     [33m[2m✓[22m[39m spec-review exhaustion halts at awaiting-resume; resume from resumePoint.step completes to awaiting-archive [33m 777[2mms[22m[39m
 [32m✓[39m tests/core/worktree/manager.test.ts [2m([22m[2m40 tests[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m tests/custom-reviewers-e2e.test.ts [2m([22m[2m14 tests[22m[2m)[22m[33m 4376[2mms[22m[39m
     [33m[2m✓[22m[39m security reviewer runs after code-review and pipeline completes [33m 353[2mms[22m[39m
     [33m[2m✓[22m[39m code-fixer receives findings attributed to the active reviewer (unit check) [33m 384[2mms[22m[39m
     [33m[2m✓[22m[39m reviewers from state.reviewers are used, not re-loaded from disk [33m 395[2mms[22m[39m
     [33m[2m✓[22m[39m ok=false from custom reviewer escalates to awaiting-resume [33m 452[2mms[22m[39m
     [33m[2m✓[22m[39m regression-gate reports high/fixable → code-fixer → gate re-runs → approved → conformance [33m 494[2mms[22m[39m
     [33m[2m✓[22m[39m decision-needed from regression-gate escalates to awaiting-resume [33m 443[2mms[22m[39m
     [33m[2m✓[22m[39m regression-gate with maxIterations=1 exhausts after budget [33m 763[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/commit-orchestrator-context-metrics.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 53[2mms[22m[39m
 [32m✓[39m tests/package-smoke-contract.test.ts [2m([22m[2m63 tests[22m[2m)[22m[32m 98[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/resume-adopt-commits.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 54[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor.commit.test.ts [2m([22m[2m11 tests[22m[2m)[22m[33m 302[2mms[22m[39m
 [32m✓[39m tests/unit/step/commit-and-push.test.ts [2m([22m[2m12 tests[22m[2m)[22m[33m 316[2mms[22m[39m
 [32m✓[39m tests/unit/core/cancel/runner.test.ts [2m([22m[2m39 tests[22m[2m)[22m[33m 575[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/runner.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 189[2mms[22m[39m
 [32m✓[39m tests/unit/step/review-exit-contract.test.ts [2m([22m[2m33 tests[22m[2m)[22m[32m 166[2mms[22m[39m
 [32m✓[39m tests/unit/no-worktree-mode.test.ts [2m([22m[2m26 tests[22m[2m)[22m[33m 1022[2mms[22m[39m
 [32m✓[39m tests/store/job-state-store.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 293[2mms[22m[39m
 [32m✓[39m tests/unit/core/prune/sidecar-runner.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.reverification.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 299[2mms[22m[39m
 [32m✓[39m tests/unit/step/unpushable-path-escalation.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 117[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/step-completion-missing-file-finding.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/adapter/codex/agent-runner.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 69[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/spec-fixer-tasks-md-writable.test.ts [2m([22m[2m32 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/resume-partial-canon.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 127[2mms[22m[39m
 [32m✓[39m tests/unit/inbox/orchestrator.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m tests/unit/inbox/planner.test.ts [2m([22m[2m61 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m src/core/archive/__tests__/orchestrator.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/fixer-push-capability.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/core/archive/achieved-assurance-revision-binding-integration.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 115[2mms[22m[39m
 [32m✓[39m tests/unit/step/test-coverage-violation-detail.test.ts [2m([22m[2m19 tests[22m[2m | [22m[90m2 todo[39m[2m)[22m[32m 57[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/halt-checkpoint-restack-e2e.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 1418[2mms[22m[39m
     [33m[2m✓[22m[39m pushes restacked checkpoint to origin when direct push is rejected [33m 617[2mms[22m[39m
     [33m[2m✓[22m[39m commitFinalState resolves without throwing when all pushes (direct + restack) are rejected [33m 397[2mms[22m[39m
     [33m[2m✓[22m[39m restack skips with remote-diverged when origin/<branch> has been advanced by another runner [33m 402[2mms[22m[39m
 [32m✓[39m tests/unit/core/job-list/operations-view.test.ts [2m([22m[2m48 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/reviewer-chain.test.ts [2m([22m[2m56 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/step/severity-fixability-split.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/parallel-review-round-canon.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m tests/resume-worktree-reconciliation-e2e.test.ts [2m([22m[2m8 tests[22m[2m)[22m[33m 699[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/reopen-command.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/core/design-layer/__tests__/topic-emission.test.ts [2m([22m[2m36 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/job-stats.test.ts [2m([22m[2m39 tests[22m[2m)[22m[32m 96[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.conformance-routing.test.ts [2m([22m[2m9 tests[22m[2m)[22m[33m 746[2mms[22m[39m
 [32m✓[39m tests/attach/verify-checkpoint.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/core/archive/__tests__/plain-archive.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/core/provider-readiness-gate.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/changed-line-coverage-type-only.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 48[2mms[22m[39m
 [32m✓[39m tests/unit/cli/command-spec-api.test.ts [2m([22m[2m94 tests[22m[2m)[22m[32m 68[2mms[22m[39m
 [32m✓[39m tests/unit/step/content-format-detection.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 80[2mms[22m[39m
 [32m✓[39m tests/pipeline-sole-committer-e2e.test.ts [2m([22m[2m4 tests[22m[2m)[22m[33m 790[2mms[22m[39m
     [33m[2m✓[22m[39m pipeline 管理パス（state.json）は finalize commit に含まれる（正常系検証） [33m 391[2mms[22m[39m
 [32m✓[39m tests/unit/core/notify/issue-notifier.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/git/__tests__/transport-auth.test.ts [2m([22m[2m44 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/commit-orchestrator.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/unit/core/attestation/build-attestation.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/reviewer-activation-e2e.test.ts [2m([22m[2m9 tests[22m[2m)[22m[33m 2202[2mms[22m[39m
     [33m[2m✓[22m[39m reviewer activates when requestType matches [33m 304[2mms[22m[39m
     [33m[2m✓[22m[39m TC-ACT-02 (requestTypes不一致): reviewer is skipped when requestType does NOT match → awaiting-archive (structural skip) [33m 645[2mms[22m[39m
     [33m[2m✓[22m[39m reviewer with no conditions runs and is not skipped [33m 392[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.episode-reset.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 188[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/request.test.ts [2m([22m[2m41 tests[22m[2m)[22m[32m 130[2mms[22m[39m
 [32m✓[39m tests/unit/pipeline/transition-when.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 56[2mms[22m[39m
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
Detached pipeline started for: test-slug
  Monitor: specrunner job wait test-slug
  Details: specrunner job show test-slug
 [32m✓[39m tests/dead-code-adapter-cli.test.ts [2m([22m[2m75 tests[22m[2m)[22m[33m 4282[2mms[22m[39m
     [33m[2m✓[22m[39m assertBreakAfterCompletion has no references [33m 331[2mms[22m[39m
     [33m[2m✓[22m[39m REPORT_TOOL_CUSTOM_TOOL_SPEC has no references [33m 374[2mms[22m[39m
     [33m[2m✓[22m[39m checkConfigComplete has no references [33m 303[2mms[22m[39m
     [33m[2m✓[22m[39m isTextDelta has no references in src/ bin/ tests/ [33m 301[2mms[22m[39m
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
 [32m✓[39m src/core/command/__tests__/detach-ack.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/context-observer.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/lineage-output-attribution.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/findings-ledger.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/agent-runner-context-metrics.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 100[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/judge-verdict-canon.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline-roles.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 48[2mms[22m[39m
 [32m✓[39m tests/config/schema.test.ts [2m([22m[2m69 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 293[2mms[22m[39m
 [32m✓[39m tests/unit/dead-code-core.test.ts [2m([22m[2m124 tests[22m[2m)[22m[33m 1055[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/commit-push-guarded-staging.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m tests/attach/attach-integration.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 2089[2mms[22m[39m
     [33m[2m✓[22m[39m state is discoverable by slug after attach [33m 429[2mms[22m[39m
     [33m[2m✓[22m[39m checkpointOid from runAttachVerification matches the commit OID that commitFinalState pushed [33m 465[2mms[22m[39m
     [33m[2m✓[22m[39m worktree HEAD is the pre-advance OID even when origin branch moved after runAttachVerification [33m 341[2mms[22m[39m
 [32m✓[39m tests/error-path-integration.test.ts [2m([22m[2m6 tests[22m[2m)[22m[33m 1444[2mms[22m[39m
     [33m[2m✓[22m[39m verification with mixed phase results (build ok, test fail) routes to implementer recovery [33m 656[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/query-one-shot.test.ts [2m([22m[2m23 tests[22m[2m)[22m[32m 69[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.build-fixer-reentry.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 216[2mms[22m[39m
 [32m✓[39m tests/operator-canon-apply-on-resume-e2e.test.ts [2m([22m[2m11 tests[22m[2m)[22m[33m 855[2mms[22m[39m
 [32m✓[39m tests/attach/attach-resume-e2e.test.ts [2m([22m[2m1 test[22m[2m)[22m[33m 824[2mms[22m[39m
     [33m[2m✓[22m[39m Machine A creates awaiting-resume checkpoint on origin; Machine B attaches and resumes implementer via real ResumeCommand [33m 823[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/commit-push-staged-bytes-guard.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/agent-runner-report-settles.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m tests/unit/core/archive/merge-then-archive-floor.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 124[2mms[22m[39m
 [32m✓[39m tests/canon-binding-e2e.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 418[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/fast-scope-checkpoint.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 234[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/from-issue.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/reverification.test.ts [2m([22m[2m37 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/init.test.ts [2m([22m[2m30 tests[22m[2m)[22m[33m 660[2mms[22m[39m
     [33m[2m✓[22m[39m TC-001: COMMANDS.init.requiresRepo === true（dispatch レベルで repo 必須が宣言されている） [33m 433[2mms[22m[39m
 [32m✓[39m tests/unit/core/archive/achieved-assurance-revision-binding-unit.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/config/step-config.test.ts [2m([22m[2m36 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/state/lifecycle.test.ts [2m([22m[2m105 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/agent-runner-port.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 89[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 88[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/runner-integrity.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 120[2mms[22m[39m
 [32m✓[39m tests/unit/step/code-fixer.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/resume-reconcile.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 67[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/finding-recency.test.ts [2m([22m[2m23 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/prior-round-context.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/job-stats-metrics.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 63[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-verdict.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 134[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/resume-apply-canon.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 77[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/agent-runner-timeout-last-tool.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 43[2mms[22m[39m
 [32m✓[39m tests/unit/core/archive/achieved-assurance-completeness-integration.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 111[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/github-client-request.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/resume-partial-canon-quarantine-e2e.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 418[2mms[22m[39m
 [32m✓[39m tests/unit/step/write-scope-bypass-closure-integration.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 407[2mms[22m[39m
 [32m✓[39m tests/unit/core/archive/achieved-assurance-completeness-unit.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/anthropic-step-model-refresh.test.ts [2m([22m[2m36 tests[22m[2m)[22m[32m 75[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.cli-step-output.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 58[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/test-coverage-gate-exclusion.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 65[2mms[22m[39m
 [32m✓[39m tests/unit/architecture/write-scope-invariants.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 148[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-activation.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 175[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/lockfile-sync.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m src/core/issue-target/__tests__/resume.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/step/pr-create.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 77[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/runner.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 125[2mms[22m[39m
 [32m✓[39m tests/unit/cli/managed.test.ts [2m([22m[2m21 tests[22m[2m)[22m[33m 333[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/runner-reload-egress-e2e.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 404[2mms[22m[39m
 [32m✓[39m tests/unit/cli/progress.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/unit/core/occupancy/guard.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/changed-line-coverage.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 79[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m tests/completion.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 123[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/runner-reload-after-setup.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 47[2mms[22m[39m
 [32m✓[39m tests/unit/cli/job-show.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 74[2mms[22m[39m
 [32m✓[39m src/core/lifecycle/__tests__/exit-guard.test.ts [2m([22m[2m16 tests[22m[2m)[22m[33m 851[2mms[22m[39m
 [32m✓[39m tests/unit/architecture/value-import-scc.test.ts [2m([22m[2m23 tests[22m[2m)[22m[33m 660[2mms[22m[39m
     [33m[2m✓[22m[39m no strongly-connected components with size > 1 exist in src/ [33m 614[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/resume-from-issue.test.ts [2m([22m[2m30 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/read-file-at-commit.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/core/pipeline/pipeline.guard-halt.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 173[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/reviewer-status-canon.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/finish-ps-integration.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 73[2mms[22m[39m
 [32m✓[39m src/store/__tests__/event-journal-checkpoint-restack.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/reviewer-status.test.ts [2m([22m[2m42 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/bootstrap-egress-ledger-wm.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 45[2mms[22m[39m
 [32m✓[39m tests/dedup-verified-safe.test.ts [2m([22m[2m24 tests[22m[2m)[22m[33m 2069[2mms[22m[39m
     [33m[2m✓[22m[39m TC-005: 'computeCodeReviewIteration' call/definition is absent from src/ and tests/ [33m 312[2mms[22m[39m
     [33m[2m✓[22m[39m TC-005: 'computeSpecReviewIteration' call/definition is absent from src/ and tests/ [33m 446[2mms[22m[39m
     [33m[2m✓[22m[39m TC-005: 'computeRequestReviewIteration' call/definition is absent from src/ and tests/ [33m 495[2mms[22m[39m
     [33m[2m✓[22m[39m TC-005: 'computeConformanceIteration' call/definition is absent from src/ and tests/ [33m 336[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/resolve-scope.test.ts [2m([22m[2m44 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/pipeline.test.ts [2m([22m[2m8 tests[22m[2m)[22m[33m 447[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/executor-verdict.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 244[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/executor.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 221[2mms[22m[39m
 [32m✓[39m tests/adapter/claude-code/provider-readiness-probe.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/step/unpushable-path-contract.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/managed.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 119[2mms[22m[39m
 [32m✓[39m src/core/inbox/__tests__/run-inbox.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/contract/agent-runner-contracts.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/archive-from-issue.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/custom-reviewer-step.test.ts [2m([22m[2m23 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/commit-scoped-paths.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m tests/unit/core/port/report-result-findings.test.ts [2m([22m[2m47 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/util/detect-pm.test.ts [2m([22m[2m44 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/step/code-review.test.ts [2m([22m[2m33 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-output-gate.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 108[2mms[22m[39m
 [32m✓[39m tests/unit/config/schema.test.ts [2m([22m[2m51 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/spec-review-step.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 241[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/apply-canon.test.ts [2m([22m[2m19 tests[22m[2m)[22m[33m 340[2mms[22m[39m
 [32m✓[39m tests/unit/core/decision/decision-ledger.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/step/step-io-contracts.test.ts [2m([22m[2m76 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/apply-canon-provenance.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/adopt-commits.test.ts [2m([22m[2m17 tests[22m[2m)[22m[33m 547[2mms[22m[39m
 [32m✓[39m src/prompts/__tests__/fragment-coverage.test.ts [2m([22m[2m125 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/result-yaml-ownership.test.ts [2m([22m[2m35 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/step/output-verify.test.ts [2m([22m[2m42 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/executor-sequential-regression.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/shared/artifact-bundle.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m tests/unit/git/push-capability.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/absorb-build-fixer/pipeline-exhaustion.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 57[2mms[22m[39m
 [32m✓[39m tests/unit/state/pipeline-sole-committer-state.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/core/port/__tests__/evidence-enforcement.test.ts [2m([22m[2m35 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/config/runtime-config.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 219[2mms[22m[39m
 [32m✓[39m tests/adapter/codex/strict-schema.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/pipeline-run-input-completeness.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m src/state/__tests__/artifact-observability.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/staging-containment.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/test-coverage-manual-exclusion.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 62[2mms[22m[39m
 [32m✓[39m tests/unit/cli/resume.test.ts [2m([22m[2m14 tests[22m[2m)[22m[33m 1415[2mms[22m[39m
     [33m[2m✓[22m[39m runs pipeline and returns exit code 0 when job is awaiting-resume [33m 428[2mms[22m[39m
 [32m✓[39m tests/unit/util/copy-artifacts.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 68[2mms[22m[39m
 [32m✓[39m tests/unit/runtime/validate-step-outputs.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 81[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/login.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/step-context-builder.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/staged-bytes-containment.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/exclusion-aware-validation.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/reconcile-worktree.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m src/core/archive/__tests__/workflow-ci-detection.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/credentials.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 72[2mms[22m[39m
 [32m✓[39m src/adapter/codex/__tests__/completion-contract-injection.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m tests/unit/absorb-build-fixer/implementer-recovery.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/judge-verdict.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/spec-review-scope-exclusion.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 71[2mms[22m[39m
 [32m✓[39m tests/unit/step/staging-exclusion-pipeline-integration.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 224[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/git-command-classifier.test.ts [2m([22m[2m94 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/executor-drift-detection.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 48[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/resume.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 61[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/conformance.test.ts [2m([22m[2m51 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/round-git-scope.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/signal-name-in-interruption.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 69[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/agent-runner-inactivity-timeout.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 81[2mms[22m[39m
 [32m✓[39m tests/core/step/step-interface.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 75[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/capability-consumers.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/cli-stdout-snapshot.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-no-op.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 53[2mms[22m[39m
 [32m✓[39m tests/templates/step-output-templates.test.ts [2m([22m[2m48 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/core/issue-target/__tests__/archive.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 15[2mms[22m[39m
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
 [32m✓[39m src/core/command/__tests__/detach.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/cli/doctor-repo-root.test.ts [2m([22m[2m6 tests[22m[2m)[22m[33m 458[2mms[22m[39m
     [33m[2m✓[22m[39m runDoctor with extended opts { repoRoot: null } completes and returns non-zero exit code [33m 366[2mms[22m[39m
 [32m✓[39m src/adapter/codex/__tests__/scope-guidance-injection.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m tests/finish-job-state.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 67[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/parallel-review-round-state-commit.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/judge-verdict-evidence.test.ts [2m([22m[2m30 tests[22m[2m)[22m[32m 82[2mms[22m[39m
 [32m✓[39m tests/core/usage/usage-summary.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/core/inbox/__tests__/planner.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/absorb-test-materialize-transitions.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/verification-phase-outcome-executor.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 146[2mms[22m[39m
 [32m✓[39m tests/unit/core/port/report-result-observations.test.ts [2m([22m[2m30 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/sandbox-scope.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-input-validation.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/managed-runtime-capabilities.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/attach/checkpoint-policy.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-resume-context.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 64[2mms[22m[39m
 [32m✓[39m tests/unit/step/fixer-findings.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/findings-ledger-canon.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.notification.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/resume-wontfix.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-lifecycle-ordering.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 77[2mms[22m[39m
 [32m✓[39m tests/unit/core/cancel/runner-process-gate.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 114[2mms[22m[39m
 [32m✓[39m tests/adapter/codex/agent-runner-transient-retry.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m tests/unit/store/finding-recency-journal.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/rules-new.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 92[2mms[22m[39m
 [32m✓[39m tests/unit/step/write-scope.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/core/request/store.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 61[2mms[22m[39m
 [32m✓[39m tests/state-store.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 94[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-drift-detection.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 99[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/pipeline-run-gate.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m tests/unit/core/gate/issue-fidelity-gate.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/safety.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/absorb-build-fixer/transitions.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/store/__tests__/event-journal-operator-event.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/core/design-layer/orchestrator-hook.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 150[2mms[22m[39m
 [32m✓[39m tests/unit/core/sidecar/orphan.test.ts [2m([22m[2m23 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m tests/attach/orchestrator.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/pipeline/transition-parity.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/runner-coverage-gate.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 54[2mms[22m[39m
 [32m✓[39m tests/bootstrap-egress-ledger-e2e.test.ts [2m([22m[2m6 tests[22m[2m)[22m[33m 429[2mms[22m[39m
 [32m✓[39m tests/parser.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/canon-write-scope.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 101[2mms[22m[39m
 [32m✓[39m tests/state/helpers.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/executor-cli-entry-oid.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 175[2mms[22m[39m
 [32m✓[39m src/util/__tests__/spawn-background-detach.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/runner-lockfile-gate.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m tests/core/usage/pricing.test.ts [2m([22m[2m36 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/local-read-revision-content.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/store/journal-integrity.test.ts [2m([22m[2m23 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/resume-from-exit-code.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/adapter/codex/__tests__/agent-runner-completion-report.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m tests/prompts/design-system.test.ts [2m([22m[2m44 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/core/resume/resolve-step.test.ts [2m([22m[2m44 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/adapter/codex/scope-guidance-provider-isolation.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 127[2mms[22m[39m
 [32m✓[39m src/git/__tests__/push-capability.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/touched-files-recorder.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/local-power-assertion.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 81[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/parallel-review-round-resume.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/main-checkout-guard.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 100[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/type-only.test.ts [2m([22m[2m52 tests[22m[2m)[22m[32m 11[2mms[22m[39m
No jobs found.
[実行中]
JOB_ID	SLUG	STEP	STATUS	NEXT	AGE
job-run-	slug-job-run-1	init	running (stale?)	job resume slug-job-run-1	242d
{
  "categories": []
}
 [32m✓[39m tests/unit/cli/ps-filter.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m tests/unit/inbox/occupancy-propagation.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-commit-mutex.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 88[2mms[22m[39m
 [32m✓[39m tests/unit/cli/flag-parser.test.ts [2m([22m[2m39 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/config/__tests__/staging-config-validation.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/resume-operator-adjudication.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/core/worktree/orphan.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/pipeline-sole-committer-final-state.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/agent-runner-invocation-metrics.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/commit-push-restack-integration.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/cli/removed-commands.test.ts [2m([22m[2m16 tests[22m[2m)[22m[33m 1124[2mms[22m[39m
     [33m[2m✓[22m[39m specrunner ps → 'Unknown command: ps' を出力し exit 2 で終了 [33m 386[2mms[22m[39m
 [32m✓[39m tests/unit/state/satisfies-floor.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/select-pending-revision-binding.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/core/archive/__tests__/post-merge-integrity.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/util/gitignore.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 47[2mms[22m[39m
 [32m✓[39m tests/unit/generate-chain-removed.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 70[2mms[22m[39m
 [32m✓[39m tests/error-codes.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 131[2mms[22m[39m
 [32m✓[39m tests/unit/core/resume/safety.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/compose-reviewers.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m tests/dispatch-workflow-reopen-action.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/routed-findings.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/pipeline/descriptor-input-completeness.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/adapter/managed-agent/__tests__/prompt-rules-injection.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/cli/hint-command-references.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 53[2mms[22m[39m
 [32m✓[39m tests/unit/core/doctor/orphan-sidecars-check.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/usage-show-context-metrics.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m tests/unit/agent/syncer.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/logger/__tests__/pipeline-logger.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/pipeline-run-reviewer-snapshot.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/commit-orchestrator-touched-files.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/resume-hard-crash.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/scope-warning.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/conformance-revision-binding.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/post-work-prompt-invariant.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.storeFactory.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/parser/extract-section.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/workspace-materializer-link.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/executor-round-produce.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m tests/unit/cli/request-new-repo-root.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 693[2mms[22m[39m
     [33m[2m✓[22m[39m exits with code 2 when there is no git repository (repoRoot is null) [33m 490[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/verify-finding-refs.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m tests/local-no-jobs-dir-writes.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 225[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/canon-escalation.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/reopen-approval-invalidation.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/reconcile-worktree-exclusion.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 43[2mms[22m[39m
 [32m✓[39m src/state/__tests__/operator-adjudication-schema.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/unit/doctor/next-steps.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/run-result.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/commit-orchestrator-usage-metrics.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/runtime/unpushable-path-validate.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/cli/resume-help.test.ts [2m([22m[2m20 tests[22m[2m)[22m[33m 1089[2mms[22m[39m
     [33m[2m✓[22m[39m TC-007: job resume --help で exit 0 [33m 340[2mms[22m[39m
 [32m✓[39m src/core/port/__tests__/report-result.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/core/archive/archive-cleanup.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/config/store.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 43[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-skip-when.test.ts [2m([22m[2m6 tests[22m[2m)[22m[33m 385[2mms[22m[39m
 [32m✓[39m tests/unit/cli/prune-combined.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/runtime-capability-gate.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/core/cancel/sidecar-teardown.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 171[2mms[22m[39m
 [32m✓[39m tests/core/steps/spec-review.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 64[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/test-gen-exemption.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/detach-output-contract.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/step/pipeline-sole-committer-egress.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/core/lifecycle/exit-guard.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 375[2mms[22m[39m
 [32m✓[39m src/core/command/__tests__/resume-member-context.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/runtime/validate-step-inputs.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 60[2mms[22m[39m
 [32m✓[39m src/store/__tests__/job-state-store-list-with-source-dirs.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m src/core/reviewers/__tests__/load-validate.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/regression-gate-false-loop.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/artifact-bundle-injection.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 210[2mms[22m[39m
 [32m✓[39m src/adapter/codex/__tests__/agent-runner-timeout-last-tool.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/dispatch-workflow-archive-action.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/bootstrap-egress-ledger-managed.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 72[2mms[22m[39m
 [32m✓[39m tests/unit/cli/specrunner-resume-dispatch.test.ts [2m([22m[2m13 tests[22m[2m)[22m[33m 1192[2mms[22m[39m
     [33m[2m✓[22m[39m calls runResume with the slug argument [33m 392[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/credential-injection.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m tests/unit/no-worktree-archive.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 52[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/round-git-scope-pipeline-managed.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/doctor-config-overlay.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 73[2mms[22m[39m
 [32m✓[39m tests/unit/config/schema-minimum-assurance.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/types.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/step/pr-create-attestation.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 58[2mms[22m[39m
 [32m✓[39m tests/unit/core/prune/runner.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/resolve-step.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/prompts/test-case-gen-system.test.ts [2m([22m[2m30 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/job-stats-cross-slug.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 98[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/transient-error.test.ts [2m([22m[2m48 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/resolve-step-test-materialize-alias.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/adapter/managed-agent/error-helpers.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/detach-flag-cli.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/request-review-verdict-evidence.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/cli.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 535[2mms[22m[39m
     [33m[2m✓[22m[39m exits with code 2 when config does not exist (CONFIG_MISSING → ARG_ERROR) [33m 490[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/runner-abort-hub.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/github-client-inbox.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/architecture/invariant-catalog-parity.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/codex/scoped-codex-auth.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/fast-descriptor.test.ts [2m([22m[2m42 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/executor-oid-capture.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/multi-layer-defense.test.ts [2m([22m[2m2 tests[22m[2m)[22m[33m 471[2mms[22m[39m
     [33m[2m✓[22m[39m design → spec-review(approved) → awaiting-merge [33m 327[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/pipeline-run-duplicate-guard.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/prompt-rules-injection.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 198[2mms[22m[39m
 [32m✓[39m tests/core/runtime/provider-readiness.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/test-case-gen-step.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/unit/core/occupancy/scan.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/core/pr-create/runner.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/step/push-capability-notice.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/verification-config-reload.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/command-registry-reopen.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 206[2mms[22m[39m
Detached pipeline started for: integration-slug
  Monitor: specrunner job wait integration-slug
  Details: specrunner job show integration-slug
Detached pipeline started for: ordering-test-slug
  Monitor: specrunner job wait ordering-test-slug
  Details: specrunner job show ordering-test-slug
Detached pipeline started for: wait-compat-slug
  Monitor: specrunner job wait wait-compat-slug
  Details: specrunner job show wait-compat-slug
 [32m✓[39m src/core/command/__tests__/detach-integration.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/regression-gate-step.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/changed-lines-origin-fallback.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/core/attach/__tests__/checkpoint-policy.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/state/__tests__/evidence-backward-compat.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-helpers.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 188[2mms[22m[39m
 [32m✓[39m src/templates/__tests__/step-output-templates.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/adoption-halt.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/agent/syncer-rollback.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/prompts/test-placement.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/pipeline-one-shot-resume.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/contract/golden-cases.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m tests/unit/cli/job-stats-repo-root.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 676[2mms[22m[39m
     [33m[2m✓[22m[39m reports the same run count when invoked from subdir vs repo root [33m 538[2mms[22m[39m
 [32m✓[39m tests/unit/core/occupancy/repair.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/local-duplicate-guard.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/scope.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/adapter/codex/agent-runner-inactivity-timeout.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-verbose-log.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m tests/prompts/spec-review-system.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/core/resume/state-based-resolve.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 47[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/judge-verdict-conformance.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/test-coverage-comment-form.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.crash-state.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m tests/core/usage/store.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/adapter/shared/__tests__/touched-files-bundle.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/command/request-prompt.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/core/doctor/checks/storage/slug-occupancy.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/fixer-helpers-conformance.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/test-coverage-boundary.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/fragments.test.ts [2m([22m[2m40 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/commit-final-state.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/runtime/list-changed-files.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/step-completion-canon.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/core/credentials/__tests__/credentials-io.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/prompts/dynamic-context-prompts.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/reload-coverage-config.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/git/checkpoint-ref.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/config/migrate.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/cli/login.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/local-round-git.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/logger/log-level.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/verification/runner-test-gen-exemption.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 81[2mms[22m[39m
 [32m✓[39m src/core/archive/__tests__/achieved-assurance.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/spec-exempt-runtime.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/verification-step.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/step/judge-verdict.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/core/archive/__tests__/achieved-assurance-no-base-oid.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/local-runtime-capabilities.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/core/usage/context-metrics-types.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/core/step/rules-delivery.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/config/schema-coverage.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/core/reviewers/__tests__/activation.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/no-op-detect-exemption.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/adapter/codex/__tests__/touched-files-injection.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/logger/verbose-log.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m tests/unit/cli/cancel.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 223[2mms[22m[39m
 [32m✓[39m tests/unit/cli/command-context.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/util/copy-artifacts.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 54[2mms[22m[39m
 [32m✓[39m tests/unit/step/test-cases-decouple.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/docs/test-coverage-gate-contract.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/unit/agent/registry.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/cli/doctor-repair.test.ts [2m([22m[2m6 tests[22m[2m)[22m[33m 650[2mms[22m[39m
     [33m[2m✓[22m[39m calls process.exit(2) when no slug is provided [33m 365[2mms[22m[39m
 [32m✓[39m tests/schema.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/remove-session-timeout.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 168[2mms[22m[39m
 [32m✓[39m tests/config/model-registry.test.ts [2m([22m[2m32 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/cli/help-flag-dispatch.test.ts [2m([22m[2m18 tests[22m[2m)[22m[33m 1123[2mms[22m[39m
     [33m[2m✓[22m[39m exits with code 0 [33m 336[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/capability-contracts.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/member-resume-routing.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/util/git-exec.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/touched-files-injection.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/unit/step/spec-review-lightweight.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/architecture/request-entrance-llm-boundary.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 133[2mms[22m[39m
 [32m✓[39m tests/cli-run-verdict.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/bootstrap-egress-ledger-local.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 47[2mms[22m[39m
 [32m✓[39m tests/unit/util/glob-match.test.ts [2m([22m[2m32 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/core/port/__tests__/request-review-evidence-parse.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/cli/archive-minimum-assurance.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 195[2mms[22m[39m
 [32m✓[39m tests/unit/core/pr-create/body-template.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/store/job-state-store-changedir.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m src/core/port/__tests__/request-review-legacy-compat.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/step/write-scope-bypass-closure-write-scope.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/prompts/__tests__/evidence-fragment-coverage.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/request-review-step-completion-evidence.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/core/credentials/anthropic.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 76[2mms[22m[39m
 [32m✓[39m tests/config/merge.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/config/type-config.test.ts [2m([22m[2m47 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/state/job-slug.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/attach/verify-checkpoint-r1-assurance.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/managed-agent/agent-runner-verbose-log.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/core/reviewers/__tests__/definition.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/occupancy-e2e.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 46[2mms[22m[39m
 [32m✓[39m tests/local-job-index.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m tests/unit/cli/archive-plain-merge-detection.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 213[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/reopen-terminal-slug.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 66[2mms[22m[39m
 [32m✓[39m tests/core/credentials/github.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 107[2mms[22m[39m
 [32m✓[39m tests/prompts/implementer-system.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/step-names.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/core/doctor/checks/runtime/__tests__/aozu-cli.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/jobs-dir-no-readdir.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m tests/unit/core/port/report-result.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/step/regression-gate-skip-when.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/runner-skip-detect.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 74[2mms[22m[39m
 [32m✓[39m src/state/__tests__/lifecycle-reopen.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/core/attestation/render-comment.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/cli/specrunner-worktree-guard.test.ts [2m([22m[2m8 tests[22m[2m)[22m[33m 928[2mms[22m[39m
     [33m[2m✓[22m[39m exits with code 2 and prints worktree guard error [33m 442[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/reviewer-capability.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/verification/runner-commands.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 80[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/egress-resolution-options.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/last-commit-touching-path.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/implementer-materialize.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/step/write-scope-rules-consistency.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/cli/issue-flag.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/core/doctor/checks/config/__tests__/claude-code-token-present.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/cli/inbox-run.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/session-log-writer.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/unit/core/occupancy/claim.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/github-client-dev-links.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/attach/workspace-materializer-attach.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/state/__tests__/touched-files-schema.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/state/bite-evidence-record-schema.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/state/profile-roundtrip.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/hint-command-existence.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/iteration-display.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor.store-cache.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/core/usage/store-backward-compat.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/core/step/fixer-helpers.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/executor-commit-mutex.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 73[2mms[22m[39m
 [32m✓[39m tests/unit/step/agent-definition.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/runner-path-mask.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 62[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/local-snapshot-guard.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/adapter/codex/__tests__/artifact-bundle-injection.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/design-system.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/usage-show-metrics.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/design-spec-exempt-contract.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/executor-round-commit.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/provider-sdk-loader.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/core/job/__tests__/start-from-issue.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/cancel-process-group-integration.test.ts [2m([22m[2m2 tests[22m[2m)[22m[33m 540[2mms[22m[39m
     [33m[2m✓[22m[39m TC-021 (破壊確認): child survives when isGroupLeader returns false [33m 338[2mms[22m[39m
 [32m✓[39m src/util/__tests__/paths-canonical.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/core/job-access/resolve-state-store.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m tests/unit/core/cancel/pid-kill.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/agent-runner-hub.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/core/usage/invocation-types.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/adapter/codex/agent-runner-observability.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/unit/doctor/xdg-config-file-exists.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/test-case-gen-gate-contract.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/runtime/git-fetch-error.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/registry-invariants.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/runner-git-show-env.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 58[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/agent-redirect-integration.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/util/spawn-background.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/pipeline-run.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/store/__tests__/touched-files-resume.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/cli/doctor-help.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 629[2mms[22m[39m
     [33m[2m✓[22m[39m doctor --help で exit 0 [33m 358[2mms[22m[39m
 [32m✓[39m src/core/archive/__tests__/archived-slug-by-job-id.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m src/adapter/codex/__tests__/prompt-rules-injection.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/git/git-spawn-env.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/issue-fidelity-comparator.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/absorb-build-fixer/state-compat.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/list-pull-request-files.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/step-completion-evidence-diagnostic.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/attach.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/docs/test-coverage-manual-contract.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/managed-verify-finding-refs.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/storage/journal-integrity.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/step/spec-fixer.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/util/atomic-write.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m tests/load-by-job-id.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m tests/unit/core/design-layer/check-gate.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/core/occupancy/errors.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/config/__tests__/staged-bytes-config-validation.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/state/__tests__/transient-retry-state.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/core/credentials/__tests__/github.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/github-client-get-issue.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/adapter/codex/agent-runner-output-verification.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/cli/progress-halt-guidance.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/propagate.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/job-stats-jobid-filter.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/doctor/xdg-integration.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/factory.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/store/compose-split-layout-from-content.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/logger/__tests__/log-retention.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/core/preflight.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline-fatal-codes.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/codex/agent-runner-env.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/adapter/shared/__tests__/last-tool-tracker.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/core/doctor/formatter-detailshuman.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/draft-move.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m tests/doctor-readiness.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/attach/attach-cli.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 659[2mms[22m[39m
     [33m[2m✓[22m[39m command-registry exits 2 when --branch is omitted [33m 549[2mms[22m[39m
 [32m✓[39m tests/unit/core/design-layer/mark-hook.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/core/doctor/orphan-worktrees-check.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 156[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/job-show-detach-log.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/state/session-timeout-migration.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 54[2mms[22m[39m
 [32m✓[39m tests/unit/core/cancel/pid-kill-group.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/report-tool-evidence-schema.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/docs/test-coverage-docs-contract.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/core/doctor/doctor-cli.test.ts [2m([22m[2m8 tests[22m[2m)[22m[33m 846[2mms[22m[39m
     [33m[2m✓[22m[39m TC-062: writes USAGE to stderr and exits 2 when no command given [33m 516[2mms[22m[39m
 [32m✓[39m tests/unit/docs/doc-drift-sync.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/core/finish/archive-change-folder.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/resolve-job-id.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 46[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/lcov.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/core/credentials/credentials-io.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 90[2mms[22m[39m
 [32m✓[39m tests/core/worktree/detection.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/adapter/codex/__tests__/resume-prompt-injection.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/core/credentials/__tests__/claude-code.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/parse-result.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/core/worktree/setup.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/util/paths.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/logger/pipeline-logger-rollover.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/state/reviewer-activation-state.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/cli/run-json-flag.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 894[2mms[22m[39m
     [33m[2m✓[22m[39m calls runRun with json: true when --json is specified [33m 488[2mms[22m[39m
 [32m✓[39m tests/unit/core/resume/resume-context.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/cli/config-effective.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m tests/unit/verification/commands.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m tests/state/io.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 67[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/github-client-issue-comment.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/pipeline-run-inbox-origin.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/regression-gate-source-checks.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/command-registry-apply-canon.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/grep-workflow-actions-pinned.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/cli/ps-pr-hint.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/core/event/event-bus.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/docs/operations-recovery-contract.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/github-device.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/prompts/__tests__/spec-exempt-prompt.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/cli/version-flag.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 597[2mms[22m[39m
     [33m[2m✓[22m[39m exits with code 0 [33m 380[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/from-flag-no-enum.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/config/github-token-present.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/view-commands-worktree-guard.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/core/doctor/formatter.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/prompts/__tests__/spec-review-full-enumeration-prompt.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/command-registry-adopt-commits.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/git/dynamic-context.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 101[2mms[22m[39m
 [32m✓[39m tests/grep-no-step-name-hardcode.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/adapter/shared/__tests__/inactivity-watchdog.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/finish-commit-archive.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/prompts/__tests__/request-review-evidence-prompt.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/managed-agent/sse-stream-verbose-log.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/compose-reviewers.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/query-one-shot-metrics.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/step/implementer.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/state/profile.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/logger/verbose-log-errors.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/git/origin-not-configured.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m src/prompts/__tests__/artifact-hygiene-discipline.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/prompts/request-review-seam.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/state/__tests__/bite-evidence-schema.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/config/design-layer-config.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/cli/version.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/agent-runner-verbose-log.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/config/step-config-trace.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/github-client-graphql.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/state/inbox-origin-schema.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m tests/unit/core/resume/resolve-request-path.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/managed-agent/session-client.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/step/implementer-lockfile.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/fixer-reviewer.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/store/__tests__/job-state-store-archive-skip.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/get-raw-file.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/exit-code-standardization.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/core/archive/protected-paths.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/core/step/rules-resolve.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/rules-md.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/contract/invariants.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m tests/unit/errors/repo-required-error.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/core/resume/resolve-job.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m tests/unit/state/base-branch-roundtrip.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/step/spec-review-reads.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/request-new.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 139[2mms[22m[39m
 [32m✓[39m tests/unit/core/finish/resolve-canonical-state-dir.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m tests/finish-archive-change-folder.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/step/io-iteration.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/executor-resume-context.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/verification-hint.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/git-remote.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m src/config/__tests__/transient-retry-config.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/power-assertion.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/prompts/__tests__/custom-reviewer-system.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/workflow/specrunner-dispatch.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/pipeline/round-all-skip-pass-through-static.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/prompts/__tests__/tc-source-contract.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/state/__tests__/reviewers-schema.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/get-ref-sha.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/init-provider-notice.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 179[2mms[22m[39m
 [32m✓[39m tests/unit/cli/ps-check-pr-merged.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/step/verification.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/message-types.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/util/retry.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/inbox/run-inbox-inbox-origin.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/adapter/shared/prompt-builder.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.conformance-resume.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/adapter/dispatching/agent-runner.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/errors/issue-fidelity-error-codes.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/step/write-scope-error.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/config/file-exists.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/core/doctor/aozu-cli-check.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 241[2mms[22m[39m
 [32m✓[39m src/config/__tests__/context-rollover-config.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/step/step-model-maxturn-config.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/config/inbox-config.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/core/cancel/__tests__/runner-branch-delete.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/unit/util/detect-pm-lockfile.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/skip-detect.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/auth/managed-key-valid.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/runtime/codex-cli.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/cli/run-worktree-signal.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/storage/jobs-writable.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/core/lifecycle/query-abort-hub.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/signal-handler-order.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/managed-agent/completion-verbose-log.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/templates/test-cases-template-gate-contract.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/runtime/package-manager.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/issue-fidelity-prompt-contract.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/unit/util/env-filter.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/changed-lines-filelist.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/config/getAgentId.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/command/reviewers-new.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m tests/unit/cli/run-worktree-git-staging.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/core/preflight.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/core/lifecycle/__tests__/diagnostic.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/auth/github-token-valid.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/validation-tc.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 106[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/command-registry-resume.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/cli/runtime-tc.test.ts [2m([22m[2m2 tests[22m[2m)[22m[33m 473[2mms[22m[39m
     [33m[2m✓[22m[39m specrunner runtime status → runManagedStatus が呼ばれる [33m 393[2mms[22m[39m
 [32m✓[39m tests/core/credentials/claude-code.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/progress-retry.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/util/__tests__/paths.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/base-branch-required.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/common-context-catch.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/doctor/workflow-structure-hint.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/grep-no-bun-imports.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 345[2mms[22m[39m
 [32m✓[39m tests/unit/util/path-mask.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/core/design-layer/template-section.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/resume-context.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/util/spawn.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 166[2mms[22m[39m
 [32m✓[39m src/adapter/github/__tests__/github-client-closing-prs.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/prompts/request-review-system.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/doctor/token-hint.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/repo/workflow-structure.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/pipeline/reviewer-chain-skipped.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/init-git-guard.test.ts [2m([22m[2m2 tests[22m[2m)[22m[33m 573[2mms[22m[39m
     [33m[2m✓[22m[39m TC-002: COMMANDS.init.requiresRepo === true (ゲートが dispatch レベルに移動した) [33m 564[2mms[22m[39m
 [32m✓[39m tests/config/config-source-metadata.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/core/port/issue-fidelity-comparator-layering.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/architecture/module-boundary.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/adapter/shared/follow-up.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/dead-guidance.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 269[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/rollover-prompt.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/cli/bootstrap.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 420[2mms[22m[39m
     [33m[2m✓[22m[39m returns config, githubClient, and runtime when config is valid [33m 347[2mms[22m[39m
 [32m✓[39m src/util/__tests__/xdg-read-sidecar-tail.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/agents/definition-drift.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/verify-path.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/workspace-materializer.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/unit/util/repo-root.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/logger/stdout-mask.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/util/paths.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/step/requires-commit-flags.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/readme-quickstart.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/managed-agent/agent-runner-context-metrics.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/adr-tc.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/managed-round-git.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/standard-transitions.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/agent-redirect.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/pipeline-run-canonical.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/changed-lines.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/managed-agent/usage.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/slug-required.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/fragment-coverage.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/core/doctor/runner.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/core/step/rules-followup-prompts.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/config/__tests__/remove-bite-evidence-config-validation.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/init-snippet.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/logger/__tests__/mask-sensitive.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/cli/help-output-tc.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 597[2mms[22m[39m
     [33m[2m✓[22m[39m USAGE には 'Request commands' ブロックが含まれる [33m 591[2mms[22m[39m
 [32m✓[39m tests/unit/step/custom-reviewer-activation.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/cli/doctor-execfile-env.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/agent/hash.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/codex/agent-runner-context-metrics.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/core/credentials/requirements.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/core/validation/registry.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/core/pr-create/__tests__/body-template.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/core/liveness/resolve-pid.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/rule-name-typesafe.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/parser/request-md.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/finish-escalation.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/config/managed-key-present.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/util/__tests__/xdg-detach-log.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/cli/job-start-file-path.test.ts [2m([22m[2m1 test[22m[2m)[22m[33m 452[2mms[22m[39m
     [33m[2m✓[22m[39m 既存ファイルパスが指定された場合は slug lookup をスキップして preflight に進む [33m 450[2mms[22m[39m
 [32m✓[39m src/core/runtime/__tests__/workspace-materializer-structure.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/adr.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/config/__tests__/github-host.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/git/__tests__/branch.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/config/__tests__/type-config.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/readme-tc.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/repo/github-origin.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/docs/request-authoring-granularity.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/core/credentials/__tests__/requirements.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/cli/prune-usage.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/dependabot-config.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/core/lifecycle/__tests__/keepalive-integration.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/logger/stdout-verbose.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/agent-definition.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 89[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/agents/agents-registered.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/run.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 217[2mms[22m[39m
 [32m✓[39m src/core/verification/__tests__/lockfile-sync-phase-constant.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/completion-directive.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/core/lifecycle/__tests__/keepalive.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/runtime/node.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/docs/security-policy.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/docs/readme-pipeline-sync.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/agents/environment-registered.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/adr-required.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/adr-valid.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/repo/git-repository.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/repo/specrunner-project-md.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/storage/old-state-files.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/builder.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/type-known.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/runtime/git.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/auth/constants.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/env/github-client-id.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/core/port/__tests__/agent-runner.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/registry-integration.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/inbox/draft-writer.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/unit/state/pipeline-id.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/title-required.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/util/__tests__/git-push.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/util/xdg.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/type-required.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/docs/readme-resume-command.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/buildMockPipeline.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m

[2m Test Files [22m [1m[32m831 passed[39m[22m[90m (831)[39m
[2m      Tests [22m [1m[32m12606 passed[39m[22m[2m | [22m[33m1 skipped[39m[2m | [22m[90m2 todo[39m[90m (12609)[39m
[2m   Start at [22m 08:36:07
[2m   Duration [22m 74.57s[2m (transform 16.59s, setup 9.94s, import 77.81s, tests 89.94s, environment 96ms)[22m


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
[design] write-scope: 境界外の残余変更を検出・復元した (commit から除外済み): vendor/x.js — 退避先: /tmp/fake-repo-exclusion-test/.specrunner/local/test-slug/write-scope-violation-design-1788165373466.md
[design] write-scope: 境界外の残余変更を検出・復元した (commit から除外済み): specrunner/changes/test-slug/spec.md — 退避先: /tmp/fake-repo-exclusion-test/.specrunner/local/test-slug/write-scope-violation-design-1788165373471.md
[design] write-scope: 境界外の残余変更を検出・復元した (commit から除外済み): specrunner/changes/test-slug/spec.md — 退避先: /tmp/fake-repo-exclusion-test/.specrunner/local/test-slug/write-scope-violation-design-1788165373474.md
[design] write-scope: 境界外の残余変更を検出・復元した (commit から除外済み): specrunner/changes/test-slug/review-feedback-001.md — 退避先: /tmp/fake-repo-exclusion-test/.specrunner/local/test-slug/write-scope-violation-design-1788165373493.md
[design] write-scope: 境界外の残余変更を検出・復元した (commit から除外済み): specrunner/changes/test-slug/code-review-result-001.md — 退避先: /tmp/fake-repo-exclusion-test/.specrunner/local/test-slug/write-scope-violation-design-1788165373496.md
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
[codex] completion report parse failed (main turn): no-json-found; fragment: "This is just prose, no JSON here at all."
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: "This is just prose, no JSON here at all."
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: "This is just prose, no JSON here at all."
[codex] completion report parse failed (main turn): no-json-found; fragment: "Sorry, no JSON here."
Mapping resumePoint.step "bite-evidence" → "verification" (legacy alias)
Mapping --from "build-fixer" → "implementer" (legacy alias)
Mapping --from "test-materialize" → "implementer" (legacy alias)
Mapping --from "bite-evidence" → "verification" (legacy alias)
Mapping --from "bite-evidence" → "verification" (legacy alias)
Mapping resumePoint.step "bite-evidence" → "verification" (legacy alias)
Mapping state.step "bite-evidence" → "verification" (legacy alias)
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
Warning: /tmp/cred-test-cFgLps/specrunner/credentials.json has loose permissions (recommend 0600).
Warning: /tmp/cred-test-QxEYTw/specrunner/credentials.json has loose permissions (recommend 0600).
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

```

## Phase: lint

```
$ eslint ./src ./tests --max-warnings 0

```

## Phase: changed-line-coverage

```
changed-line-coverage: passed (150 changed files checked, 128 skipped)
  Skipped (not in coverage surface): architecture/components.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/conformance-result-001.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/conformance-result-002.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/conformance-result-003.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/conformance-result-004.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/conformance-result-005.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/conformance-result-006.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/conformance-result-007.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/conformance-result-008.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/conformance-result-009.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/conformance-result-010.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/cross-boundary-invariants-result-001.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/cross-boundary-invariants-result-002.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/cross-boundary-invariants-result-003.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/cross-boundary-invariants-result-004.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/cross-boundary-invariants-result-005.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/cross-boundary-invariants-result-006.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/cross-boundary-invariants-result-009.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/design.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/events.jsonl, specrunner/changes/runtime-mutation-lifecycle-capability-split/regression-gate-result-001.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/regression-gate-result-002.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/regression-gate-result-003.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/regression-gate-result-004.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/regression-gate-result-005.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/regression-gate-result-006.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/regression-gate-result-007.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/regression-gate-result-008.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/regression-gate-result-009.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/regression-gate-result-010.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/regression-gate-result-011.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/regression-gate-result-012.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/regression-gate-result-013.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/request-review-attestation.json, specrunner/changes/runtime-mutation-lifecycle-capability-split/request-review-result-001.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/request-review-result-002.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/request.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/review-feedback-001.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/review-feedback-002.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/review-feedback-003.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/review-feedback-004.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/review-feedback-005.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/review-feedback-006.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/review-feedback-007.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/review-feedback-008.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/review-feedback-009.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/review-feedback-010.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/review-feedback-011.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/review-feedback-012.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/rules.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/spec-review-result-001.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/spec.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/state.json, specrunner/changes/runtime-mutation-lifecycle-capability-split/tasks.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/test-cases.md, specrunner/changes/runtime-mutation-lifecycle-capability-split/usage.json, specrunner/changes/runtime-mutation-lifecycle-capability-split/verification-result.md, src/core/pipeline/__tests__/iteration-display.test.ts, src/core/pipeline/__tests__/parallel-review-round-canon.test.ts, src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts, src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts, src/core/pipeline/__tests__/parallel-review-round-resume.test.ts, src/core/pipeline/__tests__/parallel-review-round-state-commit.test.ts, src/core/pipeline/__tests__/pipeline-one-shot-resume.test.ts, src/core/port/runtime-strategy.ts, src/core/runtime/__tests__/local-runtime-capabilities.test.ts, src/core/runtime/__tests__/managed-round-git.test.ts, src/core/runtime/__tests__/managed-runtime-capabilities.test.ts, src/core/step/__tests__/commit-push-exclusion.test.ts, src/core/step/__tests__/custom-reviewer-round-context.test.ts, src/core/step/__tests__/executor-commit-mutex.test.ts, src/core/step/__tests__/executor-drift-detection.test.ts, src/core/step/__tests__/executor-no-op.test.ts, src/core/step/__tests__/executor-oid-capture.test.ts, src/core/step/__tests__/executor-round-commit.test.ts, src/core/step/__tests__/executor-round-produce.test.ts, src/core/step/__tests__/lineage-output-attribution.test.ts, src/core/step/__tests__/post-fix-context.test.ts, src/core/step/__tests__/prior-round-context.test.ts, src/core/step/__tests__/spec-review-fixer-routing.test.ts, src/core/step/__tests__/spec-review-prior-round-context.test.ts, src/core/step/__tests__/step-completion-missing-file-finding.test.ts, src/core/step/__tests__/step-context-builder.test.ts, src/core/types.ts, tests/attach/attach-resume-e2e.test.ts, tests/canon-binding-e2e.test.ts, tests/core/pipeline/pipeline.test.ts, tests/core/provider-readiness-gate.test.ts, tests/custom-reviewers-e2e.test.ts, tests/error-path-integration.test.ts, tests/pipeline-integration.test.ts, tests/pipeline-sole-committer-e2e.test.ts, tests/unit/absorb-build-fixer/implementer-recovery.test.ts, tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts, tests/unit/architecture/arch-allowlist.ts, tests/unit/cli/repo-root-exactly-once.test.ts, tests/unit/core/command/pipeline-run-duplicate-guard.test.ts, tests/unit/core/command/pipeline-run-gate.test.ts, tests/unit/core/command/pipeline-run-inbox-origin.test.ts, tests/unit/core/command/pipeline-run-input-completeness.test.ts, tests/unit/core/command/pipeline-run-reviewer-snapshot.test.ts, tests/unit/core/command/pipeline-run.test.ts, tests/unit/core/command/resume.test.ts, tests/unit/core/command/runner.test.ts, tests/unit/core/runtime/local.test.ts, tests/unit/core/step/capability-consumers.test.ts, tests/unit/core/step/executor-cli-entry-oid.test.ts, tests/unit/core/step/fast-scope-checkpoint.test.ts, tests/unit/core/step/finding-recency.test.ts, tests/unit/core/step/scope-escalation.test.ts, tests/unit/core/step/spec-review-scope-exclusion.test.ts, tests/unit/core/step/verification-phase-outcome-executor.test.ts, tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts, tests/unit/step/commit-and-push.test.ts, tests/unit/step/executor-activation.test.ts, tests/unit/step/executor-commit-mutex.test.ts, tests/unit/step/executor-drift-detection.test.ts, tests/unit/step/executor-input-validation.test.ts, tests/unit/step/executor-lifecycle-ordering.test.ts, tests/unit/step/executor-no-op.test.ts, tests/unit/step/executor-output-gate.test.ts, tests/unit/step/executor-resume-context.test.ts, tests/unit/step/executor-skip-when.test.ts, tests/unit/step/executor-verdict.test.ts, tests/unit/step/executor.commit.test.ts, tests/unit/step/severity-fixability-split.test.ts, tests/unit/step/unpushable-path-contract.test.ts, tests/unit/step/unpushable-path-escalation.test.ts
```

## Phase: lockfile-sync

lockfile-sync: package.json の変更なし — スキップ
