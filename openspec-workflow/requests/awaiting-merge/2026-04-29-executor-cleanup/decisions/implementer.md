# Implementer Decisions — 2026-04-29-executor-cleanup

Format: `決定内容 :: 理由`

## Phase A — Zero-risk cleanups

- `AGENT_TOOLSET_TYPE` const を `src/core/agent/definition.ts` に export する :: `"agent_toolset_20260401"` リテラルが propose.ts / spec-review.ts / spec-fixer.ts / anthropic-client.ts の 4 箇所に散在しており single source of truth として集約する
- `def.role as StepName` キャストを `registry.ts:27` から削除する :: `AgentDefinition.role` は既に `StepName` 型であり不要な cast
- `step.name !== step.agent.role` を `AgentRegistry.fromSteps` に追加する :: 不整合を construction time に fail-fast 検出するため
- `canonicalJson` で `value === undefined` のキーをスキップする :: `{ a: undefined }` と `{}` が異なる hash を返すのは deterministic hash の要件を満たさない

## Phase B — Helper extraction

- `src/core/step/executor-helpers.ts` を新設する :: module-analysis.md の推奨に従い、session lifecycle helper を cohesive unit として testability を上げる
- `failStepWithError` の返り値を `Promise<never>` ではなく `Promise<JobState>` にする :: `throw` した後の state を呼び出し側で参照する可能性がある。module-analysis.md は `Promise<never>` を推奨しているが、関数内部で throw するため呼び出し側では `never` として扱われる実装にする

## Phase C — pipeline.ts deletion

- `src/core/pipeline.ts` → `src/core/pipeline/run.ts` に移動し 1 commit で削除する :: D3 / learned-patterns「directory-form 移行は sibling 削除を含めて 1 commit」を遵守
- `tests/spec-review-fetch.test.ts` の `import type { PipelineDeps } from "../src/core/pipeline.js"` を `../src/core/types.js` に変更する :: `PipelineDeps` の source of truth は `src/core/types.ts`; pipeline.ts は re-export していた

## Phase D — @deprecated classification

- `src/state/store.ts` の `updateJobState` / `persistJobState` は (b) test 経由のみ参照として削除対象に分類 :: tests/ のみに参照があり production path にない
- `src/core/session.ts` の `startProposeSession` は (b) test 経由のみ参照として削除対象に分類 :: completion.test.ts のみが参照
- `src/sdk/sessions.ts` の deprecated SDK-calling 関数群は (b) test 経由のみ参照として削除対象に分類 :: completion.test.ts が narrowing helper (`isStatusIdleEvent` 等) を import するが、これらは non-deprecated (type narrowing のみ); deprecated SDK-calling 関数は test で未参照
- `src/core/types.ts` の `githubFetch` @deprecated フィールドは (a) production 参照ありで削除不可 :: pipeline.test.ts が githubFetch を使用して verify*Legacy 経路を経由する。verify*Legacy 削除と同時に削除する

## Phase E — verify*Legacy

- `pipeline.test.ts` が `githubFetch` のみを使用し `githubClient` を一切提供していないことを確認 :: grep 結果: `tests/` に `githubClient` の参照は 0 件
- verify*Legacy 削除前提条件失敗 :: `pipeline.test.ts` の TC-035 ~ TC-042 が全て `githubFetch` 経由の legacy path をテストしている。削除するには全テストを `githubClient` mock に移行する必要がある
- テスト移行戦略: `pipeline.test.ts` の `buildGithubFetch` を `buildMockGithubClient` に置き換え、`githubFetch` → `githubClient` に移行してから verify*Legacy を削除する :: D5 の前提確認（6.1.1）に従い、verify*Legacy 削除を進める
