## Why

dogfooding-001 の 3 回目で spec-review が `SPEC_REVIEW_RESULT_NOT_FOUND` で escalate した。RCA の結果、これは prompt 漏れではなく、review 系 step (spec-review / code-review) の出口契約が分裂している構造的バグだった。Managed Agents (remote workspace) では agent が origin に push しなければ executor が結果を fetch できないが、prompt は push を指示せず、code-review.ts は `read-only` を宣言する一方 prompt は `MUST commit and push` と要求し、error hint の filename と agent が書く filename が divergence していた。openspec-workflow（claude-code, local execution）の出口戦略を Managed Agents 制約と整合させる修正が必要。

## What Changes

- `SPEC_REVIEW_SYSTEM_PROMPT` / initial message に「result file 書き出し後に commit + push、push 完了まで end_turn しない」指示を追加（propose / fixer 系と同じ shape の `buildGitPushInstruction(branch)` を組み込む）。
- **BREAKING (内部契約)**: `code-review.ts` の `capabilities` を `{}` から `{ gitWrite: true }` に変更。コメントを「source code は read-only / review-feedback file は gitWrite 必須」へ訂正。
- error hint factory `specReviewResultNotFoundError` / 新規 `codeReviewResultNotFoundError` を **iteration を引数に取る** 形に変更し、filename suffix `-{NNN}` (3 桁ゼロ埋め) を動的計算。
- review 系 result filename を `{step}-result-{NNN}.md` に統一: spec-review → `spec-review-result-{NNN}.md`、code-review → `review-feedback-{NNN}.md`。executor の verify 側も同じ規約で fetch する。
- `implementer-system.ts` に「stage 3: implementer (you) → verification → code-review」の workflow context を positive framing で追記（役割越境抑止）。
- ADR `openspec-workflow/adr/ADR-20260430-review-exit-contract-managed-agents.md` を生成し、openspec-workflow からの逸脱（agent-driven push）を Managed Agents 制約で正当化。

## Capabilities

### New Capabilities

- `agent-output-contract`: review 系 agent (spec-review, code-review) が origin branch に result file を delivery するための出口契約。result filename 規約 `{step}-result-{NNN}.md`、capability 宣言 (`gitWrite: true`)、prompt 指示 (write → commit → push → end_turn)、error hint factory の iteration 引数化、executor 側 verify との filename suffix 一致を含む。Managed Agents の workspace 不可視を前提とした agent-driven push 方式を正規化する。

### Modified Capabilities

（なし — 既存 spec のうち `spec-review-session` 等は session lifecycle 単位で書かれており、出口契約という横断的観点は新規 capability として独立させたほうが整合する）

## Impact

- **修正対象コード**:
  - `src/prompts/spec-review-system.ts` — system prompt / initial message に commit + push 指示追加
  - `src/prompts/implementer-system.ts` — workflow context (stage 3 / verification 連携) 追記
  - `src/core/step/code-review.ts` — `capabilities: { gitWrite: true }`、コメント訂正、error hint 呼び出しに iteration 渡し
  - `src/core/step/spec-review.ts` — error hint 呼び出しに iteration 渡し
  - `src/errors.ts` — `specReviewResultNotFoundError` / `codeReviewResultNotFoundError` を iteration 引数化
  - `src/core/step/executor.ts` — result file fetch の filename construction が iteration suffix と一貫していることを確認・必要なら修正
- **新規生成物**:
  - `openspec-workflow/adr/ADR-20260430-review-exit-contract-managed-agents.md`
  - `openspec/changes/review-exit-contract/specs/agent-output-contract/spec.md`
- **テスト影響**: 既存 491 tests は regression 0 を維持。本変更に関する must シナリオ (test-cases.md) を追加実装。
- **dogfooding 影響**: `bun bin/specrunner.ts run /tmp/dogfooding-001-request.md` が end-to-end PASS（PR 作成まで完走）するようになる。
- **依存・契約**: openspec-workflow との関係を ADR で明示（暗黙的逸脱 → 正当化された明示的逸脱）。Anthropic Managed Agents の workspace 制約に依存。
