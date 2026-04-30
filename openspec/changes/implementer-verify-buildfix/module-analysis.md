# Module Analysis — implementer-verify-buildfix

Static analysis (Read-only) for Step 2.5. Scope: testability / readability / cohesion / coupling / reusability / SRP. Out of scope: extensibility, deployment independence, security boundary, business domain boundary.

## 1. 既存コードパターン一覧

| # | パターン | 観測根拠 |
|---|----------|----------|
| 1 | **Step は plain object literal**（`export const XxxStep: Step = { ... }`）として宣言される。class ではない | `src/core/step/propose.ts:38`, `spec-review.ts:61`, `src/core/step/spec-fixer.ts:61` |
| 2 | **AgentDefinition は Step ファイル内に co-locate** され、module-private const として宣言される（`proposeAgentDefinition`, `specReviewAgentDefinition`, `specFixerAgentDefinition`） | `propose.ts:15`, `spec-review.ts:15`, `spec-fixer.ts:15` |
| 3 | **system prompt は `src/prompts/<role>-system.ts` に分離**、`<ROLE>_SYSTEM_PROMPT` const を export | `src/prompts/spec-fixer-system.ts:6`, `spec-review-system.ts:12`, `propose-system.ts` |
| 4 | **buildMessage は user-controlled content を `<user-request>` XML タグで包囲**（prompt injection 防御） | `src/core/step/spec-fixer.ts:35`, `prompts/spec-fixer-system.ts:42` |
| 5 | **resultFilePath が null を返す step は verdict を持たない**（spec-fixer / propose）。`StepExecutor` は `resultFilePath !== null` で fetch をスキップ | `src/core/step/executor.ts:567`, `spec-fixer.ts:80`, `propose.ts:53` |
| 6 | **直前 step の result は `getLatestStepResult(state, stepName)` で取得**（state 直接アクセス禁止） | `src/state/helpers.ts:36`, `spec-fixer.ts:71` |
| 7 | **AGENT_TOOLSET_TYPE + capabilities.gitWrite は Agent 単位で定義**、role 出し分け不可 | `src/core/agent/definition.ts`、design D5 |
| 8 | **Verdict 拡張時の exhaustive switch enforcement** — Pipeline.getStepOutcome は verdict 値で分岐 | `src/core/pipeline/pipeline.ts:249-270` |
| 9 | **Lifecycle helpers は executor-helpers.ts に sibling 抽出**（class メソッドではなく関数） | `src/core/step/executor-helpers.ts:1-9` のヘッダコメント |
| 10 | **transition table は `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` に declarative 一覧** | `src/core/pipeline/types.ts:23` |

## 2. 共通化すべき箇所と理由

| # | 候補 | 軸 | 観測根拠 | 推奨 |
|---|------|-----|----------|------|
| 1 | implementer / build-fixer の **buildMessage 内 git push 指示文** | reusability | spec-fixer.ts:42-50 と同型のテンプレが implementer / build-fixer で発生する。3 ファイルで「commit + push to branch '${branch}'」を文字列化することになる | `src/prompts/git-push-instruction.ts` に `buildGitPushInstruction(branch: string): string` を切り出し、3 step の buildMessage から参照する。design.md D11 と一致 |
| 2 | implementer / build-fixer の **`resultFilePath: null` + `parseResult: { verdict: null, findingsPath: null, fileContent: null }`** | reusability | spec-fixer.ts:80-92 と完全に同一の boilerplate が implementer / build-fixer に出る（合計 3 箇所） | `src/core/step/types.ts` に `NULL_PARSE_RESULT` の named export を追加し、3 step で共有 |
| 3 | **verification phase 名 → script 名のマッピング** | SRP | runner.ts が phase 名と shell command を両方持つと SRP 違反（実行責務 + 設定責務）。tasks.md 3.1 で `phases.ts` に分離する設計と一致 | `src/core/verification/phases.ts` に `PHASE_SCRIPTS: Record<PhaseName, { command: string; args: string[] }>` を分離。runner.ts は phases を読むのみ |
| 4 | **`<user-request>` 包囲テンプレ** | reusability | spec-fixer / implementer / build-fixer の 3 箇所で同じ構造のテンプレが必要 | 本 PR では新規 step 2 つに enforced する規律とするだけで helper 化を見送る（過抽出を避ける） |
| 5 | **`AgentDefinition` boilerplate（name/role/model/system/tools[AGENT_TOOLSET_TYPE]）の繰り返し** | readability | propose / spec-review / spec-fixer / 新 implementer / 新 build-fixer の 5 箇所で 8-10 行の同型 const | 抽出推奨度は **低い**。Step の co-location 規律（design D8 / Pattern #2）を優先 |

## 3. 既存ヘルパー / ユーティリティの活用候補

| # | 既存ヘルパー | 場所 | implementer / build-fixer / verification での活用 |
|---|--------------|------|---------------------------------------------------|
| 1 | `getLatestStepResult(state, stepName)` | `src/state/helpers.ts:36` | build-fixer.buildMessage で「直前 verification の findingsPath 取得」に必須。tasks.md 5.3 が既に指定 |
| 2 | `executor-helpers.ts` の `recordFailedStepResult` / `attachStateAndRethrow` / `throwWrappedError` / `failStepWithError` | `src/core/step/executor-helpers.ts` | StepExecutor の `kind === "cli"` 分岐内でも使用。verification runner の例外ラップは既存 helper を流用すべき |
| 3 | `pushStepResult` | `src/state/helpers.ts` | 全新 step の StepRun 記録に使用 |
| 4 | `JobStateStore` | `src/store/job-state-store.ts` | verification runner が直接 `verification-result.md` を書き出す場合でも、history append は `JobStateStore.appendHistory` を使う（fs 直接書き込み禁止） |
| 5 | `AGENT_TOOLSET_TYPE` const | `src/core/agent/definition.ts` | implementer / build-fixer Agent の tools 配列に必須 |
| 6 | `StepName` / `Verdict` union（拡張後） | `src/state/schema.ts` | verification の verdict として `"passed" \| "failed"` を使用、implementer / build-fixer は session 完了で `"success"`、例外で `"error"` を導出 |
| 7 | **未活用** — verification runner 用の child_process ラッパーは既存なし | — | `node:child_process.spawn` を `src/core/verification/runner.ts` に新設 |

## 4. 分割単位の推奨

### 4.1 ファイル構成 — `src/core/verification/` ディレクトリ新設の妥当性

ADR-20260429-module-architecture-style に準拠する場合、**verification は `src/core/verification/` 直下に runner.ts と phases.ts を置く** 構成が正しい（軸: cohesion）。理由:

- verification の責務は「shell script を順次 spawn → 結果集約 → md 書き出し」であり、Step interface 適合（`src/core/step/verification.ts`）とは別レイヤ
- `src/core/step/verification.ts` は **Step interface adapter として薄く** し（`run()` 内で `runVerification()` を呼ぶだけ）、shell 実行ロジック本体は `src/core/verification/runner.ts` に置く
- 将来 verification を CI 環境（GitHub Actions など）から直接呼ぶケースが出ても、`runVerification()` 単独で再利用可能（軸: reusability）
- 観測根拠: `src/core/agent/`, `src/core/pipeline/`, `src/core/port/`, `src/core/event/` が既に「機能単位の subdirectory」分割パターンで揃っており、verification も同形にするのが整合的

**推奨:**
- `src/core/verification/runner.ts` — `runVerification(slug: string, deps: VerificationDeps): Promise<VerificationResult>`
- `src/core/verification/phases.ts` — `PHASE_NAMES` / `PHASE_SCRIPTS` の config 化
- `src/core/verification/result-writer.ts`（任意）— `verification-result.md` の format 化を runner.ts から分離（軸: SRP）
- `src/core/step/verification.ts` — Step interface adapter（`kind: "cli"`）。runner.ts への薄い proxy

### 4.2 Step 型の分離 — `Step` / `AgentStep` / `CliStep` 境界

**design D1 の discriminated union 設計** は cohesion / SRP 観点で正しい。検証ポイント:

| 軸 | 評価 | 根拠 |
|----|------|------|
| testability | 改善 | `step.kind === "cli"` で StepExecutor 分岐を mock しやすい。`AgentStep` の test と `CliStep` の test を独立に書ける |
| readability | 改善 | `null` agent の暗黙推論を排除。CliStep の field が「agent を持たない」ことを型で明示 |
| cohesion | 改善 | AgentStep は session lifecycle に必要な field（agent, toolHandlers, buildMessage）に絞られ、CliStep は run() のみ |
| coupling | **要監視** | `StepExecutor.execute(step)` は `step.kind` を読むことで step の variant を知る。これは PR #31 の「executor は step 名を知らない」原則の **境界線上** にある（後述） |
| reusability | 中立 | discriminator の追加で後続 step（PR step など）も同 pattern で追加できる |
| SRP | 改善 | session 持つ step / 持たない step の責務分離 |

### 4.3 PR #31 の executor-step 非依存性は維持されるか

**結論: 維持される（条件付き）**

PR #31 が達成したのは「executor が step **名** を hardcode 分岐しない」原則。design D1 の discriminator は **step 名ではなく step の variant kind** で分岐するため、原則を破らない。具体検証:

- `step.kind === "agent" | "cli"` での分岐は **構造的分岐**（型システムが variant を強制）であり、`step.name === "verification"` のような **identity による分岐** とは性質が異なる
- 既存 `runStepInternal` は `step.toolHandlers && step.toolHandlers.size > 0` で propose-style / polling-style を分岐している（`executor.ts:80-85`）。これは既に「データ存在による暗黙分岐」で **anti-pattern 寄り**。D1 の discriminator は将来この分岐も `kind: "propose" | "polling" | "cli"` のような明示分岐に発展できる素地になる
- ただし tasks.md 8.3 の「step 名 hardcode 分岐がないことを grep で検証する CI test」は **必須** とする

**観測根拠:**
- `src/core/step/executor.ts:80-85`（既存の暗黙分岐ロジック）
- `src/core/step/executor.ts:636-642`（`getTimeoutMs` 内の `stepName === "spec-review"` / `"spec-fixer"` 分岐 — 既に PR #31 後も残っている軽微な原則違反。verification step 追加時に同形の分岐を増やさないこと）

### 4.4 `src/core/step/types.ts` への共有型追加候補（重複回避）

| # | 追加候補 | 利用先 | 軸 |
|---|----------|--------|-----|
| 1 | `type AgentStepName = Exclude<StepName, "verification">` | AgentRegistry / config schema の型厳密化（design D8） | readability |
| 2 | `const NULL_PARSE_RESULT: ParsedStepResult = { verdict: null, findingsPath: null, fileContent: null }` | implementer / build-fixer / spec-fixer / propose の `parseResult` で共有 | reusability |
| 3 | `interface CliStepRunDeps` — `run(state, deps: CliStepRunDeps)` で必要な依存（slug, JobStateStore など）を絞る | VerificationStep および将来の CLI step | coupling |
| 4 | `interface VerificationResult { verdict: "passed" \| "failed"; phases: PhaseResult[] }` — types.ts ではなく `src/core/verification/types.ts` 推奨 | runner / step / result-writer 間の契約 | coupling |

### 4.5 implementer / build-fixer 共通化 — design D11 の具体化

3 step 間（spec-fixer / implementer / build-fixer）は以下の共通形:

| 項目 | spec-fixer | implementer | build-fixer |
|------|-----------|-------------|-------------|
| `kind` | "agent" | "agent" | "agent" |
| `agent.tools` | `[AGENT_TOOLSET_TYPE]` | `[AGENT_TOOLSET_TYPE]` | `[AGENT_TOOLSET_TYPE]` |
| `capabilities.gitWrite` | true | true | true |
| `toolHandlers` | undefined | undefined | undefined |
| `resultFilePath` | null | null | null |
| `parseResult` | NULL_PARSE_RESULT | NULL_PARSE_RESULT | NULL_PARSE_RESULT |
| buildMessage 末尾 | "commit + push" 指示 | "commit + push" 指示 | "commit + push" 指示 |
| 直前 step の findingsPath 利用 | spec-review-result.md | tasks.md / specs/ | verification-result.md |

**抽出推奨（軸: reusability + readability）:**

1. `src/prompts/git-push-instruction.ts` — `buildGitPushInstruction(branch: string): string` を export
2. `src/core/step/types.ts` に `NULL_PARSE_RESULT` const を追加し、3 step で共有

**抽出非推奨:**

- 「`gitWrite: true` agent step factory」の作成 — Agent 定義を factory で作ると Step の co-location 規律（Pattern #2）が崩れる

## 5. Top 3 Cohesion / Coupling Concerns

1. **[coupling] StepExecutor の `runProposeStyleStep` / `runPollingStyleStep` 暗黙分岐** — `step.toolHandlers` の存在で分岐する現状（`executor.ts:80-85`）は、CliStep 追加で 3 way 分岐になる際に anti-pattern が露呈する。本 PR は kind 分岐の追加のみに絞り、後続 PR で kind ベース統一する

2. **[cohesion] `runPollingStyleStep` 内の spec-review hardcode** — `executor.ts:572` で `state.steps?.["spec-review"]?.length` を直接参照している。verification は `kind: "cli"` で別 path を通る前提で本 PR では問題なし、ただし設計上の異臭として記録

3. **[coupling] `Pipeline.handleExhausted` の SPEC_REVIEW_RETRIES_EXHAUSTED hardcode** — `pipeline.ts:276-307` は spec-review に紐付いた error code / message を生成する。tasks.md 9.2-9.3 で汎用化が予定されているが、loop name と error code のマッピングを **transition table から導出** する設計に揃える必要あり

## Notes (Out-of-Scope 観測)

- **extensibility**（後続 PR の code-review / code-fixer / PR step 追加容易性）: スコープ外
- **deployment independence**: スコープ外
- **security boundary**: `<user-request>` 包囲は既知の既存規律
- **business domain boundary**: スコープ外

## 推奨タスク追加（orchestrator が tasks.md に折り込み判断）

- **Task 1.3** (新規): `src/prompts/git-push-instruction.ts` に `buildGitPushInstruction(branch)` を新設し implementer / build-fixer / spec-fixer の 3 step から参照
- **Task 1.4** (新規): `src/core/step/types.ts` に `NULL_PARSE_RESULT` const を追加し agent-less verdict step 4 箇所で共有
- **Task 1.5** (新規): `src/state/schema.ts` に `AgentStepName = Exclude<StepName, "verification">` を追加（design D8 の型レベル強制）
- **Task 3.7** (新規): `src/core/verification/result-writer.ts` を分離（任意、SRP 強化のため）
- **Task 9.5** (新規): `Pipeline.handleExhausted` の loop name → error code mapping を transition table 由来の lookup に汎用化
- **Task 8.5** (新規): `runPollingStyleStep` 内の `state.steps?.["spec-review"]?.length` hardcode 参照を `state.steps?.[step.name]?.length` に汎用化
