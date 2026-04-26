# RCA: 2026-04-27-fix-custom-tool-and-propose-navigation

## Bug 1: register_branch Custom Tool 未登録

### 技術的原因

#### 直接原因

`actions.ts:68` の `createAgent` で生成される Agent の tools 配列が `[{ type: 'agent_toolset_20260401' }]` のみ。`REGISTER_BRANCH_TOOL`（custom tool）が含まれていないため、Agent は register_branch の存在を認知できない。

#### 根本原因

PR #11 で custom tool の実装（ツール定義、ハンドラ、SSE requires_action 処理）を追加した際、Agent 作成側の更新が漏れた。`propose-actions.ts:93-95` のコメントに「tools must be registered on the Agent」と明記しているにもかかわらず、`createAgent` への反映が行われなかった。`customTools` パラメータは `createBoundSession` に渡されているが、SDK の session-level tools 未サポートにより実効性がない。

#### 影響範囲

| 箇所 | 同じ問題あり | 対応 |
|------|------------|------|
| actions.ts:createAgent | Yes — tools 配列に custom tool なし | 本修正で対応 |
| propose-actions.ts:startPropose | No — customTools は渡している（SDK 未対応で効果なし） | 不要 |

### 技術的原因 (Bug 2)

#### 直接原因

`workspace-client.tsx:468-470` の `connectStream()` + `setSelectedManagedSessionId()` が propose 完了ハンドラ内に存在し、チャット画面への遷移を発火する。

#### 根本原因

PR #10 で「propose 起動後にリクエスト詳細画面に留まる」修正を入れたが、PR #11 の merge 時にコンフリクト解消で該当行が復活した。

#### 影響範囲

| 箇所 | 同じ問題あり | 対応 |
|------|------------|------|
| workspace-client.tsx:428-429 (bootstrap) | No — bootstrap は chat 遷移が期待動作 | 不要 |
| workspace-client.tsx:357-362 (session create) | No — 通常セッション作成も chat 遷移が期待動作 | 不要 |

## プロセス的原因

### 検出すべきだったフェーズ

- [x] code-review（実装段階で検出可能だった）— Bug 1: tools 配列の completeness チェック
- [x] code-review（実装段階で検出可能だった）— Bug 2: merge conflict resolution のレビュー

### レビュー観点の分析

| 対象 | ファイル | 該当観点の有無 | 詳細 |
|------|---------|-------------|------|
| code-review checklist | `checklist.md` | なし → ギャップ | 「API クライアントに渡すパラメータの完全性」「新規 tool/resource の全登録箇所確認」の観点がない |
| spec-review criteria | `review-criteria.md` | あり → 見逃し | 「暗黙の要件（エラーケース、境界条件、権限チェック）が考慮されているか」は既存だが、tool registration は暗黙的すぎて検出されなかった |
| rules | `.claude/rules/` | なし → ギャップ | merge conflict resolution の検証ルールなし |

### 改善アクション

| アクション | 対象ファイル | 追加内容 | ステータス |
|-----------|------------|---------|----------|
| Custom Tool/Resource 登録の完全性チェック追加 | checklist.md | 新規 tool 追加時に Agent の tools 配列への登録確認 | proposed |
| merge conflict resolution のレビュー観点追加 | learned-patterns.md | conflict resolution で意図的に削除した行が復活するパターン | proposed |
