# ADR-20260424: セッションパイプライン設計 — 4セッション直列モデル + Custom Tools インターフェース

## ステータス

提案

## コンテキスト

ADR-20260416 で「SpecRunner アプリがオーケストレーターを担う」方針を決定した。本 ADR はその具体化として、openspec-workflow の request-execute パイプラインを Managed Agents 上でどう分割・実行するかを定める。

### 調査で判明した制約

#### Managed Agents SDK（v0.91.0 / 2026-04-23 時点）

- **Beta ヘッダー**: `managed-agents-2026-04-01`（変更なし）
- **Toolset**: `agent_toolset_20260401` — Bash, Read, Write, Edit, Glob, Grep, Web Fetch, Web Search の **8 ツールのみ**。Agent/Task ツールは含まれない
- **Custom Tools**: エージェント作成時に定義。エージェントが呼ぶと SSE で `agent.custom_tool_use` イベント → セッションが `idle`（`requires_action`）に遷移 → アプリが `user.custom_tool_result` を返す → セッション再開
- **Multiagent Sessions**: coordinator → callable_agents の 1 段階委任が可能だが **Research Preview**。事前登録必須、サブエージェントがさらにサブエージェントを呼ぶことは不可
- **Memory Stores**: public beta（v0.91.0）。セッション横断の知識保持が可能。`/mnt/memory/` にマウントされ、標準ファイルツールでアクセス
- **セッション起動制限**: org 単位 300 create/min（レート）+ 総数制限あり

#### openspec-workflow の設計特性

- request-execute は **10+ ステップ** のパイプラインで、各ステップを Agent ツール（Task）で **独立コンテキスト** のサブエージェントとして起動
- **Author-Bias Elimination**: 実装者（implementer）とレビュアー（code-reviewer）のコンテキスト分離が品質保証の核。1 セッションに統合すると崩れる
- **ファイル経由 verdict**: レビュー結果は review-feedback.md 等のファイルとして出力。オーケストレーターは verdict 行のみ読む
- 各サブエージェントのインターフェースが明確（入力: prompt / ファイル、出力: ファイル）→ Managed Agents セッションへの置換が構造的に可能
- request-create は対話的な要件ヒアリングが前提。Claude Code ではコマンド実行前の会話がコンテキストとして機能しており、Managed Agents の非同期モデルとのギャップが大きい

## 決定

### 1. 4 セッション直列モデル

パイプラインを 4 セッションに分割する。

```
セッション 1: 設計（propose）
  入力: request 内容（メッセージ）
  処理: openspec-propose 相当。change folder 生成
  出力: proposal.md, specs/, design.md, tasks.md を branch に push

セッション 2: 設計レビュー（spec-review）
  入力: change folder のパス（メッセージ）
  処理: spec-review 相当。architect + spec-reviewer
  出力: spec-review-result.md を branch に push。verdict を構造化して返す

セッション 3: 実装（implementer）
  入力: tasks.md のパス（メッセージ）
  処理: tasks.md に基づいてコード実装
  出力: 実装コードを branch に push

セッション 4: 実装レビュー（code-review + verification）
  入力: 実装済みコードの差分情報（メッセージ）
  処理: verification（build/test/lint）+ code-review 相当
  出力: review-feedback.md を branch に push。verdict を構造化して返す
```

### 2. Custom Tools によるエージェント-アプリ間インターフェース

エージェントが spec-runner の機能を呼び出す手段として Custom Tools を定義する。
エージェントの tools 配列に標準ツール + Custom Tools を含める。

#### 仕組み

```
エージェントが Custom Tool を呼ぶ
  ↓
SSE: agent.custom_tool_use イベント
  ↓
SSE: session.status_idle (stop_reason: requires_action)
  ↓
spec-runner がツールを実行（DB 操作、GitHub API 等）
  ↓
POST: user.custom_tool_result を返す
  ↓
セッション再開
```

既存の SSE ストリーミング基盤（session-completion-handler.ts）を拡張し、`end_turn` に加えて `requires_action` を処理する。

#### role 別ツール定義

エージェント（role）ごとに使える Custom Tools を制限する。最小権限の原則。

| role | 標準ツール | Custom Tools |
|------|-----------|-------------|
| advisor | ✅ | create_request, start_propose, notify_user |
| propose | ✅ | submit_artifacts |
| spec-review | ✅ | submit_verdict |
| implementer | ✅ | submit_pr, report_error |
| code-review | ✅ | submit_verdict, request_fix |
| fixer | ✅ | report_fix_complete |

Custom Tools の具体的なスキーマ定義（input_schema, description）は別途ツールカタログとして設計する。

### 3. advisor role（要件定義セッション）の追加

request-create の前段階として、ユーザーとの対話的な要件定義を行う advisor セッションを追加する。

```
ユーザー ←→ advisor セッション（Managed Agents、リポジトリマウント済み）
              UI の既存チャット機能で対話
              要件が固まったら → create_request ツールで request 保存
              → start_propose ツールで propose セッション起動
```

- Managed Agents セッションを使う（Messages API ではない）。既存の UI チャット機能をそのまま活用できる
- リポジトリがマウントされているため、コードを読んで要件を構造化できる
- idle 中は課金されないため、ユーザーが考える時間があっても問題ない
- openspec-workflow で「Claude Code との会話 → /request-create」だった体験を再現する

### 4. オーケストレーションフロー

```
spec-runner (Next.js)
  │
  ├─ advisor セッション（対話）
  │  ユーザーと要件を整理
  │  → create_request ツール → DB に request 保存
  │  → start_propose ツール → セッション 1 起動
  │
  ├─ セッション 1: 設計（バックグラウンド）
  │  → 完了検知（SSE idle + end_turn）
  │  → branch に change folder が push されたか確認
  │  → ユーザーに tasks.md を提示（advisor 経由 or UI 直接）
  │
  ├─ セッション 2: 設計レビュー
  │  → verdict 判定
  │  → approved: セッション 3 へ
  │  → needs-fix: spec-fixer セッション → セッション 2 再実行（最大 2 回）
  │  → escalation: ユーザー通知
  │
  ├─ セッション 3: 実装
  │  → 完了検知
  │  → コードが push されたか確認
  │
  ├─ セッション 4: 実装レビュー
  │  → verdict 判定
  │  → approved: PR 作成
  │  → needs-fix: code-fixer セッション → セッション 4 再実行（最大 2 回）
  │  → escalation: ユーザー通知
  │
  └─ PR 作成 → request status を completed に遷移
```

### 5. セッション role 拡張

現行の role 定義を拡張する。

```typescript
// 現行
type SessionRole = 'implementer' | 'reviewer' | 'fixer' | 'explorer' | 'bootstrap';

// 拡張後
type SessionRole =
  | 'bootstrap'      // 既存: リポジトリ初期化
  | 'advisor'        // 新規: 要件定義の対話相手
  | 'propose'        // 新規: 設計（change folder 生成）
  | 'spec-review'    // 新規: 設計レビュー
  | 'implementer'    // 既存: 実装
  | 'code-review'    // 新規: 実装レビュー + verification
  | 'fixer'          // 既存: 修正（spec-fixer / code-fixer / build-fixer）
  | 'explorer';      // 既存: 探索
```

### 6. コンテキスト分離の保証

| 境界 | 分離の目的 |
|------|-----------|
| advisor → propose | 要件定義者 ≠ 設計者 |
| propose → spec-review | 設計者 ≠ レビュアー |
| spec-review → implementer | レビュアー ≠ 実装者（author-bias elimination の核心） |
| implementer → code-review | 実装者 ≠ レビュアー |

openspec-workflow と同じコンテキスト分離が、セッション分割により自然に成立する。

## 理由

1. **セッション数の最小化**: 固定骨組みの 10 ステップを 4 セッション + advisor に集約。同時起動は常に 1。リトライ含めても 6-8 で収まる
2. **コンテキスト分離の維持**: openspec-workflow の author-bias elimination がセッション分割で自然に実現される
3. **Custom Tools がエージェントの行動範囲を定義**: role ごとに使えるツールを制限することで、最小権限の原則が自然に成立する。ツール定義がそのまま spec-runner の公開インターフェースになる
4. **既存基盤の活用**: SSE ストリーミング（session-completion-handler.ts）を `requires_action` 対応に拡張するだけで Custom Tools のハンドリングが実現できる。UI チャット機能は advisor セッションでそのまま使える
5. **段階的拡張**: Phase 1 は固定骨組みのみ。opt-in エージェントや Memory Stores（review-lessons 蓄積）は後から追加可能
6. **Multiagent Sessions への移行パス**: GA 後、propose + spec-review を 1 multiagent session に統合できる。アプリ側のセッション管理コードを変えるだけ

## 却下した代替案

- **1 セッションで全工程**: コンテキスト分離が崩れる。author-bias elimination を犠牲にする品質低下は許容できない
- **ステップごとに 1 セッション（10+ セッション）**: openspec-workflow の忠実な再現だが、セッション起動数制限に抵触。起動コスト・待ち時間も大きい
- **Multiagent Sessions 依存**: Research Preview で本番利用不可。GA 時期不明
- **2 セッション（設計+レビュー / 実装+レビュー）**: レビュアーと被レビュー者のコンテキスト分離が不十分
- **要件定義を Messages API で実装**: 新しいチャット基盤の構築が必要。既存の Managed Agents セッション + UI チャット機能で実現可能

## 失敗時の方針（Phase 1）

- **needs-fix**: fixer セッション起動 → 再レビュー。最大 2 回リトライ
- **escalation**: ユーザーに通知して判断を委ねる。自動で救わない
- **セッション terminated / token 切れ**: ユーザーに通知。自動リトライしない
- **エージェントが質問を返した場合**: advisor セッションならユーザーが対話で回答。作業セッションなら UI に通知してユーザー判断

## 未決事項

- **Custom Tools カタログ**: 各ツールの input_schema、description、戻り値の具体的な設計。エージェントが道具として認識できる粒度の定義が必要
- **通知チャネル**: チェックポイントでのユーザー通知手段（UI 表示のみ → Slack / メール / push 通知）。Phase 1 は UI 表示のみ
- **Memory Stores の活用**: review-lessons の蓄積・蒸留ジョブの設計は Phase 2 以降
- **openspec CLI の利用**: セッション環境に `@fission-ai/openspec` は入っているが、SKILL.md の指示をどこまで system prompt に反映するかは設計が必要
- **opt-in エージェントの扱い**: test-case-generator, adr, module-architect, security-reviewer, pattern-reviewer は Phase 2 以降

## 参照

- ADR-20260416-app-as-orchestrator.md — 本 ADR の前提となるオーケストレーション方針
- openspec-workflow README.md — パイプラインの全体構造
- openspec-workflow skills/request-execute/SKILL.md — 固定骨組みと opt-in の定義
- openspec-workflow skills/request-create/SKILL.md — request.md のフォーマットと生成フロー
- Managed Agents Custom Tools — SSE `requires_action` による tool call/result フロー
- Managed Agents Memory Stores — セッション横断の知識保持（`/mnt/memory/`）
