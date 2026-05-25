# Test Cases: delta-validation-post-code-review

## Category: Rule — no-authority-spec-direct-edit

### TC-RULE-01
- **Priority**: must
- **Source**: Task 13 TC-1 / AC: `delta-spec-validation の rules に no-authority-spec-direct-edit が登録されている`
- **GIVEN** `changedFiles` に `specrunner/specs/foo/spec.md` が含まれる
- **WHEN** `no-authority-spec-direct-edit` rule の `check()` を実行する
- **THEN** path=`specrunner/specs/foo/spec.md`、reason=`"authority-spec-direct-edit"` の violation が 1 件返る

### TC-RULE-02
- **Priority**: must
- **Source**: Task 13 TC-2
- **GIVEN** `changedFiles` に `specrunner/changes/slug/specs/foo/spec.md` のみが含まれる (delta path)
- **WHEN** `no-authority-spec-direct-edit` rule の `check()` を実行する
- **THEN** violation は 0 件 (delta path は除外)

### TC-RULE-03
- **Priority**: must
- **Source**: Task 13 TC-3
- **GIVEN** `changedFiles` に `src/core/foo.ts` のみが含まれる
- **WHEN** `no-authority-spec-direct-edit` rule の `check()` を実行する
- **THEN** violation は 0 件

### TC-RULE-04
- **Priority**: must
- **Source**: Task 13 TC-4 / AC: 後方互換性
- **GIVEN** `changedFiles` が `undefined`
- **WHEN** `no-authority-spec-direct-edit` rule の `check()` を実行する
- **THEN** violation は 0 件 (rule をスキップ、エラーは発生しない)

### TC-RULE-05
- **Priority**: must
- **Source**: Task 13 TC-5
- **GIVEN** `changedFiles` に `specrunner/specs/bar/spec.md`、`specrunner/changes/slug/specs/bar/spec.md`、`src/util.ts` が混在する
- **WHEN** `no-authority-spec-direct-edit` rule の `check()` を実行する
- **THEN** `specrunner/specs/bar/spec.md` のみ violation として返る (delta path と src は除外)

### TC-RULE-06
- **Priority**: should
- **Source**: Task 13 TC-6
- **GIVEN** `changedFiles` が空配列 `[]`
- **WHEN** `no-authority-spec-direct-edit` rule の `check()` を実行する
- **THEN** violation は 0 件

### TC-RULE-07
- **Priority**: should
- **Source**: Task 5 — suggested フィールド
- **GIVEN** `changedFiles` に `specrunner/specs/foo/spec.md` が含まれる
- **WHEN** `no-authority-spec-direct-edit` rule の `check()` を実行する
- **THEN** 返る violation に `suggested` フィールドが含まれ、`"git checkout"` と `"specrunner/changes/<slug>/specs/"` への移動方法が記述されている

### TC-RULE-08
- **Priority**: must
- **Source**: Task 6 / AC: `delta-spec-validation の rules に no-authority-spec-direct-edit が登録されている`
- **GIVEN** `createDeltaSpecRegistry()` を呼び出す
- **WHEN** registry に登録されているルール名一覧を取得する
- **THEN** `"no-authority-spec-direct-edit"` が含まれている

### TC-RULE-09
- **Priority**: must
- **Source**: Task 2 — DeltaSpecViolationReason 拡張
- **GIVEN** `DeltaSpecViolationReason` 型の定義
- **WHEN** 型チェックを実行する (`bun run typecheck`)
- **THEN** `"authority-spec-direct-edit"` リテラルが union に含まれ、型エラーが発生しない

---

## Category: Injection — changedFiles in DeltaSpecValidationStep

### TC-INJ-01
- **Priority**: must
- **Source**: Task 7 / AC: `design 後の delta-spec-validation で新 rule も実行される`
- **GIVEN** `DeltaSpecValidationStep.run()` が呼ばれ、`git diff <baseBranch>..HEAD --name-only` が成功する
- **WHEN** `validateDeltaSpecPaths()` が呼び出される
- **THEN** `changedFiles` に git diff の結果が渡される (spawn の stdout が配列として注入される)

### TC-INJ-02
- **Priority**: must
- **Source**: Task 7 — graceful degradation
- **GIVEN** `git diff` コマンドが失敗する (spawn がエラーを返す)
- **WHEN** `DeltaSpecValidationStep.run()` が実行される
- **THEN** `changedFiles = undefined` として `validateDeltaSpecPaths()` が呼ばれ、pipeline はエラーにならない

### TC-INJ-03
- **Priority**: should
- **Source**: Task 7 — baseBranch 取得
- **GIVEN** `deps.request.baseBranch` が `"main"` に設定されている
- **WHEN** `DeltaSpecValidationStep.run()` が git diff を実行する
- **THEN** spawn に渡されるコマンドが `git diff main..HEAD --name-only` を含む

---

## Category: Transition — context-aware `when` predicate

### TC-TRANS-01
- **Priority**: must
- **Source**: Task 14 TC-1 / AC: `pipeline の既存挙動に regression なし`
- **GIVEN** `delta-spec-validation` が `approved` を返し、`state.steps["code-review"]` に attempt が存在しない (1st phase)
- **WHEN** pipeline の transition lookup を実行する
- **THEN** 次の step は `spec-review` (既存の fallback transition が選択される)

### TC-TRANS-02
- **Priority**: must
- **Source**: Task 14 TC-2 / AC: `code-review approved 後に delta-spec-validation が再実行される`
- **GIVEN** `delta-spec-validation` が `approved` を返し、`state.steps["code-review"]` に 1 件以上の attempt が存在する (2nd phase)
- **WHEN** pipeline の transition lookup を実行する
- **THEN** 次の step は `adr-gen` (conditional transition が選択される)

### TC-TRANS-03
- **Priority**: must
- **Source**: Task 14 TC-3 / AC: `code-review approved 後に delta-spec-validation が再実行される`
- **GIVEN** `code-review` step が `approved` verdict を返す
- **WHEN** pipeline の transition lookup を実行する
- **THEN** 次の step は `delta-spec-validation` (新 transition が選択される)

### TC-TRANS-04
- **Priority**: must
- **Source**: Task 14 TC-4 — regression
- **GIVEN** `when` predicate を持たない既存の transition (`design approved → delta-spec-validation` 等) が存在する
- **WHEN** pipeline の transition lookup を実行する
- **THEN** `when` なし transition は常にマッチし、既存挙動に変化がない

### TC-TRANS-05
- **Priority**: must
- **Source**: Task 14 TC-5 / AC: `code-fixer loop で baseline 直接編集が発生した場合、delta-spec-fixer が起動する`
- **GIVEN** `delta-spec-validation` が `needs-fix` を返す (phase を問わず)
- **WHEN** pipeline の transition lookup を実行する
- **THEN** 次の step は `delta-spec-fixer` (既存 loop transition が 2nd phase でも機能する)

### TC-TRANS-06
- **Priority**: should
- **Source**: Task 9 — 配列順序
- **GIVEN** `delta-spec-validation approved` + code-review 実行済みの state で、STANDARD_TRANSITIONS 配列に conditional と fallback が両方存在する
- **WHEN** `transitions.find()` が実行される
- **THEN** conditional (`→ adr-gen`) が fallback (`→ spec-review`) より先にマッチする (配列順序の保証)

### TC-TRANS-07
- **Priority**: should
- **Source**: Task 9 — code-review attempt 数が 2 以上の場合
- **GIVEN** `state.steps["code-review"]` に 2 件の attempt が存在する
- **WHEN** `delta-spec-validation approved` の transition lookup を実行する
- **THEN** 次の step は `adr-gen` (attempt 1 件以上であれば 2nd phase 扱い)

---

## Category: CommitPush — halt → warning

### TC-CP-01
- **Priority**: must
- **Source**: Task 15 TC-AUTH-01 / AC: `commit-push.ts で baseline 違反検出時に halt せず、warning が stderr に出力される`
- **GIVEN** staged files に `specrunner/specs/foo/spec.md` が含まれる
- **WHEN** `commit-push.ts` の staged-changes path を実行する
- **THEN** `throw` されず pipeline は継続し、stderr に `"Warning: authority spec edit detected in staged files"` を含むメッセージが出力される

### TC-CP-02
- **Priority**: must
- **Source**: Task 15 TC-AUTH-02
- **GIVEN** staged files に delta spec (`specrunner/changes/slug/specs/foo/spec.md`) のみが含まれる
- **WHEN** `commit-push.ts` の staged-changes path を実行する
- **THEN** warning は出力されず、commit が正常に続行される

### TC-CP-03
- **Priority**: must
- **Source**: Task 15 TC-AUTH-03
- **GIVEN** staged files に `specrunner/specs/foo/spec.md` と `src/core/bar.ts` が混在する
- **WHEN** `commit-push.ts` の staged-changes path を実行する
- **THEN** warning が stderr に出力され、commit は続行される (throw しない)

### TC-CP-04
- **Priority**: must
- **Source**: Task 15 TC-AUTH-04 / AC: HEAD-diff path の warning
- **GIVEN** agent が self-commit した結果、HEAD diff に `specrunner/specs/foo/spec.md` が含まれる
- **WHEN** `commit-push.ts` の HEAD-diff path を実行する
- **THEN** `throw` されず、stderr に `"Warning: authority spec edit detected in agent commits"` を含むメッセージが出力され、push が続行される

### TC-CP-05
- **Priority**: must
- **Source**: Task 15 TC-AUTH-05
- **GIVEN** 通常の step (baseline 違反なし) が実行される
- **WHEN** `commit-push.ts` を実行する
- **THEN** warning は出力されず、既存の挙動と変化なし

### TC-CP-06
- **Priority**: must
- **Source**: Task 15 TC-AUTH-06
- **GIVEN** agent self-commit の HEAD diff に delta spec のみが含まれる
- **WHEN** `commit-push.ts` の HEAD-diff path を実行する
- **THEN** warning は出力されず、push が正常に続行される

### TC-CP-07
- **Priority**: should
- **Source**: Task 11 — `findAuthoritySpecViolations()` の保持
- **GIVEN** `commit-push.ts` がリファクタリングされた後
- **WHEN** `findAuthoritySpecViolations()` を直接呼び出す
- **THEN** 関数が削除されず、`specrunner/specs/` prefix のファイルを正しく検出する

---

## Category: Integration — end-to-end pipeline flow

### TC-INT-01
- **Priority**: must
- **Source**: AC: `修正後の delta-spec-validation が approved を返し、adr-gen → pr-create に進める`
- **GIVEN** code-review が approved を返し、その後 delta-spec-validation (2nd) が approved を返す
- **WHEN** pipeline が end-to-end で実行される
- **THEN** `adr-gen → pr-create` のフローに到達する

### TC-INT-02
- **Priority**: must
- **Source**: AC: `code-fixer loop で baseline 直接編集が発生した場合、delta-spec-validation が needs-fix を返し、delta-spec-fixer が起動する`
- **GIVEN** code-review が approved → delta-spec-validation (2nd) が needs-fix (authority-spec-direct-edit violation)
- **WHEN** pipeline が遷移を解決する
- **THEN** `delta-spec-fixer` が起動し、fixer loop が開始される

### TC-INT-03
- **Priority**: must
- **Source**: AC: `delta-spec-fixer が baseline path への変更を rollback し、対応する delta path に書き直す`
- **GIVEN** `delta-spec-fixer` が `authority-spec-direct-edit` を含む violations を受け取る
- **WHEN** `delta-spec-fixer` の prompt に従って agent が修正を実行する
- **THEN** agent が `git checkout <baseBranch> -- <violated-path>` を実行し、変更を `specrunner/changes/<slug>/specs/<capability>/spec.md` に書き直す指示が prompt に含まれている

### TC-INT-04
- **Priority**: must
- **Source**: AC: `pipeline の既存挙動 (design → spec-review → ... → code-review approved まで) に regression なし`
- **GIVEN** 既存の pipeline flow が実行される (design → delta-spec-validation → spec-review → ... → code-review)
- **WHEN** code-review が approved を返すまでの各 transition が評価される
- **THEN** 各 step の遷移先が変更前と同じ (regression なし)

### TC-INT-05
- **Priority**: must
- **Source**: AC: `bun run typecheck && bun run test が green`
- **GIVEN** 全 Task が完了している
- **WHEN** `bun run typecheck && bun run test` を実行する
- **THEN** 両コマンドが 0 exit で green になる

### TC-INT-06
- **Priority**: should
- **Source**: D4 — shared loop iteration budget
- **GIVEN** 1st phase の delta-spec-validation/fixer loop で iteration を消費した後、2nd phase でも violation が発生する
- **WHEN** 2nd phase の fixer loop が動作する
- **THEN** `delta-spec-fixer` が起動し、iteration budget 内であれば loop が継続する

### TC-INT-07
- **Priority**: should
- **Source**: AC: `design 後の delta-spec-validation で新 rule も実行される (regression なし、かつ新 rule の検出が機能)`
- **GIVEN** design 直後 (1st phase) の delta-spec-validation が実行され、`changedFiles` に authority spec edit が含まれる
- **WHEN** validation が実行される
- **THEN** `no-authority-spec-direct-edit` rule が violations を返し、`needs-fix` verdict が出る

---

## Category: Prompt — delta-spec-fixer prompt extension

### TC-PROMPT-01
- **Priority**: must
- **Source**: Task 10 / AC: `delta-spec-fixer が baseline path への変更を rollback し、対応する delta path に書き直す`
- **GIVEN** `buildDeltaSpecFixerInitialMessage()` を呼び出す
- **WHEN** 生成された prompt を確認する
- **THEN** `"authority-spec-direct-edit"` violation への対処として `git checkout <baseBranch> -- <violated-path>` と delta path への書き直しが指示文に含まれている

### TC-PROMPT-02
- **Priority**: must
- **Source**: Task 10 — continuation message
- **GIVEN** `buildDeltaSpecFixerContinuationMessage()` を呼び出す
- **WHEN** 生成された prompt を確認する
- **THEN** initial message と同様の `authority-spec-direct-edit` 対処指示が含まれている

### TC-PROMPT-03
- **Priority**: should
- **Source**: Task 10 — 既存指示の維持
- **GIVEN** `buildDeltaSpecFixerInitialMessage()` を呼び出す
- **WHEN** 生成された prompt を確認する
- **THEN** 既存の delta format 修正指示が削除されずそのまま残っている

---

## Category: Rules — rules.ts 更新

### TC-RULES-01
- **Priority**: should
- **Source**: Task 12
- **GIVEN** `src/prompts/rules.ts` が更新されている
- **WHEN** System Facts セクションを参照する
- **THEN** `"no-authority-spec-direct-edit"` rule による検出フローと `delta-spec-fixer` による自動修正、code-review 後の再実行について記述されている
