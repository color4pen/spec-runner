# Design: judge 完了契約に evidence counts を追加し、確認ゼロ・全 skip を非 green にする

## Context

judge 系 step の verdict は typed findings から CLI が決定的に導出する（`deriveJudgeVerdict` / `deriveConformanceVerdict` / `deriveRegressionGateVerdict`、`src/core/step/judge-verdict.ts`）。現行の `deriveJudgeVerdict` は `ok=false → escalation` / `decision-needed ≥ 1 → escalation` / `critical|high ≥ 1 → needs-fix` / else → `approved` の severity・resolution のみからの導出であり、検証量の概念が存在しない。

この結果、**`findings: []` は「検証して問題なし」と「何も検証していない」を区別できない**。agent が実際には何も確認せずに `report_result({ ok: true, findings: [] })` を返せば、機械的に `approved` になる。空集合・全 skip の検査が green として素通りする経路が構造的に開いている。

prompt 側には evidence 規律（`EVIDENCE_DISCIPLINE`、`src/prompts/fragments.ts:74-85`「空集合・全 skip は判定不能として報告する」）が全 agent step の system prompt に注入済みだが、これは agent への指示であって機械の強制ではない。agent が規律を無視すれば通ってしまう。

判定チャネルは typed findings に一本化済みで（`VERDICT_BLOCKING_RULES`）、result md は機械 parse されない evidence report である。したがって「検証実績」を機械が読める形で運ぶチャネルは、typed 完了契約（`report_result` tool）にしか存在しない。

本変更は judge 系の typed 完了契約に `evidence: { checked, skipped, unverified }` を追加し、`checked === 0` の approved を機械的に不成立にする。

### 現状コードの構造（in-scope 検証済み）

- `deriveJudgeVerdict(findings, ok)` — severity/resolution のみから導出（`judge-verdict.ts:32-40`）。`deriveConformanceVerdict` は内部で `deriveJudgeVerdict` を呼ぶ（`:79-88`）。`deriveRegressionGateVerdict` は独立実装（`:118-126`）。
- `JUDGE_REPORT_TOOL` は **singleton**。`spec-review` / `regression-gate` / `custom-reviewer` の 3 step が同一オブジェクトを `reportTool` に設定する（`report-tool.ts:125`、各 step 定義）。executor の judge 判定は identity 比較 `stepReportTool === JUDGE_REPORT_TOOL` に依存（`step-completion.ts:118-124`）。
- `report_result` の入力検証はハンドライトの `parseInput` が担う。`parseJudgeReportInput` は `ok=true` のとき `findings` を必須化する（`report-result.ts:296-328`）。`parseCodeReviewReportInput` / `parseConformanceReportInput` は `parseJudgeReportInput` に委譲する（`:335-349` / `:377-383`）。`parseRequestReviewReportInput` は委譲せず独自実装で findings を任意化する（`:403-441`）。
- verdict 導出は **live tool 呼び出し時**にのみ走る（`deriveStepCompletion`、`step-completion.ts:107-248`）。永続化済み record の verdict は `state.steps[].outcome.verdict` から読むだけで再導出しない。過去 record の `toolResult` は `findings` を型付きフィールドとして直接読む（`findings-ledger.ts:39-40` 等）。
- `regression-gate` は `skipWhen` で ledger 空のとき step 自体を skip する（`regression-gate.ts:110-117`）。実行される時 ledger は非空であり、`checked > 0` が期待される。
- 判定量を運ぶ既存フィールドは存在しない（`evidence` / `checked` / `skipped` / `unverified` の構造化フィールドはコードベースに未使用）。

## Goals / Non-Goals

**Goals**:

- judge 系 step の typed 完了契約に `evidence: { checked: number; skipped: number; unverified: number }` を追加する。
- 新規の judge 完了報告で `evidence` を必須化する（`parseInput` で強制し、欠落は完了として受理しない）。
- `deriveJudgeVerdict` を拡張し、`checked === 0` の場合 findings の内容に関わらず `approved` にしない（`escalation`）。`checked > 0` の従来経路の導出は不変。
- `deriveConformanceVerdict` は `deriveJudgeVerdict` 経由で vacuous 判定を継承する。
- judge 系 prompt の Completion 節に evidence 記入指示を単一ソース fragment で追加する（`EVIDENCE_DISCIPLINE` と整合）。
- 既存 state / events の過去 record（evidence 無し）を再評価せず、読み取り・resume を正常動作させる。

**Non-Goals**:

- `checked` の**内容**の真正性検証（agent が数を偽る可能性への対処。anchor 照合として別 request）。
- custom reviewer の skip 設定機構自体の変更（全 skip 時の合流判定が `checked=0` として非 green になることのみ本変更の範囲）。
- 承認の revision 束縛・reopen（後続 request）。
- producer 系 step（design / implementer / spec-fixer / code-fixer / build-fixer / test-case-gen / adr-gen）の完了契約の拡張。
- request-review の完了契約・verdict 導出の変更（judge 系ではなく、verdict 値も approve/needs-discussion の 2 値。本変更の対象外）。
- `deriveRegressionGateVerdict` の**導出ロジック**の変更（新しい verdict 値の追加や vacuous ルールの適用はしない）。
- 新 verdict 値（indeterminate 等）の追加。

## Decisions

### D1: evidence counts を `report_result` の必須フィールドとして追加する

judge 系 step の typed 完了契約に `evidence` オブジェクトを追加する。

- 型: `Evidence = { checked: number; skipped: number; unverified: number }`。`src/kernel/report-result.ts` に `Finding` / `Observation` と並べて定義し、`src/core/port/report-result.ts` から re-export する。
- セマンティクス:
  - `checked`: 実際に検証した項目数（読んだファイル・辿った Scenario・照合した要件など、根拠を持って確認した数）。
  - `skipped`: 対象だが検証しなかった項目数。
  - `unverified`: 検証できず未確認と申告する項目数。
- `JudgeReportResult` に `evidence?: Evidence` を追加する（型上は optional）。`CodeReviewReportResult` / `ConformanceReportResult` は継承で取得する。
- 値制約: 各カウントは**非負の整数**。`parseEvidence` が `typeof === "number" && Number.isInteger && >= 0` を検証する。1 つでも欠落・不正なら `{ ok: false }`。

**Rationale**: 判定チャネルは typed findings に一本化済みで、検証量を機械が読める場所は typed 完了契約しかない。`Evidence` を kernel に置くのは `Finding` / `Observation` と同じ層（判定の一次データ）だから。

**Alternatives considered**:
- **counts でなく検証項目リスト（文字列配列）の必須化** — 却下（architect 評価済み）。内容の真正性は counts でもリストでも機械検証できない（anchor 照合の領分）。counts は vacuous 検出に十分で schema が最小。

### D2: `evidence` の必須化は `parseJudgeReportInput` に置く（`findings` と同じ機構）

`ok=true` のとき `evidence` を必須とする。欠落・不正は parse 失敗として `{ ok: false, missingFields: ["evidence"] }` を返す。

- `parseJudgeReportInput`（`report-result.ts`）に、`findings` 必須化の直後で evidence 必須化を追加する。`ok=false` のときは不要（自発的失敗の宣言）。
- 委譲構造により、この 1 箇所の変更で `code-review`（`parseCodeReviewReportInput`）・`conformance`（`parseConformanceReportInput`）にも波及する。追加改修は不要。
- `parseRequestReviewReportInput` は委譲しないため**変更しない**（request-review は対象外）。
- parse 失敗時の挙動は既存機構をそのまま使う: follow-up retry policy（`DEFAULT_TOOL_RETRY`）が `missingFields: ["evidence"]` を含む再要求を送り、リトライ上限まで有効な `toolResult` が得られなければ null-toolResult 経路で judge step は `escalation` になる（`step-completion.ts:205-218`）。これが要件「欠落は完了として受理しない」の実現機構。

**Rationale**: `findings` の必須化と同じ機構に載せることで、enforcement の実装・テスト・follow-up 経路が既存と一致する。schema（zod）ではなくハンドライト parse に強制を置くのは、既存 `findings` の必須化と対称にし、managed runtime の JSON schema 生成（optional のまま）と分離するため。

**Alternatives considered**:
- **evidence を optional にして warning 扱い** — 却下（architect 評価済み）。任意フィールドは書かれなくなり、素通りを機械で塞ぐ目的を達成しない。必須化以外に手はない。

### D3: `checked === 0 → escalation` を `deriveJudgeVerdict` に置く

`deriveJudgeVerdict` のシグネチャを `(findings, ok, evidence?)` に拡張する。

```
1. ok=false               → escalation
2. evidence && checked==0 → escalation   （vacuous: 検証実績ゼロ）
3. decision-needed ≥ 1    → escalation
4. critical|high ≥ 1      → needs-fix
5. else                   → approved
```

- vacuous チェックは `ok=false` の直後に置く。`checked === 0` なら findings の内容に関わらず `escalation` を返す（要件 3）。
- `evidence === undefined` の場合は vacuous チェックを飛ばし、従来導出を維持する（後方互換 = D5）。
- `deriveConformanceVerdict(findings, ok, evidence?)` に evidence 引数を追加し、内部の `deriveJudgeVerdict` に転送する。base が escalation になれば conformance も escalation（fixTarget routing なし）。
- `checked > 0` の場合は step 2 を通らず、従来の導出（decision-needed / blocking / approved）がそのまま効く（要件「従来経路の導出は不変」）。

採用理由（architect 評価済み）: **新 verdict 値（indeterminate 等）の追加**より、既存 3 値の意味を保ったまま `escalation` ルート（人間判断）に載せる方が、routing・resume・表示の波及がない。

**Rationale**: vacuous は「判定不能」であり、`EVIDENCE_DISCIPLINE` の「空集合・全 skip は判定不能」を機械化したもの。判定不能は人間へエスカレートするのが既存 3 値の意味論に合致する。

**Alternatives considered**:
- vacuous 判定を `step-completion.ts` の呼び出し側に置く案 — 却下。導出ロジックの一部であり、`deriveJudgeVerdict` に集約する方が単体テストで固定でき、`deriveConformanceVerdict` からの継承も自然。
- `deriveJudgeVerdict` の第 3 引数を `checked: number` にする案 — 却下。`evidence` オブジェクトを渡す方が完了契約と 1:1 で、将来 `skipped`/`unverified` を導出に使う余地を残す。

### D4: `deriveRegressionGateVerdict` は導出ロジックを変えない（evidence は必須だが vacuous 非適用）

`JUDGE_REPORT_TOOL` が singleton であるため、D2 の evidence 必須化は `regression-gate`（同 singleton 使用）にも波及する。regression-gate も `evidence` を報告する。ただし:

- `deriveRegressionGateVerdict` の**シグネチャ・ロジックは変更しない**（`(findings, ok)` のまま）。第 3 引数 evidence を渡しても TypeScript の関数割当規則で無視される（引数が少ない関数は多い型に代入可能）。
- したがって regression-gate の verdict に vacuous ルールは適用されない。regression-gate は `skipWhen` により ledger が非空のときだけ実行され、そのとき agent は ledger 件数分の `checked > 0` を報告する。ledger 空は step skip（verdict `skipped`）で処理され、`checked=0` の approved 経路は実運用で発生しない。

**Rationale**: regression-gate の「検証」は ledger 照合であり、その完了量は ledger サイズで決まる。ledger 空 = 検証すべきものが provably ゼロという合法状態は既に `skipWhen` が扱う。ここに vacuous ルールを足すと、request が要求していない導出変更（安全制約の追加）になる。singleton を割らずに evidence を必須化しつつ、導出は judge 系（`deriveJudgeVerdict`）にのみ適用するのが最小侵襲。

**Alternatives considered**:
- **regression-gate を別 report tool に切り出して evidence を免除する案** — 却下。singleton identity（`=== JUDGE_REPORT_TOOL`）が executor の judge 判定に load-bearing で、切り出すと isJudgeStep 判定へ regression-gate 用の分岐追加が必要になり侵襲が増える。regression-gate は judge/gate 系であり producer ではないため、evidence 報告は「judge 系のみ」の方針とも整合する。
- **`deriveRegressionGateVerdict` にも vacuous を適用する案** — 却下。request のスコープ外の導出変更。`skipWhen` により `checked=0` 経路は実運用で到達不能なので、適用しても実利がなく、request が名指しした `deriveJudgeVerdict` の範囲を超える。

### D5: 過去 record は再評価しない（後方互換）

既存 state / events の judge record は evidence フィールドを持たない。これらを再評価しない。

- `deriveJudgeVerdict` の `evidence` 引数は optional。`undefined`（= evidence 無し）のとき vacuous チェックを飛ばし従来導出を返す。新規 live 判定では D2 が parse で evidence を必須化するため、vacuous ルールは常に評価される。undefined 経路は旧 record・非 evidence 呼び出し専用。
- 永続化スキーマ `StepOutcome.toolResult`（`src/state/schema/types.ts:132`）と入力型 `StepResultInput.toolResult`（`src/state/helpers.ts:71`）、`StepCompletion.persistToolResult`（`src/core/step/step-completion.ts`）に `evidence?: Evidence` を additive に追加する（optional）。過去 record は evidence 欠落のまま valid。
- 過去 record を読む消費者（`findings-ledger` / `decision-ledger` / resume 経路）は `toolResult.findings` を読み `evidence` は読まないため、evidence 欠落は影響しない。

**Rationale**: 完走済み job の verdict を変えると archive 済み証跡と矛盾する（architect 評価済みで遡及再評価は却下）。新規報告のみを対象とする。

**Alternatives considered**:
- 過去 record の遡及再評価 — 却下（architect 評価済み）。

### D6: evidence 記入指示を単一ソース fragment で judge 系 prompt に注入する

judge-specific な prompt 定数の単一ソースである `src/prompts/judge-rules.ts` に `EVIDENCE_COUNTS_DEFINITION` を新設し、judge 系 prompt の Completion 節に `${EVIDENCE_COUNTS_DEFINITION}` を埋め込む（`SEVERITY_DEFINITION` / `OBSERVATION_DEFINITION` と同じパターン）。

- 文言は `EVIDENCE_DISCIPLINE`（fragments.ts）と整合させる: `report_result` の `evidence` に checked/skipped/unverified の 3 件数を必須申告し、**`checked === 0` は判定不能**（EVIDENCE_DISCIPLINE の「空集合・全 skip は判定不能」の機械化）である旨を明記する。findings が空でも実際に検証した項目があれば `checked > 0` を申告するよう促す。
- 注入対象（evidence を報告する 5 判定 prompt）: `code-review-system.ts` / `spec-review-system.ts` / `custom-reviewer-system.ts` / `conformance-system.ts` / `regression-gate-system.ts`。
- `request-review-system.ts` には注入しない（evidence を報告しない = schema と一貫）。

**Rationale**: prompt 指示と schema 要求を一致させないと agent は必須フィールドを埋められず parse 失敗が多発する。単一ソース fragment にすることで 5 prompt の文言食い違いを構造的に排除する。文言を「判定不能」に留め（EVIDENCE_DISCIPLINE と同語彙）、具体的 routing（escalation）を書かないことで、vacuous 非適用の regression-gate にも矛盾なく共有できる。

**Alternatives considered**:
- 各 prompt に個別文言を書く案 — 却下。二重帳簿・文言 drift の温床。単一ソース化が既存パターン。

### D7: 検証実績ゼロの理由を診断出力で明示する

vacuous によって escalation になったとき、理由「検証実績ゼロ」を人間に見える形で surfacing する。

- `deriveStepCompletion`（`step-completion.ts`）で judge/conformance step の `toolResult.evidence?.checked === 0` を検出したら、`stderrWrite` で診断（例: `[<step>] vacuous check: checked=0 — 検証実績ゼロのため approved を保留し escalation`）を出力する。既存の no-op 検出・null-verdict 警告と同じ surfacing パターン。
- 構造化 reason チャネルの新設はしない（scope 最小）。verdict の機械的な歯は D3 の `escalation` が担い、診断は補助的な可読化。

**Rationale**: 要件 3「理由に検証実績ゼロを明示する」を、既存の診断出力機構で最小コストに満たす。

**Alternatives considered**:
- `deriveJudgeVerdict` の戻り値を `{ verdict, reason }` に変える案 — 却下。全 judge 呼び出し・既存テストを破壊する過剰侵襲。診断は表示層で足りる。

## Risks / Trade-offs

- [既存テストフィクスチャの一括更新] `tests/helpers/pipeline-mock-client.ts` は approved の judge 完了を `{ ok: true, approved: true, findings: [] }` で生成する。evidence 必須化後、これらは parse 失敗（→ follow-up → escalation）になる。→ **Mitigation**: mock の judge/code-review/conformance/regression-gate/custom-reviewer の report_result 入力に `evidence: { checked: >0, skipped: 0, unverified: 0 }` を追加し、approved を維持する。integration / e2e（`pipeline-integration` / `custom-reviewers-e2e` / `reviewer-activation-e2e`）はこの mock 経由で緑を保つ。tasks T-08 に列挙。
- [judge 完了契約を固定する既存 unit テストの追随修正] `report-result.test.ts`（parse）・`golden-cases.test.ts`（contract snapshot）・`judge-verdict-conformance` 等、judge tool の ok=true 入力を組み立てるテストは evidence 追加で入力形が変わる。→ **Mitigation**: 判定規則そのものの期待は変えず、入力に evidence を足す追随修正に留める。`deriveJudgeVerdict` の既存導出テスト（severity/resolution ベース）は 2 引数呼び出しのまま緑を保ち（undefined evidence = 従来導出）、vacuous は新規テストで固定する。tasks T-08。
- [regression-gate の prompt と導出の見かけ上の不一致] `EVIDENCE_COUNTS_DEFINITION` は「checked=0 は判定不能」と述べるが、`deriveRegressionGateVerdict` は vacuous を適用しない。→ **Mitigation**: regression-gate は `skipWhen` により ledger 非空でのみ実行され、`checked=0` の到達経路が実運用で存在しない。文言を「判定不能」（EVIDENCE_DISCIPLINE 語彙）に留め escalation を断定しないことで矛盾を回避。design D4 / D6 に明記。
- [managed runtime の JSON schema] evidence を zod で `optional` にするため、managed 側の JSON schema 上も optional になる。実強制はハンドライト `parseInput`（両 runtime 共通経路）が担うため強制は効く（findings と同じ構造）。→ **Mitigation**: parse 必須化を unit テストで固定（T-02）。

## Open Questions

なし（architect 評価で主要な設計分岐は解決済み: checked===0 → escalation を採用、judge 系のみを対象、optional/warning 化・検証項目リスト化・過去 record 遡及再評価は却下）。singleton 波及による regression-gate の evidence 必須化は D4 で「導出不変・skipWhen で checked=0 到達不能」として処理し、request のスコープ（judge 系のみ・導出は deriveJudgeVerdict）と整合させた。

## Migration Plan

- additive な型・parse・prompt 変更。データ移行不要。過去 record は evidence 欠落のまま valid（D5）。
- ロールバックは revert のみ。状態遷移テーブル・verdict 3 値の集合には触れないため安全。
