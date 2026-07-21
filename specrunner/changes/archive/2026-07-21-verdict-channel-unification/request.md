# judge 系 step の判定チャネルを typed findings に一本化し、result md を evidence report にする

## Meta

- **type**: spec-change
- **slug**: verdict-channel-unification
- **base-branch**: main
- **adr**: true

## 背景

judge 系 step（request-review / spec-review / code-review / conformance / regression-gate / custom-reviewer）の判定は、R4 契約で「agent は finding 単位のラベル付けのみ、verdict の集計は CLI の決定的関数」に移行済みである。しかし prompt・initial message・result template には旧チャネルの指示が残存し、次の矛盾と二重帳簿を生んでいる。

1. **偽の機械要求**: 「The file MUST contain a verdict line — required for machine parsing」を要求し続けているが、prose-verdict parse 経路は全 judge step で死んでいる。同じ prompt 群の別の箇所は「verdict 行は機械ルーティングに使用されない」と明記しており、同一 prompt 内で矛盾している。
2. **実行不能な指示**: PIPELINE_RULES にカテゴリ別スコアリング（1-10・重み・Total）と、Total スコア差分（±0.3）による Convergence Trend / plateau 検出が残るが、同じ fragment が「スコアは CLI 側の verdict 判定には使用されない」と明言している。routing に使われない数値で停滞検出せよという指示は実行不能である。
3. **findings の二重帳簿**: findings は typed toolResult（routing の正）と result md の 7 列 Markdown 表（output gate が形式を機械強制）の両方に書かれる。どちらの記録がどの判定に効いたのかが構造的に曖昧で、証跡の revision 対応付けを困難にしている。
4. **定義の重複**: severity / resolution / observation の定義が judge-rules.ts と各 prompt の Completion 節に重複記載され、文言が微妙に食い違っている。

本変更は判定チャネルを typed findings のみに一本化し、result md を「evidence report」（agent が何を確認し、何を確認できなかったかの人間可読な根拠記録）に再定義する。

## 現状コードの前提

- `src/core/step/judge-verdict.ts:4-5` — verdict 集計は findings からの CLI 決定的導出（deriveJudgeVerdict 系）である
- `src/core/step/code-review.ts:189`, `src/core/step/conformance.ts:115`, `src/core/step/custom-reviewer.ts:161`, `src/core/step/regression-gate.ts:176`, `src/core/step/request-review.ts:125`, `src/core/step/spec-review.ts:119` — 各 parseResult に「R4 contract lock: prose-verdict parse path is dead」とあり、md の verdict 行は routing に使われていない
- `src/core/step/code-review.ts:90`, `src/core/step/conformance.ts:100`, `src/core/step/custom-reviewer.ts:66`, `src/core/step/regression-gate.ts:161` — initial message が「The file MUST contain a verdict line」を要求している
- `src/prompts/spec-review-system.ts:33-34,154` および `src/prompts/request-review-system.ts:130-131,279` — system prompt / initial message が verdict 行を「required for machine parsing」として要求している
- `src/prompts/fragments.ts:70-125`（PIPELINE_RULES）— 7 列 Findings 表・Scoring（Score 基準 / Weight / Total）・Iteration Comparison / Convergence Trend（score 差分 ±0.3 による plateau 判定）が定義され、同 97 行に「スコアは…CLI 側の verdict 判定には使用されない」とある
- `src/core/step/code-review.ts:139-160` — content-format output gate が review-feedback md に 7 列表 header（# / Severity / Category / File / Description / How to Fix / Fix）の存在を強制している
- `src/core/step/design.ts:68-94` — design の content-format gate は spec.md の構造（Requirement / Scenario / SHALL|MUST）を検証しており、verdict チャネルとは無関係（本変更の対象外）
- `src/templates/step-output-templates.ts` — 各 result template が verdict 行の exact format を規定している
- `src/prompts/judge-rules.ts` — DECISION_NEEDED_DEFINITION / OBSERVATION_DEFINITION / VERDICT_BLOCKING_RULES の定義元。一方で severity 定義は各 prompt の Completion 節に個別に複製されている

## 要件

1. **verdict 行の廃止**: judge 系 step の prompt・initial message・result template から「verdict 行を書け」という指示を全て削除する。agent は verdict を自己集計しない（finding 単位のラベル付けのみ。集計は CLI — R4 の完成）。人間は CLI の導出結果（job show 等の既存表示）で verdict を見る。
2. **result md の evidence report 化**: judge 系 result template を再定義し、必須セクションを「検証した項目（何をどう確認したか）」「検証できなかった項目（unverified — 無い場合は None と明記）」「findings 詳細（typed findings の補足説明）」とする。7 列 Markdown findings 表の要求は削除する（findings の正は typed toolResult のみ）。
3. **output gate の置換**: code-review の content-format gate を、7 列表 header チェックから evidence report の必須セクション存在チェックに置換する。「空・形骸レポートを機械検出する」という gate の目的は維持する。
4. **死装置の削除**: PIPELINE_RULES から Scoring（Score 基準 / Weight / Total）、および score 差分に基づく Iteration Comparison / Convergence Trend / plateau 検出の指示を削除する。CLI 実装が実際に行わない処理を agent に指示する文言を残さない。
5. **定義の単一ソース化**: severity 定義を judge-rules.ts に集約し、各 prompt の Completion 節の重複定義を削除して単一ソースからの埋め込みに置換する（DECISION_NEEDED_DEFINITION と同じパターン）。
6. **routing 不変**: deriveJudgeVerdict 系の導出ロジック・typed findings の完了契約・verdict 3 値（approved / needs-fix / escalation）の意味は変更しない。

## スコープ外

- step prompt 全体の 5 部構成骨格への再構成（後続 request で実施）
- evidence 規律（verified / derived / unverified の主張区分）を producer 系 step へ拡張すること（後続 request）
- deriveJudgeVerdict 系の導出ロジック変更
- design step の content-format gate（spec.md 構造検証）の変更
- verification / bite-evidence など CLI 自身が md を生成・parse する step の変更
- harness の write-allowlist・revision 束縛等の機構追加

## 受け入れ基準

- [ ] judge 系 step の system prompt・initial message・result template の出力文字列に「verdict 行を書け」「required for machine parsing」に相当する要求が存在しない（`**verdict**` の出力指示 grep で 0 件）
- [ ] PIPELINE_RULES に Score / Weight / Total / Convergence Trend / plateau の指示が存在しない（grep で 0 件）
- [ ] severity 定義の文言が judge-rules.ts のみに存在し、各 prompt ファイル内の重複定義が 0 件であることをテストで固定する
- [ ] code-review の content-format gate が evidence report 必須セクションを検証し、7 列表チェックが存在しないことを unit test で固定する
- [ ] evidence report template に「検証した項目」「検証できなかった項目」セクションが存在することをテストで固定する
- [ ] `src/core/step/__tests__/judge-verdict.test.ts` 等、verdict 導出の既存テストは**無改変で green**（routing 不変の証明）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: md = evidence report、findings = typed のみ**。R4 が設計した「agent 判断は finding 単位、集計は CLI」の完成形。gate は evidence セクション存在チェックに置換して「空レポート検出」の歯を保持する。
- **却下: verdict 行を「人間向け要約」として残す** — agent による verdict 自己集計は R4 が排除した二重帳簿の再導入であり、typed findings と食い違った場合に証跡が曖昧になる（findings-priority の但し書きを永続的に引きずる）。
- **却下: md の 7 列 findings 表を維持** — typed findings との二重管理が「どの記録が判定に効いたか不明」問題の温床。人間可読性は evidence report の findings 詳細セクションが担う。
- **却下: スコアリングを CLI 実装で復活させて指示と整合させる** — routing は severity ベースの blocking rules で既に決定的であり、加重スコアは判定に情報を追加しない。削除が正。
