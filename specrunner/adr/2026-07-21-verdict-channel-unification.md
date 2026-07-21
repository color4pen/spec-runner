# judge 系 step の判定チャネルを typed findings に一本化し、result md を evidence report にする

**Date**: 2026-07-21
**Status**: accepted

## Context

judge 系 step（request-review / spec-review / code-review / conformance / regression-gate / custom-reviewer）の verdict 判定は、R4 contract で「agent は finding 単位のラベル付けのみ、verdict の集計は CLI の決定的関数（`deriveJudgeVerdict` 系）」に移行済みであった。`parseResult` は `verdict: null` を返す no-op であり、md からの prose-verdict parse 経路は全 judge step で死んでいた。

しかし prompt・initial message・result template には旧チャネル前提の指示が残存し、次の矛盾と二重帳簿を生んでいた。

1. **偽の機械要求**: 「The file MUST contain a verdict line — required for machine parsing」と要求し続けているが、prose-verdict parse 経路は全 judge step で死んでいる。同一 prompt 内の別箇所（`JUDGE_REPORT_TOOL` description / `VERDICT_BLOCKING_RULES`）は「verdict 行は機械ルーティングに使用されない」と明記しており、矛盾している。
2. **実行不能な指示**: `PIPELINE_RULES` にカテゴリ別スコアリング（Score 1-10 / Weight / Total）と、Total スコア差分（±0.3）による Convergence Trend / plateau 検出が残るが、CLI 実装（`ConvergenceBudget`）は iteration 数のみを追跡しスコア差分 plateau 検出を行わない。同じ fragment が「スコアは CLI 側の verdict 判定には使用されない」と明言している。
3. **findings の二重帳簿**: findings は typed toolResult（routing の正）と result md の 7 列 Markdown 表（content-format gate が形式を機械強制）の両方に書かれる。どちらの記録がどの判定に効いたのかが構造的に曖昧で、証跡の revision 対応付けを困難にしていた。
4. **定義の重複**: severity 定義が `PIPELINE_RULES` の Severity 表と各 prompt の Completion 節に重複記載され、文言が微妙に食い違っていた（resolution / observation は既に `judge-rules.ts` に単一ソース化済み）。

本変更は判定チャネルを typed findings のみに一本化し、result md を evidence report（agent が何を確認し、何を確認できなかったかの人間可読な根拠記録）に再定義することで、R4 contract を完成させた。

## Decisions

### D1: verdict 行を全 judge チャネルから削除する

judge 系 step の system prompt・initial message・result template から、md verdict 行に関する指示を全削除する。「The file MUST contain a verdict line」「required for machine parsing」「verdict 行を書け」に相当する記述、および result template の `- **verdict**:` placeholder と verdict-format HTML コメントブロックを削除する。agent は verdict を自己集計しない。verdict は CLI が typed findings から導出し、人間は `job show` 等の既存 CLI 表示で verdict を確認する。

**根拠**: prose-verdict parse は全 judge step で死んでいる（`parseResult` は `verdict: null`）。verdict 行を書けという指示は実行しても無意味であり、typed findings と食い違えば証跡が曖昧になる。

### D2: result md を evidence report に再定義する

judge 系 result template（`REQUEST_REVIEW_RESULT_TEMPLATE` / `SPEC_REVIEW_RESULT_TEMPLATE` / `REVIEW_FEEDBACK_TEMPLATE` / `CONFORMANCE_RESULT_TEMPLATE`）を、以下の必須セクションを持つ evidence report に再定義する。

- `## 検証した項目`（Verified）— 何をどう確認したか（読んだファイル・辿った Scenario・確認したコマンド出力等、具体的な根拠）
- `## 検証できなかった項目`（Unverified）— 確認できなかった項目とその理由。無い場合は `None` と明記
- `## Findings 詳細`（Findings detail）— typed findings の補足説明。findings が無ければ `None`

7 列 Markdown findings 表（`# | Severity | Category | File | Description | How to Fix | Fix`）と Scores 表・total 行の要求は削除する。findings の正典は typed toolResult のみ。

**根拠**: R4 が設計した「agent 判断は finding 単位、集計は CLI」の完成形。人間可読性は evidence report の findings 詳細セクションが担う。

**Note**: custom-reviewer / regression-gate は `getOutputTemplates` に result template を持たない（動的注入 step）。これらは各 prompt の指示側で evidence report セクションを誘導する。

### D3: code-review の content-format gate を evidence セクション存在チェックに置換する

`CodeReviewStep.outputContracts` の content-format check を、7 列表 header チェックから evidence report 必須セクション存在チェック（`^##\s+検証した項目` / `^##\s+検証できなかった項目`、`policy: "follow-up"`）に置換する。「空・形骸レポートを機械検出する」gate 目的と `policy: "follow-up"` は維持する。

**根拠**: 7 列表という二重帳簿チャネルを廃止しつつ、gate の「空レポート検出」という歯は evidence セクション必須化で保持する。

### D4: PIPELINE_RULES から死装置を削除する

`PIPELINE_RULES`（`src/prompts/fragments.ts`）から以下を削除する。

- `## Scoring`（Score 基準表 1-10 / Weight 表 / `Total = Σ(Score × Weight)` / 承認閾値 7.0）
- `## Iteration Comparison`（Improvements / Regressions / Unchanged Issues）と `### Convergence Trend`（improving / plateaued / regressing の score 差分 ±0.3 判定・plateau 2 連続での escalation）
- `## Findings Format`（7 列 Markdown 表指示）

保持する: `## Categories`（レビュー観点のチェックリスト）/ `## Verdict`（verdict 3 値の意味と次アクションの informational な説明。verdict 行指示は含まない）/ `VERDICT_BLOCKING_RULES`（D6 で更新）。

**根拠**: CLI 実装が実際に行わない処理（加重スコア・score 差分 plateau 検出）を agent に指示する文言を残さない。routing は severity ベースの blocking rules で既に決定的であり、加重スコアは判定に情報を追加しない。

### D5: severity 定義を judge-rules.ts に単一ソース化する

`src/prompts/judge-rules.ts` に severity 定義を集約し、`DECISION_NEEDED_DEFINITION` と同じ埋め込みパターンで各 prompt に注入する。

- `SEVERITY_DEFINITION`（汎用 4 段: critical / high / medium / low）を新設し、code-review / regression-gate / custom-reviewer の既存文言を正典とする（churn 最小化）。
- `REQUEST_REVIEW_SEVERITY_DEFINITION`（request-review スコープ 3 段: high / medium / low）を新設。request-review では critical が発生し得ない（コード未生成）という request-level スコープ差を持つ。
- `PIPELINE_RULES` の `## Severity` 表を削除し、各 judge prompt の Completion / Output 節の inline severity bullet を `${SEVERITY_DEFINITION}`（request-review のみ `${REQUEST_REVIEW_SEVERITY_DEFINITION}`）の埋め込みに置換する。

**根拠**: 単一ソース化で文言食い違いを構造的に排除する。`DECISION_NEEDED_DEFINITION` と同じパターンで conformance を除く 4 prompt の rendered 二重表示も避ける。

### D6: VERDICT_BLOCKING_RULES の findings-priority 但し書きを削除する

`VERDICT_BLOCKING_RULES`（`judge-rules.ts`）末尾の「markdown の verdict 行と報告された findings が矛盾した場合、findings 由来の導出が優先される」段落を削除する。verdict 行が存在しなくなるため、findings との矛盾を語る但し書き自体が不要になる。blocking rules 本体（decision-needed ≥ 1 → escalation / critical|high ≥ 1 → needs-fix / else → approved）は不変。

**根拠**: D1 の帰結。存在しない verdict 行への言及を残すのは新たな死文であり、「findings-priority の但し書きを永続的に引きずる」懸念に反する。

### D7: routing を不変に保つ

`src/core/step/judge-verdict.ts` の導出関数群・report tool の zod スキーマ・verdict 3 値（approved / needs-fix / escalation、request-review は approve / needs-discussion）の意味は変更しない。report tool の `verdict` / `approved` compat フィールドは routing 未使用のまま schema 上に残す。本変更は prompt・template・content-format gate（content 検証のみ）のみを触り、状態遷移・導出ロジックには一切手を入れない。

**根拠**: 二重帳簿の除去は「記録の正典を一本化する」変更であり、判定ロジックの変更ではない。既存の verdict 導出テスト（`src/core/step/__tests__/judge-verdict.test.ts` 等）が無改変で green であることを routing 不変の証明とする。

## Alternatives Considered

### Alternative 1: verdict 行を「人間向け要約」として残す

agent が typed findings に加えて result md にも verdict 行を書き、「機械判定は findings から、人間向け要約として verdict 行も残す」とする案。

- **Pros**: 人間が md を直接見て verdict を把握できる。既存の md フォーマット変更が最小。
- **Cons**: agent による verdict 自己集計は R4 が排除した二重帳簿の再導入。typed findings と食い違えば証跡が曖昧になり、findings-priority 但し書きを永続的に引きずる。「どちらが正か」を常に説明するコメントが残り、矛盾の火種が消えない。
- **Why not**: 人間は CLI の導出結果（`job show` 等の既存表示）で verdict を確認できる。md に verdict を書くことは二重帳簿を再導入するだけで可観測性を向上させない（architect 評価で却下済み）。

### Alternative 2: md の 7 列 findings 表を維持する

result template と content-format gate をそのままにし、typed findings と並行して result md にも 7 列表（`# | Severity | Category | File | Description | How to Fix | Fix`）を書かせ続ける案。

- **Pros**: 既存の result md 形式を変えずに済む。agent の出力フォーマット訓練負荷がない。md を見るだけで findings 一覧を把握できる。
- **Cons**: typed findings との二重管理が「どの記録が判定に効いたか不明」問題の温床。fixer は typed findings（`buildFindingsBlock`）を消費しており md 表は routing に効いていない。証跡の revision 対応付けが構造的に困難になる。
- **Why not**: 人間可読性は evidence report の findings 詳細セクションが担える。二重管理を維持すると「どちらが正典か」の曖昧さが残り、設計原則（findings の正は typed toolResult のみ）に反する（architect 評価で却下済み）。

### Alternative 3: スコアリングを CLI 実装で復活させて指示と整合させる

`PIPELINE_RULES` の Scoring・Convergence Trend 指示を削除するのではなく、CLIの `ConvergenceBudget` 側に加重スコア集計・score 差分 plateau 検出を実装して prompt 指示と整合させる案。

- **Pros**: prompt の指示と CLI 実装が整合する。数値的な評価指標が追加される可能性がある。
- **Cons**: routing は severity ベースの blocking rules（decision-needed ≥ 1 → escalation / critical|high ≥ 1 → needs-fix / else → approved）で既に決定的であり、加重スコアは判定結果に情報を追加しない。実装コストが高く、routing の結果が変わらないまま複雑性が増す。
- **Why not**: CLI 実装が実際に行わない処理を追加実装するより、dead code 指示を削除する方が合理的。severity ベースの blocking rules が既に十分決定的（architect 評価で却下済み）。

### Alternative 4: content-format gate を撤去する

code-review の `outputContracts` から content-format check を完全に削除し、gate なしで evidence report の形式を prompt 指示のみに委ねる案。

- **Pros**: gate ロジックがシンプルになる。形式変更への追従コストがなくなる。
- **Cons**: 空・形骸レポート検出の歯を失う。agent が typed findings のみ報告し evidence（何をどう確認したか）を省略するケースを機械で検出できなくなる。
- **Why not**: `produced` contract（scaffold 差分）＋ evidence セクション必須化（`^##\s+検証した項目` / `^##\s+検証できなかった項目`）の組み合わせで「空・形骸レポート」を引き続き検出できる。gate 目的を保持したまま 7 列表チャネルのみ廃止できるため、gate を撤去する必要はない。

### Alternative 5: PIPELINE_RULES の `## Severity` を `${SEVERITY_DEFINITION}` 埋め込みに置換して Completion 側を削除する

severity 定義の単一ソース化として、各 prompt の Completion 節の inline severity bullet を削除し、PIPELINE_RULES の `## Severity` 表を `${SEVERITY_DEFINITION}` 埋め込みに置換する案（Completion 節からではなく PIPELINE_RULES から注入）。

- **Pros**: PIPELINE_RULES を severity の注入元として集約できる。各 prompt の Completion 節の変更量が減る。
- **Cons**: `DECISION_NEEDED_DEFINITION` と同じパターン（Completion 節への埋め込み）から外れる。conformance を除く 4 prompt では PIPELINE_RULES からの severity が rendered prompt で Completion 節の定義と重複して二重表示になる恐れがある。パターン不一致がコードの一貫性を損なう。
- **Why not**: `DECISION_NEEDED_DEFINITION` と同じパターン（Completion 節への `${SEVERITY_DEFINITION}` 埋め込み）に統一する方が整合的。PIPELINE_RULES からは `## Severity` を削除することで rendered 二重表示を避けられる。

## Consequences

### Positive

- R4 contract（「agent は finding 単位のみ、CLI が集計」）が prompt・template・gate レベルで完成し、判定チャネルの矛盾がなくなる。
- verdict 行という dead code 指示が消え、agent がトークンを無駄に使わなくなる。
- evidence report によって「何を確認し、何を確認できなかったか」が明示的になり、監査可能性が向上する。
- severity 定義が単一ソースとなり、文言食い違いが構造的に排除される。
- gate の「空レポート検出」の歯は evidence セクション必須化で保持される。

### Negative

- 旧チャネル契約を固定していた既存テストは本変更で意図的に破れる（新契約に合わせて更新が必要）。
- `tests/helpers/pipeline-mock-client.ts` の judge result md 生成を evidence report 形式に更新しないと、content-format gate を通す統合テストが follow-up を発火させる可能性がある。

### Known Debt / Deferred

- step prompt 全体の 5 部構成骨格への再構成（後続 request で実施）。
- evidence 規律（verified / derived / unverified の主張区分）を producer 系 step へ拡張すること（後続 request）。

## References

- Request: `specrunner/changes/verdict-channel-unification/request.md`
- Design: `specrunner/changes/verdict-channel-unification/design.md`
- Spec: `specrunner/changes/verdict-channel-unification/spec.md`
- Related: `specrunner/adr/2026-05-28-tool-driven-step-completion.md`（R4 contract の基盤：typed `report_result` tool による agent step 完了判定）
- Related: `specrunner/adr/2026-04-30-review-verdict-parser-shared.md`（旧 `parseReviewVerdict` の共通化 ADR — 本 ADR で prose-verdict parse path が正式に廃止された）
- Related: `specrunner/adr/2026-06-04-step-io-contracts.md`（content-format gate の原型）
- Implementation: `src/prompts/judge-rules.ts` / `src/prompts/fragments.ts` / `src/templates/step-output-templates.ts` / `src/core/step/code-review.ts` / 全 6 judge system prompt ファイル / `tests/helpers/pipeline-mock-client.ts`
