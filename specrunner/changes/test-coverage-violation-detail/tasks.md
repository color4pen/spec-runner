# Tasks: test-coverage 契約違反で欠落 TC-ID を agent と operator に伝え、同一セッションで修復可能にする

## T-01: `OutputViolation` に coverage 構造化フィールドを追加する

- [ ] `src/core/port/output-contract.ts` の `OutputViolation` に任意フィールド
      `coverage?: { missingTcIds: string[]; assertionlessTcIds: string[] }` を追加する
- [ ] `coverage` の doc コメントを追記する（`test-coverage` kind でのみ設定、missing = テストファイル未出現の
      must TC-ID、assertionless = 出現するが assertion 無しの must TC-ID、他 kind では undefined）
- [ ] `OutputViolation.detail` の既存 doc（`test-coverage` は missing/assertionless の union）は維持し、
      `coverage` がカテゴリ別の構造化ソースである旨を追記する

**Acceptance Criteria**:
- `OutputViolation.coverage` が `{ missingTcIds: string[]; assertionlessTcIds: string[] } | undefined` 型を取る
- 既存の produced / tasks-complete / content-format の型・doc・`detail` の意味は無変更で維持される
- `bun run typecheck` が green

## T-02: local runtime の test-coverage 検出で coverage を格納する

- [ ] `src/core/runtime/local.ts` の `validateStepOutputs` の `test-coverage` 分岐（`:1330-1333`）で、
      失敗時の violation に `coverage: { missingTcIds: result.missingTcIds, assertionlessTcIds: result.assertionlessTcIds }`
      を追加する
- [ ] `detail` は従来どおり `[...result.missingTcIds, ...result.assertionlessTcIds]` の union を維持する
- [ ] coverage 判定ロジック（`evaluateTestCoverage` / `extractMustTcIds` / `tcIdBoundaryRe` / assertion 判定）は
      変更しない

**Acceptance Criteria**:
- missing のみ / assertionless のみ / 両方混在 の各ケースで、violation の `coverage.missingTcIds` と
  `coverage.assertionlessTcIds` が評価器の結果と一致する（unit test）
- `detail` が従来どおり両集合の union を含む（既存 TC-TMB-13 が無改変で green）
- managed runtime（`src/core/runtime/managed.ts`）の test-coverage 分岐は無変更（best-effort skip のまま）
- `bun run typecheck && bun run test` が green

## T-03: halt メッセージに test-coverage の欠落 TC-ID を描画する

- [ ] `src/core/step/step-halt.ts` の `makeOutputGateHalt` の `violationPaths` map に、
      `tasks-complete` / `content-format` 分岐と generic fall-through の間に `v.kind === "test-coverage"` 分岐を追加する
- [ ] module-local な純ヘルパで `v.coverage` からカテゴリ別文字列を組む:
      `missingTcIds` 非空なら `missing TCs: <ids>`、`assertionlessTcIds` 非空なら `assertionless TCs: <ids>` を
      `; ` 連結し、`${v.path} (<parts>)` として描画する。両方空 / `coverage` undefined のときは `see file` に fall back する
- [ ] tasks-complete / content-format / produced の既存描画は無変更

**Acceptance Criteria**:
- missing = {TC-064, TC-065}、assertionless = {TC-003} の test-coverage violation を含む halt の
  `error.message`（または `error.hint`）に TC-064・TC-065・TC-003 が含まれ、missing と assertionless が
  区別された文言で描画される（unit test）
- `coverage` 未設定の test-coverage violation で `see file` fall back になる（unit test）
- 既存 tasks-complete / content-format / produced の halt メッセージは無変更（既存
  `tests/unit/step/content-format-detection.test.ts` T-07 が無改変で green）
- `bun run typecheck && bun run test` が green

## T-04: follow-up prompt に test-coverage 節を追加する

- [ ] `src/core/step/output-verify.ts` の `buildOutputFollowUpPrompt` に `test-coverage` violation の節を追加する
- [ ] 全 test-coverage violation の `coverage.missingTcIds` / `coverage.assertionlessTcIds` を集約し、
      missing 非空なら「各 TC のテストを書き TC-ID をテストファイルに記載する」指示と ID の箇条書き、
      assertionless 非空なら「各 TC を覆うテストに assertion を追加する」指示と ID の箇条書きを、
      別々のサブ節として出力する
- [ ] 両カテゴリとも空の場合は `(see <path> for uncovered must TCs)` の fall back 行を出す
- [ ] 既存の共通末尾（commit and push）を踏襲する。既存 tasks-complete / produced / content-format 節は無変更

**Acceptance Criteria**:
- missing = {TC-064}、assertionless = {TC-003} の test-coverage violation から生成した prompt が、
  TC-064 を「テストを書く」指示の対象、TC-003 を「assertion を追加する」指示の対象として ID 明示で列挙する（unit test）
- missing と assertionless の修復指示が prompt 上で区別される（unit test）
- 既存 `tests/unit/step/output-verify.test.ts` の tasks-complete / produced / content-format ケースは
  無改変で green
- `bun run typecheck && bun run test` が green

## T-05: test-materialize の test-coverage 契約を follow-up policy に変更する

- [ ] `src/core/step/test-materialize.ts:87-97` の `test-coverage` 契約の `policy` を `"halt"` から
      `"follow-up"` に変更する
- [ ] `tests/unit/step/test-materialize-boundary.test.ts` の TC-TMB-04（`:180` 付近）の
      `expect(contracts[0]?.policy).toBe("halt")` を `"follow-up"` に更新する
- [ ] TC-TMB-13/14/15/16（自前で `policy: "halt"` の契約を構築して検出機構を検証するケース）は
      検出機構の汎用テストであり無変更でよいことを確認する（violation の policy は入力契約を echo するため）

**Acceptance Criteria**:
- `TestMaterializeStep.outputContracts(state, deps)` が返す test-coverage 契約の `policy` が `"follow-up"` である（unit test）
- 更新した TC-TMB-04 が green
- 他 step の契約 policy は無変更
- `bun run typecheck && bun run test` が green

## T-06: 違反 → 修復 → 再検証 pass / 上限枯渇後 halt の経路を固定する

- [ ] `step-context-builder` が follow-up 契約から `outputVerification` policy を構築する経路を、
      test-materialize の test-coverage 契約（follow-up）で成立させるテストを追加する。以下いずれかで固定する:
      (a) `step-context-builder` の follow-up 契約フィルタと同型に `outputVerification` を構築し、
      `detect()` が missing TC を持つ follow-up violation を返す → 当該テストが覆うテストファイルを worktree に
      書く → 再度 `detect()` が violation 0 件を返す（再検証 pass）ことを実 `validateStepOutputs` で固定する、
      または (b) `buildStepContext` を通して `ctx.policy.outputVerification` が定義され、その
      `buildPrompt(violations)` が欠落 TC-ID を含むことを固定する
- [ ] 修復試行上限まで解消しない場合の halt 合流を固定するテストを追加する:
      残存する follow-up policy の test-coverage violation（coverage に missing TC-ID を保持）を
      `makeOutputGateHalt` に渡し、halt メッセージに当該 TC-ID が含まれることを固定する
      （executor 最終ゲートが `allViolations` = halt + followUp を `makeOutputGateHalt` に渡す既存経路の再利用）
- [ ] `OUTPUT_FOLLOWUP_MAX_ATTEMPTS` は参照のみで変更しない

**Acceptance Criteria**:
- test-materialize の test-coverage 契約について「follow-up として検出 → 覆うテスト追加 → 再検証 violation 0 件」の
  経路がテストで固定される
- 「follow-up policy の test-coverage violation が残存したときの halt メッセージに欠落 TC-ID が含まれる」ことが
  テストで固定される
- `bun run typecheck && bun run test` が green

## T-07: 全体検証と受け入れ基準の確認

- [ ] `bun run typecheck` が green
- [ ] `bun run test` が green
- [ ] request.md の受け入れ基準を全て満たすことを再確認する（halt に欠落 TC-ID / follow-up prompt の ID 明示 /
      follow-up policy と修復→再検証 pass 経路 / 上限枯渇後 halt にも ID / missing・assertionless の区別）
- [ ] 挙動保存: base OID commit がテストを含む保証・通常経路の verdict 導出・pipeline 遷移が不変であること
      （移設起因の期待更新 = TC-TMB-04 以外の既存テストが無改変で green）を確認する

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green
- request.md の全受け入れ基準がテストで固定されている
- policy 変更・描画追加で期待が変わる TC-TMB-04 以外の既存テストは無改変で green
