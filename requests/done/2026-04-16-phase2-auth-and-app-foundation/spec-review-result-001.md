# Spec Review Result: phase2-auth-and-app-foundation — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 6.8 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (初回)
- **agents**: architect, spec-reviewer, security-reviewer
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 1

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 7 | 0.30 | 2.10 |
| consistency | 6 | 0.25 | 1.50 |
| feasibility | 8 | 0.20 | 1.60 |
| security | 6 | 0.15 | 0.90 |
| maintainability | 7 | 0.10 | 0.70 |
| **Total** | | | **6.80** |

### カテゴリの観点

| Category | 評価観点 | 主担当エージェント |
|----------|---------|-----------------|
| completeness | 要件の網羅性、受け入れ基準の充足、仕様の漏れ | spec-reviewer |
| consistency | 既存 spec との整合性、後方互換性、用語統一 | spec-reviewer, architect |
| feasibility | 実現可能性、依存関係、工数見積の妥当性 | architect |
| security | 認証・認可、入力検証、脅威モデル（spec レベル） | security-reviewer |
| maintainability | 仕様の明確性、将来の拡張容易性、アンチパターン回避 | architect |

### スコアリング基準

| Score | 意味 |
|-------|------|
| 1-3 | 重大な仕様不備あり。設計やり直し相当 |
| 4-5 | 仕様に欠落や矛盾あり。実装前に修正必須 |
| 6 | 最低限の記述。抜けやあいまいさが残る |
| 7 | 良好。実装に進める水準（**承認閾値**） |
| 8 | 優良。網羅性・整合性ともに安定 |
| 9-10 | 卓越。模範的な仕様記述 |

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | consistency | tasks.md:14 / design.md:40 | tasks.md の Task 2.1 で `@auth/drizzle-adapter` をインストールしているが、design.md は JWT 戦略を採用し Drizzle Adapter は不要と明記している。矛盾する依存関係が実装時の混乱を招く | tasks.md の Task 2.1 から `@auth/drizzle-adapter` を削除する。JWT 戦略では Auth.js の DB アダプタは不要。ユーザー upsert は signIn コールバック内で Drizzle ORM を直接使用する |
| 2 | MEDIUM | security | specs/github-oauth/spec.md | OAuth scope が `repo`（全リポへのフルアクセス）と記載されているが、リポ一覧取得のみなら過剰。scope の選定根拠と、将来の GitHub App 移行パスが仕様レベルで未記載 | github-oauth/spec.md の GitHub OAuth Login requirement に scope 選定の根拠を追記する: Managed Agents Session のリポマウントに write 権限が必要なため `repo` scope を採用。将来的に GitHub App（fine-grained permissions）への移行を検討する旨を Risks に明記する |
| 3 | MEDIUM | security | specs/github-oauth/spec.md | OAuth トークンの失効・取り消し時の挙動が未定義。GitHub OAuth App トークンはデフォルトで無期限だが、ユーザーが GitHub 設定からトークンを取り消した場合のエラーハンドリングが仕様にない | github-oauth/spec.md に「Token invalidation」シナリオを追加: GitHub API 呼び出しが 401 を返した場合、ユーザーに再認証を促すフローを定義する |
| 4 | MEDIUM | completeness | specs/app-layout/spec.md | リポジトリ一覧のページネーションが未定義。GitHub API はデフォルトで 30 件/ページを返すが、リポが多いユーザーへの対応が仕様にない | app-layout/spec.md の Repository List Page にページネーション（またはスクロールによる追加読み込み）のシナリオを追加する。最低限「GitHub API のページネーションに対応し、全リポジトリを取得する」旨を記載する |
| 5 | MEDIUM | security | specs/session-binding/spec.md | createBoundSession() の入力値（repo owner/name）のバリデーションが未定義。悪意のある値の注入リスクがある | session-binding/spec.md に入力バリデーション要件を追加: repo パラメータが `owner/repo-name` の形式に合致すること、owner と repo-name が英数字・ハイフン・アンダースコアのみで構成されることを検証する |
| 6 | MEDIUM | consistency | specs/session-management/spec.md:4 | 「Session State Tracking: track sessions in the user_sessions database table instead of server-side memory」と記載されているが、Phase 1 はサーバーサイドメモリでセッションを追跡していない（SDK の sessions.list() を直接呼び出している）。不正確な記述が実装者を誤解させる | session-management/spec.md の記述を「instead of relying solely on the Managed Agents API for session listing」に修正する |
| 7 | LOW | completeness | specs/app-layout/spec.md | GitHub API のレート制限（5000 req/hour for authenticated）に達した場合のエラーハンドリングが未定義 | app-layout/spec.md に GitHub API エラーハンドリングのシナリオを追加: レート制限時にユーザーにメッセージを表示し、リトライ可能時刻を示す |
| 8 | LOW | security | specs/database/spec.md | SQLite の外部キー制約は PRAGMA foreign_keys = ON を接続時に有効化する必要があるが、仕様に記載がない | database/spec.md の Database Connection requirement に「接続時に PRAGMA foreign_keys = ON を実行する」シナリオを追加する |
| 9 | LOW | completeness | specs/database/spec.md | users.id と user_sessions.id の ID 生成戦略（UUID / CUID / nanoid 等）が未定義 | database/spec.md の各テーブル定義に ID 生成戦略を明記する。推奨: crypto.randomUUID() による UUID v4 |
| 10 | LOW | consistency | design.md / ADR-20260416-app-as-orchestrator.md | ADR のフェーズ計画では Phase 2a（interrupt + requires_action）→ 2b（Custom Tools）→ 2c（GitHub OAuth）の順だが、本 request は 2c を先に実施する。フェーズ順序の変更理由が未記載 | design.md の Context セクションに、Phase 2a/2b より先に認証基盤を整備する理由（認証がないとデプロイ・他者利用ができず、以降の機能開発の前提条件となるため）を追記する。または ADR のフェーズ計画を更新する |

## Iteration Comparison

（初回のため該当なし）

### Improvements
- （該当なし）

### Regressions
- （該当なし）

### Unchanged Issues
- （該当なし）

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.80 | needs-fix | 初回レビュー |

## Convergence

- **trend**: — (初回)
- **recommendation**: continue

### 停滞検出ルール

- `plateaued` (前回との差が ±0.3 以内) が **2 iteration 連続** した場合、`verdict` を `escalation` にする
- `regressing` (前回より 0.3 以上低下) が 1 回でも発生した場合、即 `escalation` を検討する

## Summary

全体として仕様の構成は良好で、受け入れ基準のカバレッジも十分。feasibility は高く、技術選定も ADR に裏付けられている。ただし、tasks.md と design.md の間で Drizzle Adapter に関する矛盾（HIGH #1）があり、これは実装時に混乱を招くため修正が必須。セキュリティ面では OAuth scope の根拠明記、トークン失効時のハンドリング、入力バリデーションの定義が不足している（MEDIUM #2, #3, #5）。completeness ではリポ一覧のページネーションが欠落（MEDIUM #4）。これらの MEDIUM 指摘を解消すれば承認水準（7.0）に到達する見込み。
