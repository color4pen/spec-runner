# Architecture Decision Records (ADR)

このディレクトリには、プロジェクトのアーキテクチャに関する重要な決定を記録します。

## フォーマット

各 ADR は以下の命名規則に従います: `ADR-YYYYMMDD-タイトル.md`

## ADR 一覧

| ADR | 決定 | ステータス |
|-----|------|-----------|
| [ADR-20260416-tech-stack](ADR-20260416-tech-stack.md) | Node.js + Next.js App Router + TypeScript + @anthropic-ai/sdk | 採用 |
| [ADR-20260416-server-actions](ADR-20260416-server-actions.md) | CRUD を Server Actions に移行、API Route は SSE のみ | 採用 |
| [ADR-20260416-git-branch-sharing](ADR-20260416-git-branch-sharing.md) | Session 間のコード共有は Git branch 経由 | 採用 |
| [ADR-20260416-app-as-orchestrator](ADR-20260416-app-as-orchestrator.md) | SpecRunner アプリがオーケストレーターを担う | 採用 |
| [ADR-20260416-sqlite-local-first](ADR-20260416-sqlite-local-first.md) | ローカル開発は SQLite + Drizzle ORM で開始 | 採用 |
| [ADR-20260416-authjs-jwt-strategy](ADR-20260416-authjs-jwt-strategy.md) | Auth.js v5 + JWT セッション戦略 | accepted |
| [ADR-20260416-route-groups-layout](ADR-20260416-route-groups-layout.md) | Route Groups によるレイアウト分離 | accepted |
| [ADR-20260416-session-binding-design](ADR-20260416-session-binding-design.md) | Session 紐付けは DB 主導で管理する | superseded |
| [ADR-20260416-request-centric-schema](ADR-20260416-request-centric-schema.md) | リクエスト中心の3層スキーマへの再設計 | accepted |
| [ADR-0010-bootstrap-for-managed-agents](ADR-0010-bootstrap-for-managed-agents.md) | マネージドエージェント向け Bootstrap 機能 | accepted (D6 superseded) |
| [ADR-0011-bootstrap-session-lifecycle](ADR-0011-bootstrap-session-lifecycle.md) | Bootstrap セッションライフサイクル統合 | accepted |
| [app-20260424-request-create-propose](app-20260424-request-create-propose.md) | Request Create + Propose セッション設計 | proposed |
