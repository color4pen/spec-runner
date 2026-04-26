# Slug 生成のエージェント委譲 + ブランチ名追跡

## Meta

- **type**: new-feature
- **date**: 2026-04-25
- **author**: color4pen

## ワークフローオプション

- **enabled**:
  - test-case-generator
  - adr

## 背景

propose セッションで日本語タイトル（例:「画面のモダン化」）から slug を生成すると、`propose-utils.ts` の `generateSlug()` が `[^a-z0-9]` で日本語を全除去して空の slug（`2026-04-25-`）になる。結果としてブランチ名も `refactor/2026-04-25-` と不完全になる。

また、エージェントが実際に使用した slug・ブランチ名をアプリケーション（spec-runner）が追跡する手段がない。アプリ側で事前計算した slug とエージェントが実際に使った値がずれると、change folder の閲覧や差分 URL の生成ができない。

## 目的

1. slug 生成をエージェントに委譲し、リポジトリの文脈を踏まえた英語 slug を生成させる
2. エージェントが確定した slug・ブランチ名を Custom Tool 経由で spec-runner に報告し、DB に永続化する
3. 保存されたブランチ名を使って差分 URL（GitHub compare）を UI に表示する

## 要件

1. requests テーブルに `branch_name` カラム（TEXT, nullable）と `base_branch` カラム（TEXT, nullable、null = default branch）を追加する
2. Custom Tool `register_branch` を定義する。エージェントがブランチ作成後に呼び出し、slug とブランチ名を報告する
3. SSE ストリーミング基盤（session-completion-handler.ts）を拡張し、`requires_action` イベント（Custom Tool 呼び出し）をハンドリングする
4. `register_branch` ツール呼び出し時に requests テーブルの `branch_name` を更新する
5. propose セッションの Agent 定義に `register_branch` を Custom Tool として追加する
6. `buildProposeMessage()` から事前計算の slug・ブランチ名指示を削除し、エージェントに slug 決定を委ねる指示に変更する
7. UI に差分 URL リンク（`https://github.com/{owner}/{repo}/compare/{base}...{branch}`）を表示する。branch_name が DB に保存されている場合のみ表示
8. `getChangeFolderFiles()` と `getChangeFolderFileContent()` を branch_name が DB にある場合はそれを使うよう修正する

## 受け入れ基準

- [ ] 日本語タイトルの request でも propose セッションが適切な英語 slug を生成してブランチを作成する
- [ ] エージェントが `register_branch` Custom Tool を呼び、spec-runner が branch_name を DB に保存する
- [ ] SSE ハンドラが `requires_action` イベントを処理し、Custom Tool の結果を返す
- [ ] UI に GitHub 差分 URL が表示され、クリックでブランチ比較ページが開く
- [ ] change folder ビューアが DB の branch_name を使ってファイルを取得する
- [ ] 既存テストが通る

## 技術的な考慮事項

- Custom Tool の仕組み: エージェントが tool_use → SSE で `agent.custom_tool_use` イベント → セッションが `idle`（`stop_reason: requires_action`）に遷移 → アプリが `user.custom_tool_result` を返す → セッション再開
- Agent 作成時に tools 配列に Custom Tool 定義を含める（`type: 'custom'`, `name`, `description`, `input_schema`）
- `base_branch` は Phase 1 では null 固定（default branch を使用）。将来的にフィーチャーブランチからの分岐に対応

## 補足

- ADR-20260424-session-pipeline-design.md に Custom Tools インターフェースの設計方針が記録されている
- `register_branch` は最初の Custom Tool 実装であり、今後の `submit_verdict`, `submit_artifacts` 等の基盤になる
- depends-on: requests/active/2026-04-24-request-create-propose（PR #6 で merge 済み）
