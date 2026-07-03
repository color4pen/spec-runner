# ADR-20260703: spec 免除を型の宣言的属性として持ち、contract 構築層で適用する

## ステータス

accepted

## コンテキスト

design step の output contract は request 型に関係なく非空・非 scaffold な `spec.md` を必須にしていた。一方 `type-config` は chore を「spec 対象外（振る舞い spec 不要）」と宣言しており、両者が矛盾する。docs / CI / 依存更新のような振る舞い spec を持たない chore を実行すると、design agent は書くべき Requirement が無く `spec.md` を雛形のまま残し、contract gate が `STEP_OUTPUT_MISSING` で halt する。結果としてこのツールが自分の docs-only PR を自前パイプラインで生成できない自己矛盾が生じていた。

既存の `type-config.specImpact` は spec-review プロンプトに注入される文字列ガイダンスにすぎず、design contract を型ごとに緩める機構が無い。contract gate は local / managed の `validateStepOutputs` に重複実装されており、どちらかだけを直すと両 runtime の動作が乖離するリスクがあった。

## 決定

### D1: `type-config` に `specRequired: boolean` を追加し、型駆動の宣言的免除を確立する

`TypeConfigEntry`（`src/config/type-config.ts`）に `specRequired: boolean` を追加する。chore は `false`、new-feature / spec-change / bug-fix / refactoring は `true`。参照用ヘルパ `isSpecRequired(type: string): boolean` を追加し、未知型は `true`（fail-closed）にフォールバックさせる。これにより免除の判定は request 作成時に決まる型属性から導かれ、agent の実行時判断（「この変更に spec は要るか」）に一切依存しない。

`specReviewMode`（lightweight / standard）とは**直交**する概念として独立フィールドを設けた。refactoring は `specReviewMode: "lightweight"` だが spec-required であり、`specReviewMode` を免除条件に流用すると refactoring まで誤って免除してしまう。

### D2: 免除の適用点は `writes()` の `verify` フラグ（contract 構築層）— runtime 検証は不変

`DesignStep.writes()` で spec.md の `IoRef` に `verify: isSpecRequired(deps.request.type)` を設定する。`producedContractsFromWrites()`（`src/core/step/output-verify.ts`）は `w.verify === false` の write を produced contract から除外する既存ロジックを持つ。免除型では spec.md の produced contract 自体が生成されず、gate に到達しない。

local / managed 両 runtime の `validateStepOutputs` は一切変更しない。`buildAllOutputContracts()` の出力を両 runtime が共有消費するため、contract 構築層で免除すれば single-source で runtime の重複検証コードを変えずに両 runtime が同じ結果を示す。

`IoRef.verify` は「runtime state に条件付きの write を post-execution 検証から外す」ために既に定義・文書化された opt-out であり、本ケースはその文書化された用途に一致する。

### D3: 免除型の spec.md scaffold を「振る舞い spec なし」の明示ノートに差し替える

`getOutputTemplates()` の design case で、`isSpecRequired(state.request.type) === false` のとき spec.md の template を `SPEC_TEMPLATE`（要件記述雛形）ではなく `SPEC_EXEMPT_NOTE` に差し替える。`SPEC_EXEMPT_NOTE` は「この変更は型が spec 対象外のため振る舞い spec を持たない（記述漏れではない）」を自己完結で述べ、機械可読な定数 `SPEC_EXEMPT_MARKER`（`"SPEC-EXEMPT"`）を含む。

D2 で spec.md contract を落とすため、免除型では agent が spec.md を未編集で残すのが正常系になる。scaffold をそのまま commit させると `SPEC_TEMPLATE` の雛形残骸が PR に残り silent fail-open になる。scaffold 自体を意味のあるノートにすることで、`git add -A` でそのまま commit され、change folder / PR に免除理由が可読に残る。

### D4: 下流プロンプトが `SPEC_EXEMPT_MARKER` を認識し vacuously satisfied 扱いする

spec-review（`src/prompts/spec-review-system.ts`）と conformance（`src/prompts/conformance-system.ts`）に、「spec.md が `SPEC_EXEMPT_MARKER` を含む場合はレビューすべき Requirement / Scenario が存在しない → vacuously satisfied として扱い、Requirement 欠如を findings にしない」というガイダンスを追加する。design プロンプト（`src/prompts/design-system.ts`）にも「spec.md は免除ノートが事前配置されている。そのまま残し、Requirement を捏造しない」旨の chore 用分岐を追加する。

`SPEC_EXEMPT_MARKER` は単一定数として export し、note とプロンプトが import 共有する。文言ドリフトをテストで固定する。

## 検討した代替案

### Alternative 1: `specReviewMode: "lightweight"` を免除条件に流用する

- **Pros**: 新規フィールド追加が不要。
- **Cons**: refactoring は `lightweight` かつ spec-required であり、流用すると refactoring まで誤って免除してしまう。
- **Why not**: 免除は `specReviewMode` とは直交する概念であり独立フィールドが必要。

### Alternative 2: agent が実行時に「spec が要るか」を判断して sentinel を書く方式

- **Pros**: type-config への変更が不要。
- **Cons**: contract が排除しようとしている LLM 判断を復活させる。型は request 作成時に既に宣言されているため、実行時に再判断させる必要がない。
- **Why not**: 免除は宣言的型属性で駆動し、agent の実行時判断に依存しないことが要件。

### Alternative 3: runtime の `validateStepOutputs` に型例外分岐を足す

- **Pros**: contract 構築層を変えずに済む。
- **Cons**: local / managed 双方に分岐が増え、重複判定ロジックを悪化させる。どちらかの実装漏れで両 runtime の動作が乖離するリスクが残る。
- **Why not**: contract 構築層（`writes()`）で免除すれば runtime 実装を変えずに single-source で両 runtime を同一動作にできる。

### Alternative 4: `buildAllOutputContracts()` 側で spec.md contract を型で filter する

- **Pros**: 各 step の `writes()` を変えずに汎用関数で吸収できる。
- **Cons**: 「spec.md は免除可能な path」という個別知識を汎用関数にハードコードする。`writes()` に置けば「どの write を条件付きにするか」は step 自身の責務に収まる。
- **Why not**: step の `writes()` が免除 opt-out の self-contained な責務として持つ方が局所性が高い。

### Alternative 5: scaffold を `SPEC_TEMPLATE` のまま残し、commit 前に spec.md を削除する

- **Pros**: template 層を変えずに済む。
- **Cons**: 下流（conformance / spec-review）が spec.md を読むため、ファイル欠落は「明示的な免除の痕跡」を消してしまい silent fail-open になる。
- **Why not**: 免除は明示的で成果物に残ることが要件。ファイル削除は免除宣言の痕跡を消す。

## 影響

- chore 型で design agent が Requirement を 1 つも生成しなくても design step が `STEP_OUTPUT_MISSING` で halt しなくなる
- 非 chore 型（new-feature / spec-change / bug-fix / refactoring）の spec.md contract は現状維持。scaffold 放置で従来どおり halt する fail-closed を弱めない
- local / managed 両 runtime の `validateStepOutputs` は不変。contract 構築層（`producedContractsFromWrites`）の変更のみで両 runtime が同じ結果になる
- chore の change folder / PR に `SPEC_EXEMPT_NOTE` が commit されることで、免除理由が可読な形で成果物に残る
- spec-review（lightweight）と conformance が `SPEC_EXEMPT_MARKER` を認識し Requirement ゼロの spec.md を vacuously satisfied として扱う
- 未知型・legacy 型は `isSpecRequired` の fail-closed フォールバック（true）により spec-required のまま

本 ADR は以下の ADR を補完する:
- `2026-06-04-step-io-contracts.md`（`IoRef.verify` opt-out の定義元）
- `2026-06-03-self-contained-spec-model.md`（spec.md の A-group scaffold 設計）

## 参照

- Request: `specrunner/changes/spec-exempt-design-contract/request.md`
- Design: `specrunner/changes/spec-exempt-design-contract/design.md`
- Spec: `specrunner/changes/spec-exempt-design-contract/spec.md`
- Implementation: `src/config/type-config.ts` · `src/core/step/design.ts` · `src/core/step/output-verify.ts` · `src/templates/step-output-templates.ts` · `src/prompts/spec-review-system.ts` · `src/prompts/conformance-system.ts` · `src/prompts/design-system.ts`
