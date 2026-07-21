# judge 完了契約の evidence 必須化と vacuous 判定ゲート

**Date**: 2026-07-21
**Status**: accepted

## Context

judge 系 step（spec-review / code-review / custom-reviewer / conformance / regression-gate）の verdict は typed findings から CLI の決定的関数（`deriveJudgeVerdict` / `deriveConformanceVerdict` / `deriveRegressionGateVerdict`）が導出する（`verdict-channel-unification` ADR で完成）。しかし現行の導出は severity・resolution のみに基づき、**「blocking findings が無ければ approved」** という規則を持つ。この規則は `findings: []` が「検証して問題なし」と「何も検証していない」の両状態を区別できないことを意味する。

agent が実際には何も確認せずに `report_result({ ok: true, findings: [] })` を返せば、機械的に `approved` になる。空集合・全 skip の検査が green として素通りする経路が構造的に開いていた。

`src/prompts/fragments.ts` の `EVIDENCE_DISCIPLINE` fragment（「空集合・全 skip は判定不能として報告する」）は全 agent step の system prompt に注入済みであったが、これは agent への指示であって機械の強制ではなかった。agent が規律を無視して `findings: []` を返せば `approved` になる構造は残っていた。

判定チャネルは typed findings に一本化済みであり、検証量（何件確認したか）を機械が読める場所は typed 完了契約（`report_result` tool）しかない。本変更は judge 系の typed 完了契約に `evidence: { checked, skipped, unverified }` を追加し、`checked === 0` の `approved` を機械的に不成立にする。

### 現状コードの構造（in-scope 検証済み）

- `deriveJudgeVerdict(findings, ok)` — severity/resolution のみから導出（`judge-verdict.ts`）。`deriveConformanceVerdict` は内部で `deriveJudgeVerdict` を呼ぶ。`deriveRegressionGateVerdict` は独立実装。
- `JUDGE_REPORT_TOOL` は singleton。spec-review / regression-gate / custom-reviewer の 3 step が同一オブジェクトを `reportTool` に設定し、executor の judge 判定は identity 比較 `stepReportTool === JUDGE_REPORT_TOOL` に依存。
- `report_result` の入力検証はハンドライトの `parseInput` が担う。`parseJudgeReportInput` は `ok=true` のとき `findings` を必須化。`parseCodeReviewReportInput` / `parseConformanceReportInput` は委譲。`parseRequestReviewReportInput` は委譲せず独自実装。
- verdict 導出は live tool 呼び出し時のみ走る（`deriveStepCompletion`）。永続化済み record の verdict は `state.steps[].outcome.verdict` から読むだけで再導出しない。

## Decisions

### D1: `evidence: { checked, skipped, unverified }` を typed 完了契約に追加する

judge 系 step の typed 完了契約（`report_result` tool）に `evidence` オブジェクトを追加する。

- 型: `Evidence = { checked: number; skipped: number; unverified: number }`。`src/kernel/report-result.ts` に `Finding` / `Observation` と並べて定義し、`src/core/port/report-result.ts` から re-export する。
- セマンティクス: `checked` = 実際に検証した項目数。`skipped` = 対象だが検証しなかった項目数。`unverified` = 検証できず未確認と申告する項目数。
- 型上は `JudgeReportResult.evidence?: Evidence`（optional）。`CodeReviewReportResult` / `ConformanceReportResult` は継承で取得する。
- 値制約: 各カウントは非負の整数。`parseEvidence` が `typeof === "number" && Number.isInteger && >= 0` を検証する。

**Rationale**: 判定チャネルは typed findings に一本化済みで、検証量を機械が読める場所は typed 完了契約しかない。`Evidence` を kernel に置くのは `Finding` / `Observation` と同じ層（判定の一次データ）であるため。

**Alternatives considered**:
- **counts でなく検証項目リスト（文字列配列）の必須化** — 却下。内容の真正性は counts でもリストでも機械検証できない（anchor 照合の領分）。counts は vacuous 検出に十分で schema が最小。

### D2: evidence の必須化は `parseJudgeReportInput` に置く（findings と同じ機構）

`ok=true` のとき `evidence` を必須とする。欠落・不正は parse 失敗として `{ ok: false, missingFields: ["evidence"] }` を返す。

- `parseJudgeReportInput`（`report-result.ts`）に、`findings` 必須化の直後で evidence 必須化を追加する。`ok=false` のときは不要（自発的失敗の宣言）。
- 委譲構造により、この 1 箇所の変更で `code-review`（`parseCodeReviewReportInput`）・`conformance`（`parseConformanceReportInput`）にも波及する。追加改修は不要。
- `parseRequestReviewReportInput` は委譲しないため変更しない（request-review は対象外）。
- parse 失敗時は既存機構をそのまま使う: follow-up retry policy（`DEFAULT_TOOL_RETRY`）が `missingFields: ["evidence"]` を含む再要求を送り、リトライ上限まで有効な `toolResult` が得られなければ null-toolResult 経路で judge step は `escalation` になる。
- zod スキーマ上は optional のまま（managed runtime の JSON schema 生成と分離）。強制はハンドライト `parseInput`（両 runtime 共通経路）が担う。`findings` の必須化と同じ構造。

**Rationale**: `findings` の必須化と同じ機構に載せることで、enforcement の実装・テスト・follow-up 経路が既存と一致する。zod（JSON schema 生成）とハンドライト parse の分離は既存パターン。

**Alternatives considered**:
- **evidence を optional にして warning 扱い** — 却下。任意フィールドは書かれなくなり、素通りを機械で塞ぐ目的を達成しない。必須化以外に手はない。

### D3: `checked === 0 → escalation` を `deriveJudgeVerdict` に置く

`deriveJudgeVerdict` のシグネチャを `(findings, ok, evidence?)` に拡張する。導出順序:

```
1. ok=false               → escalation
2. evidence && checked==0 → escalation   （vacuous: 検証実績ゼロ）
3. decision-needed ≥ 1    → escalation
4. critical|high ≥ 1      → needs-fix
5. else                   → approved
```

- vacuous チェックは `ok=false` の直後に置く。`checked === 0` なら findings の内容に関わらず `escalation` を返す。
- `evidence === undefined` の場合は vacuous チェックを飛ばし、従来導出を維持する（後方互換）。
- `deriveConformanceVerdict(findings, ok, evidence?)` に evidence 引数を追加し、内部の `deriveJudgeVerdict` に転送する。
- `checked > 0` の場合は step 2 を通らず、従来の導出（decision-needed / blocking / approved）がそのまま効く。

**Rationale**: vacuous は「判定不能」であり、`EVIDENCE_DISCIPLINE` の「空集合・全 skip は判定不能」を機械化したもの。判定不能は人間へエスカレートするのが既存 3 値の意味論に合致する。新 verdict 値（indeterminate 等）の追加より、既存 3 値の意味を保ったまま escalation ルート（人間判断）に載せる方が、routing・resume・表示の波及がない。

**Alternatives considered**:
- **新 verdict 値（indeterminate 等）の追加** — 却下。routing・resume・表示・既存テスト全体への波及が大きく、3 値体系を崩す。escalation は「判定不能 → 人間判断」の既存意味論に合致しており、追加は不要。
- **vacuous 判定を `step-completion.ts` の呼び出し側に置く案** — 却下。導出ロジックの一部であり、`deriveJudgeVerdict` に集約する方が単体テストで固定でき、`deriveConformanceVerdict` からの継承も自然。

### D4: `deriveRegressionGateVerdict` の導出ロジックは変えない（evidence 必須だが vacuous 非適用）

`JUDGE_REPORT_TOOL` が singleton であるため、D2 の evidence 必須化は regression-gate（同 singleton 使用）にも波及する。regression-gate も `evidence` を報告する。ただし:

- `deriveRegressionGateVerdict` のシグネチャ・ロジックは変更しない（`(findings, ok)` のまま）。第 3 引数 evidence は TypeScript の関数割当規則で無視される。
- したがって regression-gate の verdict に vacuous ルールは適用されない。
- regression-gate は `skipWhen` により ledger が非空のときだけ実行され、そのとき agent は ledger 件数分の `checked > 0` を報告する。ledger 空は step skip（verdict `skipped`）で処理され、`checked=0` の approved 経路は実運用で発生しない。

**Rationale**: regression-gate の「検証」は ledger 照合であり、その完了量は ledger サイズで決まる。ledger 空 = 検証すべきものが provably ゼロという合法状態は既に `skipWhen` が扱う。ここに vacuous ルールを足すと request が名指しした対象外の導出変更になる。singleton を割らずに evidence を必須化しつつ、导出は `deriveJudgeVerdict` にのみ適用するのが最小侵襲。

**Alternatives considered**:
- **regression-gate を別 report tool に切り出して evidence を免除する案** — 却下。singleton identity（`=== JUDGE_REPORT_TOOL`）が executor の judge 判定に load-bearing で、切り出すと isJudgeStep 判定へ regression-gate 用の分岐追加が必要になり侵襲が増える。
- **`deriveRegressionGateVerdict` にも vacuous を適用する案** — 却下。`skipWhen` により `checked=0` 経路は実運用で到達不能なので適用しても実利がなく、request のスコープ外の導出変更になる。

### D5: 過去 record は再評価しない（後方互換）

既存 state / events の judge record は evidence フィールドを持たない。これらを再評価しない。

- `deriveJudgeVerdict` の `evidence` 引数は optional。`undefined`（= evidence 無し）のとき vacuous チェックを飛ばし従来導出を返す。
- 永続化スキーマ `StepOutcome.toolResult`（`src/state/schema/types.ts`）と入力型 `StepResultInput.toolResult`（`src/state/helpers.ts`）に `evidence?: Evidence` を additive に追加する（optional）。過去 record は evidence 欠落のまま valid。
- 過去 record を読む消費者（`findings-ledger` / `decision-ledger` / resume 経路）は `toolResult.findings` を読み `evidence` は読まないため、evidence 欠落は影響しない。

**Rationale**: 完走済み job の verdict を変えると archive 済み証跡と矛盾する。新規報告のみを対象とする。

### D6: evidence 記入指示を単一ソース fragment で judge 系 prompt に注入する

judge-specific な prompt 定数の単一ソースである `src/prompts/judge-rules.ts` に `EVIDENCE_COUNTS_DEFINITION` を新設し、judge 系 prompt の Completion 節に `${EVIDENCE_COUNTS_DEFINITION}` を埋め込む（`SEVERITY_DEFINITION` / `OBSERVATION_DEFINITION` と同じパターン）。

- 注入対象（evidence を報告する 5 判定 prompt）: `code-review-system.ts` / `spec-review-system.ts` / `custom-reviewer-system.ts` / `conformance-system.ts` / `regression-gate-system.ts`。
- `request-review-system.ts` には注入しない（evidence を報告しない = schema と一貫）。
- 文言は `EVIDENCE_DISCIPLINE`（`fragments.ts`）と整合させる。`checked === 0` を「判定不能」として述べ（escalation とは断定しない）、vacuous 非適用の regression-gate にも矛盾なく共有できるようにする。

**Rationale**: prompt 指示と schema 要求を一致させないと agent は必須フィールドを埋められず parse 失敗が多発する。単一ソース fragment にすることで 5 prompt の文言食い違いを構造的に排除する。`EVIDENCE_DISCIPLINE` 語彙（「判定不能」）に留めることで regression-gate との共有可能性を保つ。

**Alternatives considered**:
- **各 prompt に個別文言を書く案** — 却下。二重帳簿・文言 drift の温床。単一ソース化が既存パターン（`SEVERITY_DEFINITION` 等）。

### D7: vacuous escalation の診断を stderr に出力する

vacuous によって escalation になったとき、「検証実績ゼロ」を `stderrWrite` で人間に可読な形で surfacing する。構造化 reason チャネルの新設はしない（scope 最小）。verdict の機械的な歯は D3 の `escalation` が担い、診断は補助的な可読化。

**Rationale**: 要件「理由に検証実績ゼロを明示する」を、既存の診断出力機構（no-op 検出・null-verdict 警告と同パターン）で最小コストに満たす。

**Alternatives considered**:
- **`deriveJudgeVerdict` の戻り値を `{ verdict, reason }` に変える案** — 却下。全 judge 呼び出し・既存テストを破壊する過剰侵襲。診断は表示層で足りる。

## Alternatives Considered

### Alternative 1: evidence フィールドを optional にして warning 扱い

evidence 欠落を parse 失敗とせず、欠落時に stderr 警告を出すだけにする案。

- **Pros**: 既存 judge 完了フローを一切壊さない。フィクスチャ追随が不要。
- **Cons**: 任意フィールドは書かれなくなる。agent に規律を委ねる構造は `EVIDENCE_DISCIPLINE` が既に持っており、optional 化は現状維持と等価。「確認ゼロの approved を機械的に不成立にする」目的を達成しない。
- **Why not**: 素通りを機械で塞ぐには必須化以外に手はない（D2）。

### Alternative 2: checked の内容を検証項目リスト（文字列配列）で必須化

`checked: number` でなく `checkedItems: string[]` を必須化し、リストの長さを checked 相当として使う案。

- **Pros**: 「何を確認したか」が構造化されて記録に残る。
- **Cons**: 内容の真正性は counts でもリストでも機械検証できない（それは anchor 照合の領分）。counts は vacuous 検出に十分で、リストは schema を肥大させるだけ。agent の報告コストが増え、リトライ爆発のリスクが上がる。
- **Why not**: vacuous 検出には `checked > 0` で十分。内容の真正性検証は別 request（anchor 照合）の領分（D1）。

### Alternative 3: 過去 record を遡及再評価する

evidence なし record を読んだとき `checked=0` として vacuous ルールを適用し、過去の approved verdict を escalation に変える案。

- **Pros**: evidence gate が完全に後ろ向きにも効く。
- **Cons**: 完走済み job の verdict が変わり、archive 済み証跡と矛盾する。resume・archive コマンドが突然異なる verdict を見せるようになり、運用上の混乱が大きい。
- **Why not**: 新規報告のみを対象とする（D5）。archive 済み証跡の一貫性を保つ方が判断の可追跡性において優先される。

### Alternative 4: 新 verdict 値（`indeterminate` 等）を追加する

vacuous な完了に対して既存 3 値でなく第 4 の verdict 値を返す案。

- **Pros**: vacuous 状態を意味論的に明確に区別できる。
- **Cons**: verdict 3 値（approved / needs-fix / escalation）に依存する routing・resume・表示・既存テスト全体への波及が大きい。3 値体系はコードベース全体に根を張っており、拡張コストが極めて高い。
- **Why not**: escalation は「判定不能 → 人間判断」という既存の意味論に合致しており、新値の追加なく vacuous を自然に表現できる（D3）。

## Consequences

### Positive

- `findings: []` の「問題なし」と「何も確認していない」が機械的に区別可能になる。
- prompt 規律（`EVIDENCE_DISCIPLINE`）が typed 完了契約の parse 強制として機械化され、agent の規律違反が approved として素通りしなくなる。
- `Evidence` 型が `Finding` / `Observation` と並ぶ判定の一次データとして確立し、将来の `skipped` / `unverified` 活用（例: 高 unverified 率の surfacing）の基盤になる。
- `EVIDENCE_COUNTS_DEFINITION` の単一ソース化により、5 judge prompt の文言食い違いが構造的に排除される。

### Negative

- `ok=true` の judge 完了フィクスチャ（`tests/helpers/pipeline-mock-client.ts`）は evidence 必須化後に parse 失敗（→ follow-up → escalation）になる。追随修正が必要（`evidence: { checked: N, skipped: 0, unverified: 0 }` を mock に追加）。
- judge 完了契約を固定する既存 unit テスト（`report-result.test.ts` / `golden-cases.test.ts` 等）は入力形が変わるため追随修正が必要（判定規則の期待は不変、入力に evidence を足すのみ）。
- `EVIDENCE_COUNTS_DEFINITION` が regression-gate prompt にも注入されるため、「checked=0 は判定不能」という文言を regression-gate agent も受け取る。`deriveRegressionGateVerdict` は vacuous を適用しないため文言と導出に見かけ上の不一致が生じるが、`skipWhen` により `checked=0` 経路が実運用で到達不能なため実害はない（D4）。

### Known Debt / Deferred

- `checked` の**内容**の真正性検証（agent が数を偽る可能性への対処）は anchor 照合として別 request の領分。
- `skipped` / `unverified` の値を verdict 導出に活用するかは open（現時点では `checked === 0` のみを vacuous ゲートとして使う）。
- 承認の revision 束縛・reopen（approval が取得済みの job を re-approve が必要になるか）は後続 request。

## References

- Request: `specrunner/changes/typed-evidence-gate/request.md`
- Design: `specrunner/changes/typed-evidence-gate/design.md`
- Spec: `specrunner/changes/typed-evidence-gate/spec.md`
- Related: `specrunner/adr/2026-07-21-verdict-channel-unification.md`（typed findings への判定チャネル一本化 — 本 ADR はその上に evidence gate を積む）
- Related: `specrunner/adr/2026-05-28-tool-driven-step-completion.md`（R4 contract の基盤：typed `report_result` tool による agent step 完了判定）
- Related: `specrunner/adr/2026-06-04-step-io-contracts.md`（content-format gate と output contract の原型）
- Implementation: `src/kernel/report-result.ts` / `src/core/port/report-result.ts` / `src/core/step/judge-verdict.ts` / `src/core/step/step-completion.ts` / `src/prompts/judge-rules.ts` / 5 judge system prompt ファイル / `src/state/schema/types.ts` / `src/state/helpers.ts`
