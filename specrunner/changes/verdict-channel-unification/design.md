# Design: judge 判定チャネルを typed findings に一本化し、result md を evidence report にする

## Context

judge 系 step（request-review / spec-review / code-review / conformance / regression-gate / custom-reviewer）の判定は、R4 契約で「agent は finding 単位のラベル付けのみ、verdict の集計は CLI の決定的関数（`deriveJudgeVerdict` 系）」に移行済みである。routing は typed toolResult の `findings` 配列から `deriveJudgeVerdict` / `deriveConformanceVerdict` / `deriveRegressionGateVerdict` / `deriveRequestReviewVerdict` が導出する（`src/core/step/judge-verdict.ts`）。各 step の `parseResult` は `verdict: null` を返す no-op であり、md からの prose-verdict parse 経路は死んでいる。

にもかかわらず、prompt・initial message・result template には旧チャネル前提の指示が残存し、次の矛盾と二重帳簿を生んでいる。

1. **偽の機械要求**: system prompt / initial message / result template が「The file MUST contain a verdict line — required for machine parsing」と要求し続けているが、prose-verdict parse 経路は全 judge step で死んでいる。同じ prompt 群の別箇所（`JUDGE_REPORT_TOOL` description・`VERDICT_BLOCKING_RULES`）は「verdict 行は機械ルーティングに使用されない」と明記しており、同一 prompt 内で矛盾している。
2. **実行不能な指示**: `PIPELINE_RULES`（`src/prompts/fragments.ts`）にカテゴリ別スコアリング（Score 1-10・Weight・Total）と、Total スコア差分（±0.3）による Iteration Comparison / Convergence Trend / plateau 検出が残るが、同じ fragment が「スコアは…CLI 側の verdict 判定には使用されない」と明言している。CLI 実装（`ConvergenceBudget` は iteration 数のみを追跡し、スコア差分の plateau 検出は行わない）が実行しない処理を agent に指示している。
3. **findings の二重帳簿**: findings は typed toolResult（routing の正）と result md の 7 列 Markdown 表（code-review の content-format gate が形式を機械強制）の両方に書かれる。どちらの記録がどの判定に効いたのかが構造的に曖昧で、証跡の revision 対応付けを困難にしている。fixer は typed findings（`buildFindingsBlock`）を消費しており、md 表を読んでいない。
4. **定義の重複**: severity 定義が `PIPELINE_RULES` の Severity 表と各 prompt の Completion 節に重複記載され、文言が微妙に食い違っている（例: code-review/regression-gate/custom-reviewer は「本番障害、データ損失…」、spec-review は「仕様の根本的な矛盾…」）。resolution / observation は既に judge-rules.ts に単一ソース化済み（`DECISION_NEEDED_DEFINITION` / `OBSERVATION_DEFINITION`）だが、severity のみ未集約。

本変更は判定チャネルを typed findings のみに一本化し、result md を「evidence report」（agent が何を確認し、何を確認できなかったかの人間可読な根拠記録）に再定義する。

## Goals / Non-Goals

**Goals**:

- judge 系 step の prompt・initial message・result template から「verdict 行を書け」「required for machine parsing」に相当する要求を全削除する（agent は verdict を自己集計しない）。
- judge 系 result template を evidence report に再定義する（必須セクション: 検証した項目 / 検証できなかった項目 / findings 詳細）。7 列 Markdown findings 表の要求を削除する。
- code-review の content-format gate を、7 列表 header チェックから evidence report 必須セクション存在チェックへ置換し、「空・形骸レポート検出」の歯を保持する。
- `PIPELINE_RULES` から Scoring と score 差分ベースの Iteration Comparison / Convergence Trend / plateau 検出、および 7 列 findings 表指示を削除する。
- severity 定義を `judge-rules.ts` に単一ソース化し、各 prompt の重複定義を単一ソースからの埋め込みに置換する（`DECISION_NEEDED_DEFINITION` と同じパターン）。
- routing 不変（`deriveJudgeVerdict` 系の導出・typed findings の完了契約・verdict 3 値の意味を変更しない）。

**Non-Goals**:

- step prompt 全体の 5 部構成骨格への再構成（後続 request）。
- evidence 規律（verified / derived / unverified の主張区分）を producer 系 step へ拡張すること（後続 request）。
- `deriveJudgeVerdict` 系の導出ロジック変更。
- design step の content-format gate（spec.md 構造検証、`src/core/step/design.ts`）の変更。
- verification / bite-evidence など CLI 自身が md を生成・parse する step の変更。
- harness の write-allowlist・revision 束縛等の機構追加。
- report tool（`JUDGE_REPORT_TOOL` 等）の zod スキーマ変更。`approved` / `verdict` compat フィールドは routing 未使用のまま残す（完了契約 = 不変）。
- fixer step（spec-fixer / code-fixer）prompt の「How to Fix column」文言（fixer は typed findings を消費するため機能に影響しない。scope 外）。
- CLI stdout の loop verdict 行表示（`pipeline.ts` の `[iter N/M] … approved` 表示・`job-stats` の Convergence 列。md verdict 行とは別チャネルであり scope 外）。

## Decisions

### D1: verdict 行を全 judge チャネルから削除する

judge 系 step の system prompt・initial message・result template から、md verdict 行に関する指示を全削除する。

- 削除対象: 「The file MUST contain a verdict line」「required for machine parsing」「Write the verdict line BEFORE the findings table」、result template の `- **verdict**:` placeholder と verdict-format HTML コメントブロック。
- 対象ファイル: `code-review.ts` / `conformance.ts` / `custom-reviewer.ts` / `regression-gate.ts`（initial message）、`spec-review-system.ts` / `request-review-system.ts`（system prompt + initial message）、`code-review-system.ts` / `conformance-system.ts` / `custom-reviewer-system.ts` / `regression-gate-system.ts`（system prompt）、`step-output-templates.ts`（result template）。
- request-review の完了報告指示 `{ ok: true, verdict: "…" }` は `{ ok: true }`（findings のみ）に改める。verdict は CLI が findings から導出するため agent の自己集計を求めない。report tool の `verdict` compat フィールドは schema 上は残す（routing 不変）。

**Rationale**: prose-verdict parse は全 judge step で死んでいる（`parseResult` は `verdict: null`）。verdict 行を書けという指示は実行しても無意味であり、typed findings と食い違えば証跡が曖昧になる。

**Alternatives considered**: verdict 行を「人間向け要約」として残す案は却下（architect 評価済み）。agent による verdict 自己集計は R4 が排除した二重帳簿の再導入で、findings-priority の但し書き（D6）を永続的に引きずる。人間は CLI の導出結果（`job show` 等の既存表示）で verdict を見る。

### D2: result md を evidence report に再定義する

judge 系 result template（`REQUEST_REVIEW_RESULT_TEMPLATE` / `SPEC_REVIEW_RESULT_TEMPLATE` / `REVIEW_FEEDBACK_TEMPLATE` / `CONFORMANCE_RESULT_TEMPLATE`）を、以下の必須セクションを持つ evidence report に再定義する。

- `## 検証した項目`（Verified）— 何をどう確認したか（読んだファイル・辿った Scenario・確認したコマンド出力等、具体的な根拠）。
- `## 検証できなかった項目`（Unverified）— 確認できなかった項目とその理由。無い場合は `None` と明記。
- `## Findings 詳細`（Findings detail）— typed findings（`report_result`）の補足説明。findings が無ければ `None`。

7 列 Markdown findings 表（`# | Severity | Category | File | Description | How to Fix | Fix`）と Scores 表・total 行の要求は削除する。findings の正は typed toolResult のみ。HTML コメントには「verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。findings は `report_result`（typed）で報告する」旨を明記する。

**Rationale**: R4 が設計した「agent 判断は finding 単位、集計は CLI」の完成形。人間可読性は evidence report の findings 詳細セクションが担う。

**Alternatives considered**: md の 7 列 findings 表を維持する案は却下（architect 評価済み）。typed findings との二重管理が「どの記録が判定に効いたか不明」問題の温床。

**Note**: custom-reviewer / regression-gate は `getOutputTemplates` に result template を持たない（動的注入 step）。これらの result md 形式は各 prompt の指示のみが規定するため、D1 の verdict 行削除で対応し、evidence report セクションは prompt 側で誘導する。

### D3: code-review の content-format gate を evidence セクション存在チェックに置換する

`CodeReviewStep.outputContracts`（`src/core/step/code-review.ts`）の content-format check を、7 列表 header チェックから evidence report 必須セクション存在チェックに置換する。

- 削除する check: separator row（`\|[-:]+\|`）、7 列 header（`# / Severity / Category / File / Description / How to Fix / Fix`）。
- 追加する check（`policy: "follow-up"` を維持）:
  - `検証した項目` セクション存在: `^##\s+検証した項目`（flags `m`）
  - `検証できなかった項目` セクション存在: `^##\s+検証できなかった項目`（flags `m`）

「空・形骸レポートを機械検出する」gate 目的は維持される。テンプレート未編集の空レポートは `produced` contract（scaffold 差分）が捕捉し、セクション欠落は content-format gate が捕捉する。gate は HTML コメント除去後に評価する（`stripHtmlComments`）ため、テンプレートのコメント内ヘッダは検出に効かない — 実 body のヘッダのみが通る。

**Rationale**: 7 列表という二重帳簿チャネルを廃止しつつ、gate の「空レポート検出」という歯は evidence セクション必須化で保持する。routing とは無関係（gate は content-format のみ）。

**Alternatives considered**: gate を撤去する案 — 却下。空・形骸レポート検出の歯を失う。

### D4: 死装置を PIPELINE_RULES から削除する

`PIPELINE_RULES`（`src/prompts/fragments.ts`）から以下を削除する。

- `## Scoring`（Score 基準表 1-10・Weight 表・`Total = Σ(Score × Weight)`・承認閾値 7.0）。
- `## Iteration Comparison`（Improvements / Regressions / Unchanged Issues）と `### Convergence Trend`（improving / plateaued / regressing の score 差分 ±0.3 判定・plateau 2 連続での escalation）。
- `## Findings Format`（7 列 Markdown 表指示「全エージェントは findings を以下のテーブル形式で返す」）。findings の正は typed toolResult のため、md 表出力を指示する fragment は二重帳簿チャネルであり削除する。

保持する: `## Categories`（レビュー観点のチェックリストとして有効。finding フィールドではないが観点誘導に使う）、`## Verdict`（verdict 3 値の意味と次アクションの informational な説明。verdict 行を書けという指示は含まない）、`VERDICT_BLOCKING_RULES`（D6 で更新）。

**Rationale**: CLI 実装が実際に行わない処理（加重スコア・score 差分 plateau 検出）を agent に指示する文言を残さない。routing は severity ベースの blocking rules で既に決定的であり、加重スコアは判定に情報を追加しない。

**Alternatives considered**: スコアリングを CLI 実装で復活させて指示と整合させる案は却下（architect 評価済み）。削除が正。

### D5: severity 定義を judge-rules.ts に単一ソース化する

`src/prompts/judge-rules.ts` に severity 定義を集約し、`DECISION_NEEDED_DEFINITION` と同じ埋め込みパターンで各 prompt に注入する。

- `SEVERITY_DEFINITION`（汎用 4 段: critical / high / medium / low）を新設。既存 code-review/regression-gate/custom-reviewer の文言を正典とする（churn 最小化）。
- `REQUEST_REVIEW_SEVERITY_DEFINITION`（request-review スコープ 3 段: high / medium / low、request-level defect セマンティクス）を新設。
- `PIPELINE_RULES` の `## Severity` 表を削除する（`DECISION_NEEDED_DEFINITION` が PIPELINE_RULES に無いのと同じく、severity も PIPELINE_RULES に置かない）。これにより severity 文言が fragments.ts に残らず、rendered prompt での二重表示も避ける。
- 各 judge prompt の Completion / Output 節で severity 定義を `${SEVERITY_DEFINITION}`（request-review のみ `${REQUEST_REVIEW_SEVERITY_DEFINITION}`）の埋め込みに置換する:
  - `code-review-system.ts` / `regression-gate-system.ts` / `custom-reviewer-system.ts` / `spec-review-system.ts`: 既存の inline severity bullet を `${SEVERITY_DEFINITION}` に置換。
  - `conformance-system.ts`: 現状 Completion 節に severity 定義を持たず PIPELINE_RULES に依存しているため、PIPELINE_RULES から severity が消える分、Resolution 定義の近傍に `${SEVERITY_DEFINITION}` を追加する。
  - `request-review-system.ts`: inline の request スコープ severity を `${REQUEST_REVIEW_SEVERITY_DEFINITION}` に置換。

**Rationale**: 単一ソース化で文言食い違いを構造的に排除する。spec-review の spec-focused 文言は汎用定義に統一する（severity セマンティクスは step 横断で不変であるべきで、spec 固有のニュアンスは spec-review の review-process 節が担う）。request-review のみ「critical が発生し得ない（コード未生成）」という request-level スコープの差があるため専用定数を持つ。

**Alternatives considered**: PIPELINE_RULES の `## Severity` を `${SEVERITY_DEFINITION}` 埋め込みに置換して Completion 側を削除する案 — 単一ソース化は満たすが、`DECISION_NEEDED_DEFINITION` と同じパターン（Completion 節への埋め込み）から外れ、conformance を除く 4 prompt で rendered 二重表示を招く。採用案の方がパターン整合的。

### D6: VERDICT_BLOCKING_RULES から findings-priority 但し書きを削除する

`VERDICT_BLOCKING_RULES`（`judge-rules.ts`）末尾の段落「markdown の verdict 行と報告された findings が矛盾した場合、findings 由来の導出が優先される。verdict 行は人間向けの要約であり…」を削除する。verdict 行が存在しなくなるため、findings との矛盾を語る但し書き自体が不要（永続的に引きずる負債）。blocking rules 本体（decision-needed ≥ 1 → escalation / critical|high ≥ 1 → needs-fix / else → approved）は不変。

**Rationale**: D1 の帰結。verdict 行が無い以上、md verdict 行と findings の優先関係を記述する意味がない。

**Alternatives considered**: 但し書きを「typed findings が正」と読み替えて残す案 — 却下。存在しない verdict 行への言及を残すのは新たな死文であり、request の「findings-priority の但し書きを永続的に引きずる」懸念に反する。

### D7: routing を不変に保つ

`src/core/step/judge-verdict.ts` の導出関数群・report tool の zod スキーマ・verdict 3 値（approved / needs-fix / escalation、request-review は approve / needs-discussion）の意味は変更しない。本変更は prompt・template・content-format gate（content 検証のみ）のみを触り、状態遷移・導出ロジックには一切手を入れない。既存の verdict 導出テスト（`src/core/step/__tests__/judge-verdict.test.ts` 等）は無改変で green であること（= routing 不変の証明）。

**Rationale**: 二重帳簿の除去は「記録の正典を一本化する」変更であり、判定ロジックの変更ではない。

**Alternatives considered**: report tool から `verdict` / `approved` compat フィールドを削除する案 — 却下。完了契約（typed findings の schema）は Non-Goal かつ routing 不変の対象。schema 変更は不要な破壊リスク。

## Risks / Trade-offs

- [prompt-content テストの大量更新] → 旧チャネル契約を固定する既存テストは本変更で意図的に破れる。実装者は破れたテストを新契約に合わせて更新する。ただし **verdict 導出テスト（`judge-verdict.test.ts`）は無改変で green** を厳守（触れたら routing 不変の証明が崩れる）。破れる想定テスト一覧は tasks.md T-08 に列挙。
- [content-format gate の空レポート検出弱化] → 7 列表チェックを外すことで表形式の強制は消えるが、`produced` contract（scaffold 差分）＋ evidence セクション必須化で「空・形骸」は引き続き検出できる。Mitigation: gate check を 2 セクション必須（検証した項目 / 検証できなかった項目）にして unit test で固定。
- [pipeline-mock-client の判定 md 更新漏れ] → `tests/helpers/pipeline-mock-client.ts` は judge step の result md を旧形式（verdict 行 + 7 列表）で生成する。routing は typed toolResult 由来のため機能は壊れないが、code-review の content-format gate を通す統合テストがあると evidence セクション欠落で follow-up が発火し得る。Mitigation: mock の judge md を evidence report 形式へ更新し、統合テストを green に保つ（T-08）。
- [severity 文言統一による意味変化] → spec-review の spec-focused severity を汎用定義に統一する。severity セマンティクスは step 横断で不変であるべきで実害はないが、spec-review の finding 表現が僅かに変わる。Mitigation: 汎用定義は既存 3 prompt の文言をそのまま採用し、変化量を最小化。

## Open Questions

なし（architect 評価で主要な設計分岐は解決済み: evidence report + typed findings 一本化を採用、verdict 行残存 / 7 列表維持 / スコアリング復活は却下）。

## Migration Plan

- コードのみの変更（prompt / template / gate の文言・構造）。データ移行・後方互換の考慮は不要（result md は branch-borne でジョブ単位、過去ジョブの md 形式は影響を受けない）。
- ロールバックは revert のみ（状態スキーマ・遷移テーブルに触れないため安全）。
