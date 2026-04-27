## 1. プロジェクト土台

- [ ] 1.1 `bin/specrunner.ts` に shebang (`#!/usr/bin/env node`) と引数ディスパッチを書く（`init` / `login` / `run` / `ps` / `--help` のみ受理、未知サブコマンドは exit 2）
- [ ] 1.2 `tsconfig.json` を ESM + Node20 ターゲットで作成（`module: "ES2022"`, `moduleResolution: "Bundler"`, `strict: true`, `noUncheckedIndexedAccess: true`）
- [ ] 1.3 `src/errors.ts` で `SpecRunnerError`（code, hint, message）と既知 code 定数を定義（`CONFIG_MISSING`, `CONFIG_INCOMPLETE`, `GITHUB_TOKEN_EXPIRED`, `NOT_GIT_REPO`, `REMOTE_NOT_GITHUB`, `REQUEST_MD_INVALID`, `SESSION_TIMEOUT`, `SESSION_TERMINATED`, `BRANCH_NOT_REGISTERED`, `STATE_FILE_INVALID`, `CHANGE_FOLDER_NOT_FOUND`, `SESSION_CREATE_FAILED`）
- [ ] 1.4 `src/logger/stdout.ts` で進捗表示と stderr ログのユーティリティを書く（API key / token の自動マスキングを含む）

## 2. 設定 / 状態ストア（specs: cli-config-store, job-state-store）

- [ ] 2.1 `src/config/schema.ts` で config の TypeScript 型と手書き validator（必須キー存在チェック）を定義
- [ ] 2.2 `src/config/store.ts` に `loadConfig()` / `saveConfig()` を実装。atomic write、パーミッション 0600 強制、緩いモード時の警告
- [ ] 2.3 `src/state/schema.ts` で job state の型と HistoryEntry 型を定義
- [ ] 2.4 `src/state/store.ts` に `createJobState()` / `updateJobState()` / `appendHistory()` / `listJobStates()` を実装（atomic write、history 最大 100 で先頭 truncate）
- [ ] 2.5 `src/state/store.ts` の `listJobStates()` で破損ファイルを skip し stderr に `Skipping malformed file:` を出力する処理を入れる
- [ ] 2.6 ユニットテスト: config / state の atomic write、permission、破損読み込み skip、history truncate

## 3. request.md パーサ + リポジトリ識別（specs: request-md-parser, repository-identification）

- [ ] 3.1 `src/parser/request-md.ts` に `parseRequestMd(path)` を実装（type / title / content / enabled 抽出、外部依存なし）
- [ ] 3.2 `src/parser/request-md.ts` に許容 type のバリデータを追加し、未知 type は warning（throw しない）
- [ ] 3.3 `src/git/remote.ts` に `getOriginInfo(cwd)` を実装（HTTPS / SSH 両形式、credentials 除去、`execFile` 利用）
- [ ] 3.4 `src/git/remote.ts` で GitHub 以外の remote は `REMOTE_NOT_GITHUB`、git 未初期化は `NOT_GIT_REPO` エラー
- [ ] 3.5 ユニットテスト: parser の正常系 + 各エラー系、URL 形式バリエーション全網羅

## 4. SDK ラッパー（specs: agent-environment-bootstrap, propose-pipeline）

- [ ] 4.1 `src/sdk/client.ts` に `createAnthropicClient(apiKey)` を実装。`defaultHeaders` で Beta header を設定
- [ ] 4.2 `src/sdk/agents.ts` に `createAgent` / `retrieveAgent` / `updateAgent` のラッパを書く（@anthropic-ai/sdk の型を re-export）
- [ ] 4.3 `src/sdk/environments.ts` に `createEnvironment` / `retrieveEnvironment` を書く（packages.npm 必須引数）
- [ ] 4.4 `src/sdk/sessions.ts` に `createSession` / `retrieveSession` / `streamEvents` / `sendEvents` のラッパを書く
- [ ] 4.5 `src/sdk/sessions.ts` に discriminated union narrowing ヘルパー（`isCustomToolUseEvent`, `isStatusIdleEvent`）を追加
- [ ] 4.6 `bun:*` / `Bun.*` の import が無いことを実装中に grep で確認する

## 5. Custom Tool registry（specs: register-branch-tool）

- [ ] 5.1 `src/core/tools/types.ts` で `CustomTool` 型と `defineCustomTool` ファクトリを定義（definition + handler 同居の type-safe 入口）
- [ ] 5.2 `src/core/tools/registry.ts` に `tools[]`、`registerCustomTool`、`getDefinitions`、`getHandler` を実装
- [ ] 5.3 `src/core/tools/register-branch.ts` に definition + handler を colocate 実装。description は 3 文以上、`{ branch: string }` schema、空文字 reject、last-write-wins、戻り値 JSON
- [ ] 5.4 アプリ起動時（`init` と `run` の両方）に `registerCustomTool(registerBranchTool)` を呼ぶブートストラップを `src/core/tools/index.ts` で実装
- [ ] 5.5 grep テスト: コードベース全体で `name: "register_branch"` の文字列が `register-branch.ts` 以外に存在しないことを検証
- [ ] 5.6 ユニットテスト: handler の冪等性（連続呼び出しで last-write-wins）、空文字 reject、不正キー reject

## 6. GitHub Device Flow（spec: github-device-flow-auth）

- [ ] 6.1 `src/auth/github-device.ts` に `requestDeviceCode` / `pollAccessToken` / `runDeviceFlow` を実装（fetch + interval / slow_down / expired_token / access_denied 全分岐）
- [ ] 6.2 client_id 定数を `src/auth/constants.ts` に定義し、`SPECRUNNER_GITHUB_CLIENT_ID` 環境変数で上書き可能にする
- [ ] 6.3 認可コード期限切れ・拒否時のエラーメッセージを `errors.ts` の hint 経由で出力
- [ ] 6.4 ユニットテスト: 各レスポンス分岐をモック fetch で網羅

## 7. 完了検知 + パイプライン本体（specs: session-completion-detection, propose-pipeline）

- [ ] 7.1 `src/core/completion.ts` に `pollUntilComplete(client, sessionId, opts)` を実装（指数バックオフ 2s→30s、ジッタ ±20%、タイムアウト 30 分既定）
- [ ] 7.2 `src/core/completion.ts` に SSE `assertBreakAfterCompletion` ヘルパー（テストで break 経路の存在を検証可能にする）
- [ ] 7.3 `src/prompts/propose-system.ts` に PROPOSE_SYSTEM_PROMPT（system prompt）と PROPOSE_INITIAL_MESSAGE_TEMPLATE（初回メッセージのテンプレ。`<user-request>` XML タグ必須）を定義
- [ ] 7.4 `src/core/session.ts` に `startProposeSession(deps)` を実装：events.stream 接続 → events.send（初回） → SSE ループ（custom_tool_use 受信 + handler dispatch + custom_tool_result send + idle/end_turn で break）
- [ ] 7.5 `src/core/session.ts` で SSE 切断時はポーリング fallback に移行（再接続しない）。`SSE disconnected; falling back to polling.` を stderr に出す
- [ ] 7.6 `src/core/pipeline.ts` に `runProposePipeline(jobState, deps)` を実装：state 更新の各ステップ（`session-create` → `events-stream-connected` → `initial-message-sent` → `register-branch-received`(0+) → `idle-end-turn-detected` → `branch-verified` → `success`）
- [ ] 7.7 `src/core/pipeline.ts` で register_branch 未受信のまま完了した場合は `BRANCH_NOT_REGISTERED` で fail
- [ ] 7.8 `src/core/pipeline.ts` で `terminated` ステータス受信時は `SESSION_TERMINATED` で fail、SSE/poll 即終了
- [ ] 7.9 GitHub API でブランチ存在検証（`GET /repos/{owner}/{name}/branches/{branch}`）。404 は warning、401 は `GITHUB_TOKEN_EXPIRED`
- [ ] 7.9b GitHub API で change folder 存在検証（`GET /repos/{owner}/{name}/contents/openspec/changes/{slug}?ref={branch}`）。404 は `CHANGE_FOLDER_NOT_FOUND` で fail、401 は `GITHUB_TOKEN_EXPIRED`。history に `change-folder-verified` を ok/error で append する
- [ ] 7.10 ユニットテスト（モック client）: 正常完了、register_branch 未呼び出し、tool error、terminated、timeout、SSE 切断 → poll fallback、change folder 不在（CHANGE_FOLDER_NOT_FOUND）、ポーリング先行時の SSE AbortSignal キャンセル

## 8. CLI コマンド配線（spec: cli-commands）

- [ ] 8.1 `src/cli/init.ts` を実装：API key 取得 → Agent 作成/同期 → Environment 作成/再利用 → config 保存。Agent 作成失敗時 → Env 失敗時の rollback（archive/delete）
- [ ] 8.2 `src/cli/login.ts` を実装：device flow 実行 → token 保存
- [ ] 8.3 `src/cli/run.ts` を実装：fail-fast バリデーション（1. config 存在 → 2. apiKey/agentId/environmentId/githubToken → 3. git repo → 4. origin が GitHub → 5. request.md パース可能）をこの順序で実行 → jobState 作成 → `runProposePipeline` 実行 → exit code 翻訳
- [ ] 8.4 `src/cli/run.ts` に `--timeout=Nm` / `--timeout=Ns` フラグのパースを実装
- [ ] 8.5 `src/cli/ps.ts` を実装：jobs/ 走査 → createdAt 降順ソート → 5 列テーブル（JOB_ID 先頭 8 文字、BRANCH 40 文字超で truncate、AGE 人間可読）。TTY 時は固定列幅、非 TTY 時は TAB 区切り出力。空時は `No jobs found.`
- [ ] 8.6 `bin/specrunner.ts` で各 cli モジュールへ dispatch
- [ ] 8.7 受け入れテスト（in-process）: `init` 冪等再実行、`login` mock device flow、`run` の正常系、`ps` の出力フォーマット

## 9. Agent 定義の差分検知（spec: agent-environment-bootstrap）

- [ ] 9.1 `src/core/agent-definition.ts` に PROPOSE_SYSTEM_PROMPT + custom_tools registry definitions + toolset + model を統合した CLI-side Agent definition を構築
- [ ] 9.2 canonical JSON 化 + SHA-256 で `definitionHash` を計算するヘルパーを書く
- [ ] 9.3 `init` で既存 hash と比較し、差分があれば `agents.update` 実行 → 新 hash を config に保存
- [ ] 9.4 ユニットテスト: 同一定義は同一 hash、フィールド順序差を吸収した hash 安定性

## 10. ドキュメント / バリデーション

- [ ] 10.1 `openspec validate cli-core-pipeline-2026-04-27 --strict` を実行し、すべての requirement にシナリオが結びついていることを確認
- [ ] 10.2 `bun test` を全パッケージで実行し緑になることを確認
- [ ] 10.3 grep で `bun:` および `import { ... } from "Bun"`、`Bun.` 利用が `src/` `bin/` に存在しないことを確認
- [ ] 10.4 README に `specrunner init` → `login` → `run` の実行例を最低限追記する（既存 README が存在しない場合は新規作成しない選択も可）
