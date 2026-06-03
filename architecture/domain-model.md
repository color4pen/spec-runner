# Domain Model — 型/データモデル（Logical View / tactical DDD）

> `components.md`（振る舞いの単位）の対になる **データの単位**。behavior が乗る「形」と「不変条件」を定義する。
> **SoT 境界**: 正確なフィールドはコードが正典（`→ src/...`）。本書は Aggregate 境界・Value Object・常に保つ制約まで（C4 Code level は生成/参照）。
> 制約のうち「常に保つ形」は structure（ここ）、「制約を強制するロジック」は behavior（specs / 歯）。

---

## Aggregate

### JobState（＋ StepRun[]）— 整合性境界
- **役割**: 1 ジョブの全状態。**変更は `JobStateStore` 経由のみ**（外から直接書かない＝Aggregate 不変）。
- **主フィールド**:
  ```ts
  interface JobState {
    version: 1; jobId; createdAt; updatedAt;
    request: RequestInfo; repository: RepositoryInfo; session: SessionInfo | null;
    step: string; status: JobStatus; branch: string | null;
    history: HistoryEntry[]; error: ErrorInfo | null;
    steps?: Record<string, StepRun[]>;   // step 名 → 実行履歴
    pullRequest?: PullRequestInfo; worktreePath?: string | null;
    resumePoint?: ResumePoint | null; pid?: number | null; canceledAt?;
  }
  ```
- **不変条件**:
  - `version` は常に 1。`status` は `JobStatus` の列挙内（validateJobState が強制）。
  - `history` は `MAX_HISTORY_SIZE`(100) で truncate。
  - `steps[name]` は **StepRun[]**（attempt 昇順）。append-only journal。
- → `src/state/schema.ts`

### JobStatus 状態機械（lifecycle）— JobState の遷移不変条件
- **状態集合（7値）**: `running | awaiting-resume | awaiting-archive | failed | terminated | archived | canceled`。
- **区分**: active = {`running`, `awaiting-resume`}（実行中・再開待ち）／ terminal = {`archived`, `canceled`}（出口なし。以後どこへも遷移しない）。
- **許可遷移（VALID_TRANSITIONS）**: 下表のセルのみ許可。表に無い遷移は throw（同一 status への遷移は常に noop=許可）。

  | from \ to | running | awaiting-resume | awaiting-archive | failed | terminated | archived | canceled |
  |---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
  | **running** | — | ✓ | ✓ | ✓ | ✓ |  | ✓ |
  | **awaiting-resume** | ✓ | — |  |  |  |  | ✓ |
  | **awaiting-archive** |  |  | — |  |  | ✓ | ✓ |
  | **failed** | ✓ | ✓ |  | — |  |  | ✓ |
  | **terminated** | ✓ |  |  |  | — |  | ✓ |
  | **archived** |  |  |  |  |  | — |  |
  | **canceled** |  |  |  |  |  |  | — |

- **不変条件**:
  - 遷移の**計算**は `transitionJob`（pure・I/O なし）が VALID_TRANSITIONS を引いて行う。不正遷移は throw・同 status は noop。
  - Aggregate への**永続化**は `JobStateStore` 経由のみ（JobState 不変と同じ。計算と永続化は別レイヤ）。
  - `awaiting-archive → archived` が正常完走の最終遷移（archive が client-closed に確定）。**merge は GitHub 上の外部イベントであり job status の遷移ではない**（CLI は merge を status 遷移として持たない）。`running → awaiting-resume` は異常終了 guard（exit-guard）が倒す checkpoint。
- → `src/state/lifecycle.ts`（VALID_TRANSITIONS / TERMINAL_STATUSES / ACTIVE_STATUSES / transitionJob が正典）／ `src/state/schema.ts`（`JobStatus`。legacy の `success` / `awaiting-merge` は load 時に `awaiting-archive` へ remap）

> **単一 mutator 不変**: `JobState.status` の変更は `transitionJob` 経由のみ。`patch + persist` での status 直書きは禁止（不正遷移を `VALID_TRANSITIONS` で弾き、status mutation を単一 mutator に集約）。この不変は `model.md` B-9 ＝ `tests/unit/architecture/core-invariants.test.ts` が機械強制する。

### StepRun / StepOutcome — 1 step の 1 実行
```ts
interface StepRun { attempt: number; sessionId: string | null; outcome: StepOutcome; startedAt; endedAt; modelUsage? }
interface StepOutcome { verdict: Verdict | null; findingsPath: string | null; fileContent?: string | null;
  error: ErrorInfo | null; toolResult?: BaseReportResult | null; followUpAttempts? }
```
- **不変条件**: `attempt` は 1-origin 連番。append-only。
- → `src/state/schema.ts`

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
