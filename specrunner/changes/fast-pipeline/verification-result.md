# Verification Result — fast-pipeline — iter 1

## Verdict: passed

## Phase Results

| # | Phase | Status | Duration | Exit Code |
|---|-------|--------|----------|-----------|
| 1 | build | passed | 0.8s | 0 |
| 2 | typecheck | passed | 20.2s | 0 |
| 3 | test | passed | 71.7s | 0 |
| 4 | lint | passed | 13.5s | 0 |

## Phase: build

```
CLI Building entry: bin/specrunner.ts
CLI Using tsconfig: tsconfig.json
CLI tsup v8.5.1
CLI Using tsup config: tsup.config.ts
CLI Target: node20
CLI Cleaning output folder
ESM Build start
ESM dist/specrunner.js 896.28 KB
ESM ⚡️ Build success in 145ms

$ tsup

```

## Phase: typecheck

```
$ tsc --noEmit

```

## Phase: test

```

[1m[30m[46m RUN [49m[39m[22m [36mv4.1.5 [39m[90m.[39m

 [32m✓[39m tests/reviewer-activation-e2e.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 2951[2mms[22m[39m
     [33m[2m✓[22m[39m reviewer with paths condition is skipped when no files match (managed: changedFiles=[]) [33m 1420[2mms[22m[39m
     [33m[2m✓[22m[39m reviewer activates when requestType matches [33m 362[2mms[22m[39m
 [32m✓[39m tests/unit/cli/resume.test.ts [2m([22m[2m13 tests[22m[2m)[22m[33m 3068[2mms[22m[39m
     [33m[2m✓[22m[39m runs pipeline and returns exit code 0 when job is awaiting-resume [33m 1285[2mms[22m[39m
 [32m✓[39m tests/custom-reviewers-e2e.test.ts [2m([22m[2m12 tests[22m[2m)[22m[33m 4663[2mms[22m[39m
     [33m[2m✓[22m[39m security reviewer runs after code-review and pipeline completes [33m 1422[2mms[22m[39m
     [33m[2m✓[22m[39m security then perf reviewers both run in order [33m 411[2mms[22m[39m
     [33m[2m✓[22m[39m code-fixer receives findings attributed to the active reviewer (unit check) [32m 300[2mms[22m[39m
     [33m[2m✓[22m[39m reviewers from state.reviewers are used, not re-loaded from disk [33m 320[2mms[22m[39m
     [33m[2m✓[22m[39m escalates when custom reviewer finding references a file that does not exist [33m 368[2mms[22m[39m
     [33m[2m✓[22m[39m regression-gate reports high/fixable → code-fixer → gate re-runs → approved → conformance [33m 403[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/local.test.ts [2m([22m[2m31 tests[22m[2m)[22m[33m 1719[2mms[22m[39m
 [32m✓[39m tests/core/doctor/doctor-cli.test.ts [2m([22m[2m8 tests[22m[2m)[22m[33m 3344[2mms[22m[39m
     [33m[2m✓[22m[39m returns 0 when all results are pass [33m 519[2mms[22m[39m
     [33m[2m✓[22m[39m TC-062: writes USAGE to stderr and exits 2 when no command given [33m 2191[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.conformance-routing.test.ts [2m([22m[2m9 tests[22m[2m)[22m[33m 494[2mms[22m[39m
 [32m✓[39m tests/unit/no-worktree-mode.test.ts [2m([22m[2m20 tests[22m[2m)[22m[33m 1250[2mms[22m[39m
 [32m✓[39m tests/unit/cli/removed-commands.test.ts [2m([22m[2m9 tests[22m[2m)[22m[33m 1039[2mms[22m[39m
     [33m[2m✓[22m[39m specrunner ps → 'Unknown command: ps' を出力し exit 2 で終了 [33m 667[2mms[22m[39m
 [32m✓[39m tests/pipeline-integration.test.ts [2m([22m[2m30 tests[22m[2m)[22m[33m 8174[2mms[22m[39m
     [33m[2m✓[22m[39m returns status='awaiting-merge', steps['spec-review'] has 1 element with verdict=approved, no spec-fixer steps [33m 1167[2mms[22m[39m
     [33m[2m✓[22m[39m returns status='awaiting-merge', spec-review has 2 entries, spec-fixer has 1 entry [33m 374[2mms[22m[39m
     [33m[2m✓[22m[39m persisted state has step='spec-review' after spec-fixer completes [33m 381[2mms[22m[39m
     [33m[2m✓[22m[39m returns status='awaiting-merge', code-review has 2 entries, code-fixer has 1 entry [33m 490[2mms[22m[39m
     [33m[2m✓[22m[39m allows +1 review iteration after fixer final iter, completes on approval [33m 334[2mms[22m[39m
     [33m[2m✓[22m[39m allows +1 spec-review iteration after spec-fixer final iter, completes on approval [33m 394[2mms[22m[39m
     [33m[2m✓[22m[39m allows +1 verification iteration after build-fixer final iter, completes on pass [33m 352[2mms[22m[39m
     [33m[2m✓[22m[39m persists both propose and spec-review results in job state file [33m 396[2mms[22m[39m
     [33m[2m✓[22m[39m ctx.dynamicContext matches testDynamicContext fields in every runner.run() call [33m 340[2mms[22m[39m
     [33m[2m✓[22m[39m sets error.code=VERIFICATION_RETRIES_EXHAUSTED, escalation verdict on last verification, resumePoint.step=build-fixer [33m 437[2mms[22m[39m
     [33m[2m✓[22m[39m spec-review exhaustion halts at awaiting-resume; resume from resumePoint.step completes to awaiting-archive [33m 878[2mms[22m[39m
 [32m✓[39m tests/unit/architecture/core-invariants.test.ts [2m([22m[2m31 tests[22m[2m)[22m[33m 1708[2mms[22m[39m
 [32m✓[39m tests/unit/cli/help-output-tc.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 1715[2mms[22m[39m
     [33m[2m✓[22m[39m USAGE には 'Request commands' ブロックが含まれる [33m 1702[2mms[22m[39m
 [32m✓[39m tests/unit/cli/bootstrap.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 1022[2mms[22m[39m
     [33m[2m✓[22m[39m returns config, githubClient, and runtime when config is valid [33m 795[2mms[22m[39m
 [32m✓[39m tests/unit/cli/specrunner-worktree-guard.test.ts [2m([22m[2m8 tests[22m[2m)[22m[33m 1429[2mms[22m[39m
     [33m[2m✓[22m[39m exits with code 2 and prints worktree guard error [33m 581[2mms[22m[39m
     [33m[2m✓[22m[39m does NOT reject job ls — no worktree guard error in stderr [33m 452[2mms[22m[39m
 [32m✓[39m tests/unit/cli/specrunner-resume-dispatch.test.ts [2m([22m[2m13 tests[22m[2m)[22m[33m 1419[2mms[22m[39m
     [33m[2m✓[22m[39m calls runResume with the slug argument [33m 996[2mms[22m[39m
 [32m✓[39m tests/unit/core/cancel/runner.test.ts [2m([22m[2m33 tests[22m[2m)[22m[33m 830[2mms[22m[39m
 [32m✓[39m tests/error-path-integration.test.ts [2m([22m[2m6 tests[22m[2m)[22m[33m 1073[2mms[22m[39m
     [33m[2m✓[22m[39m verification with mixed phase results (build ok, test fail) routes to build-fixer [33m 403[2mms[22m[39m
 [32m✓[39m tests/init.test.ts [2m([22m[2m11 tests[22m[2m)[22m[33m 966[2mms[22m[39m
     [33m[2m✓[22m[39m 冪等性: 2 回 runInit しても正常に完了する [33m 332[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.transitions.test.ts [2m([22m[2m68 tests[22m[2m)[22m[33m 836[2mms[22m[39m
 [32m✓[39m tests/unit/core/lifecycle/exit-guard.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 895[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor.test.ts [2m([22m[2m27 tests[22m[2m)[22m[33m 841[2mms[22m[39m
 [32m✓[39m tests/multi-layer-defense.test.ts [2m([22m[2m2 tests[22m[2m)[22m[33m 1117[2mms[22m[39m
     [33m[2m✓[22m[39m design → spec-review(approved) → awaiting-merge [33m 587[2mms[22m[39m
     [33m[2m✓[22m[39m spec-review needs-fix → spec-fixer → spec-review approved → pipeline completes [33m 525[2mms[22m[39m
 [32m✓[39m tests/unit/cli/run-json-flag.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 1060[2mms[22m[39m
     [33m[2m✓[22m[39m calls runRun with json: true when --json is specified [33m 677[2mms[22m[39m
 [32m✓[39m tests/unit/cli/help-flag-dispatch.test.ts [2m([22m[2m15 tests[22m[2m)[22m[33m 1125[2mms[22m[39m
     [33m[2m✓[22m[39m exits with code 0 [33m 513[2mms[22m[39m
 [32m✓[39m tests/pipeline.test.ts [2m([22m[2m8 tests[22m[2m)[22m[33m 1257[2mms[22m[39m
     [33m[2m✓[22m[39m records all required history steps on success [33m 829[2mms[22m[39m
 [32m✓[39m tests/cli.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 1008[2mms[22m[39m
     [33m[2m✓[22m[39m exits with code 2 when config does not exist (CONFIG_MISSING → ARG_ERROR) [33m 903[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.reverification.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 968[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.episode-reset.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 625[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/managed-agent/agent-runner.test.ts [2m([22m[2m55 tests[22m[2m)[22m[33m 456[2mms[22m[39m
 [32m✓[39m tests/unit/config/runtime-config.test.ts [2m([22m[2m28 tests[22m[2m)[22m[33m 516[2mms[22m[39m
 [32m✓[39m tests/unit/cli/job-start-file-path.test.ts [2m([22m[2m1 test[22m[2m)[22m[33m 795[2mms[22m[39m
     [33m[2m✓[22m[39m 既存ファイルパスが指定された場合は slug lookup をスキップして preflight に進む [33m 790[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/executor.test.ts [2m([22m[2m11 tests[22m[2m)[22m[33m 397[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/agent-runner.test.ts [2m([22m[2m65 tests[22m[2m)[22m[33m 735[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/scope-escalation.test.ts [2m([22m[2m58 tests[22m[2m)[22m[33m 914[2mms[22m[39m
 [32m✓[39m tests/unit/cli/version-flag.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 601[2mms[22m[39m
     [33m[2m✓[22m[39m exits with code 0 [33m 413[2mms[22m[39m
 [32m✓[39m tests/spec-review-step.test.ts [2m([22m[2m8 tests[22m[2m)[22m[33m 658[2mms[22m[39m
 [32m✓[39m tests/unit/cli/runtime-tc.test.ts [2m([22m[2m2 tests[22m[2m)[22m[33m 652[2mms[22m[39m
     [33m[2m✓[22m[39m specrunner runtime status → runManagedStatus が呼ばれる [33m 538[2mms[22m[39m
 [32m✓[39m tests/core/pipeline/pipeline.test.ts [2m([22m[2m12 tests[22m[2m)[22m[33m 703[2mms[22m[39m
 [32m✓[39m tests/grep-no-bun-imports.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 573[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/fast-scope-checkpoint.test.ts [2m([22m[2m11 tests[22m[2m)[22m[33m 509[2mms[22m[39m
 [32m✓[39m tests/unit/cli/managed.test.ts [2m([22m[2m21 tests[22m[2m)[22m[33m 825[2mms[22m[39m
     [33m[2m✓[22m[39m returns exit code 1 when SPECRUNNER_API_KEY is not set [33m 441[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor.commit.test.ts [2m([22m[2m10 tests[22m[2m)[22m[33m 402[2mms[22m[39m
 [32m✓[39m tests/git/dynamic-context.test.ts [2m([22m[2m6 tests[22m[2m)[22m[33m 404[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/test-coverage.test.ts [2m([22m[2m58 tests[22m[2m)[22m[33m 739[2mms[22m[39m
 [32m✓[39m tests/unit/runtime/validate-step-outputs.test.ts [2m([22m[2m20 tests[22m[2m)[22m[33m 598[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/executor-verdict.test.ts [2m([22m[2m15 tests[22m[2m)[22m[33m 431[2mms[22m[39m
 [32m✓[39m tests/state-store.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 203[2mms[22m[39m
 [32m✓[39m src/core/lifecycle/__tests__/exit-guard.test.ts [2m([22m[2m4 tests[22m[2m)[22m[33m 443[2mms[22m[39m
 [32m✓[39m tests/error-codes.test.ts [2m([22m[2m13 tests[22m[2m)[22m[33m 325[2mms[22m[39m
 [32m✓[39m tests/local-no-jobs-dir-writes.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 461[2mms[22m[39m
 [32m✓[39m tests/unit/cli/cancel.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 259[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/agent-runner-port.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 236[2mms[22m[39m
 [32m✓[39m tests/unit/runtime/validate-step-inputs.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 248[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 253[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/managed.test.ts [2m([22m[2m13 tests[22m[2m)[22m[33m 342[2mms[22m[39m
 [32m✓[39m tests/unit/cli/config-effective.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 279[2mms[22m[39m
 [32m✓[39m tests/unit/util/spawn.test.ts [2m([22m[2m4 tests[22m[2m)[22m[33m 316[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 220[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-verdict.test.ts [2m([22m[2m10 tests[22m[2m)[22m[33m 305[2mms[22m[39m
 [32m✓[39m tests/unit/step/commit-and-push.test.ts [2m([22m[2m9 tests[22m[2m)[22m[33m 775[2mms[22m[39m
     [33m[2m✓[22m[39m throws PUSH_FAILED when both push attempts fail [33m 319[2mms[22m[39m
 [32m✓[39m tests/unit/verification/runner-commands.test.ts [2m([22m[2m9 tests[22m[2m)[22m[33m 2405[2mms[22m[39m
     [33m[2m✓[22m[39m all commands exit 0 → verdict passed, all statuses passed [33m 326[2mms[22m[39m
     [33m[2m✓[22m[39m 1st passed, 2nd failed, 3rd skipped → verdict failed [33m 450[2mms[22m[39m
     [33m[2m✓[22m[39m phase field shows command string when name is undefined [33m 310[2mms[22m[39m
     [33m[2m✓[22m[39m commands undefined → falls back to phase detection (no scripts → VERIFICATION_NO_RUNNABLE_PHASES) [33m 556[2mms[22m[39m
 [32m✓[39m tests/unit/step/review-exit-contract.test.ts [2m([22m[2m33 tests[22m[2m)[22m[33m 2594[2mms[22m[39m
     [33m[2m✓[22m[39m ERROR_CODES.CODE_REVIEW_RESULT_NOT_FOUND is defined [33m 487[2mms[22m[39m
     [33m[2m✓[22m[39m with existingResults.length=0, step succeeds with escalation verdict (file not found is soft error) [33m 703[2mms[22m[39m
     [33m[2m✓[22m[39m with existingResults.length=1, step succeeds with escalation verdict (file not found is soft error) [33m 589[2mms[22m[39m
 [32m✓[39m tests/unit/remove-session-timeout.test.ts [2m([22m[2m9 tests[22m[2m)[22m[33m 346[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/runner.test.ts [2m([22m[2m21 tests[22m[2m)[22m[33m 374[2mms[22m[39m
 [32m✓[39m tests/unit/core/request/store.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 297[2mms[22m[39m
 [32m✓[39m tests/finish-job-state.test.ts [2m([22m[2m18 tests[22m[2m)[22m[33m 350[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/rules-new.test.ts [2m([22m[2m31 tests[22m[2m)[22m[33m 323[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-output-gate.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 400[2mms[22m[39m
 [32m✓[39m tests/unit/core/archive/orchestrator.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 218[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/run.test.ts [2m([22m[2m2 tests[22m[2m)[22m[33m 485[2mms[22m[39m
     [33m[2m✓[22m[39m STANDARD_DESCRIPTOR has at least 9 steps including pr-create [33m 472[2mms[22m[39m
 [32m✓[39m tests/unit/core/archive/merge-then-archive.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 284[2mms[22m[39m
 [32m✓[39m tests/finish-ps-integration.test.ts [2m([22m[2m20 tests[22m[2m)[22m[33m 460[2mms[22m[39m
 [32m✓[39m tests/core/credentials/anthropic.test.ts [2m([22m[2m11 tests[22m[2m)[22m[33m 328[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/runner.test.ts [2m([22m[2m12 tests[22m[2m)[22m[33m 306[2mms[22m[39m
 [32m✓[39m tests/agent-definition.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 177[2mms[22m[39m
 [32m✓[39m tests/unit/verification/commands.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 283[2mms[22m[39m
 [32m✓[39m tests/unit/util/copy-artifacts.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 230[2mms[22m[39m
 [32m✓[39m src/core/archive/__tests__/orchestrator.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 106[2mms[22m[39m
 [32m✓[39m tests/core/steps/spec-review.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 285[2mms[22m[39m
 [32m✓[39m tests/core/credentials/credentials-io.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 246[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-activation.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 198[2mms[22m[39m
 [32m✓[39m tests/completion.test.ts [2m([22m[2m30 tests[22m[2m)[22m[32m 130[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/runner-integrity.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 296[2mms[22m[39m
 [32m✓[39m tests/core/credentials/github.test.ts [2m([22m[2m11 tests[22m[2m)[22m[33m 302[2mms[22m[39m
 [32m✓[39m src/adapter/codex/__tests__/completion-contract-injection.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 68[2mms[22m[39m
 [32m✓[39m tests/unit/step/pr-create.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 143[2mms[22m[39m
 [32m✓[39m tests/unit/pipeline/transition-when.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 161[2mms[22m[39m
 [32m✓[39m tests/core/step/step-interface.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 219[2mms[22m[39m
 [32m✓[39m tests/unit/cli/job-show.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 250[2mms[22m[39m
 [32m✓[39m tests/state/session-timeout-migration.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 164[2mms[22m[39m
 [32m✓[39m tests/unit/util/gitignore.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 249[2mms[22m[39m
 [32m✓[39m tests/config/store.test.ts [2m([22m[2m13 tests[22m[2m)[22m[33m 319[2mms[22m[39m
 [32m✓[39m tests/unit/contract/golden-cases.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 163[2mms[22m[39m
 [32m✓[39m tests/config/schema.test.ts [2m([22m[2m69 tests[22m[2m)[22m[32m 109[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.cli-step-output.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 274[2mms[22m[39m
 [32m✓[39m tests/store/job-state-store.test.ts [2m([22m[2m12 tests[22m[2m)[22m[33m 335[2mms[22m[39m
 [32m✓[39m tests/unit/contract/invariants.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 144[2mms[22m[39m
 [32m✓[39m tests/local-job-index.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 198[2mms[22m[39m
 [32m✓[39m tests/cli-stdout-snapshot.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 167[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/verify-finding-refs.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 113[2mms[22m[39m
 [32m✓[39m tests/unit/no-worktree-archive.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 122[2mms[22m[39m
 [32m✓[39m tests/unit/core/job-access/resolve-state-store.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 98[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-verbose-log.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 166[2mms[22m[39m
 [32m✓[39m tests/unit/config/schema.test.ts [2m([22m[2m30 tests[22m[2m)[22m[32m 72[2mms[22m[39m
 [32m✓[39m tests/unit/architecture/module-boundary.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 83[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/request-new.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 156[2mms[22m[39m
 [32m✓[39m tests/unit/contract/agent-runner-contracts.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 115[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/draft-move.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 76[2mms[22m[39m
 [32m✓[39m tests/util/copy-artifacts.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 102[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/pipeline-run-gate.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 122[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/runner-path-mask.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 99[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-helpers.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 119[2mms[22m[39m
 [32m✓[39m tests/unit/cli/login.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 77[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline-roles.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 257[2mms[22m[39m
 [32m✓[39m src/logger/__tests__/log-retention.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 54[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/agent-redirect-integration.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 106[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/request.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 129[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/validation-tc.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 106[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-input-validation.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 171[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/query-one-shot.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 98[2mms[22m[39m
 [32m✓[39m tests/unit/command/reviewers-new.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 84[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/credential-injection.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 107[2mms[22m[39m
 [32m✓[39m tests/unit/inbox/orchestrator.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 128[2mms[22m[39m
 [32m✓[39m tests/jobs-dir-no-readdir.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 119[2mms[22m[39m
 [32m✓[39m tests/store/event-journal.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 196[2mms[22m[39m
 [32m✓[39m tests/unit/logger/verbose-log.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 115[2mms[22m[39m
 [32m✓[39m tests/finish-resolve-target.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 211[2mms[22m[39m
 [32m✓[39m tests/unit/inbox/planner.test.ts [2m([22m[2m61 tests[22m[2m)[22m[32m 56[2mms[22m[39m
 [32m✓[39m tests/unit/util/detect-pm.test.ts [2m([22m[2m36 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m tests/adapter/codex/agent-runner.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 117[2mms[22m[39m
 [32m✓[39m tests/state/io.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 97[2mms[22m[39m
 [32m✓[39m tests/load-by-job-id.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 64[2mms[22m[39m
 [32m✓[39m src/prompts/__tests__/fragment-coverage.test.ts [2m([22m[2m130 tests[22m[2m)[22m[32m 79[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/managed-agent/agent-runner-verbose-log.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 64[2mms[22m[39m
 [32m✓[39m tests/adapter/managed-agent/agent-runner.test.ts [2m([22m[2m41 tests[22m[2m)[22m[32m 146[2mms[22m[39m
 [32m✓[39m tests/core/worktree/detection.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 77[2mms[22m[39m
 [32m✓[39m src/state/__tests__/artifact-observability.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 78[2mms[22m[39m
 [32m✓[39m tests/unit/core/resume/resolve-job.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 97[2mms[22m[39m
 [32m✓[39m tests/config/config-source-metadata.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 68[2mms[22m[39m
 [32m✓[39m tests/unit/step/step-io-contracts.test.ts [2m([22m[2m82 tests[22m[2m)[22m[32m 53[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/session-log-writer.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 99[2mms[22m[39m
 [32m✓[39m src/core/inbox/__tests__/run-inbox.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 70[2mms[22m[39m
 [32m✓[39m src/adapter/codex/__tests__/agent-runner-completion-report.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 46[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.crash-state.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 65[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/github-client-inbox.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/resume.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 48[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/github-client-pr.test.ts [2m([22m[2m42 tests[22m[2m)[22m[32m 93[2mms[22m[39m
 [32m✓[39m tests/unit/step/code-review.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m tests/test-case-gen-step.test.ts [2m([22m[2m23 tests[22m[2m)[22m[32m 78[2mms[22m[39m
 [32m✓[39m tests/resolve-job-id.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 106[2mms[22m[39m
 [32m✓[39m tests/unit/core/finish/resolve-canonical-state-dir.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 111[2mms[22m[39m
 [32m✓[39m tests/unit/core/runtime/factory.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 45[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/provider-sdk-loader.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 97[2mms[22m[39m
 [32m✓[39m tests/adapter/codex/agent-runner-transient-retry.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 115[2mms[22m[39m
 [32m✓[39m tests/unit/cli/version.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/propagate.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 121[2mms[22m[39m
 [32m✓[39m tests/unit/core/request/generator.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 74[2mms[22m[39m
 [32m✓[39m src/git/__tests__/transport-auth.test.ts [2m([22m[2m44 tests[22m[2m)[22m[32m 123[2mms[22m[39m
 [32m✓[39m tests/unit/core/port/report-result-findings.test.ts [2m([22m[2m47 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m tests/core/usage/store.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 75[2mms[22m[39m
 [32m✓[39m tests/unit/core/notify/issue-notifier.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 47[2mms[22m[39m
 [32m✓[39m tests/unit/docs/security-policy.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 47[2mms[22m[39m
 [32m✓[39m tests/unit/util/atomic-write.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 133[2mms[22m[39m
 [32m✓[39m src/logger/__tests__/pipeline-logger.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 150[2mms[22m[39m
 [32m✓[39m tests/unit/step/output-verify.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m tests/unit/state/reconcile.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/config/file-exists.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/managed-agent/sse-stream-verbose-log.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m src/core/cancel/__tests__/runner-branch-delete.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 96[2mms[22m[39m
 [32m✓[39m tests/unit/core/finish/pr-status.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m tests/parser.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m tests/unit/util/slugify.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 59[2mms[22m[39m
 [32m✓[39m tests/core/usage/pricing.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/compose-reviewers.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 47[2mms[22m[39m
 [32m✓[39m tests/grep-workflow-actions-pinned.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m src/store/__tests__/job-state-store-archive-skip.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 64[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/transient-error.test.ts [2m([22m[2m48 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/slug-required.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/core/preflight.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m tests/unit/store/job-state-store-changedir.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 100[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/fast-descriptor.test.ts [2m([22m[2m52 tests[22m[2m)[22m[32m 43[2mms[22m[39m
 [32m✓[39m src/core/credentials/__tests__/github.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 43[2mms[22m[39m
 [32m✓[39m tests/unit/core/cancel/pid-kill.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/adapter/codex/strict-schema.test.ts [2m([22m[2m36 tests[22m[2m)[22m[32m 82[2mms[22m[39m
 [32m✓[39m tests/core/credentials/claude-code.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 142[2mms[22m[39m
 [32m✓[39m tests/unit/core/resume/safety.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 60[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/fragments.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/github-client-request.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 74[2mms[22m[39m
 [32m✓[39m tests/core/worktree/manager.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 92[2mms[22m[39m
 [32m✓[39m tests/unit/state/lifecycle.test.ts [2m([22m[2m105 tests[22m[2m)[22m[32m 147[2mms[22m[39m
 [32m✓[39m tests/unit/step/build-fixer.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m tests/unit/util/glob-match.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/config/github-token-present.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 69[2mms[22m[39m
 [32m✓[39m src/core/reviewers/__tests__/load-validate.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m tests/prompts/design-system.test.ts [2m([22m[2m44 tests[22m[2m)[22m[32m 40[2mms[22m[39m
No jobs found.
JOB_ID	SLUG	STEP	STATUS	BRANCH	AGE
job-run-	slug-job-run-1	init	running (stale?)	feat/test	164d
 [32m✓[39m tests/unit/cli/ps-filter.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m tests/cli-run-verdict.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/runtime/codex-cli.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/unit/cli/progress.test.ts [2m([22m[2m25 tests[22m[2m)[22m[32m 70[2mms[22m[39m
 [32m✓[39m tests/finish-archive-change-folder.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/custom-reviewer-step.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m src/core/credentials/__tests__/claude-code.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 46[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/agent-runner-verbose-log.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m tests/adapter/managed-agent/error-helpers.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 50[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/commit-final-state.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m tests/unit/util/repo-root.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m tests/core/session-runner.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/command-registry-resume.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 63[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/regression-gate-step.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m src/core/credentials/__tests__/credentials-io.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 61[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/run-result.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m tests/unit/parser/extract-section.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 54[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/list-pull-request-files.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m tests/unit/logger/log-level.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m tests/unit/logger/verbose-log-errors.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 72[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/types.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m tests/unit/core/resume/resolve-request-path.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 94[2mms[22m[39m
 [32m✓[39m tests/unit/docs/readme-pipeline-sync.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/core/reviewers/__tests__/glob-match.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/unit/core/pr-create/runner.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/auth/managed-key-valid.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor.store-cache.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m tests/github-device.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/get-raw-file.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/unit/core/port/report-result-observations.test.ts [2m([22m[2m30 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m tests/unit/core/resume/resolve-step.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/judge-verdict.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m tests/git-remote.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m tests/unit/agent/registry.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 58[2mms[22m[39m
 [32m✓[39m tests/unit/cli/flag-parser.test.ts [2m([22m[2m39 tests[22m[2m)[22m[32m 47[2mms[22m[39m
 [32m✓[39m tests/core/usage/usage-summary.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m tests/config/step-config.test.ts [2m([22m[2m36 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m tests/unit/rules-md.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m tests/schema.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/runtime/package-manager.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/auth/constants.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/config/__tests__/transient-retry-config.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m tests/util/retry.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m tests/unit/agent/syncer-rollback.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m tests/unit/core/decision/decision-ledger.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m tests/unit/step/verification.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/claude-code/message-types.test.ts [2m([22m[2m31 tests[22m[2m)[22m[32m 74[2mms[22m[39m
 [32m✓[39m src/core/reviewers/__tests__/activation.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.storeFactory.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 48[2mms[22m[39m
 [32m✓[39m tests/unit/cli/issue-flag.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m tests/util/paths.test.ts [2m([22m[2m30 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/compose-reviewers.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/common-context-catch.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/managed-agent/session-client.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/scope.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m tests/unit/readme-tc.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/github-client-issue-comment.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/templates/step-output-templates.test.ts [2m([22m[2m43 tests[22m[2m)[22m[32m 55[2mms[22m[39m
 [32m✓[39m tests/unit/config/inbox-config.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 45[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/step-names.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m tests/unit/state/reviewer-activation-state.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/judge-verdict-conformance.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/unit/core/port/report-result.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 46[2mms[22m[39m
 [32m✓[39m tests/unit/agent/hash.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 45[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/reviewer-chain.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/reverification.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m tests/unit/agent/syncer.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 45[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/runtime-capability-gate.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/verify-path.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/conformance.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 60[2mms[22m[39m
 [32m✓[39m tests/state/job-slug.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 46[2mms[22m[39m
 [32m✓[39m tests/unit/core/archive/protected-paths.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/state/__tests__/reviewers-schema.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m tests/core/event/event-bus.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/agents/environment-registered.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/adr-tc.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m tests/unit/step/judge-verdict.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 58[2mms[22m[39m
 [32m✓[39m tests/adapter/codex/agent-runner-observability.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 76[2mms[22m[39m
 [32m✓[39m tests/unit/step/agent-definition.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 58[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/adr-gen.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/unit/command/request-create.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/registry-integration.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/core/reviewers/__tests__/definition.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/login.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 50[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/agents/definition-drift.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m src/core/lifecycle/__tests__/keepalive-integration.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.notification.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m src/state/__tests__/transient-retry-state.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/prompts/request-review-system.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m tests/unit/util/env-filter.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/step/code-fixer.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/config/getAgentId.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/prompts/implementer-system.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/docs/readme-resume-command.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/state/helpers.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/all-checks.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m tests/unit/step/fixer-findings.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 66[2mms[22m[39m
 [32m✓[39m tests/finish-commit-archive.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m tests/unit/logger/stdout-verbose.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m tests/prompts/test-placement.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m tests/prompts/spec-review-system.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m tests/core/doctor/formatter.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m tests/unit/util/paths.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/auth/github-token-valid.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m tests/unit/core/pr-create/body-template.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m tests/adapter/codex/agent-runner-output-verification.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/unit/pipeline/reviewer-chain-skipped.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/adapter/codex/__tests__/resume-prompt-injection.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/unit/config/migrate.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/unit/step/io-iteration.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/base-branch-required.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/core/credentials/requirements.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/adr-valid.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/repo/specrunner-project-md.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/core/doctor/checks/config/__tests__/claude-code-token-present.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 51[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/repo/workflow-structure.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 58[2mms[22m[39m
 [32m✓[39m tests/unit/step/implementer.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/adapter/dispatching/agent-runner.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/registry-invariants.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/cli/__tests__/progress-retry.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/type-known.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/core/inbox/__tests__/planner.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/fixer-helpers-conformance.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/core/finish/archive-change-folder.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/get-ref-sha.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m src/prompts/__tests__/custom-reviewer-system.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m tests/unit/parser/review-scores.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/core/step/rules-resolve.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/config/type-config.test.ts [2m([22m[2m36 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m src/templates/__tests__/step-output-templates.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/unit/cli/ps-pr-hint.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/storage/jobs-writable.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m tests/unit/step/custom-reviewer-activation.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m tests/prompts/test-case-gen-system.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/standard-transitions.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m tests/core/step/rules-followup-prompts.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/config/model-registry.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m tests/unit/step/spec-review-lightweight.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/fixer-reviewer.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/repo/git-repository.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/runtime/node.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m tests/unit/core/validation/registry.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/managed-agent/usage.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/runtime/list-changed-files.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/state/base-branch-roundtrip.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/core/step/__tests__/executor-resume-context.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/core/pipeline/__tests__/findings-ledger.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/parse-result.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m tests/prompts/dynamic-context-prompts.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/core/credentials/__tests__/requirements.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/config/__tests__/github-host.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/logger/__tests__/mask-sensitive.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/unit/state/pipeline-id.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/config/step-config-trace.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m src/util/__tests__/paths.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/runtime/git.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/managed-agent/completion-verbose-log.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/core/lifecycle/__tests__/keepalive.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/agents/agents-registered.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m tests/unit/step/step-model-maxturn-config.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/rule-name-typesafe.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/prompts/build-fixer-system.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/adr-required.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/config/merge.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m tests/unit/cli/run-worktree-signal.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m src/config/__tests__/type-config.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/adapter/claude-code/__tests__/agent-redirect.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/exit-code-standardization.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m tests/unit/adr.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/builder.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/parser/request-md.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m tests/unit/step/spec-fixer.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m tests/unit/core/resume/resume-context.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m tests/core/step/fixer-helpers.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 57[2mms[22m[39m
 [32m✓[39m tests/unit/step/requires-commit-flags.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 69[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/type-required.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/cli/ps-check-pr-merged.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/core/pr-create/__tests__/body-template.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/finish-escalation.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/cli/run-worktree-git-staging.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/core/doctor/runner.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/config/managed-key-present.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m tests/unit/util/path-mask.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/env/github-client-id.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/unit/core/command/pipeline-run-canonical.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/prompts/spec-fixer-system.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/design-system.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 27[2mms[22m[39m
 [32m✓[39m tests/grep-no-step-name-hardcode.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/unit/prompts/fragment-coverage.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m tests/unit/util/xdg.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m src/core/lifecycle/__tests__/diagnostic.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/storage/old-state-files.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/verification-step.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m tests/adapter/shared/follow-up.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/util/__tests__/git-push.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/prompts/request-generate-system.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/unit/core/preflight.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m tests/unit/parser/rules/title-required.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/adapter/shared/prompt-builder.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/repo/github-origin.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.conformance-resume.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 91[2mms[22m[39m
 [32m✓[39m src/core/resume/__tests__/resume-context.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/buildMockPipeline.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/hint-command-existence.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m

[2m Test Files [22m [1m[32m399 passed[39m[22m[90m (399)[39m
[2m      Tests [22m [1m[32m5331 passed[39m[22m[90m (5331)[39m
[2m   Start at [22m 21:32:19
[2m   Duration [22m 70.87s[2m (transform 23.28s, setup 0ms, import 69.05s, tests 90.83s, environment 207ms)[22m


$ vitest run
Warning: /tmp/cred-test-q4hQcT/specrunner/credentials.json has loose permissions (recommend 0600).
Warning: /tmp/cred-test-rSpEpH/specrunner/credentials.json has loose permissions (recommend 0600).
[codex] completion report parse failed (main turn): no-json-found; fragment: "This is plain text. No JSON here at all."
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: "This is plain text. No JSON here at all."
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: "This is plain text. No JSON here at all."
[codex] completion report parse failed (main turn): no-json-found; fragment: "plain prose no json"
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: "plain prose no json"
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: "plain prose no json"
[codex] completion report parse failed (main turn): no-json-found; fragment: "plain prose no json"
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: "plain prose no json"
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: "plain prose no json"
[specrunner] warn: steps.code-review.byRequestType.unknown-custom-type is not a known request type. Known types: bug-fix, spec-change, new-feature, refactoring, chore.
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
[codex] completion report parse failed (main turn): no-json-found; fragment: "not valid json"
[codex] completion report parse failed (main turn): no-json-found; fragment: "not valid json"
[codex] completion report parse failed (main turn): no-json-found; fragment: "not json at all"
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: ""
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: ""
[codex] completion report parse failed (main turn): no-json-found; fragment: "This is just prose, no JSON here at all."
[codex] completion report parse failed (attempt 1/2): no-json-found; fragment: "This is just prose, no JSON here at all."
[codex] completion report parse failed (attempt 2/2): no-json-found; fragment: "This is just prose, no JSON here at all."
[codex] completion report parse failed (main turn): no-json-found; fragment: "Sorry, no JSON here."
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
[codex] completion report parse failed (main turn): no-json-found; fragment: "not json"
Warning: issue-notifier: failed to write comment to issue #42: network error
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
Warning: A vi.mock("node:child_process") call in "tests/git-remote.test.ts" is not at the top level of the module. Although it appears nested, it will be hoisted and executed before any tests run. Move it to the top level to reflect its actual execution order. This will become an error in a future version.
See: https://vitest.dev/guide/mocking/modules#how-it-works
Warning: Could not parse verdict from agent step 'design'. Treating as escalation.
Warning: Could not parse verdict from agent step 'spec-review'. Treating as escalation.

```

## Phase: lint

```
$ eslint ./src ./tests --max-warnings 0

```
