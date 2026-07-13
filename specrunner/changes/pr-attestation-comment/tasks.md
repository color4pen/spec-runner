# Tasks: PR ごとの attestation をコメント添付する

## T-01: attestation の型を宣言する

**File**: `src/core/attestation/types.ts`（新規作成）

`Attestation` とその構成型を宣言する。版号フィールドは持たせない（D6）。

```ts
import type { UsageFile } from "../usage/types.js";

export interface TokenTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface FindingsSummary {
  total: number;
  bySeverity: { critical: number; high: number; medium: number; low: number };
  byResolution: { fixable: number; decisionNeeded: number };
}

export interface GateExecution {
  step: string;
  attempt: number;           // 1-origin
  verdict: string | null;
  startedAt: string;
  endedAt: string;
  findings?: FindingsSummary; // findings を報告した gate のみ
}

export interface StepModels {
  step: string;
  models: string[];          // distinct・昇順
}

export interface StepCost {
  step: string;
  costUsd: number | null;    // null = 価格表に無い / modelUsage なし
  tokens: TokenTotals;
}

export interface CostSummary {
  totalCostUsd: number | null;
  unpricedModels: string[];  // 価格表に無い model キー（昇順・distinct）
  totalTokens: TokenTotals;
  perStep: StepCost[];
}

export interface Attestation {
  journalHash: string;       // events.jsonl の sha256 hex
  gates: GateExecution[];    // startedAt 昇順
  stepModels: StepModels[];  // step 別 model
  cost: CostSummary;
}

export interface AttestationInput {
  journalContent: string;    // events.jsonl 生バイト列
  usage: UsageFile;          // 解析済み usage.json
}
```

- [ ] `src/core/attestation/types.ts` を新規作成し上記型を export する

**Acceptance Criteria**:
- `Attestation` / `AttestationInput` / 構成型が `src/core/attestation/types.ts` から export される
- `bun run typecheck` が exit 0（型のみのため単独で通る）

---

## T-02: `buildAttestation` 純関数を実装する

**File**: `src/core/attestation/build-attestation.ts`（新規作成）

`buildAttestation(input: AttestationInput): Attestation` を副作用なし純関数として実装する（D2/D3/D4/D5）。

### 実装内容

1. **journalHash**: `node:crypto` の `createHash("sha256").update(input.journalContent).digest("hex")`。
2. **fold**: `fold(input.journalContent)`（`src/store/event-journal.ts` の既存純関数）で `steps` を得る。
3. **gates**（D4）:
   - `steps` の全 `StepRun` を平坦化（各要素に step 名を添える）。
   - `(startedAt, endedAt, step, attempt)` の辞書順で安定ソート。
   - 各要素を `{ step, attempt: run.attempt, verdict: run.outcome.verdict ?? null, startedAt, endedAt }` にマップ。
   - `run.outcome.toolResult?.findings`（`Finding[]`）が非空なら `findings` に要約を付ける（severity/resolution 件数。`Finding` 型は `src/kernel/report-result.js`）。resolution は `fixable` / `decision-needed` の 2 値、後者を `decisionNeeded` に集計。
4. **stepModels / cost**（D5）: `input.usage.commandInvocations` を stepName でグルーピングし、
   - `stepModels`: 各 step の `modelUsage`（非 null）のキー集合を distinct・昇順で。
   - `perStep` cost: 各 invocation の各 `(model, ModelUsage)` を `computeCostUsd(model, usage)`（`src/core/usage/pricing.js`）で算出。null（未価格）はその step の `costUsd` を null 方向に寄せ、model キーを `unpricedModels` に追加。token は `TokenTotals` へ合算。
   - `totalCostUsd`: 価格が取れた invocation の合算。全 invocation が未価格 or invocation ゼロなら null。
   - `stepName` を持たない invocation（`command !== "job"` 等）は step 別集計から除外する。
   - `modelUsage === null` の invocation は model 空・cost 寄与なし（cost null 側）。

### 純度制約

- ファイル I/O・ネットワーク・グローバル変数書き込みを行わない（B-5 同型）。
- import は `node:crypto`、`../../store/event-journal.js`（fold）、`../usage/pricing.js`（computeCostUsd）、`../usage/types.js`、`../../kernel/report-result.js`（Finding 型）、`./types.js` に限定。

- [ ] `src/core/attestation/build-attestation.ts` を新規作成し `buildAttestation` を実装・export する
- [ ] gates を `startedAt` 昇順で安定ソートする
- [ ] findings 要約（severity/resolution 件数）を実装する
- [ ] step 別 model と cost を usage.json から導き、未価格 model を `unpricedModels` に列挙する

**Acceptance Criteria**:
- `buildAttestation` が `AttestationInput` から `Attestation` を返す純関数として export される
- 同一 `journalContent` に対し `journalHash` が決定的（sha256 hex）
- `bun run typecheck` が exit 0

---

## T-03: `renderAttestationComment` 純関数を実装する

**File**: `src/core/attestation/render-comment.ts`（新規作成）

`renderAttestationComment(attestation: Attestation): string` を純関数として実装する（D8）。

### 実装内容

- 見出し（例: `## SpecRunner Attestation`）。
- 人間可読サマリ: journal hash、ゲート表（step / attempt / verdict、findings 要約があれば件数）、step 別 model、cost（total / per-step、null は `$?` 等で表示）。
- 機械可読ブロック: attestation object 全体を `JSON.stringify(attestation, null, 2)` して ` ```json ` フェンスで囲む。
- 純関数（I/O なし）。`formatUsd`（`src/core/usage/pricing.js`）を表示に再利用してよい。

- [ ] `src/core/attestation/render-comment.ts` を新規作成し `renderAttestationComment` を実装・export する

**Acceptance Criteria**:
- 返り値の文字列が `json` フェンスブロックを含み、その中身を `JSON.parse` すると元の `attestation` に一致する
- 人間可読サマリに journal hash とゲート数が現れる
- `bun run typecheck` が exit 0

---

## T-04: pr-create に best-effort の attestation 添付を組み込む

**File**: `src/core/step/pr-create.ts`（既存編集）

PR 作成成功（`created` / `existing-open`）かつ `pr-create-result.md` 書き込み後に、attestation 添付を **単一の try/catch** で追加する（D7）。

### 実装内容

- `result.status === "created" || result.status === "existing-open"` の分岐内、result file 書き込みの後に添付処理を置く。
- `typeof result.number === "number"` のときのみ実行。
- 手順:
  1. `journalPath = path.resolve(cwd, slugEventsPath(slug))` を読む。読めない/空文字なら `logWarn` して添付 skip（return せず、通常フローは継続）。
  2. `usagePath = path.resolve(cwd, usageJsonPath(slug))` を `readUsageFile`（`src/core/usage/store.js`）で読む（欠落は空構造で許容）。
  3. `buildAttestation({ journalContent, usage })` → `renderAttestationComment(attestation)` → `deps.githubClient.createIssueComment(deps.owner, deps.repo, result.number, body)`。
- try/catch で全例外を捕捉し `logWarn`（`src/logger/stdout.js`）に留める。re-throw しない。
- `pr-create-result.md` の内容・書き込み順・parseResult の verdict を変えない（添付は result file 書き込みの後）。
- import 追加: `slugEventsPath` / `usageJsonPath`（`src/util/paths.js`）、`readUsageFile`（`src/core/usage/store.js`）、`buildAttestation`（`src/core/attestation/build-attestation.js`）、`renderAttestationComment`（`src/core/attestation/render-comment.js`）、`logWarn`（`src/logger/stdout.js`）。

- [ ] PR 成功分岐に best-effort 添付ブロックを追加する（result file 書き込みの後）
- [ ] 全例外を catch し `logWarn` に留め、re-throw しないことを保証する
- [ ] journal 欠落/空時は `createIssueComment` を呼ばず warn して継続する

**Acceptance Criteria**:
- PR 作成成功時に `createIssueComment` が `result.number` に対して呼ばれる
- 添付経路のいかなる例外も `run` の外へ伝播しない
- `bun run typecheck` が exit 0

---

## T-05: `buildAttestation` の単体テスト

**File**: `tests/unit/core/attestation/build-attestation.test.ts`（新規作成）

events.jsonl 文字列 fixture ＋ usage object を組んで純関数を固定する。

- [ ] 代表 journal（design→...→conformance、verdict 付き）＋ usage → gates 順・各 verdict・step 別 model・cost・journalHash を検証する
- [ ] `journalHash` が `journalContent` の sha256 hex と一致することを `node:crypto` で独立再計算して検証する
- [ ] startedAt が交互の複数 step で gates が `startedAt` 昇順に並ぶことを検証する
- [ ] `outcome.toolResult.findings` の severity/resolution 件数が findings 要約に正しく集計されることを検証する（finding 本文が含まれないことも）
- [ ] pricing 表に無い model → 該当 step `costUsd` が null かつ `unpricedModels` に含まれることを検証する
- [ ] `modelUsage === null` の invocation を持つ step → model 空・cost null になることを検証する

**Acceptance Criteria**:
- 上記ケースが全て green
- `bun test tests/unit/core/attestation/build-attestation.test.ts` で単独実行できる

---

## T-06: `renderAttestationComment` の単体テスト

**File**: `tests/unit/core/attestation/render-comment.test.ts`（新規作成）

- [ ] 出力の `json` フェンスブロックを抽出して `JSON.parse` し、元の `attestation` object に一致することを検証する
- [ ] 人間可読サマリに journal hash とゲート数が現れることを検証する

**Acceptance Criteria**:
- 上記ケースが green
- `bun test tests/unit/core/attestation/render-comment.test.ts` で単独実行できる

---

## T-07: pr-create best-effort 添付の単体テスト

**File**: `tests/unit/step/pr-create.test.ts`（既存編集）または `tests/unit/step/pr-create-attestation.test.ts`（新規）

既存の `makeMinimalState` / `makeMinimalDeps`（`createIssueComment` mock 済み）と `runPrCreate` mock を再利用する。fixture として change folder に events.jsonl と usage.json を書く。

- [ ] PR 作成成功（`created`）時に `createIssueComment` が `result.number` へ 1 回呼ばれ、body が attestation の `json` フェンスを含むことを検証する
- [ ] `createIssueComment` が reject しても `run` が例外を投げず、`pr-create-result.md` が `## Status: success` を保持することを検証する（best-effort）
- [ ] change folder に events.jsonl が無い場合、`createIssueComment` が呼ばれず `run` が成功し `pr-create-result.md` が `## Status: success` を保持することを検証する
- [ ] 既存 TC-008〜020 が引き続き green（回帰なし）

**Acceptance Criteria**:
- 上記 3 ケースが green、既存 pr-create テストが回帰しない
- `bun test tests/unit/step/pr-create.test.ts` で単独実行できる

---

## T-08: `bun run typecheck && bun test` で全体 green を確認する

- [ ] `bun run typecheck` が exit 0
- [ ] `bun test` が全体 green（新規 attestation テストと pr-create テストを含む）

**Acceptance Criteria**:
- 型エラー 0 件
- テスト失敗 0 件

---

## タスク依存関係

```
T-01（types）
  ↓
T-02（buildAttestation） ── T-05（buildAttestation test）
T-03（renderComment）    ── T-06（renderComment test）
  ↓
T-04（pr-create 統合）   ── T-07（pr-create best-effort test）
  ↓
T-08（typecheck + test 全体）
```

T-01 が T-02 / T-03 の前提。T-02・T-03 は並行可。T-04 は T-02・T-03 の後。各実装タスクに対応するテストタスクは実装直後に実施。T-08 は最後に一括検証。
