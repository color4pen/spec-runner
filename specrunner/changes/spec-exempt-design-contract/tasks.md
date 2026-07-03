# Tasks: spec-exempt design contract

<!-- 実装は implementer が行う。各タスクは file:line 参照付き。design.md の D1-D4 に対応する。 -->

## T-01: `type-config` に宣言的 `specRequired` 属性と `isSpecRequired` ヘルパを追加する

対応: design D1 / spec Requirement「Request type declares spec requirement as a declarative attribute」

- [x] `src/config/type-config.ts` の `TypeConfigEntry` interface（14-20 行）に `specRequired: boolean` を追加する
- [x] `TYPE_CONFIG`（22-58 行）の各エントリに `specRequired` を設定する: `chore` = `false`、`new-feature` / `spec-change` / `bug-fix` / `refactoring` = `true`
- [x] 参照ヘルパ `isSpecRequired(type: string): boolean` を追加する。`TYPE_CONFIG[type]?.specRequired ?? true`（未知型は spec-required にフォールバック、`getBranchPrefix` / `getSpecReviewMode` と同じ規約）
- [x] `src/config/__tests__/type-config.test.ts` に `isSpecRequired` の単体テストを追加する: `chore` → `false`、`new-feature` / `spec-change` / `bug-fix` / `refactoring` → `true`、未知型（例 `"unknown"`）→ `true`

**Acceptance Criteria**:
- `isSpecRequired("chore") === false`、その他 4 型 === `true`、未知型 === `true`
- 既存の `getConventionalPrefix` テストは無変更で green

## T-02: 免除ノート `SPEC_EXEMPT_NOTE` と共有マーカーを追加し、免除型の scaffold を差し替える

対応: design D3 / spec Requirement「Spec-exempt spec.md carries an explicit, machine-recognizable exemption note」

- [x] `src/templates/step-output-templates.ts` に共有マーカー定数 `SPEC_EXEMPT_MARKER`（例 `"SPEC-EXEMPT"`）を export で追加する
- [x] `SPEC_EXEMPT_NOTE` 定数を追加する。要件: (a) 非空・自己完結、(b) `SPEC_EXEMPT_MARKER` を含む、(c) 「この変更は request 型が spec 対象外のため振る舞い spec（Requirement / Scenario）を持たない。型による宣言的な免除であり記述漏れではない」旨を可読な本文で述べる、(d) 空の `## Requirements` 雛形を含めない、(e) 下流レビュー（spec-review / conformance）に対し「Requirement 欠如を findings にしない」旨を明記する
- [x] `getOutputTemplates()` の `case "design"`（420-435 行）で、`isSpecRequired(state.request.type) === false` のとき spec.md の `content` を `SPEC_EXEMPT_NOTE` に、それ以外は従来どおり `SPEC_TEMPLATE` にする（`design.md` / `tasks.md` の template は不変）
- [x] `src/config/type-config.ts` から `isSpecRequired` を `src/templates/step-output-templates.ts` に import する
- [x] `src/templates/__tests__/step-output-templates.test.ts` にテストを追加する: `chore` の `state` で `getOutputTemplates("design", slug, state)` の spec.md content が `SPEC_EXEMPT_MARKER` を含み `SPEC_TEMPLATE` と異なること / `spec-change`・`new-feature` の `state` では spec.md content が `SPEC_TEMPLATE` に一致すること / `SPEC_EXEMPT_NOTE` が非空かつ空 `## Requirements` 雛形を含まないこと

**Acceptance Criteria**:
- `chore` の design output templates で spec.md content が `SPEC_EXEMPT_NOTE`（マーカー入り・非空）
- `spec-change` / `new-feature` の design output templates で spec.md content が `SPEC_TEMPLATE`（現状維持）
- `design.md` / `tasks.md` の template content は全型で不変

## T-03: design `writes()` の spec.md を型駆動で `verify` opt-out にする（contract 構築層で免除）

対応: design D2 / spec Requirement「Design step omits the spec.md output contract for spec-exempt types」

- [x] `src/core/step/design.ts` の `writes()`（83-90 行）で spec.md の `IoRef` に `verify: isSpecRequired(deps.request.type)` を設定する（`design.md` / `tasks.md` は不変）。`isSpecRequired` を `../../config/type-config.js` から import する
- [x] `src/core/runtime/local.ts` / `src/core/runtime/managed.ts` の `validateStepOutputs` は**変更しない**（免除は contract 構築層で完結する）
- [x] `src/core/step/` 配下に新規テスト（例 `__tests__/design-spec-exempt-contract.test.ts`）を追加し、`buildAllOutputContracts(DesignStep, state, deps)`（`src/core/step/output-verify.ts:173`）を検証する:
  - `chore` の `state` / `deps` で結果の produced contract に spec.md path が**含まれない**こと、かつ `design.md` / `tasks.md` は含まれること
  - `bug-fix` の `state` / `deps` で spec.md の produced contract が**含まれ**、その `scaffold` が `SPEC_TEMPLATE` と一致すること
- [x] `makeState` / `makeDeps` ヘルパは `src/core/step/__tests__/custom-reviewer-step.test.ts:31-55` の形を参考に、`request.type` を切り替えられるようにする

**Acceptance Criteria**:
- `chore` 時 `buildAllOutputContracts` の produced contract に spec.md が無い（gate が spec.md で halt し得ない）
- `bug-fix` 時 spec.md の produced contract が残り、scaffold 一致検出が有効
- local / managed の `validateStepOutputs` のコードは無変更

## T-04: local / managed 両 runtime で免除結果が一致することを固定する

対応: design D2 / spec Requirement「... local and managed runtime ... produce the same result」（受け入れ基準 3）

- [x] 新規または既存 runtime テストに、同一の contract リストに対する local / managed の `validateStepOutputs` 一致テストを追加する:
  - `chore` design の `buildAllOutputContracts` 出力（spec.md contract 無し）を入力に、tmp worktree（local）と mock `getRawFile`（managed、`src/core/runtime/__tests__/managed-verify-finding-refs.test.ts:67-` の `makeManagedRuntime` を参考）で、spec.md content が `SPEC_EXEMPT_NOTE`（未編集）でも**両者とも spec.md violation を出さない**こと
  - `bug-fix` design の contract 出力（spec.md contract 有り・scaffold=`SPEC_TEMPLATE`）で、spec.md content が `SPEC_TEMPLATE`（未編集）のとき**両者とも spec.md violation を出す**こと
- [x] local 側は tmp ディレクトリに design.md / tasks.md / spec.md を書いて `LocalRuntime.validateStepOutputs` を呼ぶ。managed 側は同じ path→content を返す `getRawFile` mock を使う

**Acceptance Criteria**:
- 同一 contract 入力に対し local と managed の violation 集合が一致する（chore=spec.md violation 無し、bug-fix=spec.md violation 有り）
- 受け入れ基準 1（chore 再現）・2（bug-fix 回帰）・3（両 runtime 一致）がテストで固定される

## T-05: 下流プロンプトが免除マーカーを認識するようにする

対応: design D4 / spec Requirement「Downstream review treats an exempt spec.md as vacuously satisfied」（受け入れ基準 4）

- [x] `src/prompts/spec-review-system.ts` の "Semantic Review of spec.md" 節（63-72 行付近）に、「`spec.md` が `SPEC_EXEMPT_MARKER` を含む場合は spec-exempt 型であり、レビューすべき Requirement / Scenario は存在しない。spec.md を vacuously satisfied として扱い、Requirement / Scenario 欠如を finding にしない（`findings: []`）」ガイダンスを追加する
- [x] `src/prompts/conformance-system.ts` の judgment item 3（spec.md、29 行付近）または Review Process に、「`spec.md` が `SPEC_EXEMPT_MARKER` を含む場合は spec.md の conformance を vacuously satisfied（conforms）扱いにし、Requirement 欠如を non-conformity にしない」ガイダンスを追加する
- [x] `src/prompts/design-system.ts` の Completion Checklist（183-201 行）に chore 用の分岐を追加する: 「type: chore（spec 対象外）の場合 — design.md / tasks.md を作成する。spec.md は免除ノートが事前配置済み。そのまま残し、Requirement を捏造しない」。既存の spec-change/new-feature・bug-fix/refactoring 分岐は不変
- [x] マーカー文字列は T-02 の `SPEC_EXEMPT_MARKER` を単一の出典として参照する（プロンプト側は import で共有、文言のハードコード重複を避ける）
- [x] `src/prompts/__tests__/` に、spec-review / conformance の system prompt が `SPEC_EXEMPT_MARKER` を含むことを固定するテストを追加する（マーカーと note・プロンプトのドリフト防止）

**Acceptance Criteria**:
- spec-review / conformance の system prompt に免除マーカー認識ガイダンスが含まれる
- design system prompt に chore 用 Completion Checklist 分岐が含まれ、既存 2 分岐は無変更
- `SPEC_EXEMPT_MARKER` が note・spec-review prompt・conformance prompt で単一定数から共有される

## T-06: 検証（build / typecheck / lint / test）

対応: 受け入れ基準 5

- [x] `bun run typecheck` が green
- [x] `bun run lint` が green
- [x] `bun run test` が green（既存テストは無変更で pass、新規テストが pass）
- [x] `bun run build` が成功

**Acceptance Criteria**:
- typecheck / lint / test / build がすべて成功
- 既存テストに変更を加えていない（新規追加のみ）
