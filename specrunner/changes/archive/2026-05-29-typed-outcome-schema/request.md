# report_result を step-class 別の typed outcome に拡張する（additive / expand）

## Meta

- **type**: refactoring
- **slug**: typed-outcome-schema
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

`contract/step-outcome.md`（PR #469 で main 追加済み）が、step が結果を返す形を定義している。実装は段階的（issue #468）で、本 request は **R2 = expand フェーズ**。

`contract/golden-cases.md` の床（R1, PR #470）が入ったので、ここから安全に型を入れていく。expand→cutover→contract のうち、**R2 では新しい typed outcome を「additive に足すだけ」**にする。誰も読まない状態で並存させることで、危険な cutover（R3）の blast radius を下げ、各 PR を build green に保つ。

現状: `report_result` は全 step 共通の `BaseReportResult {ok, reason?}`（`src/core/port/report-result.ts:17`、`src/core/step/report-tool.ts`）。`report-tool.ts:6-8` 自身が「Phase 3 で step 固有フィールドに拡張」と宣言しており、本 request がその Phase 3。

## 要件

1. **step-class 別の typed outcome を定義（additive）**（`contract/step-outcome.md` の「step-class 別 outcome」に従う）:
   - producer（design / implementer / 各 fixer / test-case-gen / adr-gen）: `status: "success" | "error"`
   - judge（spec-review / code-review）: `approved: boolean`（code-review のみ `fixableCount: number`）
   - 既存の `{ ok, reason? }` は**残したまま**新フィールドを足す（破壊しない）。各 step が自分の outcome 形を宣言できる形にする。
2. **claude-code adapter が新フィールドを populate する**（`src/adapter/claude-code/`）。埋めるだけ。
3. **誰も新フィールドを routing / outcome 確定に使わない**: `executor.ts` の verdict 確定・`pipeline/types.ts` の transition は**現状のまま**。= 振る舞い不変。
4. **新フィールドが populate されることを presence テストで assert する**: 各 step-class の該当フィールド（producer = `status` / judge = `approved` / code-review = `fixableCount`）が non-undefined で返ることを検証する。既存テストは green のまま。

## スコープ外

- 新フィールドを**読む** cutover（executor / transition の切替、prose-parse からの脱却）= R3。
- `ok` / `reason` の廃止、prose パーサ削除、escalation 廃止 = R3 / R4。
- managed / codex adapter の対応（runtime follow-on）。R2 で未 populate でも、誰も読まないので影響なし。
- `contract/` 配下の編集（out-of-loop な authority）。

## 受け入れ基準

- [ ] producer（status）/ judge（approved (+ code-review: fixableCount)）の typed outcome が `report-result.ts` / `report-tool.ts` に定義されている
- [ ] claude-code adapter が新フィールドを populate し、presence テストで該当フィールド（producer=`status` / judge=`approved` / code-review=`fixableCount`）が non-undefined であることを assert している
- [ ] `executor.ts` の verdict 確定経路と `pipeline/types.ts` の transition は未変更で、振る舞いが変わっていない（既存テスト green）
- [ ] 既存の `{ ok, reason? }` を破壊していない（additive）
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **expand フェーズ（additive・誰も読まない）**: 新 outcome を旧形と並存させ、cutover(R3) の前に型と adapter 側だけ先に整える。各 PR を green に保つ expand-contract の expand。
- **authority は `contract/step-outcome.md`**: 本 request は契約を実装するだけで、新たな設計判断は無い（だから adr: false。構造の根拠は contract/ に既出。specrunner/adr に二重化しない）。
- **claude-code のみ**: 他 runtime は follow-on。R2 では未 populate でも誰も読まないため degrade すら起きない。
- **`contract/` は編集対象にしない**: 契約を消費（実装）するだけ。
