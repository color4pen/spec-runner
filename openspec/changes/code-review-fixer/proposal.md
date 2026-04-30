## Why

PR #36 で SpecRunner pipeline は `propose → spec-review (loop) → implementer → verification (loop) → end` まで自走可能になったが、**implementer の diff に対するコード品質・設計判断・regression 観点の人間相当レビュー**が組み込まれていない。verification は build/test の機械検証であり、コードレビューとは別軸。spec 層には spec-review ↔ spec-fixer の self-correct loop があるのに対し、code 層には review loop が欠けており、設計の対称性も実用的価値も損なわれている。本 request はその欠落を埋め、`AgentStep | CliStep` 判別 union と `LOOP_ERROR_CODES` lookup table という PR #36 で確立した拡張点に新 step 2 種と transition rows を追加するだけで完結させる。

## What Changes

- **新 step `code-review` を追加**（`AgentStep`, `kind: "agent"`, `agent.role: "code-review"`）。verification passed の diff を review し、`review-feedback-NNN.md` に findings + verdict（`approved` / `needs-fix` / `escalation`）を出力する。
- **新 step `code-fixer` を追加**（`AgentStep`, `kind: "agent"`, `agent.role: "code-fixer"`, `capabilities.gitWrite = true`）。`review-feedback-NNN.md` の HIGH/MEDIUM findings を実装 → push する。`resultFilePath = null`、`completionVerdict = "approved"`（spec-fixer / build-fixer と同一 pattern）。
- **`STANDARD_TRANSITIONS` 書き換え**: `verification --passed→ end` を **削除**し、以下を追加。
  - `verification --passed→ code-review`
  - `code-review --approved→ end`
  - `code-review --needs-fix→ code-fixer`
  - `code-review --escalation→ escalate`
  - `code-fixer --approved→ code-review`
  - `code-fixer --error→ escalate`
- **`LOOP_ERROR_CODES` 拡張**: `code-review` エントリ（`CODE_REVIEW_RETRIES_EXHAUSTED` + hint）を追加。`Pipeline.loopNames` 既定値を `["spec-review", "verification", "code-review"]` に拡張。
- **`StepName` union 拡張**: `"code-review" | "code-fixer"` を追加。
- **System prompt 新規追加**: `src/prompts/code-review-system.ts`（`.claude/rules/review-standards.md` の severity / category / verdict 規約に準拠）と `src/prompts/code-fixer-system.ts`（review-feedback findings に対する code 修正のみ、仕様変更禁止を明示）。
- **共通化**: `parseSpecReviewVerdict` の verdict 抽出 regex を `parseReviewVerdict` 等の共通 helper に抽出し、`code-review` でも再利用する。
- **AgentRegistry / Pipeline 配線**: `init.ts` の `AgentRegistry.fromSteps([...])` と `run.ts` の `Pipeline` 構築 steps Map に新 2 step を追加。

## Capabilities

### New Capabilities

- なし（既存 capability を modify することで完結）

### Modified Capabilities

- `pipeline-orchestrator`: 標準 transition table に code-review / code-fixer の 6 行を追加し、`verification --passed→ end` の暫定行を `verification --passed→ code-review` に置換。`LOOP_ERROR_CODES` に `code-review` エントリを追加。`Pipeline.loopNames` 既定値の拡張。
- `step-execution-architecture`: `AgentStep` 実装として `CodeReviewStep` と `CodeFixerStep` を追加（既存 union への新メンバー追加であり、interface 自体は不変）。各 step の `agent.role`、`resultFilePath` 規約、`parseResult` の verdict 抽出規約を要件化。
- `agent-registry`: registry が `code-review` / `code-fixer` の 2 つの新 Agent role を扱うことを要件化（`AgentRegistry.fromSteps` への新 step 追加で達成）。
- `agent-syncer`: `specrunner init` が新 2 Agent を Anthropic に作成・同期することを要件化。

## Impact

- **Code**: `src/core/step/code-review.ts`（新規）、`src/core/step/code-fixer.ts`（新規）、`src/prompts/code-review-system.ts`（新規）、`src/prompts/code-fixer-system.ts`（新規）、`src/core/pipeline/transitions.ts`（書き換え）、`src/core/pipeline/loop-error-codes.ts`（拡張）、`src/state/schema.ts`（`StepName` 拡張）、`src/cli/init.ts` / `src/cli/run.ts`（配線）、`src/core/step/spec-review.ts`（verdict parser 共通化のための抽出）。
- **Tests**: `tests/unit/step/code-review.test.ts` / `code-fixer.test.ts`（新規）、`tests/unit/core/pipeline/pipeline.transitions.test.ts`（新 transition 追加）、`tests/grep-no-step-name-hardcode.test.ts`（継続 PASS）。
- **Docs / ADR**: `openspec-workflow/adr/` に code-review の入力経路（diff fetch 戦略）と review-feedback format の決定を ADR として追記。
- **Pipeline behavior**: verification passed 後に code-review が必ず実行される（skip option 無し）。max 3 iterations で escalation。
- **Out of scope**: PR 作成 step、学習層（EventBus subscriber）、cost ledger、E2E 実機検証、verification iteration numbering bug 修正。
