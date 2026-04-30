# code-review / code-fixer step 追加（実装層レビューループの確立）

## Meta

- **type**: new-feature
- **date**: 2026-04-30
- **author**: color4pen
- **depends-on**: openspec-workflow/requests/merged/implementer-verify-buildfix（PR #36 で merge 済み implementer + verification + build-fixer）

## ワークフローオプション

- **enabled**:
  - module-architect
  - test-case-generator
  - adr

## 背景

PR #36 の merge で SpecRunner pipeline は `propose → spec-review (loop with spec-fixer) → implementer → verification (loop with build-fixer) → end` まで自走可能になった。spec 層 self-correct loop と code 層の build/test self-correct loop は揃ったが、**implementer の diff に対する人間相当のレビュー**（spec ではなくコード品質・設計判断・リグレッション検出）が pipeline に組み込まれていない。

設計対称性（再掲）:

| Layer | 創造的 step | Verdict 生成 | Fixer | Loop 構造 |
|-------|-----------|------------|------|-----------|
| spec | propose | spec-review | spec-fixer | spec-review needs-fix → spec-fixer → spec-review |
| code（build） | implementer | verification | build-fixer | verification fail → build-fixer → verification |
| **code（review）（本 request）** | — | **code-review** | **code-fixer** | code-review needs-fix → code-fixer → code-review |

PR #36 で確立した `AgentStep | CliStep` discriminated union と `LOOP_ERROR_CODES` lookup table が「新 loop 追加 = transition rows + lookup entry の追加だけ」を保証しているため、本 request は構造的拡張ではなく **既存 pattern への新 step 追加** として実装できる。

## 目的

verification passed の後を継いで「diff レビュー → 必要なら code 修正 → 再レビュー → approved で次（PR 作成）に橋渡し可能」な review loop を確立する。具体的に:

1. **code-review step**: verification passed の diff を input として、品質 / 設計 / regression / security 観点で評価し、`review-feedback-NNN.md` に findings + verdict（`approved` / `needs-fix` / `escalation`）を出力する Step を追加
2. **code-fixer step**: code-review が needs-fix を出した時、`review-feedback-NNN.md` の findings を入力として code 修正を行う専用 Agent を持つ Step を追加
3. **Pipeline transition table の書き換え**: `verification → passed → end` を `verification → passed → code-review` に変更し、`code-review → approved → end`、`code-review → needs-fix → code-fixer`、`code-fixer → success → code-review` を追加。loop guard で max 3 iterations
4. **後続 step（PR 作成）への橋渡し**: 本 request では `code-review → approved → end` で止めるが、後続 request で `code-review → approved → pr-create` に書き換えられるように transition table の構造を保つ

## 要件

### code-review step（AgentStep）

1. **Step 実装**: `src/core/step/code-review.ts` を新設し、`AgentStep` を満たす `CodeReviewStep` を export する。`agent.role = "code-review"`、`name = "code-review"`、`kind = "agent"`
2. **Agent definition**:
   - `name`: `specrunner-code-review`
   - `model`: `claude-sonnet-4-5`
   - `system`: `src/prompts/code-review-system.ts` で `CODE_REVIEW_SYSTEM_PROMPT` として export。`.claude/rules/review-standards.md` の severity / category / verdict 規約を参照する内容にする（spec-review との共通基盤）
   - `tools`: `agent_toolset_20260401`
   - `capabilities`: `gitWrite` 不要（read-only review）
3. **buildMessage**: branch の current diff（implementer + build-fixer の合算成果）と関連 spec を含むメッセージを生成
4. **resultFilePath**: `openspec/changes/<slug>/review-feedback-NNN.md`（spec-review の `spec-review-result-NNN.md` パターンに対称）
5. **parseResult**: review-feedback の `- **verdict**: (approved|needs-fix|escalation)` を regex で抽出（spec-review と同じロジックの再利用 / 共通化候補）

### code-fixer step（AgentStep）

1. **Step 実装**: `src/core/step/code-fixer.ts` を新設。`agent.role = "code-fixer"`、`name = "code-fixer"`、`kind = "agent"`
2. **Agent definition**:
   - `name`: `specrunner-code-fixer`
   - `model`: `claude-sonnet-4-5`
   - `system`: `src/prompts/code-fixer-system.ts` で `CODE_FIXER_SYSTEM_PROMPT` として export。「review-feedback の HIGH/MEDIUM findings に対する code 修正のみ。仕様変更や追加機能は行わない」を明示
   - `tools`: `agent_toolset_20260401`
   - `capabilities.gitWrite = true`
3. **buildMessage**: 直前の code-review の `review-feedback-NNN.md` を input として「HIGH/MEDIUM findings を実装し git push せよ」を含むメッセージを生成。`buildGitPushInstruction()` 流用
4. **resultFilePath**: `null`（spec-fixer / build-fixer と同じパターン）
5. **parseResult**: `NULL_PARSE_RESULT`（既存定数を流用）
6. **completionVerdict**: `"approved"`（`code-fixer → approved → code-review` の transition 用、spec-fixer と同じデフォルト）

### Pipeline 拡張

1. **`STANDARD_TRANSITIONS` 書き換え**:
   - 既存: `{ step: "verification", on: "passed", to: "end" }` を **削除**
   - 追加:
     - `{ step: "verification", on: "passed", to: "code-review" }`
     - `{ step: "code-review", on: "approved", to: "end" }`
     - `{ step: "code-review", on: "needs-fix", to: "code-fixer" }`
     - `{ step: "code-review", on: "escalation", to: "escalate" }`
     - `{ step: "code-fixer", on: "approved", to: "code-review" }`
     - `{ step: "code-fixer", on: "error", to: "escalate" }`
2. **`LOOP_ERROR_CODES` 拡張**: `code-review` エントリを追加（`CODE_REVIEW_RETRIES_EXHAUSTED` / `Review code-review-feedback-NNN.md and address findings manually.` のような形式、spec-review と対称）
3. **`Pipeline` constructor の `loopNames`**: `["spec-review", "verification", "code-review"]` に拡張
4. **Verdict 型**: 既存の `approved / needs-fix / escalation` を流用（code-review は spec-review と同じ verdict を出す）
5. **StepName 拡張**: `src/state/schema.ts` の `StepName` union に `"code-review" | "code-fixer"` を追加

### init.ts と AgentRegistry

1. **`src/cli/init.ts`**: `AgentRegistry.fromSteps([..., CodeReviewStep, CodeFixerStep])` に拡張
2. **`src/cli/run.ts`**: `Pipeline` constructor に渡す `steps` Map に新 2 step を追加

### 共通化候補（module-architect が事前分析）

- `parseSpecReviewVerdict` / 新規 `parseCodeReviewVerdict` の verdict 抽出 regex 共通化
- `spec-review` / `code-review` で `findings 抽出` を担う helper の有無を判断
- `buildGitPushInstruction()` は code-fixer も使う（spec-fixer / implementer / build-fixer と同様）

## 受け入れ基準

- [ ] 既存テストが全 PASS する（regression 0 件）
- [ ] `specrunner init` が `code-review` / `code-fixer` の 2 つの新 Agent を Anthropic に作成する
- [ ] `specrunner run` で verification passed → code-review → end（approved の場合）の遷移が pipeline state machine 上で動く
- [ ] code-review が `needs-fix` を出した時、code-fixer → code-review の loop が max 3 iterations で escalation に遷移する
- [ ] `openspec/changes/<slug>/review-feedback-NNN.md` が iteration 番号 zero-padded で生成される（spec-review と対称）
- [ ] `tests/unit/step/code-review.test.ts` / `code-fixer.test.ts` が Step interface 適合性を検証する
- [ ] `tests/unit/core/pipeline/pipeline.transitions.test.ts` に新 transition を追加（verification → code-review、code-review → approved → end、code-review → needs-fix → code-fixer、code-fixer → approved → code-review）
- [ ] `tests/grep-no-step-name-hardcode.test.ts` が引き続き PASS する（executor / pipeline で step name hardcode が発生しない）
- [ ] module-architect の analysis が `module-analysis.md` に出力され、共通化候補が tasks.md の冒頭タスクに下りている
- [ ] ADR が `openspec-workflow/adr/` に出力され、code-review の Agent design 判断（review 観点を Agent 自身に委ねる vs CLI 側に持つ）が記録されている

## スコープ外（後続 request）

- **PR 作成 step**: 後続 request。本 request では `code-review → approved → end` で止め、後続で `→ pr-create` に書き換える
- **学習層実装**: EventBus subscriber は予約席のまま
- **cost ledger**: 別系統
- **E2E 実機検証**: self-hosting 完成までまとめて保留
- **review-feedback iteration NNN 形式の verification との統合**: PR #36 で deferred になった verification iteration numbering bug は本 request では扱わない（独立修正）

## 補足

### Managed Agents SDK の制約（再掲）

- `SessionCreateParams` は `system` 上書き不可 → Agent ごとに独立 system prompt
- 同一 Agent を異なる role で使うと system prompt と user message が矛盾する

→ code-review は spec-review と異なる Agent として定義。両者の prompt は別ファイル / 別 Agent で運用する。spec-review が propose Agent を流用していた anti-pattern を D4-D6 で解消したのと同じ規律。

### 設計分岐点（ADR で確定すべき項目）

1. **review observation の入力**: code-review agent はどのソースを見るか？
   - (a) `git diff main...<branch>` を agent が実行する（agent 内の bash tool）
   - (b) specrunner CLI が事前に diff を fetch して message に埋める
   - (b) は file size 制約の問題があるが reproducibility が高い。(a) は agent の自由度が高いが mock しづらい
2. **review observation の範囲**: 全 diff か changed files only か。changed files の場合 spec も含めるか
3. **review-feedback.md format**: spec-review-result.md の format（`## Findings` table + `## Verdict`）を踏襲するか、code 専用に拡張するか
4. **code-fixer の retry 上限**: max 3 が default だが Pipeline の `maxIterations` 設定経路を確認
5. **code-review の skip option**: `enabled` flag で code-review/code-fixer を skip 可能にすべきか（小さい change で review overhead を避ける用途）。本 request では skip option は無し（強制有効）が default

### 参照 ADR

- `openspec-workflow/adr/ADR-20260424-session-pipeline-design.md` — 4 直列セッションモデル（code-review は Session 4 相当）
- `openspec-workflow/adr/ADR-20260429-step-and-agent-class-architecture.md` — Step 抽象 + AgentDefinition 所有
- `openspec-workflow/adr/ADR-20260430-step-kind-discriminator.md`（PR #36 で生成）— `kind: "agent" | "cli"` discriminator design
- `openspec-workflow/adr/ADR-20260430-implementer-buildfixer-separation.md`（PR #36 で生成）— Managed Agents SDK 制約に基づく fixer 分離

### 参照 learned-patterns

- 「同一 Agent を異なる role で使うと system prompt と user message が矛盾する」
- 「lifecycle 等の実行戦略はデータ存在で推論せず明示的 discriminator で宣言」
- 「migration の完了判定は production 経路の grep」
- 「rename-as-MODIFIED」 — delta spec の MODIFIED ブロックで header 改変は禁止（archive 時に bug 化）
- 「openspec validate --strict は Requirement の最初の段落だけを SHALL/MUST 対象として scan する」

### 参照 PR

- PR #26（D1-D9）— Step interface / StepExecutor / Pipeline state machine の土台
- PR #28（D4-D6）— Step が AgentDefinition を所有する規律
- PR #34（port-tidying）— GitHubClient port purity
- PR #36（implementer + verification + build-fixer）— `kind` discriminator + LOOP_ERROR_CODES lookup を活用、本 request の前提
