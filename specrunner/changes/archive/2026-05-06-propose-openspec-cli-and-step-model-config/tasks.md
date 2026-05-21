## 1. AgentStep interface に maxTurns フィールドを追加

- [x] 1.1 `src/core/step/types.ts` の `AgentStep` interface に `maxTurns?: number` optional フィールドを追加する
- [x] 1.2 `src/adapter/claude-code/agent-runner.ts` の `maxTurns: 30` ハードコードを `ctx.step.maxTurns ?? 30` に変更する

## 2. 各 step の model を opusplan パターンに変更

- [x] 2.1 `src/core/step/propose.ts` の `PROPOSE_AGENT_MODEL` を `"claude-opus-4-6[1m]"` に変更する
- [x] 2.2 `src/core/step/spec-review.ts` の `SPEC_REVIEW_AGENT_MODEL` を `"claude-opus-4-6[1m]"` に変更する
- [x] 2.3 `src/core/step/code-review.ts` の `CODE_REVIEW_AGENT_MODEL` を `"claude-opus-4-6[1m]"` に変更する
- [x] 2.4 `src/core/step/spec-fixer.ts` の `SPEC_FIXER_AGENT_MODEL` を `"claude-sonnet-4-6"` に変更する
- [x] 2.5 `src/core/step/implementer.ts` の `IMPLEMENTER_AGENT_MODEL` を `"claude-sonnet-4-6"` に変更する
- [x] 2.6 `src/core/step/build-fixer.ts` の `BUILD_FIXER_AGENT_MODEL` を `"claude-sonnet-4-6"` に変更する
- [x] 2.7 `src/core/step/code-fixer.ts` の `CODE_FIXER_AGENT_MODEL` を `"claude-sonnet-4-6"` に変更する

## 3. 各 step に maxTurns 値を設定

- [x] 3.1 `src/core/step/propose.ts` の `ProposeStep` に `maxTurns: 20` を追加する
- [x] 3.2 `src/core/step/spec-review.ts` の `SpecReviewStep` に `maxTurns: 15` を追加する
- [x] 3.3 `src/core/step/spec-fixer.ts` の `SpecFixerStep` に `maxTurns: 25` を追加する
- [x] 3.4 `src/core/step/implementer.ts` の `ImplementerStep` に `maxTurns: 60` を追加する
- [x] 3.5 `src/core/step/build-fixer.ts` の `BuildFixerStep` に `maxTurns: 35` を追加する
- [x] 3.6 `src/core/step/code-review.ts` の `CodeReviewStep` に `maxTurns: 20` を追加する
- [x] 3.7 `src/core/step/code-fixer.ts` の `CodeFixerStep` に `maxTurns: 30` を追加する

## 4. propose system prompt を openspec CLI ワークフローに書き換え

- [x] 4.1 `src/prompts/propose-system.ts` の `PROPOSE_SYSTEM_PROMPT` を全面書き換え: openspec CLI のコマンドフロー（`openspec new change "<slug>"` → `openspec status --change "<slug>" --json` → `openspec instructions <artifact-id> --change "<slug>" --json` → artifact 生成ループ）を指示する内容にする。path-fence（`openspec/changes/<slug>/` 外の編集禁止）と完了条件（commit + push + register_branch）は維持する
- [x] 4.2 `PROPOSE_INITIAL_MESSAGE_TEMPLATE` の内容を確認し、openspec CLI ワークフローとの整合性を取る。slug / branch の注入構造は維持する

## 5. テスト更新

- [x] 5.1 `propose.test.ts` のアサーション（system prompt 内容、model 値）を新しい値に更新する
- [x] 5.2 `spec-review.test.ts` の model アサーションを `claude-opus-4-6[1m]` に更新する
- [x] 5.3 `code-review.test.ts` の model アサーションを `claude-opus-4-6[1m]` に更新する
- [x] 5.4 `agent-runner.test.ts` の maxTurns テストを追加: step.maxTurns が query() に渡されることを検証する
- [x] 5.5 その他 model 値をハードコードで assert しているテストを `claude-sonnet-4-6` に更新する
- [x] 5.6 `bun run typecheck && bun test` が green であることを確認する

## 6. Delta spec の検証

- [x] 6.1 `openspec validate propose-openspec-cli-and-step-model-config --type change --strict` が pass することを確認する
