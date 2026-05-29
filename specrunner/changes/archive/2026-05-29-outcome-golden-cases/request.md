# grounded 検査の golden case を追加して contract の床を固める

## Meta

- **type**: chore
- **slug**: outcome-golden-cases
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

`contract/`（PR #469 で main に追加済み）で「pipeline を縛る out-of-loop な契約」を定義した。その実装は段階的に進める（issue #468）が、migration は **“穴のある今の pipeline” を通る**。だから最初に **grounded な検査の床（golden case）を固め**、後続の危険な変更（型 cutover 等）をこの床で守る。

本 request は contract 実装 4 段階の **R1**。**振る舞いを一切変えず、現状の grounded 検査に「絶対に通すな / 絶対に弾くな」のテストを追加するだけ**。今のコードで pass する＝回帰ネット。検査を甘くする後続変更が入れば「落ちるべきものが通った」で検出できる。

対象方針は `contract/golden-cases.md` / `contract/invariants.md`。

## 要件

1. **契約の床の置き場として golden-case 専用ファイルを1つ作る**: `tests/unit/contract/golden-cases.test.ts`（配置は既存慣習に合わせて可）。「絶対に壊すな」のテストをここに集約し、`contract/golden-cases.md` と対応づける（床が1か所で見える状態にする）。
2. **そこに新規 golden case を書く**（現状テスト未存在の checker）:
   - `parseFixableFindings`（`src/core/parser/review-findings.ts`、テスト無し）: must-pass = fixable な findings を含む結果で count > 0 / must-fail-safe = 空・該当行なしで count = 0。
   - verification: **`VerificationStep.parseResult`**（`## Verdict:` 行を読む。現状ユニットテスト無し。runner 層は `tests/unit/core/verification/runner.test.ts` が既にカバー済みなので重複させない）を対象に、`'## Verdict: failed'` を入力して verdict が `passed` にならない（=`failed`）ことを assert。runner の mock 不要。
3. **既存カバー分は複製しない・既存テストを触らない**:
   - `parseReviewVerdict` の「空→null / approved 抽出」は既存（`tests/unit/parser/review-verdict.test.ts` の TC-021 / TC-018）が担保。golden-case ファイル冒頭の **コメントで floor の一部として参照するのみ**（テストは複製しない）。
4. 追加テストは現行コードで green。振る舞いを変えない。

## スコープ外

- 型の cutover / prose-parse の削除 / escalation 廃止 などの migration 本体（後続 R2〜R4）。
- 新しい outcome 形に対する golden case（例: `approved=false ∧ fixableCount=0` の矛盾検査）。新形が出来てから R4 で追加。
- 既存テスト（`review-verdict.test.ts` 等）の改変。passing test は触らない。
- `contract/` 配下の編集（trust root は out-of-loop。pipeline からは触れない）。

## 受け入れ基準

- [ ] golden-case 専用ファイルが追加され、`contract/golden-cases.md` 対応の床として集約されている
- [ ] `parseFixableFindings` の must-pass（fixable→count>0）/ must-fail-safe（空→0）を assert している
- [ ] `VerificationStep.parseResult` に `'## Verdict: failed'` を与え verdict ≠ `passed`（=`failed`）を assert している（runner 層では重複させない）
- [ ] `parseReviewVerdict` の既存 TC-018 / TC-021 を複製しておらず、既存テストファイルを変更していない（参照コメントのみ）
- [ ] 追加テストはすべて green で、既存の振る舞いを変えていない
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **床を最初に置く**: migration は今の（まだ穴のある）pipeline を通るので、検査の回帰ネットを先に固めてから機械を触る（`contract/README.md` の bootstrap 方針）。
- **golden を1ファイルに集約（review #1 への対応）**: `parseReviewVerdict` は既存 TC で担保済みなので複製せず、新規価値の `parseFixableFindings` / verification を golden 専用ファイルに書く。床を discoverable にしつつ重複と既存改変を避ける中間案。
- **verification は `parseResult` 層で pin（再レビュー #1 反映）**: runner 層の「exit→failed」は既存テスト済みなので、未テストの `VerificationStep.parseResult`（`## Verdict:` 読み取り）を golden case の対象にして重複を避ける。
- **既存テストを触らない**: passing test の改変はスコープ外（最小・安全）。
- **現状 assertable なものに限定**: 矛盾検査など “新しい outcome 形でしか出ない” ケースは R4 に回す。
- **`contract/` は編集対象にしない**: 契約は out-of-loop な authority。本 request は契約を消費（テストで守る）するだけ。
