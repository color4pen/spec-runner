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
| [ADR-0012-slug-delegation-and-branch-tracking](ADR-0012-slug-delegation-and-branch-tracking.md) | Slug 生成のエージェント委譲と Custom Tool によるブランチ名追跡 | proposed |
| [ADR-20260427-cli-core-pipeline](ADR-20260427-cli-core-pipeline.md) | `specrunner run` propose ステップの構造的決定（polling primary / Custom Tool registry / terminationReason enum） | accepted |
| [ADR-20260429-spec-review-pipeline](ADR-20260429-spec-review-pipeline.md) | Spec-review セッション接続（N-step `runPipeline` / fresh-per-task dispatcher / file-based verdict / `pollUntilComplete` 再利用） | accepted |
| [ADR-20260429-positioning-vs-gsd-and-openspec](ADR-20260429-positioning-vs-gsd-and-openspec.md) | spec-runner = Anthropic 純正 stack の Argo Workflows 相当（openspec-workflow review/学習資産 × GSD fresh-per-task × ant native）。3 列 positioning / スケール耐性軸 / k8s ecosystem 対応 | accepted |
| [ADR-20260429-spec-fixer-iteration-loop](ADR-20260429-spec-fixer-iteration-loop.md) | Pipeline 層 `runLoopUntil` primitive / spec-fixer 専用 Agent (Custom Tools 空) / `agents.{propose, specReview, specFixer}` config / `JobState.steps[name]: StepResult[]` / retry 上限 → `escalation` + `SPEC_REVIEW_RETRIES_EXHAUSTED` | accepted |
| [ADR-20260429-step-and-agent-class-architecture](ADR-20260429-step-and-agent-class-architecture.md) | Step / Agent / Pipeline のクラス境界（D1〜D10）。Step interface + StepExecutor + Pipeline state machine + AgentDefinition per-role + EventBus + JobStateStore + StepRun[] | proposed |
| [ADR-20260429-module-architecture-style](ADR-20260429-module-architecture-style.md) | Modular Monolith + Functional Core, Imperative Shell + Hexagonal-lite + tactical DDD（Aggregate / Repository / Value Object / Domain Event）。core/ adapter/ store/ port/ の境界 | proposed |
| [ADR-20260429-cicd-architecture-inspirations](ADR-20260429-cicd-architecture-inspirations.md) | Argo Workflows / Tekton / Temporal / GitHub Actions / Dagster からの転用パターンと採用ロードマップ。不採用パターンの正典化 | proposed |
| [ADR-20260429-step-abstraction-implementation](ADR-20260429-step-abstraction-implementation.md) | Step interface (plain TS) + StepExecutor class + Pipeline + Transition table + EventBus 予約席 + JobStateStore + StepRun[] 後方互換 normalization + core/adapter/store/port モジュール境界。設計 ADR D1-D9 の実装決定と Known Design Debt | accepted |
| [ADR-20260430-verification-cli-resident-step](ADR-20260430-verification-cli-resident-step.md) | Step を `kind: "agent" \| "cli"` discriminated union に変更し、verification を agent を呼ばない CLI-resident step として表現する。null agent / executor 分岐 を却下 | accepted |
| [ADR-20260430-implementer-build-fixer-separation](ADR-20260430-implementer-build-fixer-separation.md) | implementer と build-fixer を独立 Agent として分離する。PR #22 の system prompt + user message 矛盾 anti-pattern を SDK 制約上回避するため、単一 Agent + role 切替を却下 | accepted |
