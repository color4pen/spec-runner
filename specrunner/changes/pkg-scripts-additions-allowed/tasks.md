# Tasks: package.json scripts integrity — 新規 script 追加を tampering としない

<!-- 実装は implementer が行う。各タスクは file:line 参照付き。design.md の D1-D3 に対応する。 -->

## T-01: `checkPackageJsonScriptsIntegrity` を per-key 判定へ書き換える

対応: design D1 / D3 / spec Requirement「Scripts integrity is evaluated per baseline key」「Tampering diff surfaces only the offending keys」

- [x] `src/core/verification/runner.ts` の `checkPackageJsonScriptsIntegrity`（177-245 行）の比較部（228-240 行の `normalize` 定義と `if (normalize(...) !== normalize(...))` ブロック）を per-key 判定へ置き換える
- [x] `baselineScripts` の各 `[key, baselineValue]` を走査し、以下のいずれかに該当する key を「offending（tampering）」として集める:
  - **削除**: `Object.prototype.hasOwnProperty.call(currentScripts, key) === false`
  - **値変更**: `currentScripts[key] !== baselineValue`
  （`currentScripts` にのみ存在する key = 新規追加は集めない）
- [x] 削除検出は `in` 演算子ではなく `Object.prototype.hasOwnProperty.call(currentScripts, key)` を使い、prototype プロパティ名（`toString` / `constructor` 等）の script key で誤検出しないようにする（design Risk 参照）
- [x] offending key が 1 つ以上あるとき `{ tampered: true, diff }` を返す。0 個なら `{ tampered: false }` を返す
- [x] `diff` は offending key のみを対象に構築する。既存の `Baseline scripts:` / `Current scripts:` ラベル構造を維持し、baseline 側は offending key の baseline 値、current 側は offending key の current 値を示す（削除 key は current 側に現れない）。追加のみの key は diff に含めない
- [x] 以下の既存挙動は**変更しない**: `git show` 非 0 の skip（207-210 行）、worktree に package.json 不在の skip（214-218 行）、`baselineScripts`/`currentScripts` の `?? {}` フォールバック（225-226 行）、JSON パース失敗時の skip（241-244 行）、呼び出し側 `runVerificationPhases`（355-382 行）の early-exit / `PACKAGE_JSON_SCRIPTS_TAMPERED` 生成
- [x] 関数先頭の JSDoc（172-176 行）を per-key 判定の説明に更新する（「scripts differ」→「baseline key の値変更・削除のみを tampering とし、追加は許容する」旨）

**Acceptance Criteria**:
- baseline に無い key の追加のみでは `{ tampered: false }` を返す（baseline scripts 空・非空の両方）
- baseline key の値変更 or 削除では `{ tampered: true, diff }` を返す
- diff は offending key のみを示し、追加 key を tampering として列挙しない
- git show 非 0 / package.json 不在 / JSON パース失敗の skip は不変
- `PACKAGE_JSON_SCRIPTS_TAMPERED` の errorCode / early-exit パスは不変

## T-02: 単体テストで per-key 判定を固定する

対応: 受け入れ基準 1-4 / spec 全 Requirement

- [x] `tests/unit/core/verification/runner-integrity.test.ts` に新規テストケースを追加する（既存 TC-INT-01〜10 は無変更で維持し、新規追加のみとする）。既存ヘルパ `writeCurrentPackageJson` / `makeBaselinePackageJson` / `makeMockChild`（同ファイル 61-94 行）を再利用する
- [x] **追加 × 非空 baseline → not tampered**: baseline `{ build: "tsc" }`、current `{ build: "tsc", test: "vitest" }`（既存値そのまま + 新規 `test` 追加）で、`errorCode` が `PACKAGE_JSON_SCRIPTS_TAMPERED` でなく、`phases` に `package-json-integrity` が**含まれない**（phase loop に到達した）ことを固定する
- [x] **追加 × 空 baseline → not tampered**: baseline に scripts フィールド無し（`git show` は `{ name: "test-pkg" }` を返す）、current `{ build: "tsc", test: "vitest" }` で、tampering にならず phase loop に到達することを固定する
- [x] **既存 key 値変更 → tampered**: baseline `{ build: "tsc", test: "vitest" }`、current `{ build: "tsc", test: "exit 0" }` で、`verdict` が `failed`、`errorCode` が `PACKAGE_JSON_SCRIPTS_TAMPERED`、`phases` が `[package-json-integrity]`（phase 未実行）であることを固定する
- [x] **既存 key 削除 → tampered**: baseline `{ build: "tsc", test: "vitest" }`、current `{ build: "tsc" }`（`test` 削除）で、`errorCode` が `PACKAGE_JSON_SCRIPTS_TAMPERED` であることを固定する
- [x] **追加 + 変更の混在 → tampered、diff は変更 key のみ**: baseline `{ test: "vitest" }`、current `{ test: "exit 0", lint: "eslint" }` で、tampering になり、`verificationResultPath` の result ファイル内容が変更 key（`test`）を示し、追加 key（`lint`）を tampering として列挙しないことを固定する
- [x] 各テストで `spawn` mock は `git show` に baseline package.json を、それ以外（`bun run` 等）には exit 0 を返すよう、既存 TC-INT-02 と同じ形（131-139 行）にする

**Acceptance Criteria**:
- 上記 5 ケースがテストで固定される（追加は空・非空 baseline 両方、値変更、削除、混在 diff）
- 既存 TC-INT-01〜10 は無変更で green（特に TC-INT-05 の key 順序差、TC-INT-08 の diff ラベル検査）
- 追加テストは新規追加のみ（既存テストの編集なし）

## T-03: 検証（typecheck && test）

対応: 受け入れ基準 5

- [x] `bun run typecheck` が green
- [x] `bun run test` が green（既存テスト無変更 pass + 新規テスト pass）

**Acceptance Criteria**:
- `typecheck && test` がすべて成功する
