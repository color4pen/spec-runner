# Domain Model — 型/データモデル（Logical View / tactical DDD）

> `components.md`（振る舞いの単位）の対になる **データの単位**。behavior が乗る「形」と「不変条件」を定義する。
> **SoT 境界**: 正確なフィールドはコードが正典（`→ src/...`）。本書は Aggregate 境界・Value Object・常に保つ制約まで（C4 Code level は生成/参照）。
> 制約のうち「常に保つ形」は structure（ここ）、「制約を強制するロジック」は behavior（specs / 歯）。

---

## Aggregate

### JobState — 1 作業単位（slug）の状態（event-sourced）— 整合性境界
- **役割**: 1 作業単位（slug）の状態。**変更は `JobStateStore` 経由のみ**（外から直接書かない＝Aggregate 不変）。durability で 2 つに分解する:
  - **event journal（truth・append-only・branch-borne）**: step attempt（`verdict` / `toolResult` / 時刻）＋ transition（旧 `history`）＝ `changes/<slug>/events.jsonl`。起きた事実であり上書きしない。
  - **projection（cache・overwrite・branch-borne）**: descriptor（`jobId` / `request` / `repository` / `branch` / `pipelineId` / `version` / `createdAt`）＋ cursor（`step` / `status` / `resumePoint` / `updatedAt`）＋ `pullRequest`（pr-created event の materialize）＝ `changes/<slug>/state.json`。journal の fold で再構成できる cache であり truth ではない。
- **identity**: slug ＝ 作業単位の identity（配置キー）。jobId ＝ run/attempt の identity（branch `<prefix><slug>-<jobId8>`・worktree 名に内在。同一 slug の attempt は複数併存しうる）。
- **不変条件**:
  - `events.jsonl` は append-only ＝ truth。projection は journal の fold で再構成可能な cache（truth ではない）。
  - state は branch-borne（step ごと commit）＝ **git が唯一の durable source**（clone / CI checkout で完全）。
  - resume・routing が読む `verdict`・`toolResult` は journal の fold で保持される。
  - `version` は常に 1。`status` は `JobStatus` の列挙内（validateJobState が強制）。
- → `src/state/schema.ts`（正確なフィールドはコードが正典）

> **lifecycle（状態遷移）と liveness（実行時束縛）は動的構造** ＝ `dynamic-model.md`。本書は静的なデータの形のみを持つ。

### StepRun / StepOutcome — 1 step の 1 実行（journal の record）
```ts
interface StepRun { attempt: number; sessionId: string | null; outcome: StepOutcome; startedAt; endedAt }
interface StepOutcome { verdict: Verdict | null; findingsPath: string | null;
  error: ErrorInfo | null; toolResult?: BaseReportResult | null; followUpAttempts? }
```
- **不変条件**: `attempt` は 1-origin 連番。`events.jsonl`（append-only journal）の record。
- **truth の所在**: 成果物の中身は実ファイル（worktree / git）が正典 ―― `fileContent` は Aggregate に持たない。cost（`modelUsage`）は **state ではない** ―― Aggregate 外の cost 追跡ファイル `changes/<slug>/usage.json`（`usageStore` が書く・`JobStateStore` 経由でない）が持つ。
- → `src/state/schema.ts`（正確なフィールドはコードが正典）

---

## Value Objects（等価性 by value、immutable）

### Verdict — step の結果区分
```ts
type Verdict = "approved" | "needs-fix" | "escalation" | "passed" | "failed" | "success" | "error"
```
- → `src/state/schema.ts`（step-class 別の verdict 意味論は契約側＝型 `report-result.ts` ＋ `tests/unit/contract/` が正典）

### StepName 系 — step 名の型安全 union
```ts
type StepName = ...STEP_NAMES;  type AgentStepName = ...AGENT_STEP_NAMES;  type CliStepName = ...CLI_STEP_NAMES
```
- **不変条件**: 新 step は `step-names` の whitelist に追加して初めて型に出る。`ConfigStore.getAgentId(role)` は `AgentStepName` のみ受ける（CliStep 名は compile error）。
- → `src/core/step/step-names.ts`（**現状 `core/step` 配下。ruling D4 で shared-kernel へ降格予定** = model.md §5 R3）

### report_result の typed outcome（agent 自己申告）
```ts
interface BaseReportResult { ok: boolean; reason?: string }
interface ProducerReportResult extends BaseReportResult { status?: "success" | "error" }
interface JudgeReportResult   extends BaseReportResult { approved?: boolean }
interface CodeReviewReportResult extends JudgeReportResult { fixableCount?: number }
```
- → `src/core/port/report-result.ts`（`ok` の意味論・routing が読むフィールドは契約側＝型 ＋ `tests/unit/contract/` が正典）

### AgentDefinition / ParsedStepResult / Transition
```ts
interface AgentDefinition { readonly name; readonly role: AgentStepName; readonly model; readonly system; readonly tools: ToolSpec[] }  // SDK 型を含まない（B-2）
interface ParsedStepResult { verdict: Verdict | null; findingsPath: string | null; fileContent?; scores?; pullRequest? }
interface Transition { step; on: Verdict | string; to: string | "end" | "escalate"; when?(state): boolean }
```
- → `src/core/agent/definition.ts` / `src/core/step/types.ts` / `src/core/pipeline/types.ts`

---

## 型の所在と層（model.md との整合）

| 型 | 現在地 | あるべき層（ruling）|
|---|---|---|
| JobState / StepRun / Verdict / StepName | `src/state/` | shared-kernel（schema）。不変条件ロジックは domain |
| ParsedRequest / ParsedRequestSections | `src/core/request/` | **shared-kernel へ降格**（循環解消、model.md §5 R1）|
| step-names | `src/core/step/` | **shared-kernel へ降格**（model.md §5 R3）|
| port DTO（AgentRunContext 等）| `src/core/port/` | ports（domain VO のみ参照可）|

---

## 使い方

- **書く**: agent が出力する step 結果は `report_result`（typed outcome）で返す。state を触るコードは `JobStateStore` 経由。
- **レビューする**: 新コードが (1) Aggregate を store 経由で変更しているか (2) SDK 型を core/ports に漏らしていないか。詳細は `conformance.md`。
