# Design: chore（spec 対象外）の変更が design step を通過できるようにする

## Context

design step の output contract は request 型に関係なく非空・非 scaffold な `spec.md` を必須にしている。一方 `type-config` は chore を「spec 対象外」と宣言しており、両者が矛盾する。振る舞い spec を持たない chore（docs / CI / 依存更新）を実行すると、design agent は書くべき Requirement が無く spec.md を雛形のまま残し、contract gate が `STEP_OUTPUT_MISSING` で halt する。結果としてこのツールが自分の docs-only PR を自前パイプラインで生成できない。

現状コード（検証済み）:

- `DesignStep.writes()` が `design.md` / `tasks.md` / `spec.md` を宣言する（`src/core/step/design.ts:83-90`）。この宣言は `buildAllOutputContracts()`（`src/core/step/output-verify.ts:173-186`）→ `producedContractsFromWrites()`（同 65-82）経由で `kind: "produced"`・`policy: "halt"` の output contract になる。
- `produced` contract は content が (a) 欠落 / (b) trim 後 空 / (c) `scaffold` と完全一致 のいずれかで violation。判定は **local**（`src/core/runtime/local.ts:721-724`）と **managed**（`src/core/runtime/managed.ts:423-426`）に**重複**している。
- design 前に `writeOutputTemplates()`（`src/core/artifact/copy-artifacts.ts:87-99`）が `getOutputTemplates()`（`src/templates/step-output-templates.ts:402-481`）の返す A-group scaffold を設置する。spec.md の scaffold は `SPEC_TEMPLATE`（同 291-336）で、`## Requirements`（空）を含む雛形。振る舞い spec の無い変更では agent がこれを未編集で残すため上記 (c) に該当する。
- contract gate は commit の**前**に走り、halt すると awaiting-resume 化する（`src/core/step/executor.ts:455-499`）。
- `type-config` の `specImpact` は spec-review プロンプトに注入される文字列ガイダンスにすぎず（`src/config/type-config.ts:17`）、design contract を型ごとに緩める機構が無い。chore は `specReviewMode: "lightweight"`（同 51-57）。
- 下流の spec-review（`src/core/step/spec-review.ts`、prompt `src/prompts/spec-review-system.ts`）/ conformance（`src/core/step/conformance.ts`、prompt `src/prompts/conformance-system.ts`）/ spec-fixer（`src/core/step/spec-fixer.ts`）も spec.md を読む。
- commit は `git add -A`（`src/core/step/commit-push.ts:45,100`）で change folder 全体を stage するため、agent が触らない scaffold もそのまま commit される。
- `JobState.request.type`（`RequestInfo.type`、`src/state/schema.ts:81-94`）と `StepDeps.request.type`（`ParsedRequest`）はともに参照可能。`getOutputTemplates()` は `state` を、`writes()` は `deps` を受け取る。

## Goals / Non-Goals

**Goals**:

- spec 免除を **request 型の宣言的属性**として持ち、免除型の design step が振る舞い spec ゼロで（spec.md contract の halt に触れず）通過できるようにする。
- 免除を **runtime 非依存**にする（local / managed の重複検証コードを変更しない）。
- 免除された変更でも「振る舞い spec なし（理由: 型が spec 対象外）」が commit される spec.md に**可読な形で残る**ようにする（silent fail-open にしない）。
- 下流の spec-review / conformance が Requirement ゼロの spec 免除 spec.md でエラーせず、findings を捏造しないようにする。

**Non-Goals**:

- verdict 導出規則・design 以外の step の output contract の変更。
- spec-exemption 以外の `type-config` 再設計。
- refactoring 型の免除化（免除対象は chore に限定する。refactoring は現状の spec-required 既定を維持する）。
- docs-install-dependency-size（#707）本体の docs 作業。
- agent が実行時に「spec が要るか」を判断する方式（contract が排除しようとしている LLM 判断の復活）。

## Decisions

### D1: spec 免除を `type-config` の宣言的 boolean 属性 `specRequired` として持つ

`TypeConfigEntry`（`src/config/type-config.ts:14-20`）に `specRequired: boolean` を追加する。値は chore=`false`、new-feature / spec-change / bug-fix / refactoring=`true`。参照用ヘルパ `isSpecRequired(type: string): boolean` を追加し、未知型は `true`（fail-closed）にフォールバックさせる（既存の `getBranchPrefix` / `getSpecReviewMode` と同じ fallback 規約）。

- **Rationale**: 免除は request 作成時に決まる型で駆動すべきで、agent の実行時判断に依存させない（要件 1）。`specReviewMode` とは**直交**する概念なので独立フィールドが必要 — refactoring は `lightweight` だが spec-required であり、`specReviewMode` を免除条件に流用すると refactoring まで誤って免除してしまう。
- **Alternatives considered**:
  - `specReviewMode: "lightweight"` を免除条件に流用 → 却下。refactoring（lightweight かつ spec-required）を巻き込み、要件 2 と「refactoring 免除化はスコープ外」に違反する。
  - agent が spec 要否を判断して sentinel を書く → 却下。contract が排除しようとしている LLM 判断を復活させる。

### D2: 免除の適用点は design の `writes()`（contract 構築層）— runtime 検証は不変

`DesignStep.writes()`（`src/core/step/design.ts:83-90`）で spec.md の `IoRef` に `verify: isSpecRequired(deps.request.type)` を設定する。`producedContractsFromWrites()` は既に `w.verify === false` の write を produced contract から除外する（`src/core/step/output-verify.ts:72`）。免除型では spec.md の produced contract 自体が生成されず、gate に到達しない。

- **Rationale**: `IoRef.verify` は「runtime state に条件付きの write（特定 request 型でのみ書かれる）を post-execution 検証から外す」ために既に定義・文書化された opt-out（`src/core/port/step-types.ts:36-42`）であり、本ケースはその文書化された用途に正確に一致する。`buildAllOutputContracts()` の出力は local / managed **両方**の `validateStepOutputs` が消費するため、contract 構築層で免除すれば runtime の重複検証コードを一切変更せず single-source で免除できる（要件 5）。
- **Alternatives considered**:
  - `buildAllOutputContracts()` 側で spec.md contract を型で filter する → 却下。「spec.md は免除可能な path」という個別知識を汎用関数にハードコードすることになる。`writes()` に置けば「どの write を条件付きにするか」は step 自身の責務に収まる。
  - runtime の `validateStepOutputs` に型例外分岐を足す → 却下。local / managed 双方に分岐が増え、重複判定ロジックを悪化させる（要件 5 違反）。

### D3: 免除型の spec.md scaffold を「振る舞い spec なし」ノートに差し替える

`getOutputTemplates()`（`src/templates/step-output-templates.ts:420-435`）の `design` case で、`isSpecRequired(state.request.type) === false` のとき spec.md の template content を `SPEC_TEMPLATE` ではなく新設の `SPEC_EXEMPT_NOTE` にする。`SPEC_EXEMPT_NOTE` は「この変更は型が spec 対象外のため振る舞い spec を持たない（記述漏れではない）」を自己完結で述べ、機械可読なマーカー `SPEC_EXEMPT_MARKER`（例 `SPEC-EXEMPT`）を含む。マーカー文字列は定数として一元定義し、note と下流プロンプト（D4）が共有する。

- **Rationale**: D2 で spec.md contract を落とすため、免除型では agent が spec.md を未編集で残すのが正常系になる。scaffold をそのまま commit させると `SPEC_TEMPLATE`（雛形の残骸）が PR に残り silent fail-open になる。scaffold 自体を意味のあるノートにすれば、`git add -A` でそのまま commit され、change folder / PR に免除理由が可読に残る（要件 3）。`getOutputTemplates()` は `state` を受け取るため型で分岐できる。マーカーを定数共有することで D4 の下流認識と note の表現がズレない。
- **Alternatives considered**:
  - scaffold は `SPEC_TEMPLATE` のまま、commit 前に spec.md を削除する → 却下。下流（conformance / spec-review）が spec.md を読むため、ファイル欠落は「明示的な免除の痕跡」を消してしまい要件 3・4 を損なう。
  - commit 直前に別 seam でノートを書く → 却下。template 層が scaffold 設置の single seam。placement を 2 箇所に分散させない。

### D4: 下流プロンプトが `SPEC_EXEMPT_MARKER` を認識し spec.md を vacuously satisfied 扱いする

spec-review（`src/prompts/spec-review-system.ts` の "Semantic Review of spec.md" 節）と conformance（`src/prompts/conformance-system.ts` の judgment item 3）のプロンプトに、「spec.md が `SPEC_EXEMPT_MARKER` を含む場合は spec-exempt 型であり、レビューすべき Requirement / Scenario は存在しない → spec.md は vacuously satisfied として扱い、Requirement 欠如を findings にしない（`findings: []` / conforms 扱い）」というガイダンスを追加する。あわせて design プロンプト（`src/prompts/design-system.ts` の Completion Checklist、183-201）に chore 用の分岐を追加し、「spec.md は免除ノートが事前配置されている。そのまま残し、Requirement を捏造しない」旨を明示する。

- **Rationale**: 要件 4 は Requirement ゼロの spec 免除 spec.md で下流がエラーせず findings を捏造しないことを求める。CLI 側に spec.md の requirement を機械抽出して落ちる箇所は存在しない（検証済み）ため、下流の失敗経路は「agent が空の spec を見て HIGH finding を捏造する」ことに限られる。マーカー認識ガイダンスでこれを抑止する。design プロンプト分岐は agent が免除ノートを上書き／捏造しないための補助であり、halt の可否は D2 の contract 免除が型駆動で決めるため、プロンプトは gate ではなく成果物の品質担保として働く。
- **Alternatives considered**:
  - lightweight mode の既存文言（"Requirements coverage is not applicable for behavior-preserving changes"）だけに頼る → 却下。これは behavior-preserving（refactoring）向けの記述で、「zero-Requirement が chore では正当」だと agent に明示しないため findings 捏造を確実には防げない。

## Risks / Trade-offs

- [Risk] 未知型 / legacy 型で免除が漏れる → **Mitigation**: `isSpecRequired` は未知型を `true`（spec-required, fail-closed）にフォールバックさせる。既存の型ヘルパと同じ規約で、要件 2（fail-closed を弱めない）を保つ。
- [Risk] 非 chore 型の contract が誤って緩む → **Mitigation**: D2 は `verify: isSpecRequired(type)` で spec-required 型は `verify: true`（既定）のまま produced contract を維持する。bug-fix で scaffold 放置 → 従来どおり halt する回帰テストで固定する（要件 2）。
- [Risk] spec-fixer も `writes()` で spec.md を produced 宣言する（`src/core/step/spec-fixer.ts:99-105`）ため chore で halt しないか → **Mitigation**: spec-fixer の spec.md には scaffold（template）が無く（`getOutputTemplates` は spec-fixer に対し `[]`）、violation 条件は「欠落 / 空」のみ。免除ノートは非空なので passes。spec-fixer は chore では通常起動しない（spec-review lightweight が approve）。本 request では spec-fixer に変更を加えない。
- [Risk] note のマーカーとプロンプトの文言がドリフトする → **Mitigation**: `SPEC_EXEMPT_MARKER` を定数で一元定義し note とプロンプトが import 共有する。テストで note とプロンプト双方にマーカーが含まれることを固定する。
- [Risk] agent が免除ノートを Requirement で上書きする → **Mitigation**: halt 可否は D2 の型駆動 contract 免除が決めるため上書きされても halt しない。下流も spec-required 型と同様に実 spec を読むだけで壊れない。D4 の design プロンプト分岐で上書きを抑止する。

## Open Questions

- なし（refactoring の将来的な免除化は明示的にスコープ外）。
