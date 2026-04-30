# implementer / verification / build-fixer step 追加（spec → code self-correct loop の確立）

## Meta

- **type**: new-feature
- **date**: 2026-04-30
- **author**: color4pen
- **depends-on**: openspec-workflow/requests/merged/2026-04-30-port-tidying（PR #34 で merge 済み port-tidying）

## ワークフローオプション

- **enabled**:
  - module-architect
  - test-case-generator
  - adr

## 背景

PR #26（D1-D9）→ PR #28（D4-D6）→ PR #31（executor-cleanup）→ PR #34（port-tidying）の累積で、SpecRunner の Step / Pipeline / Agent / port 抽象は完全に整った。現在の pipeline は spec 層（propose / spec-review / spec-fixer）までしか走らず、spec が approved になった後の「実装→検証→修正→PR 作成」までを SpecRunner が自走できない。

ADR-20260424-session-pipeline-design は 4 直列セッションモデル（propose / spec-review / **implementer** / code-review+verification）を提案しており、ADR-20260429-step-and-agent-class-architecture の D10 で「後続 request」として明示的に分離された決定事項。本 request は **implementer + verification + build-fixer** の 3 step を 1 request で追加し、spec 層と対称な「実装層 self-correct loop」を確立することを目的とする。

設計対称性:

| Layer | 創造的 step | Verdict 生成 | Fixer | Loop 構造 |
|-------|-----------|------------|------|-----------|
| spec（既存） | propose | spec-review | spec-fixer | spec-review needs-fix → spec-fixer → spec-review |
| code（本 request） | **implementer** | **verification** | **build-fixer** | verification fail → build-fixer → verification |
| review（後続 request） | — | code-review | code-fixer | code-review needs-fix → code-fixer → code-review |

implementer agent が「creative な初期実装」と「mechanical な build error 修正」を兼ねる collapses を避ける設計（PR #22 で踏んだ system prompt 矛盾と同種の anti-pattern を構造的に回避）。

## 目的

spec 層 approved の後を継いで「実装 → build/typecheck/test/lint/security verification → 失敗時自動修正 → success で次 step に橋渡し可能」な pipeline 状態機械を確立する。具体的に:

1. **implementer step**: spec-review が approved を出した後、`openspec/changes/<slug>/specs/` と `tasks.md` を入力としてコードを実装し git push まで実行する Step を追加する
2. **verification step**: build / typecheck / test / lint / security の 5 phase を spec-runner CLI 内で直接実行し、verdict（passed / failed）を生成する Step を追加する
3. **build-fixer step**: verification 失敗時に、エラーログを入力として mechanical な修正を行う専用 Agent を持つ Step を追加する
4. **Pipeline transition table の拡張**: `implementer → success → verification`、`verification → passed → end`、`verification → failed → build-fixer`、`build-fixer → success → verification` を追加し、loop guard で max 3 iterations
5. **後続 step（code-review / code-fixer / PR 作成）への橋渡し**: 本 request では verification approved を `end` に流すが、後続 request で `verification → passed → code-review` に書き換えられるように transition table の構造を保つ

## 要件

### implementer step

1. **Step 実装**: `src/core/step/implementer.ts` を新設し、`Step` interface を満たす `ImplementerStep` を export する。`agent.role = "implementer"`、`name = "implementer"`、`toolHandlers` に必要な custom tool を持つ
2. **Agent definition**:
   - `name`: `specrunner-implementer`
   - `model`: `claude-sonnet-4-5`（既存 step と同じ default）
   - `system`: `src/prompts/implementer-system.ts` で `IMPLEMENTER_SYSTEM_PROMPT` として export
   - `tools`: `agent_toolset_20260401` + 必要な custom tools
   - `capabilities.gitWrite = true`（git push が必要）
3. **buildMessage**: `tasks.md` のチェックボックス未完項目と関連 spec を含むメッセージを生成
4. **resultFilePath**: `null` を返す（git push で完了検知、verdict file は無し）
5. **parseResult**: `{ verdict: null, findingsPath: null }` を返す（spec-fixer と同じパターン）

### verification step

1. **Step 実装**: `src/core/step/verification.ts` を新設。**重要**: verification は agent を呼ばず、specrunner CLI が直接 build/test 等を実行する **CLI-resident step** として実装する
2. **CLI runner**: `src/core/verification/runner.ts` を新設し、5 phase（build / typecheck / test / lint / security）を順次実行して結果を集約する。各 phase の実行コマンドは `bun run <phase>` 形式（package.json の scripts に依存）
3. **verdict 生成**: 全 phase passed → `passed`、いずれか failed → `failed`。phase ごとの stdout/stderr を `openspec/changes/<slug>/verification-result.md` に書き出し
4. **Step interface 適合**: agent を呼ばないため、`StepExecutor` の lifecycle に乗らない特殊形になる。設計の選択肢は (i) Step interface はそのまま使い `agent` フィールドに「null agent」を入れる、(ii) Step interface を拡張して agent-less step を表現する、(iii) executor に分岐を追加する。選択は design 段階で確定すること（ADR 化）
5. **resultFilePath**: `openspec/changes/<slug>/verification-result.md`
6. **parseResult**: verification-result.md の `## Verdict: passed | failed` 行を regex 抽出

### build-fixer step

1. **Step 実装**: `src/core/step/build-fixer.ts` を新設。`agent.role = "build-fixer"`、`name = "build-fixer"`
2. **Agent definition**:
   - `name`: `specrunner-build-fixer`
   - `model`: `claude-sonnet-4-5`
   - `system`: `src/prompts/build-fixer-system.ts` で `BUILD_FIXER_SYSTEM_PROMPT` として export。「mechanical な build/test/lint/typecheck エラー修正のみを行う。仕様変更や設計判断は行わない」を明示
   - `tools`: `agent_toolset_20260401`
   - `capabilities.gitWrite = true`
3. **buildMessage**: 直前の verification step 結果（verification-result.md）を input として「failed phase の error log を読んで mechanical 修正を行い git push せよ」のメッセージを生成
4. **resultFilePath**: `null`（spec-fixer 同様）
5. **parseResult**: `{ verdict: null, findingsPath: null }`

### Pipeline 拡張

1. **`STANDARD_TRANSITIONS` 拡張**: `src/core/pipeline/types.ts` に以下を追加
   - `{ step: "spec-review", on: "approved", to: "implementer" }` （既存の `to: "end"` を置換）
   - `{ step: "implementer", on: "success", to: "verification" }`
   - `{ step: "implementer", on: "error", to: "escalate" }`
   - `{ step: "verification", on: "passed", to: "end" }`
   - `{ step: "verification", on: "failed", to: "build-fixer" }`
   - `{ step: "verification", on: "escalation", to: "escalate" }`
   - `{ step: "build-fixer", on: "success", to: "verification" }`
   - `{ step: "build-fixer", on: "error", to: "escalate" }`
2. **Verdict 型拡張**: `src/state/schema.ts` の `Verdict` union に `"passed" | "failed"` を追加
3. **StepName 拡張**: `src/state/schema.ts` の `StepName` union に `"implementer" | "verification" | "build-fixer"` を追加
4. **loop guard**: `Pipeline.runInternal` の loopName / maxIterations を拡張し、`verification ↔ build-fixer` cycle にも適用（max 3）

### init.ts と AgentRegistry

1. **`src/cli/init.ts:52` 修正**: `AgentRegistry.fromSteps([ProposeStep, SpecReviewStep, SpecFixerStep, ImplementerStep, BuildFixerStep])` に拡張（VerificationStep は agent を持たないため除外）
2. **`src/cli/run.ts` 修正**: `Pipeline` constructor に渡す `steps` Map に新 3 step を追加

## 受け入れ基準

- [ ] 既存テストが全 PASS する（regression 0 件）
- [ ] `specrunner init` が implementer / build-fixer の 2 つの新 Agent を Anthropic に作成する（spec-fixer と対称）
- [ ] `specrunner run` で spec-review approved → implementer → verification → end（passed の場合）の遷移が pipeline state machine 上で動く
- [ ] verification 失敗時に build-fixer → verification の loop が max 3 iterations で escalation に遷移する
- [ ] `openspec/changes/<slug>/verification-result.md` が 5 phase の結果を含む形式で生成される
- [ ] `tests/unit/core/verification/runner.test.ts` で 5 phase passed / 1 phase failed / multiple phases failed のシナリオがカバーされている
- [ ] `tests/unit/step/implementer.test.ts` / `build-fixer.test.ts` が Step interface 適合性を検証する
- [ ] module-architect の analysis が `openspec/changes/<slug>/module-analysis.md` に出力され、3 step 間の helper 共通化候補が tasks.md の冒頭タスクに下りている
- [ ] ADR が `openspec-workflow/adr/` に出力され、verification の agent-less 設計判断と build-fixer 分離判断が記録されている

## スコープ外（後続 request）

- **code-review step + code-fixer step**: 後続 request。本 request では `verification → passed → end` で止め、後続 request で `verification → passed → code-review` に書き換える
- **PR 作成 step**: 後続 request。merged 後に self-host 完成形に近づく
- **学習層実装**: EventBus subscriber は予約席のまま。observation → instinct → rule の hook は本 request では張らない
- **cost ledger**: 別系統
- **E2E 実機検証**: self-hosting 完成までまとめて保留

## 補足

### Managed Agents SDK の制約（再掲）

- `SessionCreateParams` は `system` 上書き不可 → Agent ごとに独立 system prompt
- Custom Tool は Agent レベルで定義 → role-specific 出し分け不可
- 同一 Agent を異なる role で使うと system prompt と user message が矛盾する

→ 本 request では implementer / build-fixer をそれぞれ独立 Agent として定義（spec-review が propose Agent を流用していた anti-pattern を D4-D6 で解消したのと同じ規律）。

### 設計分岐点（ADR で確定すべき項目）

1. **verification の Step interface 適合方法**: (i) null agent / (ii) interface 拡張 / (iii) executor 分岐
2. **verification CLI runner の shell 実行方式**: bash spawn / Bun.spawn / node:child_process — 過去の memory「bun:* / Bun.* の import を禁止する」規律を遵守
3. **build-fixer の retry 上限**: max 3 が default だが Pipeline の `maxIterations` 設定経路を確認
4. **verification phase 順序**: build → typecheck → test → lint → security の順（fail-fast 原則）か、並列実行か
5. **verification-result.md の format**: spec-review-result.md と類似の `## Verdict` + `## Phase Results` 構造を踏襲
6. **implementer の git push 方式**: 既に branch は propose で register 済み（state.branch から取得可能）。implementer は同 branch に commit + push を行う

### 参照 ADR

- `openspec-workflow/adr/ADR-20260424-session-pipeline-design.md` — 4 直列セッションモデル
- `openspec-workflow/adr/ADR-20260429-step-and-agent-class-architecture.md` — D10「後続 request」分離決定
- `openspec-workflow/adr/ADR-20260429-module-architecture-style.md` — `core/verification/` の配置方針
- `openspec-workflow/adr/ADR-20260429-positioning-vs-gsd-and-openspec.md` — verification の 5 phase 継承

### 参照 learned-patterns

- 「同一 Agent を異なる role で使うと system prompt と user message が矛盾する」 — implementer / build-fixer 分離の根拠
- 「lifecycle 等の実行戦略はデータ存在で推論せず明示的 discriminator で宣言」 — verification の Step interface 適合方法を選ぶ際の規律
- 「migration の完了判定は production 経路の grep」 — 既存 step との並行運用期を作らず、1 PR で全 step を main 経路に乗せる
- 「openspec validate --strict は Requirement の最初の段落だけを SHALL/MUST 対象として scan する」 — delta spec 作成時の parser quirk
- 「rename-as-MODIFIED」 — delta spec の MODIFIED ブロックで header 改変は禁止

### 参照 PR

- PR #26（D1-D9）— Step interface / StepExecutor / Pipeline state machine の土台
- PR #28（D4-D6）— Step が AgentDefinition を所有する規律
- PR #31（executor-cleanup）— executor.ts の helper 抽出 + @deprecated cleanup
- PR #34（port-tidying）— GitHubClient port purity + fetchSpecReviewResult 削除
