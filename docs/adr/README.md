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
