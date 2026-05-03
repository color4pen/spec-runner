# Verification Result — specrunner-dir-rename — iter 1

## Verdict: passed

## Phase Results

| # | Phase | Status | Duration | Exit Code |
|---|-------|--------|----------|-----------|
| 1 | build | passed | 1.6s | 0 |
| 2 | typecheck | passed | 1.3s | 0 |
| 3 | test | passed | 2.4s | 0 |
| 4 | lint | skipped | — | — |
| 5 | security | skipped | — | — |

## Phase: build

```
$ tsc --noEmit false --outDir dist

```

## Phase: typecheck

```
$ tsc --noEmit

```

## Phase: test

```

[1m[30m[46m RUN [49m[39m[22m [36mv4.1.5 [39m[90m~/Documents/GitHub/spec-runner[39m

 [32m✓[39m tests/completion.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 5[2mms[22m[39m
[iter 1/1] starting propose
 [32m✓[39m tests/init.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 158[2mms[22m[39m
[iter 1/1] starting propose
 [32m✓[39m tests/spec-review-step.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 166[2mms[22m[39m
[iter 1] propose verdict: escalation → halt
 [32m✓[39m tests/cli.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 167[2mms[22m[39m
[iter 1/1] starting propose
[iter 1/1] starting propose
[iter 1/1] starting propose
 [32m✓[39m tests/core/doctor/doctor-cli.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 209[2mms[22m[39m
 [32m✓[39m tests/core/pipeline/pipeline.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 75[2mms[22m[39m
[iter 1] propose verdict: escalation → halt
[iter 1/1] starting propose
[iter 1/1] starting propose
[iter 1] propose verdict: escalation → halt
[iter 1/1] starting propose
 [32m✓[39m tests/pipeline.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 267[2mms[22m[39m
 [32m✓[39m tests/grep-no-bun-imports.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 86[2mms[22m[39m
 [32m✓[39m tests/custom-tools.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 48[2mms[22m[39m
 [32m✓[39m tests/core/steps/spec-review.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 74[2mms[22m[39m
 [32m✓[39m tests/unit/step/review-exit-contract.test.ts [2m([22m[2m33 tests[22m[2m)[22m[32m 64[2mms[22m[39m
 [32m✓[39m tests/finish-orchestrator.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 72[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/pipeline.transitions.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 70[2mms[22m[39m
 [32m✓[39m tests/error-codes.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 52[2mms[22m[39m
 [32m✓[39m tests/state-store.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 47[2mms[22m[39m
 [32m✓[39m tests/store/job-state-store.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 50[2mms[22m[39m
 [32m✓[39m tests/finish-resolve-target.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 52[2mms[22m[39m
 [32m✓[39m tests/finish-adversarial.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 54[2mms[22m[39m
 [32m✓[39m tests/unit/step/pr-create.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m tests/unit/remove-session-timeout.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 39[2mms[22m[39m
 [32m✓[39m tests/finish-job-state.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m tests/cli-stdout-snapshot.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m tests/finish-ps-integration.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m tests/unit/core/verification/runner.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m tests/state/io.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m tests/unit/core/pr-create/runner.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/agent-definition.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m tests/parser.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/core/step/step-interface.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m tests/unit/step/executor-helpers.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 50[2mms[22m[39m
 [32m✓[39m tests/core/session-runner.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/cli-run-verdict.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m tests/unit/agent/syncer-rollback.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/step/build-fixer.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/step/code-review.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/agent/syncer.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/agent/registry.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/grep-no-step-name-hardcode.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/all-checks.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m tests/git-remote.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/state/session-timeout-migration.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 41[2mms[22m[39m
 [32m✓[39m tests/register-branch-schema.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/core/event/event-bus.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/pipeline-integration.test.ts [2m([22m[2m13 tests[22m[2m)[22m[33m 1192[2mms[22m[39m
 [32m✓[39m tests/github-device.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/core/doctor/formatter.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/agents/environment-registered.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/storage/jobs-writable.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/runtime/bun.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m tests/state/job-slug.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/config/file-exists.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/get-raw-file.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/runtime/node.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/unit/step/code-fixer.test.ts [2m([22m[2m23 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/auth/anthropic-key-valid.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/unit/config/migrate.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/github/verify-path.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/step/verification.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m tests/spec-review-verdict.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/core/doctor/runner.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/finish-move-requests-dir.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/state/helpers.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/schema.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/repo/github-origin.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m tests/unit/step/agent-definition.test.ts [2m([22m[2m23 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/auth/github-token-valid.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/agents/definition-drift.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/storage/old-state-files.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/unit/agent/hash.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/config/getAgentId.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/finish-archive-openspec.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/adapter/anthropic/session-client.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/unit/step/implementer.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/runtime/git.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 2[2mms[22m[39m
 [32m✓[39m tests/prompts/propose-system.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m tests/unit/core/pipeline/run.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/unit/core/pr-create/body-template.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/prompts/implementer-system.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/config/github-token-present.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 2[2mms[22m[39m
 [32m✓[39m tests/config/schema.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/unit/parser/review-verdict.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/runtime/openspec.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m tests/unit/core/step/types.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/config/anthropic-key-present.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/env/github-client-id.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 2[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/repo/workflow-structure.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/agents/agents-registered.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 2[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/repo/git-repository.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 2[2mms[22m[39m
 [32m✓[39m tests/core/doctor/checks/repo/openspec-project-md.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 2[2mms[22m[39m
 [32m✓[39m tests/prompts/spec-fixer-system.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 2[2mms[22m[39m
 [32m✓[39m tests/finish-escalation.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 2[2mms[22m[39m

[2m Test Files [22m [1m[32m92 passed[39m[22m[90m (92)[39m
[2m      Tests [22m [1m[32m712 passed[39m[22m[90m (712)[39m
[2m   Start at [22m 18:11:23
[2m   Duration [22m 2.18s[2m (transform 1.94s, setup 0ms, import 2.78s, tests 3.67s, environment 5ms)[22m


$ vitest run
Warning: A vi.mock("node:child_process") call in "~/Documents/GitHub/spec-runner/tests/git-remote.test.ts" is not at the top level of the module. Although it appears nested, it will be hoisted and executed before any tests run. Move it to the top level to reflect its actual execution order. This will become an error in a future version.
See: https://vitest.dev/guide/mocking/modules#how-it-works

```

## Phase: lint

_(skipped — script not found in package.json)_

## Phase: security

_(skipped — script not found in package.json)_
