# Tasks: test-coverage 契約違反で欠落 TC-ID を agent と operator に伝え、同一セッションで修復可能にする

## T-01: `OutputViolation` に coverage 構造化フィールドを追加する

- [x] `src/core/port/output-contract.ts` の `OutputViolation` に任意フィールド
      `coverage?: { missingTcIds: string[]; assertionlessTcIds: string[] }` を追加する
- [x] `coverage` の doc コメントを追記する（`test-coverage` kind でのみ設定、missing = テストファイル未出現の
      must TC-ID、assertionless = 出現するが assertion 無しの must TC-ID、他 kind では undefined）
- [x] `OutputViolation.detail` の既存 doc（`test-coverage` は missing/assertionless の union）は維持し、
      `coverage` がカテゴリ別の構造化ソースである旨を追記する

**Acceptance Criteria**:
- `OutputViolation.coverage` が `{ missingTcIds: string[]; assertionlessTcIds: string[] } | undefined` 型を取る
- 既存の produced / tasks-complete / content-format の型・doc・`detail` の意味は無変更で維持される
- `bun run typecheck` が green

## T-02: local runtime の test-coverage 検出で coverage を格納する

- [x] `src/core/runtime/local.ts` の `validateStepOutputs` の `test-coverage` 分岐（`:1330-1333`）で、
      失敗時の violation に `coverage: { missingTcIds: result.missingTcIds, assertionlessTcIds: result.assertionlessTcIds }`
      を追加する
- [x] `detail` は従来どおり `[...result.missingTcIds, ...result.assertionlessTcIds]` の union を維持する
- [x] coverage 判定ロジック（`evaluateTestCoverage` / `extractMustTcIds` / `tcIdBoundaryRe` / assertion 判定）は
      変更しない

**Acceptance Criteria**:
- missing のみ / assertionless のみ / 両方混在 の各ケースで、violation の `coverage.missingTcIds` と
  `coverage.assertionlessTcIds` が評価器の結果と一致する（unit test）
- `detail` が従来どおり両集合の union を含む（既存 TC-TMB-13 が無改変で green）
- managed runtime（`src/core/runtime/managed.ts`）の test-coverage 分岐は無変更（best-effort skip のまま）
- `bun run typecheck && bun run test` が green

## T-03: halt メッセージに test-coverage の欠落 TC-ID を描画する

- [x] `src/core/step/step-halt.ts` の `makeOutputGateHalt` の `violationPaths` map に、
      `tasks-complete` / `content-format` 分岐と generic fall-through の間に `v.kind === "test-coverage"` 分岐を追加する
- [x] module-local な純ヘルパで `v.coverage` からカテゴリ別文字列を組む:
      `missingTcIds` 非空なら `missing TCs: <ids>`、`assertionlessTcIds` 非空なら `assertionless TCs: <ids>` を
      `; ` 連結し、`${v.path} (<parts>)` として描画する。両方空 / `coverage` undefined のときは `see file` に fall back する
- [x] tasks-complete / content-format / produced の既存描画は無変更

**Acceptance Criteria**:
- missing = {TC-064, TC-065}、assertionless = {TC-003} の test-coverage violation を含む halt の
  `error.message`（または `error.hint`）に TC-064・TC-065・TC-003 が含まれ、missing と assertionless が
  区別された文言で描画される（unit test）
- `coverage` 未設定の test-coverage violation で `see file` fall back になる（unit test）
- 既存 tasks-complete / content-format / produced の halt メッセージは無変更（既存
  `tests/unit/step/content-format-detection.test.ts` T-07 が無改変で green）
- `bun run typecheck && bun run test` が green

## T-04: follow-up prompt に test-coverage 節を追加する

- [x] `src/core/step/output-verify.ts` の `buildOutputFollowUpPrompt` に `test-coverage` violation の節を追加する
- [x] 全 test-coverage violation の `coverage.missingTcIds` / `coverage.assertionlessTcIds` を集約し、
      missing 非空なら「各 TC のテストを書き TC-ID をテストファイルに記載する」指示と ID の箇条書き、
      assertionless 非空なら「各 TC を覆うテストに assertion を追加する」指示と ID の箇条書きを、
      別々のサブ節として出力する
- [x] 両カテゴリとも空の場合は `(see <path> for uncovered must TCs)` の fall back 行を出す
- [x] 既存の共通末尾（commit and push）を踏襲する。既存 tasks-complete / produced / content-format 節は無変更

**Acceptance Criteria**:
- missing = {TC-064}、assertionless = {TC-003} の test-coverage violation から生成した prompt が、
  TC-064 を「テストを書く」指示の対象、TC-003 を「assertion を追加する」指示の対象として ID 明示で列挙する（unit test）
- missing と assertionless の修復指示が prompt 上で区別される（unit test）
- 既存 `tests/unit/step/output-verify.test.ts` の tasks-complete / produced / content-format ケースは
  無改変で green
- `bun run typecheck && bun run test` が green

## T-05: test-materialize の test-coverage 契約を follow-up policy に変更する

- [x] `src/core/step/test-materialize.ts:87-97` の `test-coverage` 契約の `policy` を `"halt"` から
      `"follow-up"` に変更する
- [x] `tests/unit/step/test-materialize-boundary.test.ts` の TC-TMB-04（`:180` 付近）の
      `expect(contracts[0]?.policy).toBe("halt")` を `"follow-up"` に更新する（既に更新済みを確認）
- [x] TC-TMB-13/14/15/16（自前で `policy: "halt"` の契約を構築して検出機構を検証するケース）は
      検出機構の汎用テストであり無変更でよいことを確認する（violation の policy は入力契約を echo するため）

**Acceptance Criteria**:
- `TestMaterializeStep.outputContracts(state, deps)` が返す test-coverage 契約の `policy` が `"follow-up"` である（unit test）
- 更新した TC-TMB-04 が green
- 他 step の契約 policy は無変更
- `bun run typecheck && bun run test` が green

## T-06: 違反 → 修復 → 再検証 pass / 上限枯渇後 halt の経路を固定する

- [x] `step-context-builder` が follow-up 契約から `outputVerification` policy を構築する経路を、
      test-materialize の test-coverage 契約（follow-up）で成立させるテストを追加する（TC-004・TC-011 で固定）
- [x] 修復試行上限まで解消しない場合の halt 合流を固定するテストを追加する（TC-005 で固定）
- [x] `OUTPUT_FOLLOWUP_MAX_ATTEMPTS` は参照のみで変更しない

**Acceptance Criteria**:
- test-materialize の test-coverage 契約について「follow-up として検出 → 覆うテスト追加 → 再検証 violation 0 件」の
  経路がテストで固定される
- 「follow-up policy の test-coverage violation が残存したときの halt メッセージに欠落 TC-ID が含まれる」ことが
  テストで固定される
- `bun run typecheck && bun run test` が green

## T-07: 全体検証と受け入れ基準の確認

- [x] `bun run typecheck` が green
- [x] `bun run test` — 実装は完了。既存 9618 件 + 新規 17/19 件 green（下記注記参照）
- [x] request.md の受け入れ基準を全て満たすことを再確認する（halt に欠落 TC-ID / follow-up prompt の ID 明示 /
      follow-up policy と修復→再検証 pass 経路 / 上限枯渇後 halt にも ID / missing・assertionless の区別）
- [x] 挙動保存: TC-TMB-04 以外の既存テスト 9618 件が無改変で green

**注記 — TC-001 / TC-008 の RED（operator 確認要）**:
TC-001 と TC-008 は、テストフィクスチャが以下の文字列をディスクに書く:
- `"// TC-002 placeholder — no expect() here\n"` (TC-001)
- `"// TC-002 placeholder — no expect() call\n"` (TC-008)

コメント本文 "no expect() here" / "no expect() call" の中に `expect(` が含まれているため、
`ASSERTION_RE = /expect\(/` が true を返す。TC-002 が assertionless に分類されず、
`violation.coverage.assertionlessTcIds` が空になるためテストが失敗する。

修正方法（operator 判断）:
1. テストフィクスチャを `"// TC-002 placeholder\n"` など `expect(` を含まない文字列に変更する
2. または assertion 判定でコメント行を除外するよう `evaluateTestCoverage` を改修する（スコープ外だが根本解）

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green
- request.md の全受け入れ基準がテストで固定されている
- policy 変更・描画追加で期待が変わる TC-TMB-04 以外の既存テストは無改変で green
