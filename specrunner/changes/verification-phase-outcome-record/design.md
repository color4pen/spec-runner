# Design: verification の失敗 phase を StepRun outcome に構造化記録する

## Context

verification が失敗しても、job 完了後にどの phase（build / typecheck / test / lint / security /
test-coverage）で落ちたかが判別できない。原因は 2 つ:

1. **markdown が上書きされる**: `verificationResultPath(slug)`（`src/util/paths.ts:67`）は iteration
   番号を持たず、`specrunner/changes/<slug>/verification-result.md` を全 iteration で同一パスに上書きする。
   失敗 → build-fixer が修正 → 再実行で passed の場合、archive には「passed」の markdown しか残らない。
2. **journal の outcome が phase 情報を持たない**: verification は CLI step。`runVerification`
   （`src/core/verification/runner.ts:329`）は `VerificationResult { verdict, phases: PhaseResult[] }`
   を返すが、`src/core/step/verification.ts:49` はこの戻り値を **破棄** する。step 完了後、
   `runCliStep`（`src/core/step/executor.ts:594-611`）は markdown を read し `parseResult` で
   verdict だけを取り出す。その結果、`events.jsonl` の `step-attempt.outcome` は
   `{verdict, findingsPath, error, toolResult:null, followUpAttempts:0}` で phase 情報を持たない
   （実物: archive の events.jsonl で確認済み）。

一方、`events.jsonl` の `step-attempt` は **append-only で iteration ごとに独立記録** される
（`src/store/job-journal.ts` が新規 StepRun を delta-append）。markdown と違い上書きされない。
したがって、破棄されている `VerificationResult.phases` を outcome に載せれば、上書きで失敗原因が
消える経路を journal 側で塞げる。

あわせて `src/core/pipeline/types.ts:176` の `VERIFICATION` loop-exhaustion hint は
`verification-result-${nnn}.md`（連番ファイル）を案内するが、そのファイルは生成されない
（実在するのは常に `verification-result.md`）。他の step の hint は連番ファイルが実在するため正しい。

### データ経路（現状）

```
runVerification() → VerificationResult{verdict, phases}   ← phases が捨てられる
  ↓ (verification.ts:49 が戻り値を破棄)
VerificationStep.run(): Promise<void>
  ↓ executor.runCliStep(): markdown を read → deriveStepCompletion → parseResult → verdict のみ
StepExecutionResult{kind:"success", completion:{verdict}}
  ↓ commit-orchestrator.projectSuccess → pushStepResult
StepOutcome{verdict, findingsPath, error, toolResult, followUpAttempts}   ← phase 情報なし
  ↓ store.persist → job-journal.stepRunToRecord
events.jsonl: {"type":"step-attempt","outcome":{...}}   ← phase 情報なし
```

本 request は、破棄されている `phases` を専用フィールドとして outcome に載せる **記録の追加** であり、
verdict 判定・routing・markdown 出力は一切変えない。

## Goals / Non-Goals

**Goals**:

- verification の各 iteration について、phase 名・status（passed/failed/skipped）・exit code を
  `events.jsonl` の `step-attempt.outcome` に機械可読な形で記録する（markdown 再パース不要）。
- passed iteration についても実行された全 phase の status を記録する（skip 判別のため）。
- 複数 iteration が独立に記録され、後の iteration が前を上書きしない（append-only journal を活用）。
- `VERIFICATION` exhaustion hint を実在ファイル案内に修正する。

**Non-Goals**（request のスコープ外を踏襲）:

- `verification-result.md` の iteration 連番化（build-fixer / propagate 波及があり記録目的には不要）。
- phase 失敗の本文（stdout / stderr / エラーメッセージ）の構造化。本 request は phase 名・status・exit code まで。
- 記録した phase 情報を使った集計・レポート（`job stats` = backlog B-3 は後続）。
- build-fixer の入力を markdown から構造化データへ切り替えること。
- verification の phase 構成・実行順・fail-fast 挙動の変更。
- verdict 判定・遷移テーブル・iteration 予算の変更。

## Decisions

### D1: 構造化 phase データは `CliStep.run()` の戻り値で thread する（markdown 再パースしない）

`CliStep.run()` の戻り型を `Promise<void>` から `Promise<CliStepRunOutcome | void>` に **widen** し、
`VerificationStep.run` が `runVerification` の `VerificationResult.phases` を投影して返す。
`executor.runCliStep` はこの戻り値を捕捉し、`StepExecutionResult` に載せる。

- **Rationale**: 受け入れ基準 1 は「markdown の再パースを伴わないこと」を要求する。phase データの唯一の
  非markdown 源泉は、現在 `verification.ts:49` で破棄されている in-memory の `VerificationResult` である。
  これを run() の戻り値で取り出すのが最短かつ型安全。`parseResult` に markdown から phase を再抽出させる案は
  AC1 に反するため不可。
- **Alternatives considered**:
  - (a) `parseResult` が markdown から phase table を再パース → **AC1 違反**（markdown 再パース）。却下。
  - (b) run() が well-known な sidecar ファイルに phase を書き、executor が読む → side-channel で不透明、
    ファイル I/O 増、上書き問題を再導入。却下。
  - (c) run() 戻り型 widen（採用）→ void を返す既存 CliStep（bite-evidence / pr-create）は
    `void` が `CliStepRunOutcome | void` に代入可能なため無改修。後方互換。

### D2: phase は専用フィールド `StepOutcome.verificationPhases` に格納する（`toolResult` に載せない）

`StepOutcome`（`src/state/schema/types.ts`）と `StepAttemptRecord.outcome`
（`src/store/event-journal.ts`）に optional フィールド `verificationPhases?: VerificationPhaseOutcome[]`
を追加する。

- **Rationale**: `outcome.toolResult` は agent の `report_result`（`BaseReportResult`）専用に型付けされている。
  そこへ verification 固有の phase 配列を詰めるのは型ハックであり、toolResult を読む既存 consumer を混乱させる。
  `completionReportDiagnostics` / `addedTurns` 等と同様、feature 固有の optional フィールドを追加するのが
  既存パターンに一致する。request 背景も「toolResult は phase 情報を持たない」と述べており、別チャネルを示唆する。
- **Alternatives considered**: `toolResult` を流用 → 型の意味を壊す。却下。

### D3: `PhaseResult` を最小の `VerificationPhaseOutcome`（phase / status / exitCode）へ投影する

`VerificationPhaseOutcome = { phase: string; status: "passed"|"failed"|"skipped"; exitCode: number | null }`。
`runner.ts` の `PhaseResult` から `stdout` / `stderr` / `durationMs` / `skippedCount` を **落とす**。

- **Rationale**: request スコープが「phase 名・status・exit code までとする」と明記。stdout/stderr は
  markdown（無改変）に残る。大きな stdout を journal に複製すると events.jsonl が肥大化する。
- **Alternatives considered**: `PhaseResult` をそのまま格納 → スコープ超過 + journal 肥大。却下。
  型定義の置き場所は state schema 層（`src/state/schema/types.ts`）とする。schema / helpers / event-journal /
  port が新規の cross-layer import なしに参照でき、`PhaseResult`（core 層）→ 投影は core 層の
  `VerificationStep.run` が担うため層違反にならない。

### D4: phase は `StepExecutionResult`（`completion` の兄弟）に載せ、verdict 導出経路に触れない

`runCliStep` は run() 戻り値の phase を `StepExecutionResult{kind:"success"}` に直接付加する。
`deriveStepCompletion` / `StepCompletion` / `parseResult` は **一切変更しない**。`projectSuccess`
（`commit-orchestrator.ts:108`）が `result.verificationPhases` を `pushStepResult` に渡す。

- **Rationale**: 受け入れ基準 5・7 は「verdict 判定経路と build-fixer 遷移を現状同一に保つ」を要求。
  phase 記録を verdict 導出（`deriveStepCompletion`）から分離すれば、verdict 系の既存テストは無改変で green を
  維持できる。phase は verdict と直交する観測データである。
- **Alternatives considered**: `StepCompletion` に phase を含める → verdict 導出関数のシグネチャに波及し、
  AC7 の「既存テスト無変更」を脅かす。却下。

### D5: `VERIFICATION` hint を `verification-result.md` 案内に修正する（他 step は無改変）

`src/core/pipeline/types.ts:176` の `VERIFICATION` エントリの `hint` を、実在する
`verification-result.md`（＋ phase 別 status は step-attempt outcome を参照、の旨）へ変更する。
`LoopErrorShape.hint` は `(nnn: string) => string` だが、verification は連番を使わないため引数を無視する
（実引数超過は JS が黙って無視するため型互換）。

- **Rationale**: AC4 / AC6。`spec-review-result-${nnn}.md` 等は連番ファイルが実在するため無改変。
- **Alternatives considered**: hint 生成側（`pipeline.ts:762`）で分岐 → テーブル駆動の設計思想に反する。却下。

## データ経路（変更後）

```
runVerification() → VerificationResult{verdict, phases}
  ↓ verification.ts: 戻り値を捕捉し phases を投影
VerificationStep.run(): Promise<CliStepRunOutcome | void>   → {verificationPhases}
  ↓ executor.runCliStep: 戻り値を捕捉し success 結果へ付加（verdict 導出は無変更）
StepExecutionResult{kind:"success", completion:{verdict}, verificationPhases}
  ↓ projectSuccess → pushStepResult(verificationPhases)
StepOutcome{verdict, ..., verificationPhases}
  ↓ store.persist → stepRunToRecord（新フィールドを serialize）
events.jsonl: {"type":"step-attempt","outcome":{...,"verificationPhases":[...]}}
  ↑ fold() が verificationPhases を再構築（state.json 投影も保持）
```

## Risks / Trade-offs

- **[Risk] `run()` 戻り型 widen が他 CliStep（bite-evidence / pr-create）に波及** →
  **Mitigation**: `void` は `CliStepRunOutcome | void` に代入可能。両 step は無改修で通る。既存テストの
  inline CliStep（`run: async () => {}`）も無改修。
- **[Risk] journal 再構築（`fold`）が新フィールドを落とすと state 読み戻しで消える** →
  **Mitigation**: `StepAttemptRecord.outcome` 型・`stepRunToRecord`・`fold` の 3 箇所すべてに
  `verificationPhases` を通す。round-trip テストで固定（AC3）。
- **[Risk] on-read 正規化（`validateJobState` → `normalizeSteps`）がフィールドを削る** →
  **Mitigation**: current-shape（`"attempt" in obj && "outcome" in obj`）は
  `src/state/schema/operations.ts` で passthrough される（確認済み）。変更不要。
- **[Risk] 失敗 verification が例外を投げれば phase が失われる** →
  **Clarification**: `runVerification` は phase 失敗時も **例外を投げず** `verdict:"failed"` +
  `phases` を返す（`runner.ts` 参照）。step.run は正常完了し success 経路で phase を記録する。
  spawn crash 等の真の例外は halt（error）となる別クラスで、本 request のスコープ外。
- **[Trade-off] 専用フィールド追加で schema 表面が広がる** → optional・後方互換。既存 record は
  `verificationPhases` 不在（undefined）で従来通り解釈される。

## Open Questions

なし。`durationMs` を含めるかは検討したが、スコープ（phase 名・status・exit code まで）に従い除外する。
