# Tasks: ADR Alternatives Considered follow-prompt

## Task 1: AgentStep に getFollowUpPrompt method を追加

- [x] `src/core/step/types.ts` の `AgentStep` interface に `getFollowUpPrompt?(state: JobState, deps: StepDeps): string | undefined` を追加する
  - `getMaxTurns` と同型の optional method
  - JSDoc: 「動的に followUpPrompt を解決する。定義時は静的 followUpPrompt より優先される。undefined を返すと follow turn は実行されない。」

## Task 2: executor の followUpPrompt 解決ロジックを変更

- [x] `src/core/step/executor.ts` の ctx 構築部分（L146 付近）を変更:
  - before: `followUpPrompt: step.followUpPrompt,`
  - after: `followUpPrompt: step.getFollowUpPrompt?.(state, deps) ?? step.followUpPrompt,`
- adapter / shouldRunFollowUp / mergeFollowUpResult は無改修

## Task 3: AdrGenStep に getFollowUpPrompt を実装

- [x] `src/core/step/adr-gen.ts` に follow-prompt 定数 `ADR_FOLLOWUP_PROMPT` を追加
  - 文面は design.md D3 の通り（修正専用、判定なし）
  - Alternatives Considered の具体的な代替案名・Pros/Cons/Why not を確認・追記する指示
- [x] `AdrGenStep` object に `getFollowUpPrompt` method を追加:
  - `deps.request.adr === false` → `undefined` を返す
  - `deps.request.adr === true` → `ADR_FOLLOWUP_PROMPT` を返す

## Task 4: テスト追加

- [x] `tests/unit/core/step/adr-gen.test.ts` に getFollowUpPrompt テストを追加:
  - `adr: true` のとき string を返す
  - `adr: false` のとき undefined を返す
  - 返却文字列に「Alternatives Considered」が含まれる
  - 返却文字列に「判定」的な表現が含まれない（修正専用の確認）
- [ ] `tests/unit/core/step/types.test.ts` に getFollowUpPrompt の型互換テストがあれば追加（既存テストに合わせる）

## Task 5: typecheck & test green 確認

- [x] `bun run typecheck` が通ることを確認
- [x] `bun run test` が通ることを確認
