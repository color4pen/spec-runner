# Spec Review Result — interactive-create-dialog

- **reviewer**: spec-reviewer
- **iteration**: 1
- **date**: 2026-05-08
- **verdict**: approved

## Summary

request.md の全要件（4 phase 構造、REPL UI、出口戦略、system prompt、draft 永続化、テスト）が proposal → design → tasks → delta specs に一貫してトレースできる。設計判断（CommandRunner 非継承、generator prompt、FINAL_DRAFT マーカー）は根拠が明確で実現可能。CRITICAL / HIGH の指摘なし。MEDIUM 2 件は実装時に対応可能な改善提案。

## Completeness

| Request 要件 | proposal | design | tasks | delta spec | 状態 |
|---|---|---|---|---|---|
| 4 phase 構造 (Req 1-2) | ✓ | D1 | 3.1-3.8 | cli-commands | 完全 |
| readline REPL (Req 3) | ✓ | D2 | 3.2 | cli-commands | 完全 |
| ストリーミング表示 (Req 4) | ✓ | D3 | 2.1-2.3, 3.4 | cli-commands | 完全 |
| ツール実行表示 (Req 5) | ✓ | D3 | 2.3, 3.4 | cli-commands | 完全 |
| 応答完了後プロンプト (Req 6) | ✓ | D3 | 3.4 | cli-commands | 完全 |
| FINAL_DRAFT system prompt (Req 7) | ✓ | D4 | 1.1 | cli-commands | 完全 |
| マーカー検出 + 確認 (Req 8-9) | ✓ | D4 | 3.5-3.6 | cli-commands | 完全 |
| exit/quit (Req 10) | ✓ | D5 | 3.2, 4.4 | cli-commands | 完全 |
| 対話用 system prompt (Req 11-12) | ✓ | D2 | 1.1-1.2 | — | 完全 |
| draft 永続化 (Req 13-15) | ✓ | D5 | 4.1-4.4 | request-mgmt | 完全 |
| テスト (Req 16-20) | — | — | 6.1-6.8 | — | 完全 |
| CLI ファサード更新 | ✓ | D6 | 5.1-5.2 | cli-commands | 完全 |
| LocalRuntime 専用 | ✓ | D7 | 3.3 | cli-commands | 完全 |

## Consistency

- **cli-commands delta spec**: ベース spec の「6 サブコマンド」を「7 つのサブコマンド」に正しく更新。`create` サブコマンドの引数形式・対話モード・`--no-llm` の振る舞いを明確に定義。ベースの既存 Requirement と矛盾なし
- **request-management delta spec**: ADDED Requirements のみ。ベース spec（Next.js 時代の Server Action / DB schema）とは別領域（ファイルシステムベースの draft CRUD）のため衝突なし。ベース spec 自体が現行実装と乖離している（既知の spec debt）が、本 change の責任範囲外
- **design.md ↔ delta specs**: D1-D7 の設計判断が delta specs の Scenario に 1:1 で反映されている
- **tasks.md ↔ delta specs**: タスク 7.1-7.2 が delta spec の作成を指示し、実際に specs/ 配下に存在する

## Feasibility

- **generator prompt パターン**: `LocalRuntime.queryInteractive()` が `AsyncIterable<SDKUserMessage>` を受け取り `Query` を返す実装が既に存在。design.md D2 の `createPromptGenerator()` は技術的に成立する
- **stream_event パース**: SDK の `Query` は `AsyncIterable<SDKMessage>` を実装。`content_block_delta` → `text_delta` の分岐は Anthropic Streaming API の標準パターン
- **draft-store**: `fs.mkdir` + `fs.writeFile` + `fs.rm` の単純な操作。JobState との依存なし。実現に技術的障壁なし
- **FINAL_DRAFT マーカー**: テキスト内のマーカー検出は `indexOf` で十分。LLM の応答テキスト（text_delta 蓄積）のみが検出対象で、ユーザー入力とは分離されている

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | security | design.md (D5), specs/request-management/spec.md | `saveDraft(slug, ...)` が `specrunner/requests/draft/<slug>/` に書き出すが、slug のパス・トラバーサル検証が未記載。slug に `../` が含まれた場合に意図しないディレクトリへ書き出す可能性がある | `saveDraft()` の入口で slug を検証する（`/` `..` 空文字を reject）要件を request-management delta spec の draft 保存 Scenario に追加するか、実装時に `draft-store.ts` 内でバリデーションを行う旨を tasks.md に注記する |
| 2 | MEDIUM | completeness | design.md (Risks), specs/cli-commands/spec.md | SDK セッション中のエラー（ネットワーク障害、トークン期限切れ等）発生時の振る舞いが未定義。FINAL_DRAFT 未検出の段階でクラッシュすると対話内容が全失落する | design.md の Risks に挙がっている通り finally ブロックで rl.close() する方針は記載済み。追加で「SDK エラー時は現在のバッファを saveDraft() で保存して終了する」Scenario を cli-commands delta spec に追加するか、実装時の判断に委ねる旨を明記する |
| 3 | LOW | completeness | specs/cli-commands/spec.md | `[y/N]` 確認プロンプトで `exit` / `quit` を入力した場合の振る舞いが未記載。実装上は generator の `rl.question()` とは別の `rl.question()` で処理されるため `exit` は "n" 扱いになるが、明示されていない | 情報提供のみ。実装者が判断可能な範囲 |
| 4 | LOW | consistency | specs/request-management/spec.md | ベース spec が Next.js 時代の Server Action / DB schema を記述しており、現行の CLI + ファイルシステム実装と乖離している。delta spec 自体は正しいが、ベース spec の更新が将来必要 | 本 change のスコープ外。別途 spec debt として認識する |
