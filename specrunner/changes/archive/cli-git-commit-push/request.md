# git commit + push を StepExecutor の責務に移す

## Meta

- **slug**: cli-git-commit-push
- **type**: spec-change
- **base-branch**: main
- **date**: 2026-05-13
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

各ステップの agent が自分で `git add && git commit && git push` を実行している。トークン分析の結果、全 Bash 呼び出しの 71% (1628/2308) が git コマンドで、コンテキストが最大に膨らんだ後半で実行されるためコスト効率が悪い。propose だけで git 操作が 6 API call × 60K tokens を消費している。

worktree は job 専用なので、agent が書いたファイル = commit すべきファイル。CLI が一括で commit + push できる。

GitHub Issue #209。

## 目的

agent はファイル生成（Write/Edit）のみ行い end_turn する。StepExecutor が agent 完了後に git add + commit + push を行う。local runtime 限定の変更。managed runtime は従来通り agent が commit + push する。

## 要件

1. **StepExecutor に `commitAndPush` を追加**: `src/core/step/executor.ts` の `runAgentStep()` 内、`runner.run()` 成功後・`finalizeStep()` 前に配置する。`git add -A && git diff --cached --quiet` で差分を検出し、差分があれば commit + push、なければスキップ。`requiresCommit: true` の step で差分がなかった場合のみ `NO_COMMIT_DETECTED` エラーを出す

2. **commit message の自動生成**: `${step.name}: ${slug}` 形式（例: `propose: add-git-commit-to-executor`）

3. **push 失敗時のリトライ**: 1回リトライ（5秒 wait）、2回目も失敗なら `PUSH_FAILED` エラーで state に記録し escalation

4. **`requiresCommit` guard の executor 移管**: `src/adapter/claude-code/agent-runner.ts` の pre/post SHA 比較 guard を除去する。executor 側で `git diff --cached --quiet` による差分検出に置き換える

5. **system prompt から git 指示を除去（local runtime 用）**: 以下の 8 ファイルから commit + push 関連の指示を「ファイルを worktree に書き出したら end_turn」に置換する:
   - src/prompts/propose-system.ts
   - src/prompts/implementer-system.ts
   - src/prompts/spec-fixer-system.ts
   - src/prompts/code-fixer-system.ts
   - src/prompts/build-fixer-system.ts
   - src/prompts/code-review-system.ts
   - src/prompts/spec-review-system.ts
   - src/prompts/test-case-gen-system.ts

6. **`git-push-instruction.ts` の削除**: `src/prompts/git-push-instruction.ts` を削除し、全 import を除去する（4ステップの buildMessage から呼ばれている）

7. **`buildAdditionalInstructions` から push 行を除去**: `src/adapter/claude-code/agent-runner.ts` の `buildAdditionalInstructions()` から git push 関連の行を除去する

8. **managed runtime の prompt は維持**: `src/adapter/managed-agent/agent-runner.ts` 側では従来通り agent が commit + push する。system prompt の git 指示は managed runtime 用の `additionalInstructions` で注入する

9. **改修後の grep 検証**: `commit.*push|git add|git push` が src/prompts/ 内に残っていないことを確認する（managed adapter 内は除く）

## 受け入れ基準

- [ ] pipeline 実行後、agent の Bash 呼び出しに git コマンドが含まれない（local runtime）
- [ ] StepExecutor が agent 完了後に自動で commit + push している
- [ ] commit message が `${step.name}: ${slug}` 形式
- [ ] `requiresCommit: true` の step で差分なしの場合 `NO_COMMIT_DETECTED` エラー
- [ ] push 失敗時にリトライが動作する
- [ ] `git-push-instruction.ts` が削除されている
- [ ] src/prompts/ 内に git commit/push の指示が残っていない
- [ ] managed runtime の動作に影響がない
- [ ] `bun run typecheck` / `bun run test` が全 pass

## 補足

- Claude Code SDK の `query()` は同一プロセス内で Write/Edit を逐次実行する。end_turn 時点で全ファイルは worktree に存在する
- managed runtime はこの変更のスコープ外。agent が sandbox 内で git push するしかないため
- `requiresCommit` のセマンティクスは「commit がなければエラー」に変わる。「commit するかどうか」は差分有無で自動判定
- review step も result file を worktree に書くため、差分があれば commit される
- `buildGitPushInstruction()` が 7 ソースファイルの buildMessage から呼ばれている二重経路がある（implementer, spec-fixer, code-fixer, build-fixer, code-review の 5 ステップファイル + spec-review-system, test-case-gen-system の 2 プロンプトファイル）。`git-push-instruction.ts` 削除で両方解消する
