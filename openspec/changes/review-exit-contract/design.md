## Context

SpecRunner は Anthropic Managed Agents (remote workspace) を使う pipeline orchestrator で、各 step (propose / spec-review / implementer / verification / code-review / pr-create) を agent session として実行する。設計の参照実装は openspec-workflow（claude-code, local execution）であり、agent と orchestrator が同じ filesystem を共有する前提で「review 系 agent は local file write のみ、orchestrator が一括 commit/push」というモデルになっている。

SpecRunner は Managed Agents を使うため orchestrator が agent の workspace に直接アクセスできず、result file を origin に届けるには agent 自身が push する必要がある。propose / fixer / implementer 系は既に `gitWrite: true` + `buildGitPushInstruction(branch)` で agent push する形になっていたが、**review 系 (spec-review, code-review) だけ openspec-workflow の意図（read-only reviewer）をコメントだけコピーして prompt と矛盾させていた**。

dogfooding-001 の 3 回目で spec-review が `SPEC_REVIEW_RESULT_NOT_FOUND` で escalate し、構造的バグとして RCA された:

1. spec-review-system.ts に commit/push 指示が無い → agent は file 書いて end_turn → origin に届かず executor 404
2. code-review-system.ts は「MUST commit and push」要求、code-review.ts は `capabilities: {}` でコメント `// No capabilities: gitWrite is intentionally absent (read-only reviewer)` → 真逆の宣言
3. error hint は `spec-review-result.md` (suffix なし)、agent は `spec-review-result-001.md` (suffix 付き) を書く → divergence

本 design はこの 3 つの divergence を **review 系の出口契約という単一の正規化されたモデル**で吸収し、openspec-workflow からの逸脱を ADR で正当化する。

**Constraints**:
- Anthropic Managed Agents の workspace は orchestrator から不可視（custom_tool で content を返す方式は別アーキテクチャ）。
- 既存 491 tests は regression 0 を維持する（`pipeline-context.md` の code-review emphasis）。
- 修正は最小修正方針 — agent push を追加するだけで custom_tool 方式への大改造は別 ADR の選択肢として残す。

**Stakeholders**: review 系 agent 開発者、executor (verify/fetch) 開発者、ADR を将来読む後任、dogfooding を回す本人。

## Goals / Non-Goals

**Goals:**

- review 系 agent (spec-review, code-review) が **必ず origin branch に result file を push してから end_turn する** ことを capability + prompt + error hint の 3 層で整合させる。
- result filename を `{step}-result-{NNN}.md` 形式（3 桁ゼロ埋め iteration suffix）に統一し、agent / executor / error hint 全層で同一規約を共有する。
- `code-review.ts` の capability 宣言と prompt 要求の矛盾を解消する。
- openspec-workflow からの逸脱（agent-driven push）を ADR で明示的に正当化し、後任が「read-only reviewer」コメントを再コピーしないようにする。
- implementer の役割越境抑止（stage 3 として verification → code-review に渡す）を prompt で positive framing する。

**Non-Goals:**

- custom_tool で content を返す方式への移行（ADR の alternative として記録するのみ）。
- review 系 agent が source code を modify できるようにすること（source code は依然として read-only / prompt で禁止）。
- openspec-workflow 側の修正（参照実装は claude-code 前提のまま、SpecRunner が逸脱する側）。
- `spec-fixer` / `code-fixer` の出口契約変更（既に gitWrite + push 指示がある前提で本 request 範囲外。ただし監査として確認）。
- review 系の iteration 上限・収束ロジック変更（review-standards.md の規約に従うのみ）。

## Decisions

### Decision 1: agent-driven push を review 系の正規モデルとする

**選択**: review 系 agent (spec-review, code-review) に `capabilities: { gitWrite: true }` を付与し、prompt に `buildGitPushInstruction(branch)` を組み込んで「write → commit → push → end_turn」を必須化する。

**理由**: Managed Agents の workspace 不可視という制約下では、orchestrator-driven commit は技術的に不可能。custom_tool 経由で content を返す方式も成立するが、新たな tool 設計が必要で本 request の最小修正方針を逸脱する。propose / fixer 系は既に同じモデルを採用しており、review 系だけ例外にする理由が無い。

**代替案と却下理由**:
- (A) custom_tool で content を返し executor が commit: tool 設計、binary 不安定性、debug 性低下のため別 ADR の選択肢として残す。
- (B) push 後 verify をやめて agent の self-report のみ信頼: error hint の divergence は解消できないし、push 漏れの検出手段が消える。却下。
- (C) openspec-workflow の参照実装に合わせて orchestrator commit: workspace 不可視で実装不能。

### Decision 2: result filename 規約を `{step}-result-{NNN}.md` に統一

**選択**: spec-review → `spec-review-result-{NNN}.md`、code-review → `review-feedback-{NNN}.md`。`{NNN}` は iteration の 3 桁ゼロ埋め (`001`, `002`, ...)。code-review は既存命名 `review-feedback` を維持し、suffix `-{NNN}` のみ規約化。

**理由**: 既存 code-review が `review-feedback` を使っており全面 rename は影響大。一方 suffix の有無 / 桁数だけは agent / executor / error hint の 3 層で統一可能で、最小修正で divergence を消せる。

**実装注記**: spec.md Requirement "user message construction MUST embed `buildGitPushInstruction(branch)`" を満たすため、`buildCodeReviewInitialMessage` に `branch` 引数を追加し `buildGitPushInstruction(branch)` を user message に embed する。`code-review.ts:buildMessage`（または相当箇所）で `state.branch` / `deps.branch` を取得して渡す。

**代替案と却下理由**:
- 全面 rename して `code-review-result-{NNN}.md` に揃える: 既存 prompt / executor / archive log への影響が大きく、本 request の scope を膨張させる。

### Decision 3: error hint factory を iteration 引数化

**選択**: `specReviewResultNotFoundError(slug, branch, iteration)` / `codeReviewResultNotFoundError(slug, branch, iteration)` のシグネチャに変更し、内部で `String(iteration).padStart(3, '0')` を使って suffix を計算。呼び出し側 (`src/core/step/spec-review.ts`, `src/core/step/code-review.ts`) は現在の iteration を渡す。

**理由**: hardcode で suffix を外していたのが divergence の直接原因。factory 関数で動的計算することで agent が書く filename と hint の filename が必ず一致する。test も `iteration=1, 2, 10` で hint string snapshot を検証できる。

**SSOT**: `{step}-result-{NNN}.md` のファイル名 suffix 規約は `agent-output-contract` capability が SSOT。`spec-review-session` capability は session lifecycle 単位で書かれており、この suffix 規約については `agent-output-contract` への cross-reference とする（`spec-review-session` 側の Requirement を重複定義しない）。本 PR では `spec-review-session` capability 側を MODIFIED delta として書き換えるのは scope 拡張にあたるため、SSOT 宣言のみとする。

**代替案と却下理由**:
- 共有 const に suffix 規約を切り出し各所で format: factory 関数に閉じ込める方が test と review-time の認知負荷が低い。
- iteration を含めず suffix glob (`spec-review-result-*.md`) で match: hint message としての具体性が低下し、agent が「どの iteration の file を書けばいいか」を判断しにくくなる。

### Decision 4: capability 宣言のコメントを「source code は read-only / review-feedback file は gitWrite」と訂正

**選択**: `code-review.ts` のコメントを以下に書き換える:
```ts
// gitWrite: true — review-feedback file is committed and pushed by the agent.
// Source code remains read-only (enforced by prompt: "Do NOT modify any source files").
```

**理由**: 「read-only reviewer」という openspec-workflow の意図をそのまま写し取ったのが矛盾の温床だった。Managed Agents 制約下では「agent は workspace 内で write/commit/push する」のが唯一実現可能な配送手段で、それを capability コメントで明示すれば後任が同じ事故を起こさない。spec-review.ts も同等のコメントを既に持っている / 持たせる。

### Decision 5: ADR で openspec-workflow からの逸脱を正当化

**選択**: `openspec-workflow/adr/ADR-20260430-review-exit-contract-managed-agents.md` を生成し、Context (claude-code 前提 vs Managed Agents 前提) → Decision (agent-driven push 採用) → Consequences (逸脱の明示 / 将来の custom_tool 方式オプション) を記録する。

**理由**: 「openspec-workflow がこう書いているから」という参照だけでコメントを写し取ると本件のような事故が再発する。逸脱の根拠 (Managed Agents 制約) と検討した代替 (custom_tool, orchestrator commit) を ADR に残すことで、将来 architecture を変える人が選択肢を再評価できる。

### Decision 6: implementer prompt に workflow context を positive framing で追記

**選択**: `implementer-system.ts` に workflow context を追記する。既存 `IMPLEMENTER_SYSTEM_PROMPT` は全文日本語であるため、追記文言も日本語に揃える。例: 「あなたは pipeline の stage 3 (implementer) です。次工程: verification (build/test/lint), その次: code-review。build/test/lint は次工程に渡してください」。verification が build/test/lint の品質ゲートを担う次工程であることを明示し、「役割を盗まないこと」を否定形ではなく「次工程に渡せ」という positive framing で書く。

**理由**: propose-system.ts が同じ手法で「propose stub」役割越境を防いでいる先例がある。否定形 (`Do NOT do verification yourself`) は LLM agent には弱く、role boundary を positive に書く方が遵守率が高い経験則。さらに既存 prompt が日本語で書かれているため、英語文言を混在させると LLM の指示遵守率が低下するリスクがある。

## Risks / Trade-offs

- **[Risk] capability `gitWrite: true` を付けた agent が source code を変更してしまう** → Mitigation: prompt で `Do NOT modify any source files` を強調。`git diff` 監視は本 request 範囲外（prompt のみが運用契約で技術的強制は無い）。capability は技術的可能性で、prompt が運用契約を担う構造を維持する。code-review.ts の新コメントで明示する。
- **[Risk] agent が commit/push を忘れて end_turn する**（dogfooding-003 と同じ症状の再発） → Mitigation: prompt に `Do NOT end_turn until push is complete` を明記、test で system prompt snapshot を検証、e2e dogfooding で実機検証。
- **[Risk] iteration 引数化で既存 caller の引数漏れ** → Mitigation: TypeScript の型で必須引数化（optional にしない）、既存呼び出し箇所を grep で網羅修正、test で各 iteration の hint string を assert。
- **[Risk] filename 規約変更で既存 archive / log と互換性低下** → Mitigation: archive 済みの change は再生成しない（読み取り側は old format も許容する形を維持）。新規 result のみ新規約を採用。
- **[Trade-off] ADR を書く工数** → 価値: 後任の事故防止 + 将来の architecture 変更時の選択肢保持。本 request 範囲で 1 ADR 生成は許容範囲。
- **[Trade-off] `review-feedback-{NNN}.md` の `review-feedback` 命名が `{step}-result-{NNN}.md` 規約と部分的に異なる** → 既存 prompt / executor の影響を抑えるための妥協。spec.md で「step ごとの prefix は固定、suffix `-{NNN}` のみ統一」と明記する。
