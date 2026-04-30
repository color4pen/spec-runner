# Unify review-side exit contract (spec-review / code-review) for Managed Agents

## Meta

- **type**: spec-change
- **slug**: review-exit-contract
- **date**: 2026-04-30
- **author**: color4pen

## ワークフローオプション

- **enabled**:
  - test-case-generator
  - adr
  - pattern-reviewer

## 背景

dogfooding-001 の 3 回目（PR #44 マージ後）で、pipeline は propose を初めて成功通過させたが、spec-review iter 1 で escalate した。

```
[iter 1/2] starting spec-review
Spec-review result file not found on branch 'feat/readme-status-section'.
[iter 1] spec-review verdict: escalation → halt
```

詳細調査の結果、これは propose stub の延長線にある「prompt の指示漏れ」ではなく、**review 系 step 全体の出口契約が分裂している構造的バグ**であることが判明した。

参考リソース:
- 失敗 job state: `~/.local/share/specrunner/jobs/fbfcc5d8-bbee-4388-89b4-1c5fd3fd4357.json`
- 失敗ログ: `/tmp/dogfooding-003-run.log`
- spec-review session events: `sesn_011CaZrGgWo97VwHYEU489qz`
- 整合性 audit 結果: 本 request の RCA 章を参照

## 観測した症状

### 症状 1: spec-review session が end_turn したのに executor は file を見つけられない

spec-review session の event log を `ant beta:sessions:events list` で取得したところ:

- agent は `write` ツールで `/workspace/spec-runner/openspec/changes/readme-status-section/spec-review-result-001.md` に verdict + findings を書き出した
- agent は session 終了前に **`git add` / `git commit` / `git push` を一切呼んでいない**
- 結果、ファイルは agent の workspace 内にのみ存在し origin に push されていない
- executor は GitHub から `spec-review-result-NNN.md` を fetch しようとして 404 → `SPEC_REVIEW_RESULT_NOT_FOUND` で escalate

### 症状 2: error hint と agent 指示の filename が divergence

executor が出した error hint:

```
Spec-review result file not found on branch 'feat/readme-status-section'.
Hint: Ensure the spec-review agent wrote the result file to openspec/changes/readme-status-section/spec-review-result.md ...
```

しかし agent は initial message テンプレに従って `spec-review-result-001.md`（iteration suffix `-001` 付き）に書く。**hint と実態が一致せず、ユーザーが原因を特定しづらい**。

### 症状 3: code-review の prompt と capability 宣言が真逆

dogfooding がもし spec-review を通過して code-review に到達した場合、同種の問題で再 escalation する見込み。理由:

- `src/core/step/code-review.ts:30-39` のコメント: `// No capabilities: gitWrite is intentionally absent (read-only reviewer)`
- 一方 `src/prompts/code-review-system.ts:12,67-68`: `You MUST commit and push the review-feedback file before completing the session`

つまり **「push せよ」と prompt は明示するのに、capability 宣言は「read-only」**。コメントと運用契約が矛盾している。

## RCA（根本原因分析）

### 直接原因 1: spec-review-system.ts に commit/push 指示が無い

`src/prompts/spec-review-system.ts` には result file の出力指示はあるが、書いた後の commit / push 指示は無い。propose / fixer 系 prompt はすべて `buildGitPushInstruction(branch)` を user message に組み込んでいるが、spec-review はそれを欠く。

PR #44 (workspace-mount-and-propose-boundary) で「workspace branch propagation」と「propose path-fence」を直したが、spec-review の push 指示は scope 外だった。dogfooding-002 で propose が end_turn しなかった結果として隠れていた spec-review 問題が、PR #44 の workspace mount 修正で初めて顕在化した。

### 直接原因 2: code-review-system.ts と code-review.ts の契約矛盾

code-review-system.ts は `MUST commit and push` と書いているが、code-review.ts は `capabilities: {}`（gitWrite なし）と注釈している。本来「review on source code は read-only / review-feedback file write は gitWrite が必要」と分けて記述すべきところを、「read-only reviewer」とだけ書いて prompt と矛盾させた。

### 直接原因 3: filename suffix の設計揺れ

agent には `spec-review-result-{NNN}.md`（3 桁ゼロ埋め suffix）を書かせる一方、executor の error hint は suffix 無しの `spec-review-result.md` と書く。executor の verify 実装が iteration suffix 付きで fetch しているのか、suffix 無しで fetch しているのか、コードと hint の整合が取れていない。

### 構造原因: 参照実装との archtecture 前提の違い

openspec-workflow（参照実装、`~/Documents/GitHub/openspec-workflow/`）の review 系は:

- agent は **local file write のみ**
- orchestrator (request-execute Step 9) が **一括 commit + push**
- `gitWrite` capability は agent には不要

これは claude-code が **local execution** で、orchestrator が同じ filesystem を共有するため成立する。

一方 SpecRunner は **Anthropic Managed Agents (remote workspace)** を使用するため:

- executor は agent の workspace に直接アクセスできない
- agent が push する以外に origin にファイルを届ける方法がない（custom tool で content を返す方式は別アーキテクチャ）

つまり SpecRunner は openspec-workflow からアーキテクチャ前提の違いで **必然的に逸脱する**。しかしこの逸脱の正当化が ADR / コメントとして残っていないため、code-review.ts のように「read-only」コメントだけ写し取って prompt と矛盾させる事故が起きた。

### Learned-pattern 違反

- **「契約と実装の divergence」**: capability 宣言（コメント）と prompt 要求が真逆
- **「defensive コメントを意図として重複」**: code-review.ts が openspec-workflow の意図（"read-only reviewer"）をコメントだけコピーし、Managed Agents の制約と整合していない
- **「error hint と実装の動的計算が divergence」**: hint string が iteration suffix を hardcode で外している

## 仕様変更（変更前 / 変更後）

### 変更 1: spec-review の出口契約

**変更前**:
- `SPEC_REVIEW_SYSTEM_PROMPT`: 「Write your findings to the path specified in the user message」と「Do not modify any source code or spec files other than writing the spec-review-result file」のみ
- result file の commit / push 指示は無い
- agent は file を書いただけで end_turn

**変更後**:
- `SPEC_REVIEW_SYSTEM_PROMPT`（または `SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE`）に以下を追加:
  - 「After writing the verdict and findings, **commit the file** to branch `{{BRANCH}}` and **push to origin**」
  - 「**Do NOT end_turn until push is complete**」
- propose / fixer 系と同じ shape の `buildGitPushInstruction(branch)` を user message に組み込む

### 変更 2: code-review の capability 宣言

**変更前**:
- `code-review.ts:30-39`: `// No capabilities: gitWrite is intentionally absent (read-only reviewer)`
- `capabilities: {}`（gitWrite フィールドなし）
- 一方 `code-review-system.ts`: 「You MUST commit and push the review-feedback file」

**変更後**:
- `code-review.ts`: `capabilities: { gitWrite: true }` に変更
- コメントを訂正: `// gitWrite: true — review-feedback file is committed and pushed by the agent. Source code remains read-only (enforced by prompt: "Do NOT modify any source files").`
- prompt の「MUST commit and push」記述はそのまま維持（一致）

### 変更 3: filename suffix の統一

**変更前**:
- agent には `spec-review-result-{NNN}.md` 形式（3 桁ゼロ埋め）で書かせる
- executor の error hint は `spec-review-result.md`（suffix なし）と書く
- executor の verify 実装が suffix 付きで fetch しているかは要コード確認

**変更後**:
- 全 review 系で result filename を `{step}-result-{NNN}.md` 形式に **統一**:
  - spec-review: `spec-review-result-{NNN}.md`
  - code-review: `review-feedback-{NNN}.md`（既存命名を維持、suffix `-{NNN}` のみ統一）
- error hint factory を **iteration を引数に取り** dynamically 生成:
  ```typescript
  specReviewResultNotFoundError(slug, branch, iteration)
    → hint: `... openspec/changes/${slug}/spec-review-result-${String(iteration).padStart(3,'0')}.md ...`
  ```
- executor の verify 側も同じ suffix 規約で fetch する

### 変更 4: ADR 生成（受け入れ基準）

`openspec-workflow/adr/{NNN}-review-exit-contract-managed-agents.md` を生成:

- **タイトル**: Review-side exit contract: agent-driven push (deviation from openspec-workflow's orchestrator-driven commit)
- **Context**: openspec-workflow は claude-code (local execution) の前提で orchestrator 一括 commit。SpecRunner は Anthropic Managed Agents (remote workspace) のため agent push が必須
- **Decision**: review 系 (spec-review / code-review) は `gitWrite: true` capability + prompt に push 指示で統一する
- **Consequences**:
  - openspec-workflow からの逸脱を明示
  - capability コメントを「read-only reviewer」と書かない（Managed Agents 制約を理由に）
  - 将来 architecture を変える場合（custom tool で content を返す方式 / local relay 等）の選択肢を残す

### 変更 5: implementer の verification 連携を prompt 内で明示

**変更前**:
- `implementer-system.ts` には verification step の存在に関する記述が無い
- agent が「自分の修正で全部完了させる」誘惑を持つ可能性

**変更後**:
- `implementer-system.ts` に「あなたは pipeline の stage 3 です: implementer (you) → verification → code-review」を追記
- verification が build / test / lint で品質を見る次工程であることを明示
- propose-system.ts 同様の positive framing で「役割を盗まないこと」を強調

## 影響範囲

### 修正対象ファイル

| ファイル | 変更内容 |
|---|---|
| `src/prompts/spec-review-system.ts` | system prompt または initial message に commit + push 指示追加 |
| `src/prompts/code-review-system.ts` | (現状維持。push 指示は既にある) |
| `src/prompts/implementer-system.ts` | workflow context (stage 3 / verification 連携) 追記 |
| `src/core/step/code-review.ts` | `capabilities: { gitWrite: true }` 追加、コメント訂正 |
| `src/errors.ts` | `specReviewResultNotFoundError` / 新規 `codeReviewResultNotFoundError` を iteration 引数で動的生成 |
| `src/core/step/spec-review.ts` | error hint 呼び出しに iteration を渡す |
| `src/core/step/code-review.ts` | error hint 呼び出しに iteration を渡す |
| `src/core/step/executor.ts` | result file の filename construction に iteration suffix を一貫適用（既に実装済みなら確認のみ） |

### 新規生成

| ファイル | 内容 |
|---|---|
| `openspec-workflow/adr/{NNN}-review-exit-contract-managed-agents.md` | review 系出口契約の ADR |
| `openspec/changes/review-exit-contract/specs/agent-output-contract/spec.md` | review 系 agent の出力契約 delta spec |

## 受け入れ基準

- [ ] spec-review-system.ts に commit + push 指示が追加され、agent が result file を origin に push する
- [ ] code-review.ts の `capabilities` に `gitWrite: true` が追加されている
- [ ] code-review.ts のコメントが「read-only reviewer」から「source code is read-only / review-feedback file requires gitWrite」へ訂正されている
- [ ] `specReviewResultNotFoundError` / `codeReviewResultNotFoundError` が iteration 引数で動的に正確な hint を生成する
- [ ] executor が GitHub から fetch する result filename と agent が書く filename が `{step}-result-{NNN}.md` 形式で一致する
- [ ] implementer-system.ts に workflow context（stage 3, verification 連携）が positive framing で記述されている
- [ ] ADR `openspec-workflow/adr/{NNN}-review-exit-contract-managed-agents.md` が生成され、Managed Agents 制約に基づく逸脱の正当化が記録されている
- [ ] delta spec `openspec/changes/review-exit-contract/specs/agent-output-contract/spec.md` が生成されている
- [ ] `bun bin/specrunner.ts run /tmp/dogfooding-001-request.md` が end-to-end PASS（GitHub に PR 作成まで完走）
- [ ] 既存テスト全 PASS（regression 0、現状 491 tests）+ 本変更に関する must シナリオが test-cases.md に記述され実装されている

## 仕様変更前後の動作の比較

| 観点 | 変更前 | 変更後 |
|---|---|---|
| spec-review session の終了条件 | result file write 後即 end_turn | result file write + commit + push 完了後 end_turn |
| code-review capability 宣言 | `capabilities: {}` (gitWrite なし) | `capabilities: { gitWrite: true }` |
| code-review prompt と capability の整合 | 矛盾（push 要 / gitWrite なし） | 整合（push 要 / gitWrite あり） |
| error hint の filename | hardcoded suffix なし | iteration から動的に suffix 付き計算 |
| openspec-workflow との設計関係 | 暗黙的逸脱（コメントだけ写し取り） | ADR で正当化された明示的逸脱 |
| implementer の verification 連携 | prompt 内に記述なし | positive framing で stage 3 と次工程を明示 |

## 補足

### 参照リソース

- 失敗 job state: `~/.local/share/specrunner/jobs/fbfcc5d8-bbee-4388-89b4-1c5fd3fd4357.json`
- 失敗ログ: `/tmp/dogfooding-003-run.log`
- spec-review session events: `sesn_011CaZrGgWo97VwHYEU489qz`（`ant beta:sessions:events list --session-id sesn_011CaZrGgWo97VwHYEU489qz` で再取得可能）
- 整合性 audit 詳細: 直前のセッション transcript（Findings 1–7、特に CRITICAL #1, #2）
- openspec-workflow 出口戦略 audit: 直前のセッション transcript（review 系は orchestrator 一括 commit 設計）
- review-standards: `.claude/rules/review-standards.md`
- learned-patterns: `openspec-workflow/learned-patterns.md`

### dogfooding 用 dangling branch

dogfooding-003 で push された `origin/feat/readme-status-section` を削除済み（next dogfooding 投入前にクリア状態を確保）。

### 並列パスのオプション（本 request では採用しない）

将来検討候補として記録:

- agent が custom_tool 経由で result file content を executor に返し、executor が commit/push する方式
- これは Managed Agents の workspace 不可視を回避する別アーキテクチャだが、本 request では「agent push が最小修正」として採用する。ADR には alternative として記載

### dogfooding コスト見積

前回失敗分: $0.5-1。本修正後の e2e 完走想定: +$5-10（propose / spec-review × 1-2 / spec-fixer 0-1 / implementer / verify / code-review × 1-2 iter / code-fixer 0-1 / pr-create）。
