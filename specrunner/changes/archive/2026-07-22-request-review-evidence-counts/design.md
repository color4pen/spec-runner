# Design: request-review 完了契約への evidence counts 追加と確認ゼロ approve の非 green 化

## Context

judge 系 step（spec-review / code-review / custom-reviewer / conformance / regression-gate）の typed 完了契約には、直前の変更（typed-evidence-gate, archived `2026-07-21-typed-evidence-gate`）で evidence counts（`checked` / `skipped` / `unverified`）が必須化され、`checked === 0` は「判定不能（vacuous check）」として機械的に非 green（escalation）になっている。

一方 request-review は専用の `REQUEST_REVIEW_REPORT_TOOL` を使っており、typed-evidence-gate では意図的に対象外とされた（当時の判断: request-review は別 request で扱う）。その結果、以下の穴が残っている:

- `REQUEST_REVIEW_REPORT_TOOL`（`src/core/step/report-tool.ts:231-242`）の zodSchema に `evidence` フィールドが無い。
- `parseRequestReviewReportInput`（`src/core/port/report-result.ts:438-476`）は `ok=true` で evidence を要求しない。
- `deriveRequestReviewVerdict`（`src/core/step/judge-verdict.ts:158-170`）は `(findings, ok)` のみで evidence 概念を持たず、`checked===0` を検知できない。
- request-review の system prompt（`src/prompts/request-review-system.ts`）には `EVIDENCE_COUNTS_DEFINITION` が注入されておらず、`EVIDENCE_DISCIPLINE`（散文の根拠規律）のみが入っている。

このため「何も検証せず `findings: []` を返す」request-review が approve として素通りする経路が残る。request-review は pipeline の入口 gate（正典の確定判定）であり、正典弱化が全下流 gate を素通りする起点となるため、確認ゼロ approve が最も危険な step の一つである。

本変更は、typed-evidence-gate が judge 系に適用した evidence 規律を、既存の単一ソース資産（`parseEvidence` / `evidenceSchema` / `EVIDENCE_COUNTS_DEFINITION`）を再利用して request-review に横展開する。

### 現状の観測（検証済み）

typed-evidence-gate が導入した以下の資産は既に存在し、そのまま再利用できる:

- `parseEvidence`（`src/core/port/report-result.ts:147-164`）— 非負整数 3 件の hand-written parse。
- `evidenceSchema`（`src/core/step/report-tool.ts:83-87`）— `object({ checked, skipped, unverified: number() })`。
- `Evidence` 型（`src/kernel/report-result.ts:81-88`、`src/core/port/report-result.ts:12-13` で re-export 済み）。
- `EVIDENCE_COUNTS_DEFINITION`（`src/prompts/judge-rules.ts:88-99`）— provider-neutral な記入指示 fragment。
- 永続化スキーマ `StepOutcome.toolResult`（`src/state/schema/types.ts:132`）と `StepResultInput.toolResult`（`src/state/helpers.ts:71`）は既に `evidence?: Evidence` を許容する（additive optional）。よって永続化層のスキーマ変更は不要。
- `deriveRequestReviewVerdict` の唯一の非テスト呼び出しは `src/core/step/step-completion.ts:146`。

typed-evidence-gate は request-review の**除外**を drift-guard test で固定した。本変更はその除外判断を反転するため、以下の既存テストの反転が実装に含まれる（設計上の必然。詳細は tasks.md T-07）:

- `src/core/step/__tests__/report-tool-evidence-schema.test.ts` TC-023（request-review に evidence 無しを固定 → 反転）
- `src/core/port/__tests__/evidence-enforcement.test.ts` TC-006（request-review は evidence 不要を固定 → 反転）
- `src/prompts/__tests__/evidence-fragment-coverage.test.ts` TC-018（request-review prompt は fragment 非注入を固定 → 反転）

## Goals / Non-Goals

**Goals**:

- `REQUEST_REVIEW_REPORT_TOOL` に evidence フィールドを追加し、`ok=true` の新規報告で必須化する（parse 強制、欠落は完了として受理しない）。
- `deriveRequestReviewVerdict` を拡張し、evidence が存在して `checked === 0` の場合は findings 内容に関わらず approve にしない（needs-discussion）。evidence 未定義（legacy）は従来導出。
- request-review の system prompt Completion 節に `EVIDENCE_COUNTS_DEFINITION` を単一ソースで注入する（文言複製なし）。
- 旧 record の再評価をしない後方互換を維持する。
- 既存の judge 系資産（`parseEvidence` / `evidenceSchema` / `EVIDENCE_COUNTS_DEFINITION`）を再利用し、専用実装・文言複製を作らない。

**Non-Goals**（request のスコープ外を踏襲）:

- `checked` の内容の真正性検証（anchor 照合）— 別 request。
- request-generate / producer 系への evidence 拡張。
- verdict 3 値（approve / needs-discussion / reject）の意味変更。
- judge 系（spec-review / code-review / conformance / regression-gate）の挙動変更 — 既に typed-evidence-gate で完了済み。本変更は request-review のみ。
- `architecture/domain-model.md` の編集 — request の要件が名指ししておらず、既存の「verdict は findings から CLI が導出」の記述と本変更（evidence による vacuous 判定の追加）は矛盾しない。scope creep を避けるため触れない。

## Decisions

### D1: `RequestReviewReportResult` に `evidence?: Evidence` を additive 追加する

`src/core/port/report-result.ts` の `RequestReviewReportResult` インターフェース（現状 `verdict?` / `findings?` / `observations?`）に `evidence?: Evidence` を追加する。型上は optional（後方互換のため）だが、実行時の必須化は parse で行う（D2）。

- **Rationale**: `JudgeReportResult` が evidence を optional 型 + parse 必須で運用しているのと同じ二層構造。型を required にすると legacy record（evidence 無し）の型互換が壊れる。
- **Alternatives considered**: 型を required にする案 → legacy 永続 record と非互換になり後方互換要件に反するため却下。

### D2: `parseRequestReviewReportInput` で `ok=true` 時に evidence を必須化する（parseEvidence 再利用）

`ok=true` ブロック（findings の任意チェックの直後）に evidence 必須化を追加する。`parseJudgeReportInput` と同じ機構（`parseEvidence` 呼び出し → 失敗なら `missingFields: ["evidence"]` を返す）を使う。findings は request-review では従来どおり任意のまま保つ（findings 欠落は approve 相当、evidence とは独立）。`ok=false` では evidence を要求しない（`ok=true` ブロック内でのみチェック）。

- **Rationale**: 「入口 gate の確認ゼロ approve は他 judge より緩くする理由がない」（architect 評価済み・却下案の裏返し）。judge と同じ強制機構を再利用することで単一ソース原則を保つ。findings 任意性は既存の request-review 固有仕様（agent が指摘なしで `{ok: true, verdict: "approve"}` を返す経路）であり、これは維持する。
- **Alternatives considered**: request-review だけ evidence を任意にする案 → request が明示的に却下。専用 parse ヘルパーを新設する案 → `parseEvidence` の複製になり単一ソース原則違反のため却下。

### D3: `REQUEST_REVIEW_REPORT_TOOL` の zodSchema に `evidence: optional(evidenceSchema)` を追加し description を更新する

既存の `evidenceSchema`（`report-tool.ts:83-87`）を再利用して `zodSchema` に `evidence: optional(evidenceSchema)` を追加する。tool description に「`ok=true` で `evidence: { checked, skipped, unverified }`（すべて非負整数）が REQUIRED」「`checked` は実際に検証した項目数」「`checked === 0` は判定不能」を明記する（judge tool の description と同趣旨）。

- **Rationale**: zod 上 optional・実強制は parseInput、という判断は既存 3 judge tool と同一。`toCustomToolSpec` 経由で local / managed 双方の input_schema が単一ソースから生成される。
- **Alternatives considered**: request-review 用に別 evidence schema を定義する案 → 複製になるため却下。

### D4: `deriveRequestReviewVerdict` に `evidence?: Evidence` を追加し vacuous check を挿入する

シグネチャを `(findings: Finding[], ok: boolean, evidence?: Evidence)` に拡張する。導出ロジック:

1. `!ok` → `needs-discussion`（既存、最優先）
2. `evidence !== undefined && evidence.checked === 0` → `needs-discussion`（**新規: vacuous check**）
3. blocking（critical | high | decision-needed）≥ 1 → `needs-discussion`（既存）
4. else → `approve`（既存）

vacuous check は `!ok` の直後・blocking 判定の前に置く。`evidence === undefined`（legacy 経路）のとき vacuous check を飛ばし従来導出になる。

- **Rationale**: request-review の escalation 相当は needs-discussion（人間判断ルート）であり、既存 3 値の意味を保ったまま、典型 judge の `checked===0 → escalation` と同型に揃える（architect 採用済み）。`deriveJudgeVerdict` が `checked===0 → escalation` を `!ok` 直後に置く順序と対称。
- **Alternatives considered**: `checked===0 → reject` 案 → reject は routing 上 needs-discussion と同一に扱われ、かつ「自発的失敗」の語義とずれるため却下。verdict 戻り値型に第 3 の値を足す案 → verdict 意味変更（スコープ外）のため却下。

### D5: `step-completion.ts` の request-review 分岐で evidence を受け渡し、`checked===0` を surfacing する

`src/core/step/step-completion.ts:146` の `deriveRequestReviewVerdict(undecidedFindings, tr.ok)` を `deriveRequestReviewVerdict(undecidedFindings, tr.ok, tr.evidence)` にする（`tr` は `RequestReviewReportResult`、evidence を保持）。judge / conformance 分岐と同様、`tr.evidence?.checked === 0` を検知したら `stderrWrite` で診断（検証実績ゼロのため needs-discussion 相当である旨）を出力する。`persistToolResult` の型は既に `evidence?: Evidence` を含む（typed-evidence-gate で拡張済み）ため、request-review の evidence は spread でそのまま永続化される。

- **Rationale**: 人間への surfacing パターンを judge 分岐と揃える。永続化は既存型で吸収できるため追加のスキーマ変更が不要。
- **Alternatives considered**: 診断出力を省く案 → judge 分岐と非対称になり、確認ゼロの発生が運用で見えなくなるため却下。

### D6: request-review system prompt の Completion 節に `EVIDENCE_COUNTS_DEFINITION` を注入する

`src/prompts/request-review-system.ts` の judge-rules import に `EVIDENCE_COUNTS_DEFINITION` を追加し、Completion 節（findings / `OBSERVATION_DEFINITION` の近辺）に `${EVIDENCE_COUNTS_DEFINITION}` を埋め込む。文言は複製せず fragment 参照のみ。既存の `## Evidence` 節（`EVIDENCE_DISCIPLINE`）は散文の根拠規律として残し、`EVIDENCE_COUNTS_DEFINITION` は機械 counts の記入指示として Completion に追加する（judge prompt と同じ二層構成）。

- **Rationale**: 単一ソース原則（architect 採用済み）。判定の機械化に対応する記入指示を agent に届ける。`EVIDENCE_COUNTS_DEFINITION` は provider-neutral（`report_result` / `end_turn` 語を含まない）ため request-review にもそのまま適用できる。
- **Alternatives considered**: request-review 専用の evidence 文言を書く案 → 複製になり drift の温床になるため却下。

### D7: 後方互換 — 旧 record は再評価しない

evidence 欠落の旧 record（typed-evidence-gate 以前 / request-review 対象外時代の永続 record）は再評価しない。resume 等で旧 record を読む経路は evidence 欠落を許容する。これは以下で自然に成立する:

- 型 `evidence?` は optional（D1）。
- parse 必須化は**新規の live tool call** に対してのみ働く（`parseRequestReviewReportInput` は tool 入力の parse であり、永続 record の読み取りには使われない）。
- verdict 導出で `evidence === undefined` は従来導出にフォールバック（D4）。
- 永続 record を読む消費者（`findings-ledger` 等）は `findings` のみ読み evidence を要求しない。

- **Rationale**: typed-evidence-gate と同方式（前例踏襲）。追加コードなしで後方互換が成立することをテストで固定する（tasks.md T-07）。

## Risks / Trade-offs

- **[Risk] typed-evidence-gate が固定した除外 drift-guard test の反転漏れ** → TC-023 / TC-006 / TC-018 と findings-optional 系テスト・e2e fixture を実装時に反転・追随しないと build/test が赤になる。Mitigation: tasks.md T-07 で反転・追随対象を file:line で列挙し、破壊確認（T-08）で検知する。
- **[Risk] 既存 request-review fixture の evidence 欠落による e2e 退行** → `tests/helpers/pipeline-mock-client.ts:266` / `tests/reviewer-activation-e2e.test.ts:155` / `tests/custom-reviewers-e2e.test.ts:301` の `{ ok: true, verdict: "approve", findings: [] }` が evidence 必須化で parse 失敗 → needs-discussion に落ち、pipeline が escalation になり e2e が赤になる。Mitigation: これら fixture に `evidence: { checked: N>0, skipped: 0, unverified: 0 }` を追加（tasks.md T-07）。
- **[Risk] managed degradation 経路で agent が evidence を出せない** → managed でツール入力の evidence が欠落した場合、parse 失敗 → follow-up 再試行 → 最終的に toolResult null → needs-discussion フォールバック（既存挙動）。これは「確認ゼロを approve にしない」という本変更の意図と整合するため許容。Mitigation: 意図的挙動として design に記録（追加対応不要）。
- **[Trade-off] request-review で findings は任意のまま・evidence は必須**という非対称 → findings 任意は既存の request-review 固有仕様（指摘なし approve 経路）であり維持する。evidence だけ必須化することで「指摘は無いが検証はした」を強制でき、確認ゼロを排除できる。この非対称は意図的。

## Open Questions

なし（architect 評価で設計判断は確定済み。checked=0 → needs-discussion、既存資産再利用、request-review 除外の反転はいずれも採用/却下が明示されている）。
