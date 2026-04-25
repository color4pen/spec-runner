# Request Create + Propose セッション機能

## Meta

- **type**: new-feature
- **date**: 2026-04-24
- **author**: color4pen

## ワークフローオプション

- **enabled**:
  - test-case-generator
  - adr

## 背景

spec-runner は openspec-workflow の request-execute パイプラインを Managed Agents 上で自動化する Web アプリケーション。ADR-20260424 で「4セッション直列モデル + Custom Tools インターフェース」の方針が決まった。

現状は bootstrap フロー（リポジトリ初期化）のみが動作しており、開発ワークフローの入口である request-create → propose が未実装。ユーザーがやりたいことを入力して、設計成果物（change folder）を生成・閲覧するまでの最初のパイプラインを通す必要がある。

## 目的

ユーザーが Web UI から request を作成し、Managed Agents の propose セッションで openspec の change folder（proposal.md, specs/, design.md, tasks.md）を自動生成して、その結果を UI で閲覧できるようにする。

## 要件

1. Web UI に request 作成フォームを追加する。入力項目は type（セレクト）、タイトル（テキスト）、本文（テキストエリア）、enabled（マルチセレクト: test-case-generator, adr, module-architect, security-reviewer, pattern-reviewer）
2. フォーム送信で DB に request レコードを保存する。既存の createRequest() を拡張し、enabled フィールドを追加する
3. request 保存後、propose セッション（role: 'propose'）を起動する。bootstrap と同様のフロー（createBoundSession → sendMessage）
4. propose セッションの system prompt は openspec-propose スキルをベースとし、ユーザーの入力内容（type, タイトル, 本文）をメッセージとして送信する
5. セッションはリポジトリをマウントした状態で、新規ブランチ上に change folder を生成して push する
6. 生成された change folder（proposal.md, specs/, design.md, tasks.md）を UI で閲覧できるページを作成する。branch 上のファイルを GitHub API で取得して markdown 表示する
7. セッション role に 'propose' を追加する（DB スキーマの拡張）
8. ブランチ命名規則: `{prefix}/{slug}` 形式。prefix は type に基づく（feat/ / change/ / refactor/ / fix/）。slug は `YYYY-MM-DD-{タイトルから生成}`

## 受け入れ基準

- [ ] request 作成フォームが表示され、4項目（type, タイトル, 本文, enabled）を入力できる
- [ ] フォーム送信で request が DB に保存される（enabled フィールド含む）
- [ ] request 保存後に propose セッションが自動起動される
- [ ] propose セッションが change folder を生成して branch に push する
- [ ] 生成された md ファイル（proposal.md, design.md, tasks.md）を UI で閲覧できる
- [ ] セッションの状態（running / idle / terminated）が UI に表示される

## 技術的な考慮事項

- propose セッション起動は bootstrap の startBootstrap() と同構造。createBoundSession + sendMessage のパターンを流用する
- openspec CLI は environment の packages に `@fission-ai/openspec` として登録済み。セッション内で利用可能
- セッション完了検知は既存の SSE ストリーミング基盤（session-completion-handler.ts）を利用
- GitHub API でのファイル取得は github-api.ts に追加関数が必要（branch 上のファイル内容取得）
- enabled フィールドは DB スキーマに TEXT（JSON 配列の文字列）として保存する
- propose セッションの Agent は専用に作成する（system prompt に openspec-propose の指示を含む）

## 補足

- ADR-20260424-session-pipeline-design.md に4セッション直列モデルの設計が記録されている
- 本 request は4セッションモデルの「セッション1: 設計（propose）」部分のみを対象とする
- セッション2以降（spec-review, implementer, code-review）は後続の request で実装する
- Custom Tools（submit_artifacts 等）は Phase 1 では不要。セッションは標準ツールのみで完結する
