## 1. Phase 1 — AgentRunner port 抽出（リファクタ・動作変更なし）

- [x] 1.1 `src/core/port/agent-runner.ts` を新設し、`AgentRunner` interface / `AgentRunContext` / `AgentRunResult` 型を定義する
- [x] 1.2 `src/adapter/anthropic/` を `src/adapter/managed-agent/` に `git mv` で rename する（履歴維持）
- [x] 1.3 `src/adapter/managed-agent/agent-runner.ts` を新設し、`ManagedAgentRunner` 雛形を作成する（インタフェース実装のみ、内部はまだ stub）
- [x] 1.4 `src/core/step/executor.ts` の `runAgentStep` から session 作成 / SSE 購読 / polling / register_branch dispatch / verifyBranch / getFileContent ロジックを抽出し、`ManagedAgentRunner.run()` 内に移植する
- [x] 1.5 `src/core/tools/register-branch.ts` 相当を `src/adapter/managed-agent/tools/register-branch.ts` に移動し、`src/core/` 配下からの import を全削除する
- [x] 1.6 `StepExecutor` constructor を変更し、`AgentRunner` を依存として受け取る（`SessionClient` の直接依存を撤去）
- [x] 1.7 `StepExecutor.runAgentStep` を `runner.run(ctx)` 呼び出しに書き換え、結果を `step.parseResult` / `JobStateStore.appendStepRun` に渡す経路に整理する
- [x] 1.8 `StepExecutor` から `STEP_AGENT_ROLE` / `verifyBranch` / `verifyPath` / `getFileContent` のヘルパ呼び出しを削除する（adapter 内部に閉じ込めた）
- [x] 1.9 CLI composition root（`src/cli/`）で `ManagedAgentRunner` を生成して `StepExecutor` に注入するように wiring を更新する
- [x] 1.10 既存テストを実行し、grep ベース invariant（core から SDK / adapter import なし）と全 unit / integration テストが green であることを確認する（`bun run typecheck && bun test`）
- [ ] 1.11 dogfooding スクリプト（または手動実行）で managed mode の regression がないことを確認する

## 2. Phase 2 — Claude Code SDK adapter 実装

- [ ] 2.1 `package.json` に `@anthropic-ai/claude-code` を追加し、`bun install` で lockfile 更新
- [ ] 2.2 Claude Code SDK の `query()` API spec を verify-don't-trust 原則で公式 docs / 型定義から確認する（cwd / additionalInstructions / event model）
- [x] 2.3 `src/adapter/claude-code/agent-runner.ts` に `ClaudeCodeRunner` を実装し、`AgentRunner` interface に compliant にする
- [x] 2.4 `ClaudeCodeRunner.run()` に prompt 構築ロジック（step.buildMessage + runtime additionalInstructions の append）を実装する
- [x] 2.5 `ClaudeCodeRunner.run()` に `spawn` による claude CLI subprocess 呼び出しを実装する（`@anthropic-ai/claude-code` SDK は利用せず、直接 CLI を subprocess として呼ぶ設計に変更）
- [x] 2.6 `ClaudeCodeRunner.run()` に branch / path 検証（`git rev-parse` / `git branch --list` / `fs.readFile`）を実装する
- [x] 2.7 `ClaudeCodeRunner.run()` に resultContent 取得（`fs.readFile`）を実装する
- [x] 2.8 polling-style step（spec-review 等）の `ClaudeCodeRunner` 単体テストを追加する（fake spawn / fake git で in-memory 検証）
- [ ] 2.9 module-boundary invariant（`grep -rE "@anthropic-ai/sdk" src/adapter/claude-code/` が 0 マッチ）の lint チェックを CI に追加する

## 3. Phase 3 — config + CLI 統合

- [x] 3.1 `cli-config-store` の schema 型定義に `runtime: "managed" | "local"` を追加する
- [x] 3.2 `ConfigStore.load()` の migration ロジックで未設定 `runtime` field を `"managed"` に正規化する
- [x] 3.3 不正な runtime 値（`"managed"` / `"local"` 以外）に対する `CONFIG_INVALID` エラー処理を追加する
- [x] 3.4 `runtime === "local"` のとき `anthropic.apiKey` 不在 / `agents` 空を許容する経路を追加する
- [x] 3.5 `specrunner init` の argv parser に `--runtime` flag を追加する
- [x] 3.6 `specrunner init --runtime local` 経路で apiKey 入力 prompt skip / `AgentSyncer.syncAll()` skip を実装する
- [ ] 3.7 `specrunner init --runtime managed`（既存挙動）に対して runtime field の永続化を追加する（既存の Anthropic API 呼び出しは維持）
- [x] 3.8 CLI composition root で `config.runtime` を読み、`ManagedAgentRunner` または `ClaudeCodeRunner` を選択して注入する分岐を実装する
- [x] 3.9 `runtime === "local"` のとき `SessionClient` を生成しないことを確認する（startup で apiKey 不在エラーが出ないこと）
- [ ] 3.10 `specrunner init --runtime local` の e2e テスト（API 呼び出しゼロ）を追加する
- [x] 3.11 ConfigStore migration の単体テスト（runtime field 未設定 → `"managed"` 正規化）を追加する

## 4. Phase 4 — propose step の local 対応

- [ ] 4.1 ProposeStep の `buildMessage(state, deps)` を branch INPUT 対応に更新する（CLI 入力 branch を prompt に含める）
- [x] 4.2 `ManagedAgentRunner` 内で「CLI canonical branch と agent-reported branch の不一致 warning」を実装する
- [x] 4.3 `ClaudeCodeRunner` の `additionalInstructions` に runtime 固有の git 操作指示（`git checkout -b feat/<slug>` → commit → push）を実装する
- [x] 4.4 ProposeStep から `register_branch` を含む `toolHandlers` 露出を撤去する（adapter 注入モデルへ）
- [x] 4.5 `ManagedAgentRunner` が adapter 内部で `register_branch` を `custom_tools` 配列に注入するロジックを実装する
- [x] 4.6 `ClaudeCodeRunner` の `requiresCommit` guard（git status / log / rev-parse による完了検証）を実装する
- [ ] 4.7 prompts/ から runtime 固有指示（register_branch 言及など）を削除し runtime-neutral に整理する
- [ ] 4.8 local mode で `propose → implementer → verification → code-review → pr-create` の pipeline が完走する e2e 検証（手動 dogfood で OK）

## 5. Specs / ADR / レビュー連携

- [ ] 5.1 spec-runner のレビュー基準（`.claude/rules/review-standards.md`）に従い、変更対象 spec の MODIFIED Requirement header が 既存 spec と完全一致しているか self-review checklist を通す
- [ ] 5.2 `openspec validate add-local-runtime-agentrunner-port --type change --strict` で fail-fast がないことを確認する
- [ ] 5.3 ADR-2026-05-05-agent-runner-port を執筆し、AgentRunner port の境界 / register_branch ownership 移動の判断ログを記録する（workflow option `adr` enabled のため）
- [ ] 5.4 module-architect レビューで `module-boundary` 違反がないことを確認する（workflow option `module-architect` enabled）
- [ ] 5.5 test-case-generator で各 capability の must シナリオを test-cases.md に列挙する（workflow option `test-case-generator` enabled）

## 6. リリース / 後片付け

- [ ] 6.1 PR description に Phase 1-4 の段階的リリース戦略 / rollback 手順を記載する
- [x] 6.2 `bun run typecheck && bun test` を最終 gate として実行する
- [ ] 6.3 既存 dogfood スクリプトで managed mode の regression がないことを最終確認する
- [ ] 6.4 README / docs に `--runtime local` の利用方法を追加する（必要であれば）
- [ ] 6.5 `openspec/changes/add-local-runtime-agentrunner-port/` の archive 準備（PR merge 後に `/openspec-archive-change` で実行）
