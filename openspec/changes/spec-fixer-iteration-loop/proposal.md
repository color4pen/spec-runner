## Why

PR #22 で spec-review セッションを実装したが、`needs-fix` を返した時点でパイプラインは停止する暫定実装になっている。openspec-workflow 本来の挙動は、spec-fixer がレビュー指摘を読んで change folder を修正し、新しい spec-review セッションで再評価する **iteration ループ** で完結することにある。

このループは spec-review だけでなく code-review でも同形なので、いま spec-fixer を実装することで loop プリミティブを Pipeline 層に確立し、後続の implementer / code-review で再利用できる構造を作る。同時に、PR #22 で表面化した「同一 Agent を異なる role で再利用すると system prompt と user message が矛盾する」問題（ADR-20260429-positioning-vs-gsd-and-openspec の Managed Agents 制約）に対し、spec-fixer 専用 Agent を新設して構造的に回避する。

## What Changes

- **Pipeline 層に `runLoopUntil` プリミティブ追加** — `runLoopUntil(state, deps, { body, evaluator, maxIterations, onExceeded })` で「ある verdict になるまで body を反復」を表現可能にする。spec-review の自動修復ループおよび将来の code-review ループで再利用する。
- **spec-fixer 専用 Agent 新設** — `specrunner init` が propose Agent と spec-fixer Agent を別々に作成する。spec-fixer は role-specific system prompt（修正のみ、レビュー禁止）を持ち、Custom Tools は持たない（`register_branch` を含めない）。
- **config schema 拡張** — `config.agents.{propose, specReview, specFixer}` 構造を導入。既存 `config.agent.id` は backward-compat のため残し、未設定時のフォールバックとして使う（deprecated）。
- **`config.pipeline.maxRetries` 追加** — iteration loop の上限値（既定 2）。
- **`JobState.steps[stepName]` を配列化** — 各 step を `Array<StepResult>` で時系列保持。`StepResult.iteration`（1-origin、必須）を追加。後方互換のため、最終 iteration を返す read API を提供。
- **`runPipeline` リファクタ** — 既存 API を維持しつつ、step + loop を合成可能な内部構造に書き換える。spec-review verdict が `needs-fix` の場合、spec-fixer → spec-review iteration loop に自動的に入る。
- **spec-fixer step 実装** — `src/core/steps/spec-fixer.ts`、`src/prompts/spec-fixer-system.ts` を新設。spec-review-result.md を入力に change folder を修正してブランチに push する。
- **iteration progress stdout** — `[iter N] spec-review verdict: needs-fix → spawning spec-fixer` 等を逐次出力。
- **retry 上限到達時の挙動** — 最終 verdict を `escalation` に統合し、`state.error.code = SPEC_REVIEW_RETRIES_EXHAUSTED` を記録、stdout に `retries exhausted, escalating` を出力。新しい verdict 値は導入しない。

## Capabilities

### New Capabilities
- `pipeline-loop-primitive`: Pipeline 層の汎用 iteration loop（`runLoopUntil`）。body / evaluator / maxIterations / onExceeded を受け、approved / escalation / 上限超過まで反復する。
- `spec-fixer-session`: spec-review-result.md を読んで change folder を修正しブランチに push する spec-fixer セッション仕様。

### Modified Capabilities
- `pipeline-orchestrator`: spec-review needs-fix → spec-fixer → spec-review の iteration loop を `runPipeline` に統合する。`escalation` で loop を抜ける条件、retry 上限到達時の挙動を追加する。
- `agent-environment-bootstrap`: `specrunner init` が propose / spec-fixer の 2 種類の Agent を冪等に作成する。spec-fixer Agent は Custom Tools を持たない不変条件を追加する。
- `cli-config-store`: スキーマに `agents.{propose, specReview, specFixer}` を追加。`config.pipeline.maxRetries` を追加。既存 `config.agent.id` は deprecated だが backward-compat のため保持。
- `job-state-store`: `state.steps[stepName]` を `Array<StepResult>` に変更。`StepResult.iteration` を追加。既存形式（オブジェクト）の状態ファイルは読み込み時に長さ 1 の配列に正規化する。
- `spec-review-session`: spec-review verdict 完了後に runPipeline 側 loop が呼び出される前提を明記する（spec-review 自体の Requirement に変更はないが、loop 連動の整合性のため delta で確認）。

## Impact

- **Code**: `src/core/pipeline.ts`（loop 合成へのリファクタ）、`src/core/loop.ts`（新規、`runLoopUntil`）、`src/core/steps/spec-fixer.ts`（新規）、`src/core/steps/spec-review.ts`（state.steps 配列対応）、`src/prompts/spec-fixer-system.ts`（新規）、`src/init/agent.ts`（propose / spec-fixer の 2 種類化）、`src/config/schema.ts`（agents 構造、maxRetries）、`src/state/types.ts`（StepResult / JobState 配列化）、`src/state/migration.ts`（旧形式 → 配列正規化）。
- **Config schema**: `config.json` の `agents` キー追加、`pipeline.maxRetries` 追加。既存 `agent.id` は残す。
- **State schema**: `steps[stepName]` の型変更（オブジェクト → 配列）。version は据え置きで読み込み層で正規化。
- **Anthropic API**: `client.beta.agents.create` を `specrunner init` 内で 2 回呼ぶ（propose, spec-fixer）。1 回当たりの追加コストは無視できる範囲。
- **Out of scope**: Step interface の汎用化、plateaued / regressing 検出、spec-review 専用 Agent 化、implementer / code-review セッション接続、decision logging。
