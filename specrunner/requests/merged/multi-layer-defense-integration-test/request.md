# 多層防衛 (dsv + spec-review + design) 連携 integration test を追加する

## Meta

- **type**: new-feature
- **slug**: multi-layer-defense-integration-test
- **base-branch**: main
- **adr**: true

## 背景

#283 (= 4 層防衛網突破) の対応として 3 sub-task が個別に merge 済:

- **Sub-A** (= PR #285): `delta-spec-validation` に `no-specs-for-required-type` rule 追加
- **Sub-B** (= PR #289): `spec-review` prompt に「type=spec-change/new-feature なら specs/ 配下 delta spec 存在」HIGH check 追加
- **Sub-C** (= PR #290): `design` 完了条件にチェックリスト形式の delta spec MUST 規約追加

各 sub-task は単独で意味があり unit/integration test で動作確認されているが、「3 層が連携して動く (= 複数層が同時に bug でも残る 1 層で防ぐ)」の統合保証は各 sub-task の scope 外として #287 に切り出された。

PR #282 (= 4 層全突破) と同型の reproduction scenario が 3 層連携で確実に止まることを保証する integration test を追加する。

## 着手条件

- [x] Sub-A: PR #285 merged
- [x] Sub-B: PR #289 merged
- [x] Sub-C: PR #290 merged

3 件 merge 済 = 着手条件充足。

## pipeline state transition (= 実装基準)

`src/core/pipeline/types.ts` の transition table より、本 request が依存する正規経路:

- `delta-spec-validation needs-fix` → `delta-spec-fixer` → `delta-spec-validation` (= dsv-loop)
- `spec-review needs-fix` → `spec-fixer` → `delta-spec-validation` → `spec-review` (= spec-loop)
- `design` の出力は `success` / `error` のみ (= design 自体には fixer loop なし、completion checklist は agent 内 self-check)

各 sub-task の防衛が catch するときの起動 fixer:

| catch する層 | needs-fix を返す step | 起動する fixer |
|---|---|---|
| Sub-A (dsv) | `delta-spec-validation` | `delta-spec-fixer` |
| Sub-B (spec-review) | `spec-review` | `spec-fixer` |
| Sub-C (design) | (= self-check により design 段で end_turn せず再試行) | (= fixer step なし) |

## 要件

1. `tests/multi-layer-defense.test.ts` (= 新規ファイル、既存 `pipeline-integration.test.ts` と同型) に 3 層連携 integration test を実装する
2. **正常系**: type=spec-change で design が specs/ を作成 → dsv approved → spec-review approved → 後段に進む state 遷移を assert する
3. **Sub-B catch シナリオ**: design が specs/ 構造を作るが delta spec の中身が不十分なケースを mock agent 応答で構築し、pipeline が `dsv approved → spec-review needs-fix → spec-fixer → 再 dsv approved → 再 spec-review approved` の state 遷移を辿ることを assert する
4. **Sub-A catch シナリオ**: design が specs/ を作らなかったケースを mock agent 応答で構築し、pipeline が `dsv needs-fix → delta-spec-fixer → 再 dsv approved` の state 遷移を辿ることを assert する
5. **2 層同時 failure シナリオ**: 以下 2 ケースで「2 層が同時に bug でも残る 1 層で catch される」ことを assert する:
   - 5-a: **design + spec-review が共に bug** (= 両層が specs/ 不在を見逃す) → 残る **dsv** が catch、`dsv needs-fix → delta-spec-fixer → 再 dsv approved` で修復まで完走する
   - 5-b: **design + dsv が共に bug** (= design 段の checklist 漏れ + dsv 段の rule 無視) → 残る **spec-review** が catch、`dsv approved → spec-review needs-fix → spec-fixer → 再 dsv approved → 再 spec-review approved` で修復まで完走する
6. `bun run typecheck && bun run test` が green

### test 戦略 (= integration test、mock-based)

- 既存 `tests/pipeline-integration.test.ts` の `TC-DSV-INT-*` と同型 (= mock agent 応答 + 実物の pipeline state machine 駆動)
- agent (= LLM) は実物呼ばず mock。pipeline state machine / step orchestrator / fixer 遷移は実物
- 各 catch シナリオで `result.steps[<step>]` の verdict 配列と最終 state を assert する

## スコープ外

- 各 sub-task の修正 (= Sub-A/B/C 全て merge 済)
- 4 層目 (= implementer 側、PR #294 の AUTHORITY_SPEC_GUARD) の防衛強化
- design / spec-review / dsv 単体の prompt 改修
- 新規防衛層の追加
- spec-review + dsv の 2 層同時 failure シナリオ (= 設計上 design は self-check のみで「見逃し」とは別軸のため、3 層中 1 層が design のみ生存する組み合わせは scope 外)
- 実 LLM を呼ぶ E2E (= E2E category は PR #300 で廃止、本 test は integration category)
- Sub-C (= design completion checklist) の string assertion (= 既存 `tests/prompts/design-system.test.ts` の `TC-CL-001` で完全カバー済、本 request では重複追加しない)

## 受け入れ基準

- [ ] `tests/multi-layer-defense.test.ts` で 3 層連携 integration test が追加されている
- [ ] 正常系 + 4 シナリオ (= Sub-B catch / Sub-A catch / 2 層同時 failure 5-a, 5-b) が assert されている
- [ ] Sub-B catch シナリオが `dsv approved → spec-review needs-fix → spec-fixer → 再 dsv → 再 spec-review approved` の state 遷移で assert される (= `spec-fixer` 経由、`delta-spec-fixer` ではない)
- [ ] Sub-A catch シナリオが `dsv needs-fix → delta-spec-fixer → 再 dsv approved` の state 遷移で assert される (= `delta-spec-fixer` 経由)
- [ ] 2 層同時 failure (= 5-a / 5-b) でも残る 1 層で catch されて pipeline が完走することが state 遷移レベルで assert される
- [ ] mock agent 応答 + 実物 pipeline state machine の構成で書かれている (= 実 LLM 呼び出しなし)
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD
