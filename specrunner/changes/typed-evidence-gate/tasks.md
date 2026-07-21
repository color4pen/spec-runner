# Tasks: judge 完了契約に evidence counts を追加し、確認ゼロ・全 skip を非 green にする

<!-- 実装対象ファイル一覧（参照用）
- src/kernel/report-result.ts             — T-01: Evidence 型を追加
- src/core/port/report-result.ts          — T-01/T-02: Evidence re-export・JudgeReportResult 拡張・parseEvidence・parseJudgeReportInput 必須化
- src/core/step/report-tool.ts            — T-03: 3 judge tool の zodSchema に evidence 追加・description 更新
- src/core/step/judge-verdict.ts          — T-04: deriveJudgeVerdict / deriveConformanceVerdict に evidence 引数・vacuous ルール
- src/core/port/step-types.ts             — T-04: judgeVerdictFn 型に evidence 引数
- src/core/step/step-completion.ts        — T-05: evidence を verdictFn へ受け渡し・診断出力・persist 型拡張
- src/state/schema/types.ts               — T-06: StepOutcome.toolResult に evidence?（後方互換）
- src/state/helpers.ts                    — T-06: StepResultInput.toolResult に evidence?
- src/prompts/judge-rules.ts              — T-07: EVIDENCE_COUNTS_DEFINITION 新設
- src/prompts/code-review-system.ts       — T-07: EVIDENCE_COUNTS_DEFINITION 注入
- src/prompts/spec-review-system.ts       — T-07: 同上
- src/prompts/custom-reviewer-system.ts   — T-07: 同上
- src/prompts/conformance-system.ts       — T-07: 同上
- src/prompts/regression-gate-system.ts   — T-07: 同上
- tests/ 各所                             — T-08: 新規 unit テスト + 既存フィクスチャ/テストの追随修正
-->

---

## T-01: Evidence 型の追加と judge 完了結果型の拡張

judge 完了契約に検証量を運ぶ `Evidence` 型を追加し、judge 系の typed 完了結果型に optional フィールドとして載せる。

- [x] `src/kernel/report-result.ts` に `Evidence` インターフェースを追加する（`Finding` / `Observation` と同じ層）。
  ```typescript
  /** Verification-volume counts reported by judge steps via report_result. */
  export interface Evidence {
    /** Number of items actually verified (files read, scenarios traced, requirements checked). */
    checked: number;
    /** Number of in-scope items that were NOT verified. */
    skipped: number;
    /** Number of items that could not be verified and are declared unconfirmed. */
    unverified: number;
  }
  ```
- [x] `src/core/port/report-result.ts` で `Evidence` を kernel から import し re-export する（既存の `Finding` / `Observation` re-export と同じ行）。
- [x] `src/core/port/report-result.ts` の `JudgeReportResult` インターフェースに `evidence?: Evidence;` を追加する（型上は optional）。`CodeReviewReportResult` / `ConformanceReportResult` は継承で取得するため個別追加は不要。
- [x] `RequestReviewReportResult` には `evidence` を**追加しない**（request-review は対象外）。

**Acceptance Criteria**:
- `Evidence` 型が `src/kernel/report-result.ts` に export され、`src/core/port/report-result.ts` から re-export される。
- `JudgeReportResult` に `evidence?: Evidence` が存在し、`CodeReviewReportResult` / `ConformanceReportResult` から参照できる。
- `RequestReviewReportResult` に `evidence` フィールドが無い。
- `bun run typecheck` が緑。

---

## T-02: evidence の必須化（parse 強制）

`ok: true` の judge 完了報告で `evidence` を必須化する。`findings` 必須化と同じ機構（ハンドライト parse）に載せる。

- [x] `src/core/port/report-result.ts` に `parseEvidence` ヘルパーを追加する（純関数・I/O なし）。
  ```typescript
  export function parseEvidence(
    raw: unknown,
  ): { ok: true; value: Evidence } | { ok: false } {
    if (typeof raw !== "object" || raw === null) return { ok: false };
    const o = raw as Record<string, unknown>;
    for (const key of ["checked", "skipped", "unverified"] as const) {
      const v = o[key];
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return { ok: false };
    }
    return {
      ok: true,
      value: {
        checked: o["checked"] as number,
        skipped: o["skipped"] as number,
        unverified: o["unverified"] as number,
      },
    };
  }
  ```
- [x] `parseJudgeReportInput` の `ok=true` ブロックで、`findings` 必須化の直後に evidence 必須化を追加する。
  ```typescript
  if (result.ok) {
    const parsed = parseFindings(obj["findings"], true);
    if (!parsed.ok) {
      return { ok: false, missingFields: ["findings"], rawInput: raw };
    }
    result.findings = parsed.value;

    const parsedEvidence = parseEvidence(obj["evidence"]);
    if (!parsedEvidence.ok) {
      return { ok: false, missingFields: ["evidence"], rawInput: raw };
    }
    result.evidence = parsedEvidence.value;
  }
  ```
- [x] `parseCodeReviewReportInput` / `parseConformanceReportInput` は `parseJudgeReportInput` に委譲済みのため**変更しない**（evidence 必須化を自動継承する）。委譲が成立していることをコードで確認する。
- [x] `parseRequestReviewReportInput` は**変更しない**（evidence を要求しない）。
- [x] `ok=false` のとき evidence を要求しないこと（`ok=true` ブロック内でのみチェック）を保証する。

**Acceptance Criteria**:
- `parseJudgeReportInput({ ok: true, findings: [] })`（evidence なし）→ `{ ok: false }`、`missingFields` に `"evidence"` を含む。
- `parseJudgeReportInput({ ok: true, findings: [], evidence: { checked: 3, skipped: 0, unverified: 0 } })` → `{ ok: true }`、`value.evidence` が一致。
- `parseJudgeReportInput({ ok: true, findings: [], evidence: { checked: -1, skipped: 0, unverified: 0 } })` → `{ ok: false }`（負値拒否）。
- `parseJudgeReportInput({ ok: true, findings: [], evidence: { checked: 1.5, ... } })` → `{ ok: false }`（非整数拒否）。
- `parseJudgeReportInput({ ok: false, reason: "x" })` → `{ ok: true }`（ok=false は evidence 不要）。
- `parseCodeReviewReportInput` / `parseConformanceReportInput` が evidence なし ok=true を parse 失敗にする。
- `parseRequestReviewReportInput({ ok: true })` → `{ ok: true }`（従来どおり）。

---

## T-03: report tool スキーマと description の更新

3 つの judge tool spec の zodSchema に `evidence` を追加し、tool description に必須フィールドとして明記する。

- [x] `src/core/step/report-tool.ts` に `evidenceSchema` を定義する（`zod/v4-mini` の `object` / `number`）。
  ```typescript
  const evidenceSchema = object({
    checked: number(),
    skipped: number(),
    unverified: number(),
  });
  ```
- [x] `JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` / `CONFORMANCE_REPORT_TOOL` の `zodSchema` に `evidence: optional(evidenceSchema)` を追加する（`findings` と同じく zod 上は optional。実強制は parseInput）。
- [x] 上記 3 tool の `description` を更新し、`ok=true` で `evidence: { checked, skipped, unverified }`（すべて非負整数）が REQUIRED であること、`checked` は実際に検証した項目数であり `checked === 0` は判定不能として扱われることを明記する。
- [x] `REQUEST_REVIEW_REPORT_TOOL` は**変更しない**。
- [x] `PRODUCER_REPORT_TOOL` は**変更しない**。

**Acceptance Criteria**:
- `JUDGE_REPORT_TOOL.zodSchema` / `CODE_REVIEW_REPORT_TOOL.zodSchema` / `CONFORMANCE_REPORT_TOOL.zodSchema` に `evidence` キーが存在する。
- 3 tool の `description` に `evidence` / `checked` / `skipped` / `unverified` の記述がある。
- `REQUEST_REVIEW_REPORT_TOOL.zodSchema` に `evidence` が無い。
- `toCustomToolSpec` 経由の JSON schema 生成が型エラーなく通る（`bun run typecheck` 緑）。

---

## T-04: verdict 導出の拡張（vacuous ルール）

`deriveJudgeVerdict` に evidence 引数と `checked === 0 → escalation` を追加する。`deriveConformanceVerdict` は転送する。`deriveRegressionGateVerdict` / `deriveRequestReviewVerdict` は変更しない。

- [x] `src/core/step/judge-verdict.ts` で `Evidence` 型を import する。
- [x] `deriveJudgeVerdict` のシグネチャを `(findings: Finding[], ok: boolean, evidence?: Evidence)` に拡張する。ロジック:
  ```typescript
  export function deriveJudgeVerdict(
    findings: Finding[],
    ok: boolean,
    evidence?: Evidence,
  ): "approved" | "needs-fix" | "escalation" {
    if (!ok) return "escalation";
    if (evidence !== undefined && evidence.checked === 0) return "escalation"; // vacuous
    if (findings.some((f) => f.resolution === "decision-needed")) return "escalation";
    if (findings.some((f) => f.severity === "critical" || f.severity === "high")) return "needs-fix";
    return "approved";
  }
  ```
  - vacuous チェックは `!ok` の直後（decision-needed / blocking より前）に置く。
  - `evidence === undefined` のとき vacuous チェックを飛ばし従来導出（後方互換）。
- [x] `deriveConformanceVerdict` のシグネチャを `(findings, ok, evidence?)` に拡張し、内部の `deriveJudgeVerdict(findings, ok)` を `deriveJudgeVerdict(findings, ok, evidence)` にする。それ以外のロジック（fixTarget 集計）は不変。
- [x] `deriveRegressionGateVerdict` は**変更しない**（`(findings, ok)` のまま）。docstring に「vacuous ルールは適用しない。regression-gate は skipWhen により ledger 非空でのみ実行され、checked=0 の approved 経路は実運用で発生しない」旨のコメントを追加する。
- [x] `deriveRequestReviewVerdict` は**変更しない**（request-review は対象外）。
- [x] `src/core/port/step-types.ts` の `judgeVerdictFn` 型を拡張する:
  ```typescript
  judgeVerdictFn?: (
    findings: import("../../kernel/report-result.js").Finding[],
    ok: boolean,
    evidence?: import("../../kernel/report-result.js").Evidence,
  ) => "approved" | "needs-fix" | "escalation";
  ```
  - `deriveRegressionGateVerdict`（2 引数）は引数が少ないため引き続きこの型に代入可能であることを確認する。

**Acceptance Criteria**:
- `deriveJudgeVerdict([], true, { checked: 0, skipped: 3, unverified: 0 })` → `"escalation"`。
- `deriveJudgeVerdict([], true, { checked: 5, skipped: 0, unverified: 0 })` → `"approved"`。
- `deriveJudgeVerdict([finding("critical","fixable")], true, { checked: 2, skipped: 0, unverified: 0 })` → `"needs-fix"`。
- `deriveJudgeVerdict([finding("low","decision-needed")], true, { checked: 2, skipped: 0, unverified: 0 })` → `"escalation"`。
- `deriveJudgeVerdict([], true)`（evidence なし）→ `"approved"`（後方互換）。
- `deriveConformanceVerdict([], true, { checked: 0, skipped: 0, unverified: 0 })` → `"escalation"`。
- `deriveConformanceVerdict([finding("high","fixable")], true, { checked: 1, ... })` → `"needs-fix:..."`（fixTarget 集計不変）。
- `deriveRegressionGateVerdict` の既存テストが無改変で緑（導出不変の証明）。
- `judgeVerdictFn` 型拡張後も `createRegressionGateStep().judgeVerdictFn === deriveRegressionGateVerdict` が型エラーなく成立。

---

## T-05: step-completion の evidence 受け渡しと診断出力

`deriveStepCompletion` で judge/conformance step の verdict 導出に evidence を渡し、`checked === 0` を人間に surfacing する。persist 型も拡張する。

- [x] `src/core/step/step-completion.ts` の `isConformanceStep` 分岐で `deriveConformanceVerdict(undecidedFindings, tr.ok)` を `deriveConformanceVerdict(undecidedFindings, tr.ok, tr.evidence)` にする（`tr` は `JudgeReportResult`）。
- [x] `isJudgeStep` 分岐で `verdict = verdictFn(undecidedFindings, (toolResult as JudgeReportResult).ok)` を `verdict = verdictFn(undecidedFindings, tr.ok, tr.evidence)` にする（`tr` を `JudgeReportResult` として参照）。
  - `verdictFn` が `deriveRegressionGateVerdict`（2 引数）の場合でも第 3 引数は無視されるため安全。
- [x] `isRequestReviewStep` 分岐は**変更しない**。
- [x] `checked === 0` の診断出力を追加する: judge/conformance step で `tr.evidence?.checked === 0` を検出したら `stderrWrite` で理由を出力する（例: `[<step.name>] vacuous check: checked=0 — 検証実績ゼロのため approved を保留し escalation`）。既存の null-verdict 警告と同じ surfacing パターン。
- [x] `StepCompletion.persistToolResult` の型と `deriveStepCompletion` 内の `persistToolResult` / `effectiveToolResult` 局所型を `(BaseReportResult & { findings?: Finding[]; evidence?: Evidence })` に拡張する（spread で evidence が実行時に運ばれるのを型に反映）。`Evidence` を import する。

**Acceptance Criteria**:
- judge step が `{ ok: true, findings: [], evidence: { checked: 0, ... } }` を報告したとき、`deriveStepCompletion` の返す verdict が `"escalation"`。
- judge step が `{ ok: true, findings: [], evidence: { checked: 3, ... } }` を報告したとき、verdict が `"approved"`。
- conformance step の `checked: 0` 報告が `"escalation"` になる。
- `checked === 0` 検出時に stderr へ診断が出る。
- `persistToolResult` に evidence が保持され、`pushStepResult` 経由で state に永続化される。
- `bun run typecheck` 緑。

---

## T-06: 永続化スキーマの後方互換拡張

過去 record（evidence 無し）の読み取り・resume を壊さないよう、toolResult 型に `evidence?` を additive に追加する。

- [x] `src/state/schema/types.ts` の `StepOutcome.toolResult` 型に `evidence?: Evidence` を追加する（`kernel/report-result.js` から `Evidence` を import）。
  - 現在: `toolResult?: (BaseReportResult & { approved?: boolean; findings?: Finding[]; observations?: Observation[] }) | null;`
  - 変更後: 上記に `evidence?: Evidence` を追加（optional のまま）。
- [x] `src/state/helpers.ts` の `StepResultInput.toolResult` 型（line 71）に `evidence?: Evidence` を追加する（`BaseReportResult` の import 隣で `Evidence` を import）。
- [x] `pushStepResult` は `partial.toolResult` を丸ごと outcome に載せるため、追加ロジックは不要であることを確認する（evidence は spread で運ばれる）。
- [x] 過去 record を読む消費者（`findings-ledger.ts` の `collectFindingsLedger`、`decision-ledger.ts`、`getLatestStepResult`）は `toolResult.findings` のみ読み `evidence` を要求しないことを確認する（コード変更不要の確認タスク）。

**Acceptance Criteria**:
- evidence を持たない judge `StepRun` を含む `JobState` の読み取り（`collectFindingsLedger` / `getLatestStepResult`）が例外なく成功する。
- evidence を持つ toolResult が `pushStepResult` で永続化され、読み戻せる。
- 旧形式 record を含む state での resume が正常動作する（該当 resume/state テストが緑）。
- `bun run typecheck` 緑。

---

## T-07: judge prompt への evidence 記入指示の注入

evidence 記入指示を単一ソース fragment 化し、evidence を報告する 5 judge prompt の Completion 節に注入する。

- [x] `src/prompts/judge-rules.ts` に `EVIDENCE_COUNTS_DEFINITION` を新設する。`EVIDENCE_DISCIPLINE`（fragments.ts）と整合する文言で、以下を含める:
  - `report_result` の `evidence` フィールドに `checked` / `skipped` / `unverified` の 3 件数を必須申告する。
  - 各件数の意味（checked = 実際に検証した項目数、skipped = 対象だが未検証、unverified = 未確認申告）。
  - `checked === 0` は**判定不能**として扱われる（EVIDENCE_DISCIPLINE の「空集合・全 skip は判定不能」の機械化）旨。findings が空でも実際に検証した項目があれば `checked > 0` を申告する旨。
  - 文言は「判定不能」に留め、具体的 routing（escalation）を断定しない（regression-gate と共有するため）。
- [x] 以下 5 prompt の Completion 節に `${EVIDENCE_COUNTS_DEFINITION}` を埋め込む（`OBSERVATION_DEFINITION` と同じ import・埋め込みパターン）:
  - `src/prompts/code-review-system.ts`
  - `src/prompts/spec-review-system.ts`
  - `src/prompts/custom-reviewer-system.ts`
  - `src/prompts/conformance-system.ts`
  - `src/prompts/regression-gate-system.ts`
- [x] `src/prompts/request-review-system.ts` には**注入しない**。
- [x] fragment 文言が provider-neutral 制約（`report_result` / `end_turn` 語を含めない — fragment-coverage T-07 の禁止語）に違反しないことを確認する。`evidence` フィールド名は許容されるが、`report_result` という tool 名は書かない（「完了報告に evidence を含める」等の中立表現にする）。

**Acceptance Criteria**:
- `EVIDENCE_COUNTS_DEFINITION` が export され、`evidence` / `checked` / `skipped` / `unverified` と「判定不能」（または checked=0 の指示）を含む。
- code-review / spec-review / custom-reviewer / conformance / regression-gate の各 system prompt が `EVIDENCE_COUNTS_DEFINITION` を含む。
- request-review system prompt が `EVIDENCE_COUNTS_DEFINITION` を含まない。
- `EVIDENCE_COUNTS_DEFINITION` が `report_result` / `end_turn` 文字列を含まない（provider-neutral）。

---

## T-08: テストの追加と既存テスト/フィクスチャの追随修正

新規 unit テストで受け入れ基準を固定し、evidence 必須化で破れる既存フィクスチャ/テストを新契約へ追随させる。

- [x] **verdict 導出テスト**（`src/core/step/__tests__/judge-verdict.test.ts` または `tests/unit/step/judge-verdict.test.ts`）に vacuous ケースを追加する:
  - `checked: 0` + `findings: []` → `escalation`
  - `checked > 0` + `findings: []` → `approved`
  - `checked > 0` + blocking findings（critical/high, decision-needed）→ needs-fix / escalation（不変）
  - `checked > 0` + medium/low fixable → approved（不変）
  - evidence 引数なし呼び出し → 従来導出（後方互換）
  - `deriveConformanceVerdict` の `checked: 0` → escalation / `checked > 0` の fixTarget 集計不変
  - 既存の `deriveJudgeVerdict` 導出テスト（severity/resolution ベース）は 2 引数のまま緑を保つ（判定規則の期待は変えない）。
- [x] **parse テスト**（`src/core/port/__tests__/report-result.test.ts` または対応 test）に追加する:
  - `parseEvidence` の単体（valid / 非オブジェクト / フィールド欠落 / 負値 / 非整数）。
  - `parseJudgeReportInput` の evidence 必須化（欠落 → `{ ok: false, missingFields 含む "evidence" }`、valid → ok）。
  - `parseCodeReviewReportInput` / `parseConformanceReportInput` が evidence なし ok=true を parse 失敗にする。
  - `parseRequestReviewReportInput({ ok: true })` が従来どおり ok（evidence 不要）。
- [x] **後方互換 test**: 旧形式 record（evidence 無し judge `StepRun`）を含む `JobState` の読み取り・resume が正常動作することを固定する（`findings-ledger` テストまたは state/resume テストに追加）。
- [x] **drift-guard / fragment-coverage test**（`src/prompts/__tests__/fragment-coverage.test.ts`）に追加する:
  - 5 judge prompt が `EVIDENCE_COUNTS_DEFINITION` を含む。
  - `EVIDENCE_COUNTS_DEFINITION` の内容（`evidence` / `checked` / `skipped` / `unverified` / 判定不能の記述）。
  - request-review prompt が `EVIDENCE_COUNTS_DEFINITION` を含まない。
- [x] **フィクスチャ追随**: `tests/helpers/pipeline-mock-client.ts` の judge/code-review/conformance/regression-gate/custom-reviewer の approved 系 `report_result` 入力に `evidence: { checked: <正の整数>, skipped: 0, unverified: 0 }` を追加する（evidence 必須化で parse 失敗 → escalation になるのを防ぎ、approved を維持）。
- [x] **既存テスト追随の監査**: 以下を含む、judge tool の ok=true 入力を組み立てる既存テストを走査し、evidence を追加する（判定規則の期待は変えず入力形のみ追随）:
  - `tests/unit/step/executor-verdict.test.ts`
  - `tests/unit/core/step/judge-verdict-conformance.test.ts`
  - `tests/unit/core/step/scope-escalation.test.ts`
  - `tests/unit/step/code-review.test.ts`
  - `src/core/step/__tests__/judge-verdict.test.ts`（TC-021 executor dispatch）
  - `src/core/step/__tests__/verdict-channel-unification.test.ts`
  - `tests/unit/contract/golden-cases.test.ts`（tool schema snapshot がある場合は evidence 追加を反映）
  - `tests/pipeline-integration.test.ts` / `tests/custom-reviewers-e2e.test.ts` / `tests/reviewer-activation-e2e.test.ts`（mock 経由で緑を確認）

**Acceptance Criteria**:
- `checked: 0` + `findings: []` の judge 完了が approved にならない（escalation）ことがテストで固定される。
- `checked > 0` + `findings: []` が approved であることがテストで固定される。
- `checked > 0` + blocking findings の導出（needs-fix / escalation）が不変であることが既存テストで確認される。
- evidence 欠落の新規報告が完了として受理されない（parse 失敗）ことがテストで固定される。
- 旧形式 record を含む state の読み取り・resume が正常動作することがテストで固定される。
- judge 系 prompt の出力に evidence 記入指示が含まれることが drift-guard 系テストで固定される。
- 既存テストの追随修正で判定規則そのものの期待が変わっていない（severity/resolution ベースの導出テストは無改変または入力形のみ追加）。

---

## T-09: 検証ゲート（最終確認）

T-01〜T-08 の実装後、パイプライン全体に後退がないことを確認する。

- [x] `bun run build` が成功する（型エラーゼロ）。
- [x] `bun run typecheck` が成功する。
- [x] `bun run lint` が成功する（該当する場合）。
- [x] `bun run test` が緑（新規テスト含む全テスト）。
- [x] integration / e2e（`pipeline-integration` / `custom-reviewers-e2e` / `reviewer-activation-e2e`）が後退なし。

**Acceptance Criteria**:
- `typecheck && test` が green。
- build / lint がすべて成功する。
- 新規追加した T-02 / T-04 / T-06 / T-07 / T-08 の受け入れテストがすべて緑。
