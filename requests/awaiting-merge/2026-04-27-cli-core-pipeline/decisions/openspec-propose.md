# Decisions — openspec-propose (Step 2)

事前宣言の design decisions（書式: `〜する :: 理由`）。
openspec-propose スキル起動前に決定を pin し、生成成果物の整合性ゲートとして使う。

## 技術スタック

- Node.js + TypeScript で実装する :: request.md と memory（feedback_mainstream_toolchain）に従い、`bun:*` / `Bun.*` の import を使わず Node 標準 API のみで完結させる
- `@anthropic-ai/sdk` ^0.91.0 を直接利用する :: package.json と request.md で固定。v0.91.0 は `client.beta.sessions/agents/environments` namespace を提供しており Phase 1 PoC コードとの互換が保てる
- ESM (`"type": "module"`) を維持する :: package.json で既に宣言済み。動的 import を避け静的 import で統一する（constraints.md「動的 import と静的 import を混在させない」）

## スコープ境界

- 本 request では `specrunner run` の **propose ステップのみ** を実装する :: request.md スコープ外で明示。spec-review/implement/code-review の接続は後続 request に切り出す
- `init` / `login` / `run` / `ps` の 4 コマンドのみを CLI 仕様に含める :: 受け入れ基準と要件 1-4 に対応。`logs -f` / `stop` / `resume` / `cancel` / `merge` / `fixup` はスコープ外
- `specrunner/` ディレクトリの対象リポジトリ内設計はスコープ外とする :: request.md で明示

## セッション完了検知

- ポーリング（`client.beta.sessions.retrieve()` で `status: idle` + `stop_reason: end_turn`）を主とする :: ADR-20260427-cli-first-architecture「セッションは Anthropic のサーバー上で自律実行され、SSE は観察用」と一致
- propose セッションのみ SSE stream を併用し `register_branch` Custom Tool に応答する :: ADR の「propose の特殊性」に従い、Custom Tool の `requires_action` を消費するために必要
- SSE で idle + end_turn を観測したら必ず break する :: feedback_sse_break_after_completion（過去に 2 回踏んだ事象の再発防止）
- ポーリング間隔は指数バックオフ（初期 2s、上限 30s、ジッタ ±20%）にする :: 600 req/min（read endpoint）の制限に余裕を持たせ、長時間セッションでもレートを使い切らない

## Custom Tool: register_branch

- 入力スキーマは `{ branch: string }` の単一引数で固定する :: 旧 `register-branch-tool.ts` パターンを継承し、Agent が複数呼びしてもアプリ側が確実にハンドリングできる粒度
- 冪等性は last-write-wins とする :: request.md および pipeline-context.md emphasis に明示
- ツール定義は `agent.custom_tools` 配列に静的に登録し、CLI コードに source-of-truth を置く :: constraints.md「定義済み関数の未呼び出し、Custom Tool の Agent tools 配列への未登録は致命的なサイレント障害」に対する直接対策
- Custom Tool ハンドラの登録ヘルパーは「定義 → Agent 登録 → SSE ハンドラ登録」を 1 ファイル内で結線する設計にする :: 出口/入口の接続漏れ（Bug 1 再発防止）を構造的に阻止する

## 状態管理

- ジョブ状態ファイルを `~/.local/share/specrunner/jobs/<id>.json` に書き込む :: XDG Base Directory（`XDG_DATA_HOME` 既定）に従う。OS 横断で副作用の少ない場所
- ジョブ ID は uuid v4 で生成する :: 衝突確率が無視でき、Anthropic 側 session id と独立した stable identifier を CLI 起動時点で確保できる
- 状態ファイルの書き込みは temp file → rename の atomic write にする :: 並列 `specrunner ps` と書き込みの race による破壊的読み取りを防止
- ステップ単位の更新は append-only な history 配列を持つ :: `specrunner ps` でタイムラインを再構築できる。後続の `logs` コマンド実装の布石でもある

## 設定管理

- 設定ファイルを `~/.config/specrunner/config.json` に保存する :: XDG Base Directory に従う
- API key / agent_id / environment_id / github_token の 4 値を保存する :: 要件 15 に対応
- ファイルパーミッションを `0600` で固定する :: 平文トークンの最小限の保護（OWASP Top 10 「機微情報の不適切な保存」対策）
- `specrunner init` は冪等にする :: 既存の agent_id / environment_id があれば retrieve で存在確認、なければ create する。差分 sync 時は ID を再利用
- `specrunner login` の Device Flow は失敗時に明確なリカバリ手順を表示する :: pipeline-context.md emphasis 「GitHub Device Flow OAuth（成功 + 失敗/期限切れ）」

## エラーハンドリング / ロールバック

- 多段リソース作成（Agent → Environment → Session）は逆順の cleanup を try-catch で保証する :: constraints.md「外部 API 呼び出し + DB 操作の多段処理では、全リソースの rollback を保証する」
- サイレント障害を検出可能にするため、各ステップの完了を状態ファイルにマークし、未完了状態で終了したら `ps` でその旨が判別できる仕様にする :: pipeline-context.md emphasis「サイレント障害（エラーなし・機能しない）の検出可能性」
- Anthropic API key 未設定 / GitHub トークン期限切れ / リポジトリ未マウント の 3 ケースは個別のエラーメッセージと推奨アクションを返す :: pipeline-context.md must-areas に明記

## 仕様ドキュメント方針

- 関数シグネチャは specs/ で唯一の真実とし、design.md と tasks.md では参照に留める :: constraints.md「設計ドキュメント間の関数インターフェース定義は一箇所を正とし、他は参照する形にする」
- 公開型（CLI 引数の型、状態ファイル schema、config schema）は spec レベルで明示する :: constraints.md「公開型の拡張は spec レベルで明示的に定義する」
- 失敗→再実行のシナリオを spec に含め、`register_branch` の冪等性を明示する :: constraints.md「Custom Tool のような外部エージェントが呼ぶインターフェースはリトライ・再実行を前提とする」

## 生成後の追加判断（post-skill）

- openspec CLI が日付プレフィックス slug を拒否したため、scaffold は alt-slug `cli-core-pipeline-2026-04-27` で生成して最終的に `2026-04-27-cli-core-pipeline` に rename する :: pipeline-context.md の `change-folder: openspec/changes/2026-04-27-cli-core-pipeline/` を保ち、後続の自動化を変更しないため
- specs を 10 ケイパビリティに分割する（cli-commands / propose-pipeline / register-branch-tool / session-completion-detection / job-state-store / cli-config-store / agent-environment-bootstrap / github-device-flow-auth / request-md-parser / repository-identification） :: 単一責務（SRP）と spec-review エージェントの並列レビュー容易性のため
- 仕様文中で `MUST` / `SHALL` を英語で明示する :: openspec validate --strict が英語キーワードの存在を要件とするため、レビュー対象としても規範性が一目で判別できる
- design.md に SDK 利用断面（agents.create / environments.create / sessions.{create,retrieve,events.stream,events.send} の引数形）を確定値で記述する :: implementer が SDK 再調査を行わずに着手できる状態を保証するため（feedback_investigate_before_implementing）
- tasks.md は 10 グループ（プロジェクト土台 / config-state / parser-git / SDK ラッパ / Custom Tool registry / OAuth / 完了検知+pipeline / CLI 配線 / Agent 定義同期 / 検証）に分け、依存順で並べる :: 並列着手可能なグループ（2/3/6 等）と直列依存（4→5→7→8）を明示するため
