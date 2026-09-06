# Verification Result — optional-github-integration — iter 1

## Verdict: failed

## Phase Results

| # | Phase | Status | Duration | Exit Code |
|---|-------|--------|----------|-----------|
| 1 | build | passed | 0.6s | 0 |
| 2 | typecheck | failed | 15.5s | 2 |
| 3 | test | skipped | — | — |
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
[32mESM[39m [1mdist/specrunner.js [22m[32m1.62 MB[39m
[32mESM[39m ⚡️ Build success in 207ms

$ tsup
$ ! grep -qE "from ['\"]zod|require\\(['\"]zod" dist/specrunner.js

```

## Phase: typecheck

Step 'typecheck' failed

```
src/cli/archive-from-issue.ts(147,29): error TS2353: Object literal may only specify known properties, and 'owner' does not exist in type '{ github?: { owner: string; name: string; } | undefined; origin?: RepositoryOrigin | undefined; }'.
src/cli/ps.ts(47,50): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
  Type 'undefined' is not assignable to type 'string'.
src/cli/resume-from-issue.ts(165,27): error TS2353: Object literal may only specify known properties, and 'owner' does not exist in type '{ github?: { owner: string; name: string; } | undefined; origin?: RepositoryOrigin | undefined; }'.
src/cli/resume.ts(68,49): error TS2345: Argument of type '{ owner: string | undefined; name: string | undefined; }' is not assignable to parameter of type 'OriginInfo'.
  Types of property 'owner' are incompatible.
    Type 'string | undefined' is not assignable to type 'string'.
      Type 'undefined' is not assignable to type 'string'.
src/core/attach/__tests__/checkpoint-policy.test.ts(193,25): error TS2353: Object literal may only specify known properties, and 'owner' does not exist in type '{ github?: { owner: string; name: string; } | undefined; origin?: RepositoryOrigin | undefined; }'.
src/core/command/runner.ts(374,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/notify/issue-notifier.ts(185,33): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
  Type 'undefined' is not assignable to type 'string'.
src/core/pipeline/__tests__/iteration-display.test.ts(155,50): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/iteration-display.test.ts(207,46): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-canon.test.ts(265,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-canon.test.ts(284,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-canon.test.ts(319,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-canon.test.ts(354,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-canon.test.ts(384,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-canon.test.ts(408,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-canon.test.ts(436,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-canon.test.ts(457,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-canon.test.ts(483,66): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-canon.test.ts(515,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-canon.test.ts(554,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-canon.test.ts(604,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-canon.test.ts(656,81): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-canon.test.ts(689,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(220,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(248,47): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(275,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(293,47): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(311,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(331,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(358,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(389,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(412,47): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(450,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(476,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(494,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(514,47): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(532,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(569,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(590,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(608,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(676,43): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(689,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(706,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(761,43): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(774,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(791,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(861,43): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(874,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(895,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(913,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(970,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(989,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(1025,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(1047,47): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(1073,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(1110,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(1150,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(1177,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts(1213,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts(246,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts(301,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts(331,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts(366,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts(405,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts(433,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts(485,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts(514,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts(582,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts(637,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts(690,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-resume.test.ts(208,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-resume.test.ts(229,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-resume.test.ts(253,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-resume.test.ts(279,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-resume.test.ts(302,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-state-commit.test.ts(201,47): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-state-commit.test.ts(219,53): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-state-commit.test.ts(241,47): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-state-commit.test.ts(272,67): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-state-commit.test.ts(285,67): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-state-commit.test.ts(298,67): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-state-commit.test.ts(311,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-state-commit.test.ts(328,74): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-state-commit.test.ts(347,74): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-state-commit.test.ts(362,47): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/parallel-review-round-state-commit.test.ts(387,47): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/pipeline-one-shot-resume.test.ts(183,45): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/pipeline-one-shot-resume.test.ts(209,45): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/pipeline-one-shot-resume.test.ts(236,45): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/__tests__/pipeline-one-shot-resume.test.ts(258,45): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/run.ts(144,55): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/pipeline/run.ts(166,67): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/runtime/factory.ts(78,82): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
  Type 'undefined' is not assignable to type 'string'.
src/core/step/__tests__/commit-orchestrator-touched-files.test.ts(158,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/commit-orchestrator-touched-files.test.ts(182,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/commit-orchestrator-touched-files.test.ts(215,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/commit-orchestrator-touched-files.test.ts(225,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/commit-orchestrator-touched-files.test.ts(261,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/commit-orchestrator-touched-files.test.ts(286,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/commit-orchestrator-touched-files.test.ts(318,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/commit-orchestrator.test.ts(207,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/commit-orchestrator.test.ts(229,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/commit-orchestrator.test.ts(364,55): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/commit-orchestrator.test.ts(379,43): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/commit-orchestrator.test.ts(398,50): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/commit-orchestrator.test.ts(446,7): error TS2322: Type 'PipelineDeps' is not assignable to type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/commit-orchestrator.test.ts(491,7): error TS2322: Type 'PipelineDeps' is not assignable to type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/commit-orchestrator.test.ts(542,7): error TS2322: Type 'PipelineDeps' is not assignable to type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/commit-orchestrator.test.ts(583,7): error TS2322: Type 'PipelineDeps' is not assignable to type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/commit-orchestrator.test.ts(614,7): error TS2322: Type 'PipelineDeps' is not assignable to type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/commit-orchestrator.test.ts(644,7): error TS2322: Type 'PipelineDeps' is not assignable to type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/commit-orchestrator.test.ts(675,7): error TS2322: Type 'PipelineDeps' is not assignable to type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-commit-mutex.test.ts(155,55): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-commit-mutex.test.ts(156,55): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-commit-mutex.test.ts(210,60): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-drift-detection.test.ts(182,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-drift-detection.test.ts(212,54): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-drift-detection.test.ts(238,67): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-drift-detection.test.ts(259,67): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-drift-detection.test.ts(281,67): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-drift-detection.test.ts(307,47): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-drift-detection.test.ts(323,67): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-drift-detection.test.ts(356,49): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(193,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(225,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(248,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(267,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(288,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(309,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(380,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(406,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(433,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(496,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(709,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(740,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(765,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(796,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(833,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(865,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(901,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(932,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(963,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(995,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-no-op.test.ts(1025,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-oid-capture.test.ts(165,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-oid-capture.test.ts(236,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-oid-capture.test.ts(286,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-resume-context.test.ts(132,55): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-resume-context.test.ts(141,60): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-round-commit.test.ts(143,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-round-commit.test.ts(170,70): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-round-commit.test.ts(171,69): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-round-commit.test.ts(198,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-round-commit.test.ts(218,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-round-produce.test.ts(155,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-round-produce.test.ts(195,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-round-produce.test.ts(231,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-round-produce.test.ts(262,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-round-produce.test.ts(288,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-round-produce.test.ts(313,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-round-produce.test.ts(341,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-sequential-regression.test.ts(204,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-sequential-regression.test.ts(219,47): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-sequential-regression.test.ts(231,47): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-sequential-regression.test.ts(245,47): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-sequential-regression.test.ts(264,54): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-sequential-regression.test.ts(276,49): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-sequential-regression.test.ts(292,53): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-sequential-regression.test.ts(306,53): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-sequential-regression.test.ts(325,54): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-sequential-regression.test.ts(337,49): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-sequential-regression.test.ts(355,53): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-sequential-regression.test.ts(370,53): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-sequential-regression.test.ts(383,53): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-sequential-regression.test.ts(413,67): error TS2345: Argument of type '{ cwd: string; client?: SessionClient; sleepFn?: (ms: number) => Promise<void>; githubClient: GitHubClient | null; githubToken?: string; ... 21 more ...; pushCapability?: PushCapability | null; }' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-sequential-regression.test.ts(427,47): error TS2345: Argument of type '{ cwd: string; client?: SessionClient; sleepFn?: (ms: number) => Promise<void>; githubClient: GitHubClient | null; githubToken?: string; ... 21 more ...; pushCapability?: PushCapability | null; }' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/executor-sequential-regression.test.ts(442,47): error TS2345: Argument of type '{ cwd: string; client?: SessionClient; sleepFn?: (ms: number) => Promise<void>; githubClient: GitHubClient | null; githubToken?: string; ... 21 more ...; pushCapability?: PushCapability | null; }' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/judge-verdict.test.ts(384,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/judge-verdict.test.ts(412,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/lineage-output-attribution.test.ts(246,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/lineage-output-attribution.test.ts(289,66): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/lineage-output-attribution.test.ts(335,67): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/lineage-output-attribution.test.ts(374,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/lineage-output-attribution.test.ts(410,67): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/lineage-output-attribution.test.ts(462,7): error TS2322: Type 'PipelineDeps' is not assignable to type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/lineage-output-attribution.test.ts(540,7): error TS2322: Type 'PipelineDeps' is not assignable to type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/lineage-output-attribution.test.ts(657,59): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/request-review-step-completion-evidence.test.ts(115,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/request-review-step-completion-evidence.test.ts(148,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/request-review-step-completion-evidence.test.ts(182,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/request-review-step-completion-evidence.test.ts(207,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/spec-review-fixer-routing.test.ts(291,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/spec-review-fixer-routing.test.ts(354,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/spec-review-fixer-routing.test.ts(405,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/spec-review-fixer-routing.test.ts(453,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/spec-review-fixer-routing.test.ts(639,74): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/spec-review-fixer-routing.test.ts(726,74): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/spec-review-fixer-routing.test.ts(780,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/spec-review-fixer-routing.test.ts(988,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/spec-review-fixer-routing.test.ts(1140,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/spec-review-fixer-routing.test.ts(1192,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/spec-review-fixer-routing.test.ts(1303,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/spec-review-prior-round-context.test.ts(376,57): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/spec-review-prior-round-context.test.ts(417,57): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/spec-review-prior-round-context.test.ts(458,53): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/step-completion-evidence-diagnostic.test.ts(117,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/step-completion-evidence-diagnostic.test.ts(143,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/step-completion-evidence-diagnostic.test.ts(173,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/step-completion-missing-file-finding.test.ts(225,66): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/step-completion-missing-file-finding.test.ts(267,66): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/step-completion-missing-file-finding.test.ts(311,66): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/step-completion-missing-file-finding.test.ts(409,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/step-completion-missing-file-finding.test.ts(502,45): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/step-completion-missing-file-finding.test.ts(744,66): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/step-context-builder.test.ts(140,53): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/step-context-builder.test.ts(163,53): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/step-context-builder.test.ts(187,37): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/step-context-builder.test.ts(199,37): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/step-context-builder.test.ts(238,53): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/step-context-builder.test.ts(300,53): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/step-context-builder.test.ts(362,53): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
src/core/step/__tests__/step-context-builder.test.ts(398,53): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/attach/attach-resume-e2e.test.ts(325,90): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/canon-binding-e2e.test.ts(303,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/canon-binding-e2e.test.ts(349,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/canon-binding-e2e.test.ts(397,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/canon-binding-e2e.test.ts(434,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/canon-binding-e2e.test.ts(495,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/canon-binding-e2e.test.ts(543,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/canon-binding-e2e.test.ts(586,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/cli-stdout-snapshot.test.ts(231,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/cli-stdout-snapshot.test.ts(291,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/cli-stdout-snapshot.test.ts(346,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts(694,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts(707,50): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts(740,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts(783,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts(801,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts(836,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts(866,50): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts(938,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts(963,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts(977,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts(1077,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts(1162,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts(1238,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts(1294,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts(1341,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts(1558,66): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts(1756,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.guard-halt.test.ts(208,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.guard-halt.test.ts(262,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.guard-halt.test.ts(347,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.guard-halt.test.ts(401,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.guard-halt.test.ts(475,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.test.ts(364,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.test.ts(397,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.test.ts(423,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.test.ts(482,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.test.ts(509,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.test.ts(546,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.test.ts(573,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.test.ts(682,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.test.ts(715,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.test.ts(755,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.test.ts(784,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.test.ts(815,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.test.ts(851,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/pipeline/pipeline.test.ts(923,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/step/step-interface.test.ts(273,7): error TS2322: Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
  Type 'null' is not assignable to type 'GitHubClient'.
tests/core/step/step-interface.test.ts(280,47): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/step/step-interface.test.ts(344,7): error TS2322: Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
  Type 'null' is not assignable to type 'GitHubClient'.
tests/core/step/step-interface.test.ts(352,47): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/core/steps/spec-review.test.ts(138,5): error TS2322: Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
  Type 'null' is not assignable to type 'GitHubClient'.
tests/core/steps/spec-review.test.ts(143,53): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/error-path-integration.test.ts(236,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/error-path-integration.test.ts(284,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/github-disabled-e2e.test.ts(199,5): error TS2322: Type '(p: string, opts?: { recursive?: boolean; }) => Promise<string | undefined>' is not assignable to type '(path: string, opts: { recursive: boolean; }) => Promise<void>'.
  Type 'Promise<string | undefined>' is not assignable to type 'Promise<void>'.
    Type 'string | undefined' is not assignable to type 'void'.
      Type 'string' is not assignable to type 'void'.
tests/github-disabled-e2e.test.ts(308,85): error TS2552: Cannot find name 'RequestInfo'. Did you mean 'RequestInit'?
tests/github-disabled-e2e.test.ts(402,91): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/github-disabled-e2e.test.ts(419,82): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/github-disabled-e2e.test.ts(512,11): error TS2322: Type '(cmd: string, args: string[], opts?: Record<string, unknown>) => Promise<SpawnResult>' is not assignable to type 'SpawnFn'.
  Types of parameters 'opts' and 'opts' are incompatible.
    Type 'SpawnOptions' is not assignable to type 'Record<string, unknown>'.
      Index signature for type 'string' is missing in type 'SpawnOptions'.
tests/github-disabled-e2e.test.ts(517,44): error TS2352: Conversion of type 'Record<string, unknown> | undefined' to type 'SpawnOptions' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Property 'cwd' is missing in type 'Record<string, unknown>' but required in type 'SpawnOptions'.
tests/pipeline-sole-committer-e2e.test.ts(492,58): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/pipeline-sole-committer-e2e.test.ts(639,58): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/spec-review-step.test.ts(142,5): error TS2322: Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
  Type 'null' is not assignable to type 'GitHubClient'.
tests/spec-review-step.test.ts(147,53): error TS2345: Argument of type 'Omit<PipelineDeps, "client"> & { client: SessionClient; }' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/absorb-build-fixer/implementer-recovery.test.ts(134,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/absorb-build-fixer/implementer-recovery.test.ts(188,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/absorb-build-fixer/implementer-recovery.test.ts(214,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/absorb-build-fixer/implementer-recovery.test.ts(392,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/absorb-build-fixer/implementer-recovery.test.ts(410,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/absorb-build-fixer/pipeline-exhaustion.test.ts(271,71): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/absorb-build-fixer/pipeline-exhaustion.test.ts(438,71): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/adapter/agent-runner-port.test.ts(275,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/adapter/agent-runner-port.test.ts(307,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/adapter/agent-runner-port.test.ts(357,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/adapter/agent-runner-port.test.ts(426,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/adapter/agent-runner-port.test.ts(484,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/adapter/agent-runner-port.test.ts(529,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/adapter/agent-runner-port.test.ts(589,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts(218,68): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts(310,55): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts(402,68): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts(483,68): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts(568,68): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts(649,68): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts(729,68): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts(965,68): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts(1046,55): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/architecture/composite-deps-ownership.test.ts(35,60): error TS2322: Type 'PipelineDeps' is not assignable to type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/architecture/composite-deps-ownership.test.ts(36,67): error TS2322: Type 'PipelineDeps' is not assignable to type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/architecture/composite-deps-ownership.test.ts(37,72): error TS2322: Type 'PipelineDeps' is not assignable to type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/contract/golden-cases.test.ts(191,79): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/contract/golden-cases.test.ts(205,79): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/contract/golden-cases.test.ts(220,79): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/command/pipeline-run-duplicate-guard.test.ts(58,3): error TS2739: Type '{ config: { version: 1; runtime: "local"; agents: {}; }; repo: { owner: string; name: string; }; request: ParsedRequest; githubToken: string; githubTokenSource: "env"; }' is missing the following properties from type 'PreflightResult': githubEnabled, origin
tests/unit/core/command/pipeline-run-gate.test.ts(87,3): error TS2739: Type '{ config: { version: 1; runtime: "local"; agents: {}; }; repo: { owner: string; name: string; }; request: ParsedRequest; githubToken: string; githubTokenSource: "env"; }' is missing the following properties from type 'PreflightResult': githubEnabled, origin
tests/unit/core/command/pipeline-run-inbox-origin.test.ts(59,3): error TS2739: Type '{ config: { version: 1; runtime: "local"; agents: {}; }; repo: { owner: string; name: string; }; request: ParsedRequest; githubToken: string; githubTokenSource: "env"; }' is missing the following properties from type 'PreflightResult': githubEnabled, origin
tests/unit/core/command/pipeline-run-input-completeness.test.ts(188,3): error TS2739: Type '{ config: { version: 1; runtime: "local"; agents: {}; }; repo: { owner: string; name: string; }; request: ParsedRequest; githubToken: string; githubTokenSource: "env"; }' is missing the following properties from type 'PreflightResult': githubEnabled, origin
tests/unit/core/command/pipeline-run-reviewer-snapshot.test.ts(93,3): error TS2739: Type '{ config: { version: 1; runtime: "local"; agents: {}; }; repo: { owner: string; name: string; }; request: ParsedRequest; githubToken: string; githubTokenSource: "env"; }' is missing the following properties from type 'PreflightResult': githubEnabled, origin
tests/unit/core/command/pipeline-run.test.ts(62,3): error TS2739: Type '{ config: SpecRunnerConfig; repo: { owner: string; name: string; }; request: ParsedRequest; githubToken: string; githubTokenSource: "env"; }' is missing the following properties from type 'PreflightResult': githubEnabled, origin
tests/unit/core/pipeline/pipeline-roles.test.ts(431,45): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline-roles.test.ts(491,45): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.build-fixer-reentry.test.ts(343,71): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.build-fixer-reentry.test.ts(385,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.build-fixer-reentry.test.ts(509,71): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.build-fixer-reentry.test.ts(601,71): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.cli-step-output.test.ts(219,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.cli-step-output.test.ts(254,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.cli-step-output.test.ts(288,44): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.cli-step-output.test.ts(322,44): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.cli-step-output.test.ts(357,46): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.cli-step-output.test.ts(391,44): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.cli-step-output.test.ts(433,43): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.cli-step-output.test.ts(483,47): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.cli-step-output.test.ts(520,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.conformance-routing.test.ts(253,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.conformance-routing.test.ts(293,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.conformance-routing.test.ts(336,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.conformance-routing.test.ts(371,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.conformance-routing.test.ts(398,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.conformance-routing.test.ts(421,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.conformance-routing.test.ts(447,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.conformance-routing.test.ts(498,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.conformance-routing.test.ts(566,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.crash-state.test.ts(146,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.crash-state.test.ts(189,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.crash-state.test.ts(229,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.episode-reset.test.ts(266,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.episode-reset.test.ts(345,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.episode-reset.test.ts(408,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.episode-reset.test.ts(524,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.episode-reset.test.ts(581,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts(197,46): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts(239,47): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts(273,46): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts(306,46): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts(347,46): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts(378,46): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts(427,47): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts(483,46): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts(524,46): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.notification.test.ts(193,60): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.notification.test.ts(238,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.notification.test.ts(289,60): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.notification.test.ts(333,60): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.reverification.test.ts(270,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.reverification.test.ts(349,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.reverification.test.ts(430,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.reverification.test.ts(512,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.reverification.test.ts(559,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.reverification.test.ts(594,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.reverification.test.ts(680,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.storeFactory.test.ts(171,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.storeFactory.test.ts(233,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.storeFactory.test.ts(277,50): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.transitions.test.ts(555,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.transitions.test.ts(648,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.transitions.test.ts(765,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.transitions.test.ts(833,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.transitions.test.ts(942,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.transitions.test.ts(1007,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/pipeline/pipeline.transitions.test.ts(1054,59): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-context-metrics.test.ts(201,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-context-metrics.test.ts(233,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-context-metrics.test.ts(283,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-context-metrics.test.ts(339,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-context-metrics.test.ts(382,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-context-metrics.test.ts(415,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-context-metrics.test.ts(461,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-context-metrics.test.ts(489,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-context-metrics.test.ts(507,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-context-metrics.test.ts(661,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-context-metrics.test.ts(730,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-context-metrics.test.ts(790,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-context-metrics.test.ts(828,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-context-metrics.test.ts(869,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-context-metrics.test.ts(947,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-rollover.test.ts(216,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-rollover.test.ts(270,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-rollover.test.ts(310,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-rollover.test.ts(339,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-rollover.test.ts(369,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-rollover.test.ts(393,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-rollover.test.ts(431,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-rollover.test.ts(489,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-rollover.test.ts(553,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-rollover.test.ts(606,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-rollover.test.ts(648,58): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-rollover.test.ts(694,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-rollover.test.ts(965,7): error TS2322: Type 'PipelineDeps' is not assignable to type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-rollover.test.ts(1018,7): error TS2322: Type 'PipelineDeps' is not assignable to type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-rollover.test.ts(1091,7): error TS2322: Type 'PipelineDeps' is not assignable to type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-rollover.test.ts(1152,9): error TS2322: Type 'PipelineDeps' is not assignable to type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-rollover.test.ts(1193,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-rollover.test.ts(1218,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-rollover.test.ts(1249,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-usage-metrics.test.ts(200,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/commit-orchestrator-usage-metrics.test.ts(247,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor-cli-entry-oid.test.ts(194,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor-cli-entry-oid.test.ts(230,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor-cli-entry-oid.test.ts(267,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor-cli-entry-oid.test.ts(297,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor-verdict.test.ts(203,74): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor-verdict.test.ts(224,74): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor-verdict.test.ts(241,74): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor-verdict.test.ts(258,74): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor-verdict.test.ts(275,86): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor-verdict.test.ts(291,86): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor-verdict.test.ts(307,86): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor-verdict.test.ts(325,87): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor-verdict.test.ts(341,79): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor-verdict.test.ts(382,82): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor-verdict.test.ts(399,82): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor-verdict.test.ts(421,82): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor.test.ts(163,44): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor.test.ts(190,44): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor.test.ts(217,59): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor.test.ts(221,42): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor.test.ts(240,44): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor.test.ts(270,44): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor.test.ts(305,44): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor.test.ts(326,44): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor.test.ts(347,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor.test.ts(348,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor.test.ts(381,59): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor.test.ts(382,42): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor.test.ts(444,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/executor.test.ts(469,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/fast-scope-checkpoint.test.ts(254,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/fast-scope-checkpoint.test.ts(272,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/fast-scope-checkpoint.test.ts(290,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/fast-scope-checkpoint.test.ts(308,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/fast-scope-checkpoint.test.ts(329,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/fast-scope-checkpoint.test.ts(349,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/fast-scope-checkpoint.test.ts(369,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/fast-scope-checkpoint.test.ts(387,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/fast-scope-checkpoint.test.ts(418,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/fast-scope-checkpoint.test.ts(439,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/fast-scope-checkpoint.test.ts(469,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/fast-scope-checkpoint.test.ts(491,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/fast-scope-checkpoint.test.ts(512,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/fast-scope-checkpoint.test.ts(540,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/fast-scope-checkpoint.test.ts(565,44): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(345,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(375,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(393,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(416,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(446,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(477,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(521,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(698,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(890,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(908,44): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(926,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(948,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(968,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(1095,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(1131,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(1150,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(1168,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(1232,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(1251,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(1273,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(1293,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(1319,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/scope-escalation.test.ts(1338,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/spec-fixer-tasks-md-writable.test.ts(279,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/spec-fixer-tasks-md-writable.test.ts(349,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/spec-fixer-tasks-md-writable.test.ts(406,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/spec-review-scope-exclusion.test.ts(255,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/spec-review-scope-exclusion.test.ts(309,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/spec-review-scope-exclusion.test.ts(356,63): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/spec-review-scope-exclusion.test.ts(391,80): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/step-completion-canon.test.ts(148,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/step-completion-canon.test.ts(181,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/step-completion-canon.test.ts(213,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/step-completion-canon.test.ts(243,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/verification-phase-outcome-executor.test.ts(184,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/verification-phase-outcome-executor.test.ts(216,73): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/verification-phase-outcome-executor.test.ts(252,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/core/step/verification-phase-outcome-executor.test.ts(294,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts(298,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts(353,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/pipeline/pipeline-sole-committer-round-guard.test.ts(441,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'ParallelReviewRoundDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/pipeline/transition-when.test.ts(541,45): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'PipelineOrchestrationDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/commit-and-push.test.ts(368,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/commit-and-push.test.ts(413,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/commit-and-push.test.ts(447,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/commit-and-push.test.ts(489,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/commit-and-push.test.ts(533,9): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/commit-and-push.test.ts(573,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/commit-and-push.test.ts(616,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/commit-and-push.test.ts(650,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/commit-and-push.test.ts(681,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/commit-and-push.test.ts(714,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/commit-and-push.test.ts(745,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/commit-and-push.test.ts(786,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-activation.test.ts(173,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-activation.test.ts(203,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-activation.test.ts(236,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-activation.test.ts(261,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-activation.test.ts(291,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-activation.test.ts(323,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-activation.test.ts(354,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-activation.test.ts(387,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-activation.test.ts(413,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-activation.test.ts(441,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-activation.test.ts(467,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-activation.test.ts(500,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-activation.test.ts(531,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-commit-mutex.test.ts(185,59): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-commit-mutex.test.ts(223,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-commit-mutex.test.ts(224,57): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-commit-mutex.test.ts(264,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-commit-mutex.test.ts(265,57): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-drift-detection.test.ts(181,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-drift-detection.test.ts(204,49): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-drift-detection.test.ts(233,62): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-drift-detection.test.ts(257,49): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-input-validation.test.ts(202,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-input-validation.test.ts(257,43): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-input-validation.test.ts(316,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-lifecycle-ordering.test.ts(164,54): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-lifecycle-ordering.test.ts(206,54): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-lifecycle-ordering.test.ts(272,54): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-no-op.test.ts(233,71): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-no-op.test.ts(256,71): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-no-op.test.ts(278,73): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-no-op.test.ts(298,71): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-output-gate.test.ts(202,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-output-gate.test.ts(229,43): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-output-gate.test.ts(266,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-output-gate.test.ts(291,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-output-gate.test.ts(315,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-output-gate.test.ts(356,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-output-gate.test.ts(387,43): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-resume-context.test.ts(207,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-resume-context.test.ts(229,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-resume-context.test.ts(252,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-resume-context.test.ts(281,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-skip-when.test.ts(136,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-skip-when.test.ts(166,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-skip-when.test.ts(196,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-skip-when.test.ts(216,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-skip-when.test.ts(244,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-skip-when.test.ts(280,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-verbose-log.test.ts(191,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-verbose-log.test.ts(213,65): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-verbose-log.test.ts(237,72): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-verdict.test.ts(191,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-verdict.test.ts(215,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-verdict.test.ts(254,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-verdict.test.ts(294,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-verdict.test.ts(316,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-verdict.test.ts(349,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-verdict.test.ts(413,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-verdict.test.ts(474,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-verdict.test.ts(536,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor-verdict.test.ts(570,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.commit.test.ts(327,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.commit.test.ts(373,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.commit.test.ts(421,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.commit.test.ts(465,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.commit.test.ts(507,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.commit.test.ts(550,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.commit.test.ts(601,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.commit.test.ts(644,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.commit.test.ts(690,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.commit.test.ts(729,37): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.commit.test.ts(769,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.store-cache.test.ts(145,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.store-cache.test.ts(146,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.store-cache.test.ts(147,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.store-cache.test.ts(178,42): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.store-cache.test.ts(179,42): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(32,5): error TS2322: Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
  Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(188,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(262,51): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(334,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(398,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(465,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(527,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(589,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(652,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(768,43): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(882,43): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(985,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(1001,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(1028,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(1113,50): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(1191,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(1272,64): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(1358,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(1381,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(1405,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/executor.test.ts(1429,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/review-exit-contract.test.ts(503,5): error TS2322: Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
  Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/review-exit-contract.test.ts(570,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/review-exit-contract.test.ts(636,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/review-exit-contract.test.ts(704,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/review-exit-contract.test.ts(770,56): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/severity-fixability-split.test.ts(572,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/severity-fixability-split.test.ts(627,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/unpushable-path-contract.test.ts(269,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/unpushable-path-contract.test.ts(288,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/unpushable-path-contract.test.ts(308,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/unpushable-path-contract.test.ts(328,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/unpushable-path-contract.test.ts(352,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/unpushable-path-contract.test.ts(369,68): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/unpushable-path-contract.test.ts(370,71): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/unpushable-path-contract.test.ts(389,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/unpushable-path-contract.test.ts(408,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/unpushable-path-contract.test.ts(433,7): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/unpushable-path-escalation.test.ts(253,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/unpushable-path-escalation.test.ts(284,41): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/unpushable-path-escalation.test.ts(312,61): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/unpushable-path-escalation.test.ts(354,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.
tests/unit/step/unpushable-path-escalation.test.ts(382,48): error TS2345: Argument of type 'PipelineDeps' is not assignable to parameter of type 'StepExecutionDeps'.
  Types of property 'githubClient' are incompatible.
    Type 'GitHubClient | null' is not assignable to type 'GitHubClient'.
      Type 'null' is not assignable to type 'GitHubClient'.

$ tsc --noEmit

```

## Phase: test

_(skipped — previous command failed)_

## Phase: lint

_(skipped — previous command failed)_

## Phase: changed-line-coverage

_(skipped — previous command failed)_

## Phase: lockfile-sync

_(skipped — previous command failed)_
