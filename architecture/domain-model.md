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
  - `version` は `1 | 2`（新規 state は 2、旧 version 1 は read 時に 2 へ normalize）。`status` は `JobStatus` の列挙内（validateJobState が強制）。
- → `src/state/schema.ts`（正確なフィールドはコードが正典）

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
interface JudgeReportResult   extends BaseReportResult { approved?: boolean; findings?: Finding[]; observations?: Observation[] }
interface CodeReviewReportResult extends JudgeReportResult { fixableCount?: number }
```
- → `src/core/port/report-result.ts`（`ok` の意味論・routing が読むフィールドは契約側＝型 ＋ `tests/unit/contract/` が正典）

### Finding — judge の指摘単位（verdict 導出の入力）
```ts
interface Finding { severity: "critical" | "high" | "medium" | "low";
  resolution: "fixable" | "decision-needed"; file: string; line?: number; title: string; rationale: string; options?: DecisionOption[]; origin?: "scope" }
```
- **不変条件**:
  - judge 系 step（spec-review / code-review / request-review）の verdict は agent 申告値ではなく findings から CLI が決定的に導出する（純関数 `deriveJudgeVerdict` / `deriveRequestReviewVerdict` / `collectFixableFindings`）。`approved` / `fixableCount` / 申告 `verdict` は導出・routing に影響しない（受理のみ）。
  - verdict に影響する findings（severity critical / high、または resolution decision-needed）は RuntimeStrategy の実在検証（file / line の存在確認）を通る。
  - `resolution: "decision-needed"` の finding は選択肢 `options`（各 `{label, consequence}`）を ≥2 持つ（新規 tool 入力は strict 検証で拒否、legacy state read は寛容）。2 案を articulate できないものは定義上 `fixable`。
  - decision ledger（`JobState.decisions`）に決定済みの finding は verdict 導出から除外される＝ 同一論点の再報告は re-escalation を起こさない。
  - `origin?: "scope"` は finding の**出自**の discriminator（粗く「scope 由来か否か」のみ。absent = in-scope = 現行。細かい理由は `rationale` に接地）。出自は resolution（解消形）とは別軸で、新 resolution 値は導入しない。
  - **verdict 導出の入力は2源**: agent 申告の finding ＋ **CLI が機械導出する scope finding**。後者は `permissionScope` の breach（または評価不能）から純関数で `origin:"scope"` の decision-needed finding として**合成**され、agent 申告の finding と**同一の `deriveJudgeVerdict` → escalation → decision-ledger 経路**を通る（並行機構を作らない）。「判断は導出する、自己申告させない」を境界（権限）にも適用した形。
- → `src/kernel/report-result.ts`（型）/ `src/core/step/judge-verdict.ts`（導出の純関数。fs / child_process を import しない＝B-5）

### DecisionOption / Observation — finding 周辺の VO
```ts
interface DecisionOption { label: string; consequence: string }   // decision-needed finding の選択肢
interface Observation { severity: "critical"|"high"|"medium"|"low"; file: string; line?: number; title: string; rationale: string }  // resolution 無し
```
- **Observation**: 「対応不要・記録のみ」の観察。findings と対の独立チャネルで、**verdict に影響しない**（judge / request-review の typed outcome に `observations?` として載る）。「要対応」は finding、「対応不要の記録」は observation という振り分け。
- → `src/kernel/report-result.ts`

### Decision ledger — 人間判断の台帳（`JobState.decisions`）
```ts
interface DecisionRecord { id: string; step: string; findingKey: string;
  finding: { title: string; file: string; line?: number; rationale: string; severity; options? };  // 決定時の finding snapshot
  selectedOption: { number: number; label: string; consequence: string };
  resumeComment?: string; decidedAt: string; source: "issue-comment" }
```
- **役割**: escalation した `decision-needed` finding への人間の選択を構造化し JobState に記録する（projection 側 `JobState.decisions?: DecisionRecord[]`、legacy 欠落 = 空台帳）。
- **不変条件**: `findingKey` は `computeFindingKey`（step / file / line / 正規化 title / 正規化 rationale）で決定的に導出。verdict 導出は台帳に合致する finding を blocking として数えない（蒸し返しの構造的封殺）。
- → `src/core/decision/decision-ledger.ts`（key 導出・台帳照合の純関数）/ `src/state/schema.ts`（`DecisionRecord` / `JobState.decisions`）

### PermissionScope / ForbiddenSurface — pipeline profile の権限スコープ宣言
```ts
interface ForbiddenSurface { id: string; paths: readonly string[] }   // base...HEAD 変更ファイルに当てる glob denylist
interface PermissionScope { checkpoint: string; forbidden: readonly ForbiddenSurface[] }  // checkpoint = breach を評価する judge step
```
- **役割**: `PipelineDescriptor.permissionScope?`（任意・absent = 無制限 = 現行）として、その profile が「触らないと約束する面」を宣言する。`checkpoint` の judge step で、最終 diff の変更ファイルを `forbidden` の glob に当てて breach を機械導出する。
- **不変条件**: breach 判定は純関数（`deriveScopeBreach`。I/O は RuntimeStrategy seam 経由＝B-5）。breach も評価不能（UNKNOWN）も `origin:"scope"` の decision-needed finding に**合成**され、既存の judge verdict 導出経路へ載る。`permissionScope` を宣言する profile は changed-files 導出可能な runtime を要求する（着手前 capability gate → `dynamic-model.md`、real runtime 側の能力必須化は B-11）。
- → `src/core/pipeline/types.ts`（型）/ `src/core/pipeline/scope.ts`（breach 導出・finding 合成の純関数）

### StepHalt — step 停止判断の VO
```ts
type StepHalt =
  | { kind: "failed";        error: ErrorInfo; thrownErr: Error; recordOpts?; history? }
  | { kind: "awaiting-resume"; error: ErrorInfo; thrownErr: Error; resumePoint; interruption; statePatch?; recordOpts?; history? }
```
- **役割**: guard 条件（タイムアウト・出力ゲート違反・drift 検知等）が生成する「step 停止判断の値」。I/O なし・pure value。`CommitOrchestrator.commitHalt` が受け取り、永続化・FSM 遷移・rethrow を一括担う（B-13/B-14）。
- **不変条件**:
  - `StepExecutor` の各 guard は `makeXxxHalt` factory で値を生成するだけ。`store.persist` / `transitionJob` / `attachStateAndRethrow` を直接呼ばない（B-13 / B-14）。
  - `history` フィールドは CommitOrchestrator が `ts` を付与して `store.appendHistory` に渡す（factory 側で `ts` は不要）。
  - `recordOpts` は `recordFailedStepResult` の第4引数として転送（`startedAt` / `transientRetryAttempts` 等の差異を guard ごとに吸収）。
  - `resumePoint.step` は `toStepName(stepName)` で型安全な `StepName` に変換。
- → `src/core/step/step-halt.ts`（型定義・factory 群）

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
