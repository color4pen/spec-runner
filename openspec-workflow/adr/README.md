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
| [ADR-20260430-code-review-fixer-agent-design](ADR-20260430-code-review-fixer-agent-design.md) | code-review / code-fixer の Agent 設計判断（agent 内 `git diff` で観察 / `parseReviewVerdict` 共通 helper + wrapper 維持 / `completionVerdict: "approved"` 明示記述 / executor から `buildFindingsPath` を排除し `step.resultFilePath` に一本化） | accepted |
| [ADR-20260430-pr-create-step-design](ADR-20260430-pr-create-step-design.md) | pr-create step 設計（kind=cli 採用 / 既存 PR 検出冪等性 / base branch main 固定 / request.md ベース PR body 生成 / 失敗時即 escalation / transition 削除を 1 PR で完結） | accepted |
| [ADR-20260430-external-dependency-policy](ADR-20260430-external-dependency-policy.md) | SpecRunner 外部依存方針（node/bun/git/openspec 必須 / gh CLI 不要・GitHubClient port で代替 / operational tooling では LLM 不使用） | accepted |
| [ADR-20260501-cli-finish-command](ADR-20260501-cli-finish-command.md) | `specrunner finish` 設計判断 D1-D9（archive PR 経由 / gh CLI 継続 / LLM auto-recovery 不採用 / `merged/` 採用 / `archived` 新設 / 入力解決 3 段階 / PR 状態 6 種正規化 / spawn wrapper 流用 / `JobStatus` location 確定） | superseded（finish-redesign 1-PR モデルへ転換 / D1・D4 廃止、D2・D3・D5-D9 は新 ADR に引継ぎ予定） |
| [ADR-20260502-finish-1pr-model](ADR-20260502-finish-1pr-model.md) | `specrunner finish` を 1-PR モデルに転換。archive 操作を feature branch のコミットに乗せ feature PR 1 本のみで main に反映。Phase 0 pre-flight 8 項目 + slug を schema レベル canonical 化（RequestInfo.slug / getJobSlug helper）+ register_branch tool に slug 連動 + ps SLUG 列追加 | accepted |
| [ADR-0013-remove-session-timeout](ADR-0013-remove-session-timeout.md) | step session の wall-clock timeout を完全撤廃し、終端は出口戦略（idle+end_turn / SSE disconnect / stop_reason / maxIterations / 手動 cancel）に一本化。`SESSION_TIMEOUT` 型撤廃 + lazy migration / config silently ignore / delta は REMOVED + MODIFIED 構成 | accepted |
| [ADR-20260505-agent-runner-port-and-local-runtime](ADR-20260505-agent-runner-port-and-local-runtime.md) | AgentRunner port 1 つに agent step lifecycle を集約、ManagedAgentRunner / ClaudeCodeRunner の 2 adapter で managed / local runtime を切替。adapter rename (anthropic→managed-agent) / register_branch を adapter 移管 / branch CLI canonical / config.runtime field / 4 Phase 段階リリース | accepted |
| [ADR-20260506-fix-local-runtime-and-finish-preflight](ADR-20260506-fix-local-runtime-and-finish-preflight.md) | Local runtime 初回 dogfood で表面化した 4 件のバグ修正。completionVerdict fallback / setsBranch 宣言的フラグ / review-verdict parser tolerance / MERGED PR の UNKNOWN bypass | accepted |
| [skill-20260506-propose-openspec-cli-and-step-model-config](skill-20260506-propose-openspec-cli-and-step-model-config.md) | propose step の openspec CLI 対応（スキーマ駆動 artifact 生成で delta spec 省略を構造的に防止）+ opusplan パターン model 選定（Opus で設計/レビュー、Sonnet で実装/修正）+ AgentStep.maxTurns 宣言的設定 | proposed |
