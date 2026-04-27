# Test Cases: CLI Core Pipeline — `specrunner run` propose ステップ最小実装

## Summary

- **Total**: 103 cases
- **Automated** (unit/integration/e2e): 97
- **Manual**: 6
- **Priority**: must: 63, should: 34, could: 6

---

## Test Cases

### TC-001: request.md 正常パース（全フィールド存在）

**Category**: unit
**Priority**: must
**Source**: specs/request-md-parser/spec.md — Requirement: request.md は YAML/Markdown ハイブリッド構造でパースされる

**GIVEN** level-1 heading、Meta セクション（`- **type**: new-feature`）、ワークフローオプションセクションを含む request.md ファイル
**WHEN** `parseRequestMd(path)` を呼び出す
**THEN** `{ type: "new-feature", title: "...", content: "...", enabled: ["test-case-generator", ...] }` を返し、type と title は非空文字列、enabled は string[]

---

### TC-002: request.md — enabled が空のセクション

**Category**: unit
**Priority**: must
**Source**: specs/request-md-parser/spec.md — Scenario: enabled が空

**GIVEN** ワークフローオプションセクションが存在するが `enabled:` 配下にリスト項目が無い request.md
**WHEN** `parseRequestMd(path)` を呼び出す
**THEN** `enabled` が空配列 `[]` で返る（エラーなし）

---

### TC-003: request.md — ワークフローオプションセクションが存在しない

**Category**: unit
**Priority**: must
**Source**: specs/request-md-parser/spec.md — Scenario: ワークフローオプションセクションが無い

**GIVEN** ワークフローオプションセクションが存在しない request.md
**WHEN** `parseRequestMd(path)` を呼び出す
**THEN** `enabled` が `[]` で返り、エラーは発生しない

---

### TC-004: request.md — title（level-1 heading）が欠落

**Category**: unit
**Priority**: must
**Source**: specs/request-md-parser/spec.md — Requirement: 必須フィールドの欠落はエラーとなる

**GIVEN** level-1 heading が存在しない request.md
**WHEN** `parseRequestMd(path)` を呼び出す
**THEN** `REQUEST_MD_INVALID` エラーが発生し、メッセージに `missing title (top-level # heading required)` が含まれる

---

### TC-005: request.md — type が欠落

**Category**: unit
**Priority**: must
**Source**: specs/request-md-parser/spec.md — Scenario: type が無い

**GIVEN** Meta セクションに `- **type**:` が存在しない request.md
**WHEN** `parseRequestMd(path)` を呼び出す
**THEN** `REQUEST_MD_INVALID` エラーが発生し、メッセージに `missing 'type' in Meta section` が含まれる

---

### TC-006: request.md — 未知の type は警告を出して継続

**Category**: unit
**Priority**: should
**Source**: specs/request-md-parser/spec.md — Requirement: type は許容値リストで検証される

**GIVEN** `type: unknown-type` を含む request.md
**WHEN** `parseRequestMd(path)` を呼び出す
**THEN** stderr に `Warning: unknown request type 'unknown-type'.` が出力され、処理は継続してパース結果が返る

---

### TC-007: request.md パーサーは外部 npm 依存を使わない

**Category**: unit
**Priority**: should
**Source**: specs/request-md-parser/spec.md — Requirement: パーサーは外部依存なしの実装でなければならない

**GIVEN** request-md-parser モジュールの import 文
**WHEN** 全 import を検査する
**THEN** `@anthropic-ai/sdk`、`zod`、その他外部 Markdown ライブラリへの import が存在しない（Node 標準 API + 正規表現のみ）

---

### TC-008: git remote — HTTPS URL から owner/name 解決

**Category**: unit
**Priority**: must
**Source**: specs/repository-identification/spec.md — Scenario: HTTPS URL

**GIVEN** `git remote get-url origin` が `https://github.com/color4pen/spec-runner.git` を返す環境
**WHEN** `getOriginInfo(cwd)` を呼び出す
**THEN** `{ owner: "color4pen", name: "spec-runner" }` が返る

---

### TC-009: git remote — HTTPS URL（.git suffix なし）

**Category**: unit
**Priority**: should
**Source**: specs/repository-identification/spec.md — Scenario: HTTPS URL（.git なし）

**GIVEN** `git remote get-url origin` が `https://github.com/color4pen/spec-runner` を返す環境
**WHEN** `getOriginInfo(cwd)` を呼び出す
**THEN** `{ owner: "color4pen", name: "spec-runner" }` が返る

---

### TC-010: git remote — SSH URL から owner/name 解決

**Category**: unit
**Priority**: must
**Source**: specs/repository-identification/spec.md — Scenario: SSH URL

**GIVEN** `git remote get-url origin` が `git@github.com:color4pen/spec-runner.git` を返す環境
**WHEN** `getOriginInfo(cwd)` を呼び出す
**THEN** `{ owner: "color4pen", name: "spec-runner" }` が返る

---

### TC-011: git remote — credentials 付き HTTPS URL

**Category**: unit
**Priority**: should
**Source**: specs/repository-identification/spec.md — Scenario: HTTPS URL with credentials

**GIVEN** `git remote get-url origin` が `https://x-access-token:abc@github.com/o/r.git` を返す環境
**WHEN** `getOriginInfo(cwd)` を呼び出す
**THEN** credentials を除去した上で `{ owner: "o", name: "r" }` が返る

---

### TC-012: git remote — GitHub 以外の remote はエラー

**Category**: unit
**Priority**: must
**Source**: specs/repository-identification/spec.md — Scenario: GitLab remote

**GIVEN** `git remote get-url origin` が `https://gitlab.com/u/r.git` を返す環境
**WHEN** `getOriginInfo(cwd)` を呼び出す
**THEN** `REMOTE_NOT_GITHUB` エラーが発生し、メッセージに `'origin' must point to github.com.` が含まれる

---

### TC-013: git remote — git 未初期化ディレクトリ

**Category**: unit
**Priority**: must
**Source**: specs/repository-identification/spec.md — Scenario: git 未初期化ディレクトリ

**GIVEN** `.git` ディレクトリが存在しないディレクトリ
**WHEN** `getOriginInfo(cwd)` を呼び出す
**THEN** `NOT_GIT_REPO` エラーが発生し、メッセージに `Not a git repository.` が含まれる

---

### TC-014: git remote — origin が未設定

**Category**: unit
**Priority**: should
**Source**: specs/repository-identification/spec.md — Scenario: origin remote が無い

**GIVEN** git リポジトリだが origin remote が設定されていない環境
**WHEN** `getOriginInfo(cwd)` を呼び出す
**THEN** エラーが発生し、メッセージに `Origin remote not configured.` が含まれる

---

### TC-015: git remote — child_process.execFile を使う（shell injection 防止）

**Category**: unit
**Priority**: should
**Source**: specs/repository-identification/spec.md — Requirement: 解析は外部 npm 依存なしで行う

**GIVEN** `getOriginInfo` の実装
**WHEN** 実装を検査する
**THEN** `execFile("git", ["remote", "get-url", "origin"])` を使用し、`exec` を使用していない

---

### TC-016: Custom Tool registry — register_branch が registry 経由で登録される

**Category**: unit
**Priority**: must
**Source**: design.md — D2: Custom Tool 結線の colocate 強制、specs/register-branch-tool/spec.md — Scenario: 単一 source-of-truth

**GIVEN** ブートストラップが完了した状態（`registerCustomTool(registerBranchTool)` が呼ばれた後）
**WHEN** `getDefinitions()` と `getHandler("register_branch")` を呼び出す
**THEN** `getDefinitions()` の返す配列に `name: "register_branch"` のエントリが 1 件あり、`getHandler("register_branch")` が関数を返す（null/undefined でない）

---

### TC-017: Custom Tool registry — `register_branch` の文字列が registry 以外に存在しない（grep）

**Category**: unit
**Priority**: must
**Source**: tasks.md — 5.5: grep テスト; specs/agent-environment-bootstrap/spec.md — Requirement: Custom Tools は registry 経由で Agent に登録される

**GIVEN** src/ と bin/ 配下の全 TypeScript ファイル
**WHEN** `name: "register_branch"` という文字列を grep する
**THEN** `src/core/tools/register-branch.ts` 以外のファイルにマッチが存在しない

---

### TC-018: Custom Tool registry — SSE dispatch も registry から取得する

**Category**: unit
**Priority**: must
**Source**: specs/register-branch-tool/spec.md — Scenario: SSE dispatch も同じ registry から取得する

**GIVEN** SSE ループの実装（`src/core/session.ts`）
**WHEN** `agent.custom_tool_use` イベントを受信したときの handler 解決部分を検査する
**THEN** `tool-registry.getHandler(event.name)` を呼び出して解決しており、handler を直接 import していない

---

### TC-019: register_branch handler — 正常呼び出し（1 回）

**Category**: unit
**Priority**: must
**Source**: specs/register-branch-tool/spec.md — Scenario: 1 回呼び出し

**GIVEN** state.branch が null の初期状態
**WHEN** handler が `{ branch: "feat/x" }` で呼ばれる
**THEN** state.branch が `"feat/x"` になり、戻り値が `{ ok: true, branch: "feat/x" }` になる

---

### TC-020: register_branch handler — 連続呼び出し（last-write-wins）

**Category**: unit
**Priority**: must
**Source**: specs/register-branch-tool/spec.md — Scenario: 連続 2 回呼び出し; design.md — D3

**GIVEN** state.branch が null の初期状態
**WHEN** handler が `{ branch: "a" }` → `{ branch: "b" }` の順で連続呼び出しされる
**THEN** 最終 state.branch が `"b"` になり、どちらの呼び出しもエラーを返さない

---

### TC-021: register_branch handler — 空文字列入力を拒否

**Category**: unit
**Priority**: must
**Source**: specs/register-branch-tool/spec.md — Scenario: 空文字列入力

**GIVEN** 初期状態の handler
**WHEN** handler が `{ branch: "" }` で呼ばれる
**THEN** state.branch は変更されず、戻り値が `{ ok: false, error: "branch must be a non-empty string" }` になる

---

### TC-022: register_branch handler — branch プロパティ欠落を拒否

**Category**: unit
**Priority**: must
**Source**: specs/register-branch-tool/spec.md — Scenario: 必須プロパティ欠落

**GIVEN** 初期状態の handler
**WHEN** handler が `{}` で呼ばれる
**THEN** state.branch は変更されず、戻り値が `{ ok: false, error: "branch must be a non-empty string" }` になる

---

### TC-023: register_branch — definition が決定論的に生成される

**Category**: unit
**Priority**: must
**Source**: specs/register-branch-tool/spec.md — Scenario: definition が安定している

**GIVEN** `registerBranchTool.definition` を複数回取得する
**WHEN** JSON.stringify した結果を比較する
**THEN** 毎回同一の文字列が生成される（環境変数・時刻に依存しない）

---

### TC-024: register_branch — description が 3 文以上

**Category**: unit
**Priority**: should
**Source**: design.md — D10: Custom Tool description は 3-4 文以上で詳細記述

**GIVEN** `registerBranchTool.definition.description`
**WHEN** 文字列を検査する
**THEN** 「何をするか」「いつ使うか」「branch 命名規約」「last-write-wins」を含み、3 文以上の記述がある

---

### TC-025: register_branch — custom_tool_result の id 対応

**Category**: unit
**Priority**: must
**Source**: specs/register-branch-tool/spec.md — Scenario: id の対応

**GIVEN** SSE で受信した custom_tool_use イベントの id が `ctu_abc123`
**WHEN** handler が応答を生成し `events.send` を呼び出す
**THEN** 送信イベントの `custom_tool_use_id` が `ctu_abc123` と一致し、handler の戻り値が JSON 文字列として content に含まれる

---

### TC-026: SSE break-after-completion — idle+end_turn で break する

**Category**: unit
**Priority**: must
**Source**: specs/session-completion-detection/spec.md — Requirement: SSE ループは idle+end_turn を観測したら必ず break する; design.md — D1

**GIVEN** SSE ループとモックの `session.status_idle` イベント（`stop_reason: "end_turn"`）
**WHEN** イベントを注入する
**THEN** ループから即 break し、その後 `events.send` が呼ばれないことを確認できる（`assertBreakAfterCompletion` が機能する）

---

### TC-027: SSE break-after-completion — requires_action では break しない

**Category**: unit
**Priority**: must
**Source**: specs/session-completion-detection/spec.md — Scenario: requires_action では break しない

**GIVEN** SSE ループとモックの idle イベント（`stop_reason: "requires_action"`）
**WHEN** イベントを注入する
**THEN** ループは継続し、Custom Tool 応答の処理に進む

---

### TC-028: ポーリング先行完了時の SSE AbortSignal キャンセル

**Category**: unit
**Priority**: must
**Source**: specs/session-completion-detection/spec.md — Scenario: ポーリング側が先に idle+end_turn を確定した場合; design.md — D1

**GIVEN** ポーリングループとアクティブな SSE ストリーム（モック）
**WHEN** ポーリングで `{ status: "idle", stop_reason: "end_turn" }` を受信する
**THEN** SSE ストリームに渡した `AbortSignal` がキャンセルされ、SSE ループが即時中断される

---

### TC-029: ポーリング — 指数バックオフ（初期 3 回の間隔）

**Category**: unit
**Priority**: should
**Source**: specs/session-completion-detection/spec.md — Scenario: 初期 3 回の間隔

**GIVEN** モッククライアントで全て `{ status: "running" }` を返す設定
**WHEN** ポーリングを 3 回実行する
**THEN** 1 回目は約 2000ms、2 回目は約 3000ms、3 回目は約 4500ms（±20% 許容）の間隔で呼ばれる

---

### TC-030: ポーリング — 上限 30000ms クランプ

**Category**: unit
**Priority**: should
**Source**: specs/session-completion-detection/spec.md — Scenario: 上限到達

**GIVEN** バックオフ計算値が 30000ms を超える状態
**WHEN** 次のポーリング間隔を計算する
**THEN** 間隔が 30000ms にクランプされる

---

### TC-031: ポーリング — terminated を観測したら即失敗

**Category**: unit
**Priority**: must
**Source**: specs/session-completion-detection/spec.md — Scenario: terminated 観測; specs/propose-pipeline/spec.md — Scenario: SESSION_TERMINATED

**GIVEN** ポーリングが `{ status: "terminated" }` を返すモッククライアント
**WHEN** `pollUntilComplete` を実行する
**THEN** state.status が `failed`、error.code が `SESSION_TERMINATED` に設定され、ポーリングと SSE が即終了する

---

### TC-032: ポーリング — タイムアウト（30 分超過）

**Category**: unit
**Priority**: must
**Source**: specs/session-completion-detection/spec.md — Scenario: 既定タイムアウト; specs/propose-pipeline/spec.md — Scenario: SESSION_TIMEOUT

**GIVEN** 30 分を超えても `status: "running"` を返し続けるモッククライアント
**WHEN** `pollUntilComplete` を実行する
**THEN** state.status が `failed`、error.code が `SESSION_TIMEOUT` に設定され、stderr に `Session timed out after 30m.` が出力される

---

### TC-033: ポーリング — --timeout フラグで上書き

**Category**: unit
**Priority**: should
**Source**: specs/session-completion-detection/spec.md — Scenario: フラグでの上書き

**GIVEN** `--timeout=10m` フラグを渡した `specrunner run` 実行
**WHEN** セッションが 10 分を超えても完了しない
**THEN** タイムアウト判定が 10 分で発動する（30 分ではなく）

---

### TC-034: SSE 切断 — ポーリング fallback に移行

**Category**: unit
**Priority**: must
**Source**: specs/session-completion-detection/spec.md — Scenario: 通信切断; design.md — D1

**GIVEN** SSE ストリームがネットワークエラーで切断されるモック
**WHEN** SSE 処理中にエラーが発生する
**THEN** SSE は終了し、ポーリングは継続される。stderr に `SSE disconnected; falling back to polling.` が出力される

---

### TC-035: propose パイプライン — 正常完了（状態遷移の全記録）

**Category**: unit
**Priority**: must
**Source**: specs/propose-pipeline/spec.md — Scenario: 正常完了

**GIVEN** Agent が `register_branch` を 1 回呼んで idle+end_turn で完了するモックセッション
**WHEN** `runProposePipeline` を実行する
**THEN** state.history に `init`、`session-create`、`events-stream-connected`、`initial-message-sent`、`register-branch-received`、`idle-end-turn-detected`、`branch-verified`、`success` の 8 entry が順に記録され、state.status が `success`

---

### TC-036: propose パイプライン — register_branch 未呼び出しで完了

**Category**: unit
**Priority**: must
**Source**: specs/propose-pipeline/spec.md — Scenario: register_branch が呼ばれずに完了; tasks.md — 7.7

**GIVEN** Agent が `register_branch` を呼ばずに idle+end_turn になるモックセッション
**WHEN** `runProposePipeline` を実行する
**THEN** state.status が `failed`、error.code が `BRANCH_NOT_REGISTERED`、stderr に `Branch was not registered by the agent.` が出力される

---

### TC-037: propose パイプライン — SSE 接続は初回メッセージ送信の前に確立される

**Category**: unit
**Priority**: must
**Source**: specs/propose-pipeline/spec.md — Requirement: SSE stream はセッション作成後に接続される

**GIVEN** `startProposeSession` の実行（モック SDK）
**WHEN** 呼び出し順序を記録する
**THEN** `events.stream(session.id)` の呼び出しが `events.send(session.id, ...)` の呼び出しより先に発生する

---

### TC-038: propose パイプライン — 初回メッセージに user-request タグが含まれる

**Category**: unit
**Priority**: must
**Source**: specs/propose-pipeline/spec.md — Requirement: propose セッションには初回メッセージとして system prompt 派生のテンプレートを送る

**GIVEN** `events.send` に渡されるイベント（モック SDK）
**WHEN** 送信コンテンツを検査する
**THEN** `<user-request>` と `</user-request>` の対が本文に存在し、`type: "user.message"` のイベントが 1 件送信される

---

### TC-039: propose パイプライン — CHANGE_FOLDER_NOT_FOUND で失敗

**Category**: unit
**Priority**: must
**Source**: specs/propose-pipeline/spec.md — Scenario: change folder が存在しない; tasks.md — 7.9b

**GIVEN** change folder 確認 API が 404 を返すモック
**WHEN** `runProposePipeline` が branch 検証フェーズに達する
**THEN** state.status が `failed`、error.code が `CHANGE_FOLDER_NOT_FOUND`、history に `{ step: "change-folder-verified", status: "error" }` が記録される

---

### TC-040: propose パイプライン — branch が GitHub に存在しない（warning のみ）

**Category**: unit
**Priority**: must
**Source**: specs/propose-pipeline/spec.md — Scenario: ブランチが GitHub に存在しない

**GIVEN** ブランチ確認 API が 404、change folder 確認 API が 200 を返すモック
**WHEN** `runProposePipeline` が branch 検証フェーズに達する
**THEN** state.status が `success` のまま、history に `branch-verified` が `warning` で記録され、stderr に警告が出力される

---

### TC-041: propose パイプライン — GitHub API 401 で GITHUB_TOKEN_EXPIRED

**Category**: unit
**Priority**: must
**Source**: specs/propose-pipeline/spec.md — Scenario: GitHub API が 401 を返す; specs/github-device-flow-auth/spec.md — Scenario: API 呼び出しで 401

**GIVEN** GitHub API 呼び出しが 401 を返すモック
**WHEN** `runProposePipeline` が branch/change folder 検証フェーズに達する
**THEN** state.status が `failed`、error.code が `GITHUB_TOKEN_EXPIRED`、stderr に `GitHub token expired. Run 'specrunner login' again.` が出力される

---

### TC-042: セッション作成パラメータの検証

**Category**: unit
**Priority**: must
**Source**: specs/propose-pipeline/spec.md — Scenario: セッション作成パラメータ

**GIVEN** `startProposeSession` の実行（モック SDK）
**WHEN** `sessions.create` に渡される引数を検査する
**THEN** `agent: { id, type: "agent" }`、`environment_id`、`resources: [{ type: "github_repository", repository: { owner, name }, authorization_token }]` が含まれる

---

### TC-043: 状態ファイル — atomic write（temp+rename）

**Category**: integration
**Priority**: must
**Source**: specs/job-state-store/spec.md — Requirement: 状態ファイル書き込みは atomic に行う; design.md — D4

**GIVEN** 実ファイルシステム上の jobs ディレクトリ
**WHEN** `createJobState()` または `updateJobState()` を呼び出す
**THEN** 書き込みが `<path>.tmp.<random>` への書き込み後に `fs.rename` で正規パスへの atomic rename を行い、正規パスには常に完全な JSON が存在する

---

### TC-044: 状態ファイル — SIGINT 中断耐性

**Category**: integration
**Priority**: must
**Source**: specs/job-state-store/spec.md — Scenario: 書き込み中の SIGINT; design.md — D4

**GIVEN** 既存の完全な状態ファイルが存在する状態
**WHEN** 書き込みの直前にプロセスが中断される（temp ファイルへの書き込み後、rename 前に相当する状態をシミュレート）
**THEN** 正規パスのファイルは前回の完全な状態を保持し、JSON パースできる状態を維持する

---

### TC-045: 状態ファイル — 並行 ps と書き込みの整合性

**Category**: integration
**Priority**: must
**Source**: specs/job-state-store/spec.md — Scenario: 並行 ps と書き込み

**GIVEN** `specrunner run` が状態ファイルを更新中（モック遅延）と `specrunner ps` が同ファイルを読むシナリオ
**WHEN** 並行アクセスをシミュレートする
**THEN** ps は古い完全な内容か新しい完全な内容のどちらかを読み、部分書き込みによる JSON パースエラーは発生しない

---

### TC-046: 状態ファイル — history append-only と最大 100 entry truncate

**Category**: integration
**Priority**: must
**Source**: specs/job-state-store/spec.md — Requirement: 履歴は append-only で最大 100 entry まで保持する

**GIVEN** history が 100 entry ある状態ファイル
**WHEN** `appendHistory(jobId, entry)` を呼び出す
**THEN** 先頭の 1 entry が drop され、結果として 100 entry のままになる（最新が末尾）

---

### TC-047: 状態ファイル — 破損ファイルが存在しても他のジョブを表示できる

**Category**: integration
**Priority**: must
**Source**: specs/job-state-store/spec.md — Requirement: 状態ファイルの enumeration は破損に耐える

**GIVEN** jobs/ ディレクトリに 3 ファイルがあり、そのうち 1 ファイルが JSON パース不可
**WHEN** `listJobStates()` を呼び出す
**THEN** 残り 2 ファイルが正常に返され、stderr に `Skipping malformed file: <path>` が 1 行出力される

---

### TC-048: 状態ファイル — XDG_DATA_HOME 未設定時のパス

**Category**: unit
**Priority**: should
**Source**: specs/job-state-store/spec.md — Scenario: XDG_DATA_HOME 未設定

**GIVEN** `XDG_DATA_HOME` が未設定で `HOME=~`
**WHEN** 状態ファイルのパスを解決する
**THEN** パスが `~/.local/share/specrunner/jobs/<uuid>.json` になる

---

### TC-049: 状態ファイル — XDG_DATA_HOME 設定済み時のパス

**Category**: unit
**Priority**: should
**Source**: specs/job-state-store/spec.md — Scenario: XDG_DATA_HOME 設定済み

**GIVEN** `XDG_DATA_HOME=/tmp/data`
**WHEN** 状態ファイルのパスを解決する
**THEN** パスが `/tmp/data/specrunner/jobs/<uuid>.json` になる

---

### TC-050: 状態ファイル — 必須フィールド欠落のファイルを skip する

**Category**: integration
**Priority**: should
**Source**: specs/job-state-store/spec.md — Scenario: 必須フィールド検証

**GIVEN** 必須フィールドが欠落した JSON ファイルが jobs/ に存在する
**WHEN** `listJobStates()` を呼び出す
**THEN** `STATE_FILE_INVALID` として skip され、stderr に skip メッセージが出力される

---

### TC-051: config — atomic write と permission 0600 強制

**Category**: integration
**Priority**: must
**Source**: specs/cli-config-store/spec.md — Requirement: 設定の更新は atomic に行う; Requirement: 設定ファイルはパーミッション 0600 で保存される

**GIVEN** 実ファイルシステム上の config ディレクトリ
**WHEN** `saveConfig(cfg)` を呼び出す
**THEN** atomic write（temp+rename）で書き込まれ、ファイルの mode が 0600 になる

---

### TC-052: config — 既存ファイルの permission が緩い場合に警告

**Category**: integration
**Priority**: must
**Source**: specs/cli-config-store/spec.md — Scenario: 既存ファイルの権限が緩い

**GIVEN** 既存 config が 0644 で配置されている
**WHEN** `loadConfig()` を呼び出す
**THEN** stderr に `Warning: ~/.config/specrunner/config.json has loose permissions (recommend 0600).` が出力される（読み込み自体は継続する）

---

### TC-053: config — apiKey が欠落している場合 CONFIG_INCOMPLETE

**Category**: unit
**Priority**: must
**Source**: specs/cli-config-store/spec.md — Scenario: 不完全な config

**GIVEN** `anthropic.apiKey` が欠落している config JSON
**WHEN** `loadConfig()` を呼び出す
**THEN** `CONFIG_INCOMPLETE` エラーが発生し、メッセージに `Run 'specrunner init' first.` が含まれる

---

### TC-054: config — github.accessToken 欠落（login 未実行）

**Category**: unit
**Priority**: must
**Source**: specs/cli-config-store/spec.md — Scenario: login 未実行の状態で run を実行する

**GIVEN** init 完了後 login 未実行の config（`github` ブロック未存在）
**WHEN** `specrunner run` のバリデーションが config を検査する
**THEN** `github.accessToken` 未設定を検知し、`Run 'specrunner login' first.` が返る

---

### TC-055: config — 機微情報が stdout に出力されない

**Category**: integration
**Priority**: must
**Source**: specs/cli-config-store/spec.md — Requirement: 機微情報は stdout に出力されない

**GIVEN** 有効な apiKey を含む config でモック SDK を使った `specrunner init` 実行
**WHEN** init が完了する
**THEN** stdout のすべての出力に apiKey の生値が含まれず、マスク表記（例: `sk-ant-...`）のみが含まれる

---

### TC-056: config — XDG_CONFIG_HOME 未設定時のパス

**Category**: unit
**Priority**: should
**Source**: specs/cli-config-store/spec.md — Scenario: XDG_CONFIG_HOME 未設定

**GIVEN** `XDG_CONFIG_HOME` が未設定で `HOME=~`
**WHEN** config のパスを解決する
**THEN** パスが `~/.config/specrunner/config.json` になる

---

### TC-057: specrunner init — 初回実行（config 未作成）

**Category**: integration
**Priority**: must
**Source**: specs/cli-commands/spec.md — Scenario: 初回実行（config 未作成）

**GIVEN** `~/.config/specrunner/config.json` が存在しない状態でモック SDK を使った実行
**WHEN** `specrunner init` を実行する
**THEN** Agent が 1 つ、Environment が 1 つ作成され、両 ID と apiKey を含む config がパーミッション 0600 で作成され、各ステップが stdout に表示され exit code 0 で終了する

---

### TC-058: specrunner init — API key が未設定

**Category**: integration
**Priority**: must
**Source**: specs/cli-commands/spec.md — Scenario: API key が無い

**GIVEN** `ANTHROPIC_API_KEY` が未設定で config にも apiKey が無い状態
**WHEN** `specrunner init` を実行する
**THEN** stderr に適切なメッセージが出力され exit code 1 で終了する

---

### TC-059: specrunner init — 既存 Agent/Environment で差分なし（冪等）

**Category**: integration
**Priority**: must
**Source**: specs/cli-commands/spec.md — Scenario: 既存 Agent / Environment があり差分がない; specs/agent-environment-bootstrap/spec.md — Scenario: ハッシュ一致

**GIVEN** config に agent.id と environment.id が記録され、CLI 側 definitionHash が一致する状態でモック SDK を使った実行
**WHEN** `specrunner init` を実行する
**THEN** 新規作成は行わず、既存リソースを再利用する旨が stdout に出力され exit code 0 で終了する

---

### TC-060: specrunner init — Agent 定義に差分がある場合 agents.update

**Category**: integration
**Priority**: must
**Source**: specs/cli-commands/spec.md — Scenario: Agent 定義に差分がある; specs/agent-environment-bootstrap/spec.md — Scenario: ハッシュ不一致

**GIVEN** config の definitionHash が CLI 側と異なる状態でモック SDK を使った実行
**WHEN** `specrunner init` を実行する
**THEN** `agents.update` が呼ばれ、新しい definitionHash が config に保存される

---

### TC-061: specrunner init — Environment 作成失敗時に Agent を rollback

**Category**: integration
**Priority**: must
**Source**: specs/agent-environment-bootstrap/spec.md — Scenario: Environment 作成失敗

**GIVEN** Agent 作成は成功するが Environment 作成が失敗するモック SDK
**WHEN** `specrunner init` を実行する
**THEN** Agent の archive/delete が試行され、新規作成された Agent ID は config に書き込まれず、exit code 1 で終了する

---

### TC-062: specrunner init — Environment を含む packages.npm の検証

**Category**: unit
**Priority**: should
**Source**: specs/agent-environment-bootstrap/spec.md — Scenario: 初回作成

**GIVEN** `createEnvironment` に渡される引数（モック SDK）
**WHEN** 引数を検査する
**THEN** `packages: { npm: ["@fission-ai/openspec"] }` が含まれる

---

### TC-063: specrunner run — fail-fast バリデーション順序（config 不在 → exit 1）

**Category**: integration
**Priority**: must
**Source**: specs/cli-commands/spec.md — Scenario: config が存在しない（ステップ 1 で失敗）; design.md — D8

**GIVEN** `~/.config/specrunner/config.json` が存在しない状態
**WHEN** `specrunner run req.md` を実行する
**THEN** ステップ 1 で即時 exit 1 し、`Run 'specrunner init' first.` が stderr に出力される。git repo チェック等は実行されない

---

### TC-064: specrunner run — fail-fast バリデーション（github token 欠落 → ステップ 2 で失敗）

**Category**: integration
**Priority**: must
**Source**: specs/cli-commands/spec.md — Scenario: github token が欠けている（ステップ 2 で失敗）

**GIVEN** config は存在するが `github.accessToken` が未設定
**WHEN** `specrunner run req.md` を実行する
**THEN** ステップ 2 で `Run 'specrunner login' first.` が stderr に出力され exit 1。cwd チェック等は実行されない

---

### TC-065: specrunner run — fail-fast バリデーション（origin が GitHub 以外 → ステップ 4 で失敗）

**Category**: integration
**Priority**: must
**Source**: specs/cli-commands/spec.md — Scenario: origin が GitHub 以外（ステップ 4 で失敗）

**GIVEN** config と token は揃い cwd は git repo だが origin が gitlab.com を指す状態
**WHEN** `specrunner run req.md` を実行する
**THEN** ステップ 4 で `'origin' must point to github.com.` が stderr に出力され exit 1

---

### TC-066: specrunner ps — 破損ファイルをスキップして他のジョブを表示

**Category**: integration
**Priority**: must
**Source**: specs/cli-commands/spec.md — Scenario: 破損した状態ファイルがある

**GIVEN** jobs/ に 3 ファイルがあり、1 ファイルが JSON パース不可
**WHEN** `specrunner ps` を実行する
**THEN** 残り 2 ジョブが表示され、stderr に `Skipping malformed file: <path>` が 1 行出力され exit code 0

---

### TC-067: specrunner ps — ジョブが 0 件

**Category**: integration
**Priority**: must
**Source**: specs/cli-commands/spec.md — Scenario: ジョブが 1 件もない

**GIVEN** `~/.local/share/specrunner/jobs/` が空か存在しない
**WHEN** `specrunner ps` を実行する
**THEN** stdout に `No jobs found.` が出力され exit code 0

---

### TC-068: specrunner ps — 非 TTY 出力（TAB 区切り）

**Category**: integration
**Priority**: must
**Source**: specs/cli-commands/spec.md — Scenario: 非 TTY 出力（パイプ等）

**GIVEN** stdout が非 TTY（パイプ等）でジョブが 2 件存在する
**WHEN** `specrunner ps` を実行する
**THEN** ヘッダ行 + 2 行を TAB 区切りで出力し、列幅パディングを行わない

---

### TC-069: specrunner ps — TTY 出力（固定列幅）

**Category**: manual
**Priority**: should
**Source**: specs/cli-commands/spec.md — Scenario: TTY 出力（複数ジョブ）

**GIVEN** stdout が TTY でディレクトリに 3 件の状態ファイルが存在する
**WHEN** `specrunner ps` を実行する
**THEN** 3 行 + ヘッダ行が固定列幅でテーブル表示される。JOB_ID は先頭 8 文字、BRANCH は 40 文字超で truncate、AGE は人間可読（例: `2m`、`1h`）で表示される。createdAt 降順でソートされる

---

### TC-070: Agent 定義ハッシュ — 同一定義は同一ハッシュ

**Category**: unit
**Priority**: should
**Source**: tasks.md — 9.4: 同一定義は同一 hash; specs/agent-environment-bootstrap/spec.md

**GIVEN** CLI 側の Agent definition
**WHEN** canonical JSON 化 + SHA-256 を 2 回計算する
**THEN** 両回が同一のハッシュ文字列を返す

---

### TC-071: Agent 定義ハッシュ — フィールド順序差を吸収する

**Category**: unit
**Priority**: should
**Source**: tasks.md — 9.4: フィールド順序差を吸収した hash 安定性

**GIVEN** フィールド順序が異なる 2 つの等価な Agent definition オブジェクト
**WHEN** 双方のハッシュを計算する
**THEN** 同一のハッシュ文字列を返す

---

### TC-072: CLI — 不明なサブコマンドは exit 2

**Category**: integration
**Priority**: should
**Source**: specs/cli-commands/spec.md — Scenario: 不明なサブコマンドが渡された場合

**GIVEN** `specrunner foobar` を実行する
**WHEN** バイナリが引数を受け取る
**THEN** stderr に `Unknown command: foobar` と usage が出力され exit code 2 で終了する

---

### TC-073: GitHub Device Flow — device code 取得とユーザー誘導表示（実機）

**Category**: manual
**Priority**: must
**Source**: specs/github-device-flow-auth/spec.md — Scenario: device code 取得; Scenario: ユーザー誘導表示

**GIVEN** 有効な GitHub OAuth App client_id を設定した状態
**WHEN** `specrunner login` を実行する
**THEN** `POST https://github.com/login/device/code` が呼ばれ、stdout に `Open <verification_uri> and enter code: <user_code>` と expires_in が表示される

---

### TC-074: GitHub Device Flow — token polling 成功（実機）

**Category**: manual
**Priority**: must
**Source**: specs/github-device-flow-auth/spec.md — Scenario: token polling

**GIVEN** device code を取得後、ブラウザで user_code を承認した状態
**WHEN** CLI が token endpoint をポーリングする
**THEN** access_token が取得され、config の `github.accessToken`、`tokenObtainedAt`、`scopes` が更新される。ファイルパーミッションが 0600 に維持される

---

### TC-075: GitHub Device Flow — token polling モック（authorization_pending）

**Category**: unit
**Priority**: must
**Source**: specs/github-device-flow-auth/spec.md — Scenario: authorization_pending

**GIVEN** `{ error: "authorization_pending" }` を返すモック fetch
**WHEN** `pollAccessToken` が呼ばれる
**THEN** 現行 `interval` 秒後に再試行し、エラーは発生しない

---

### TC-076: GitHub Device Flow — token polling モック（slow_down）

**Category**: unit
**Priority**: must
**Source**: specs/github-device-flow-auth/spec.md — Scenario: slow_down

**GIVEN** `{ error: "slow_down" }` を返すモック fetch
**WHEN** `pollAccessToken` が呼ばれる
**THEN** `interval` が 5 秒増加し、新 interval で再試行する

---

### TC-077: GitHub Device Flow — expired_token でエラー終了

**Category**: unit
**Priority**: must
**Source**: specs/github-device-flow-auth/spec.md — Scenario: expired_token

**GIVEN** `{ error: "expired_token" }` を返すモック fetch
**WHEN** `pollAccessToken` が呼ばれる
**THEN** ポーリングが終了し、stderr に `Authorization timed out. Run 'specrunner login' again.` が出力され exit code 1

---

### TC-078: GitHub Device Flow — access_denied でエラー終了

**Category**: unit
**Priority**: must
**Source**: specs/github-device-flow-auth/spec.md — Scenario: access_denied

**GIVEN** `{ error: "access_denied" }` を返すモック fetch
**WHEN** `pollAccessToken` が呼ばれる
**THEN** ポーリングが終了し、stderr に `Authorization denied by user.` が出力され exit code 1

---

### TC-079: GitHub Device Flow — SPECRUNNER_GITHUB_CLIENT_ID 環境変数で上書き

**Category**: unit
**Priority**: should
**Source**: specs/github-device-flow-auth/spec.md — Scenario: 環境変数オーバーライド

**GIVEN** `SPECRUNNER_GITHUB_CLIENT_ID=Iv1.test123` が設定された環境
**WHEN** `requestDeviceCode` を呼び出す
**THEN** `POST` リクエストの `client_id` が `Iv1.test123` になる

---

### TC-080: post-init 不変条件の検証（実機）

**Category**: manual
**Priority**: should
**Source**: specs/agent-environment-bootstrap/spec.md — Scenario: post-init 検証

**GIVEN** `specrunner init` が exit code 0 で完了した状態
**WHEN** 実 Anthropic API で config の agent.id と environment.id を retrieve する
**THEN** (a) agent.id が retrieve 可能、(b) environment.id が retrieve 可能、(c) Agent の custom_tools に `register_branch` が含まれる、(d) Agent の toolset.type が `agent_toolset_20260401` であることをすべて確認できる

---

### TC-081: bun:* / Bun.* の import が存在しない（grep）

**Category**: unit
**Priority**: should
**Source**: tasks.md — 4.6, 10.3; proposal.md — Impact（依存関係）

**GIVEN** src/ と bin/ 配下の全 TypeScript ファイル
**WHEN** `bun:` および `Bun.` の import 文を grep する
**THEN** マッチが 0 件である

---

### TC-082: specrunner run — 正常完了の E2E（実機）

**Category**: manual
**Priority**: must
**Source**: request.md — 受け入れ基準; specs/propose-pipeline/spec.md — Scenario: 正常完了

**GIVEN** `specrunner init` と `specrunner login` が完了し、有効な request.md が存在する git リポジトリ
**WHEN** `specrunner run <request.md>` を実行する
**THEN** propose セッションが起動し、`register_branch` Custom Tool が処理され、ポーリングで完了が検知され、state file に success が記録され、exit code 0 で終了する

---

### TC-083: specrunner run — Managed Agents セッション作成後の SSE 接続（実機）

**Category**: manual
**Priority**: must
**Source**: design.md — Sequence; specs/propose-pipeline/spec.md — Requirement: SSE stream はセッション作成後に接続される

**GIVEN** 実 Anthropic API に接続した状態
**WHEN** `specrunner run` がセッションを作成する
**THEN** `events.stream(session.id)` が接続に成功し、events.send で初回メッセージを送信できる

---

### TC-084: specrunner init — Agent ID が 404 の場合に新規作成

**Category**: integration
**Priority**: should
**Source**: specs/agent-environment-bootstrap/spec.md — Scenario: 既存 ID が 404

**GIVEN** config に agent.id があるが retrieve で 404 が返るモック SDK
**WHEN** `specrunner init` を実行する
**THEN** 新規 Agent が作成され、新 ID が config に保存される

---

### TC-085: specrunner init — cleanup 失敗時の孤立リソース警告

**Category**: integration
**Priority**: should
**Source**: specs/agent-environment-bootstrap/spec.md — Scenario: cleanup も失敗

**GIVEN** Environment 作成失敗 → Agent cleanup も失敗するモック SDK
**WHEN** `specrunner init` を実行する
**THEN** stderr に `Failed to cleanup orphaned agent <id>; please archive manually.` が出力され exit code 1 で終了する

---

### TC-086: logger — API key が stdout にマスクされる

**Category**: unit
**Priority**: should
**Source**: tasks.md — 1.4; specs/cli-config-store/spec.md — Requirement: 機微情報は stdout に出力されない

**GIVEN** `src/logger/stdout.ts` の自動マスキング機能
**WHEN** `sk-ant-apiKey123` を含む文字列を logger に渡す
**THEN** 出力は `sk-ant-...` 形式にマスクされ、生の API key が含まれない

---

### TC-087: SpecRunnerError — code と hint が正しく設定される

**Category**: unit
**Priority**: could
**Source**: design.md — Error Handling; tasks.md — 1.3

**GIVEN** `new SpecRunnerError("CONFIG_MISSING", "Run 'specrunner init' first.", "Config not found")`
**WHEN** error オブジェクトを検査する
**THEN** `error.code === "CONFIG_MISSING"`、`error.hint` に推奨アクションが含まれ、`error.message` にも内容が含まれる

---

### TC-088: specrunner ps — JOB_ID が先頭 8 文字に短縮される

**Category**: unit
**Priority**: should
**Source**: specs/cli-commands/spec.md — Requirement: specrunner ps は実行中のジョブを一覧表示する

**GIVEN** jobId が `550e8400-e29b-41d4-a716-446655440000` の状態ファイル
**WHEN** ps の出力フォーマットを検査する
**THEN** JOB_ID 列が `550e8400`（先頭 8 文字）になる

---

### TC-089: specrunner ps — BRANCH が 40 文字超で truncate

**Category**: unit
**Priority**: should
**Source**: specs/cli-commands/spec.md — Requirement: specrunner ps

**GIVEN** branch が 45 文字の状態ファイル
**WHEN** ps の出力フォーマットを検査する
**THEN** BRANCH 列が 37 文字 + `...` に truncate される

---

### TC-090: specrunner ps — createdAt 降順ソート

**Category**: unit
**Priority**: should
**Source**: specs/cli-commands/spec.md — Requirement: specrunner ps

**GIVEN** createdAt が異なる 3 件の状態ファイル
**WHEN** `listJobStates()` を呼び出す
**THEN** 返り値が createdAt 降順（最新が先頭）でソートされる

---

### TC-091: specrunner — 引数なし実行で usage と exit 2

**Category**: integration
**Priority**: could
**Source**: specs/cli-commands/spec.md — Scenario: 引数なしで実行された場合

**GIVEN** サブコマンドなしで `specrunner` を実行する
**WHEN** バイナリが起動する
**THEN** stderr に各サブコマンドの 1 行説明を含む usage が出力され exit code 2 で終了する

---

### TC-092: specrunner — --help で usage と exit 0

**Category**: integration
**Priority**: could
**Source**: specs/cli-commands/spec.md — Scenario: --help または -h が渡された場合

**GIVEN** `specrunner --help` を実行する
**WHEN** バイナリが起動する
**THEN** stdout に usage が出力され exit code 0 で終了する

---

### TC-093: 状態マシン — SESSION_TIMEOUT の history entry

**Category**: unit
**Priority**: should
**Source**: specs/propose-pipeline/spec.md — Scenario: SESSION_TIMEOUT

**GIVEN** タイムアウトが発生するシナリオ（モック時刻）
**WHEN** `runProposePipeline` がタイムアウトを検知する
**THEN** history に `{ step: "session-timeout", status: "error" }` が append され、state.status が `failed`、error.code が `SESSION_TIMEOUT`

---

### TC-094: 状態マシン — SESSION_TERMINATED の history entry

**Category**: unit
**Priority**: should
**Source**: specs/propose-pipeline/spec.md — Scenario: SESSION_TERMINATED

**GIVEN** ポーリングで `{ status: "terminated" }` を返すモック
**WHEN** `runProposePipeline` を実行する
**THEN** history に `{ step: "session-terminated", status: "error" }` が append され、state.status が `failed`、error.code が `SESSION_TERMINATED`

---

### TC-095: 状態マシン — BRANCH_NOT_REGISTERED の history entry

**Category**: unit
**Priority**: should
**Source**: specs/propose-pipeline/spec.md — Scenario: BRANCH_NOT_REGISTERED

**GIVEN** idle+end_turn 時点で state.branch が null のシナリオ
**WHEN** `runProposePipeline` が idle 検知後に branch チェックを行う
**THEN** history に `{ step: "idle-end-turn-detected", status: "error" }` が append され、error.code が `BRANCH_NOT_REGISTERED`

---

### TC-096: 状態マシン — CHANGE_FOLDER_NOT_FOUND の history entry

**Category**: unit
**Priority**: should
**Source**: specs/propose-pipeline/spec.md — Scenario: CHANGE_FOLDER_NOT_FOUND

**GIVEN** change folder 確認 API が 404 を返すモック
**WHEN** `runProposePipeline` が検証フェーズに達する
**THEN** history に `{ step: "change-folder-verified", status: "error" }` が append され、error.code が `CHANGE_FOLDER_NOT_FOUND`

---

### TC-097: uuid v4 で jobId が生成される

**Category**: unit
**Priority**: could
**Source**: design.md — D7: uuid v4 でジョブ ID

**GIVEN** `createJobState()` を呼び出す
**WHEN** 生成された jobId を検査する
**THEN** jobId が uuid v4 形式（`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`）に一致する

---

### TC-098: config — ps 経路では permission の自動修正を行わない

**Category**: unit
**Priority**: could
**Source**: specs/cli-config-store/spec.md — Note: specrunner ps は read-only 経路

**GIVEN** 0644 の config ファイルが存在する状態で `specrunner ps` を実行する
**WHEN** ps が config を読み込む
**THEN** config のファイルパーミッションが変更されない（0644 のまま）。警告は出力されてよい

---

### TC-099: SSE — session.status_idle のみが先行した場合にポーリングで確認

**Category**: unit
**Priority**: should
**Source**: specs/session-completion-detection/spec.md — Scenario: SSE のみが idle を伝えた場合でも確定として扱う

**GIVEN** SSE で `session.status_idle` イベント（`stop_reason: "end_turn"` 付き）が届くモック
**WHEN** SSE ループがこのイベントを受信する
**THEN** SSE ループが break され、ポーリングが 1 回追加発行されて同じ status を確認した上で completion が確定する

---

### TC-100: Managed Agents — SDK で `bun:*` なしで Anthropic client が生成される

**Category**: unit
**Priority**: should
**Source**: design.md — SDK 型定義の利用方針; tasks.md — 4.1

**GIVEN** `createAnthropicClient(apiKey)` の実装
**WHEN** client を生成する
**THEN** `new Anthropic({ apiKey, defaultHeaders: { "anthropic-beta": "managed-agents-2026-04-01" } })` で生成され、`bun:*` / `Bun.*` を import していない

---

### TC-101: 状態ファイル — 書き込み中の中断後に temp ファイルが残っても本体は完全

**Category**: integration
**Priority**: could
**Source**: specs/job-state-store/spec.md — Scenario: 書き込み中の SIGINT

**GIVEN** temp ファイルへの書き込み後、rename 前の状態をシミュレートする（temp ファイルが残存する状態）
**WHEN** `listJobStates()` または `loadJobState()` を呼び出す
**THEN** 正規パスのファイルは完全な JSON を保持し、temp ファイルは無視される

---

### TC-102: specrunner login — config に github ブロックが保存される（モック）

**Category**: integration
**Priority**: must
**Source**: specs/github-device-flow-auth/spec.md — Scenario: 保存内容

**GIVEN** モック fetch が成功の access_token を返す状態
**WHEN** `specrunner login` を実行する
**THEN** config の `github.accessToken`、`github.tokenObtainedAt`、`github.scopes` が更新され、ファイルパーミッションが 0600 に維持される

---

### TC-103: init — custom_tools が agent 作成時に registry 由来の値のみを使う

**Category**: integration
**Priority**: must
**Source**: specs/agent-environment-bootstrap/spec.md — Requirement: Custom Tools は registry 経由で Agent に登録される

**GIVEN** モック SDK を使った `specrunner init` 実行
**WHEN** `agents.create` または `agents.update` に渡される引数を検査する
**THEN** `custom_tools` の値が `tool-registry.getDefinitions()` の戻り値であり、手動で書かれた定義オブジェクトを含まない
