# Tasks: verification-tc-coverage

## T-01: PhaseName 型に test-coverage を追加

- [x] `src/core/verification/phases.ts`: `PhaseName` 型に `"test-coverage"` を追加
- [x] `PHASE_NAMES` 配列の末尾に `"test-coverage"` を追加
- [x] `PHASE_SCRIPTS` には `test-coverage` を追加しない（内部処理 phase のため）
- [x] `ScriptPhaseName` 型を新規定義: `export type ScriptPhaseName = Exclude<PhaseName, "test-coverage">`
- [x] `PHASE_SCRIPTS` の型を `Record<ScriptPhaseName, string>` に変更（`Record<PhaseName, string>` のままだと `"test-coverage"` キーが不足してコンパイルエラーになるため）

**受け入れ基準**: `PhaseName` が `"build" | "typecheck" | "test" | "lint" | "security" | "test-coverage"` となる。`PHASE_NAMES` が 6 要素。`PHASE_SCRIPTS` は 5 エントリのまま。`ScriptPhaseName` 型が export されており `PHASE_SCRIPTS: Record<ScriptPhaseName, string>` の型でコンパイルが通る。

## T-02: test-coverage phase の処理ロジックを実装

- [x] `src/core/verification/test-coverage.ts` を新規作成
- [x] `TestCoverageResult` interface を定義: `{ status, missingTcIds, totalMustTcs, foundTcIds, stdout }`
- [x] `runTestCoveragePhase(slug: string, cwd: string): Promise<TestCoverageResult>` を export
- [x] 処理:
  1. `specrunner/changes/<slug>/test-cases.md` を読み込む。存在しなければ `status: "skipped"` を返す
  2. Priority: must の TC ID を section-scan アプローチで抽出する:
     - `^##[#]?\s+(TC-\d+(?:-\d+)*)` で TC section header を全列挙（h2 / h3 両対応）
     - 各 section の後続行群を次の `##` が出現するまで走査し、`\*\*Priority\*\*:\s*must` の行の存在で判定
     - bullet prefix（`- **Priority**: must`）と非 bullet（`**Priority**: must`）の両方を許容
  3. must TC が 0 件なら `status: "passed"` を返す（must TC なし = 検証対象なし）
  4. `tests/` 配下の `.ts` ファイルを再帰取得し、各ファイル内容を読み込む
  5. 各 must TC ID が少なくとも 1 ファイルに文字列として出現するか確認
  6. 全 must TC ID が見つかれば `status: "passed"`、1 つでも未発見なら `status: "failed"`
  7. `stdout` に human-readable summary を生成: `"test-coverage: N/M must TCs covered\nMissing: TC-XXX, TC-YYY"`
- [x] `node:fs/promises` と `node:path` のみ使用（`bun:*` / `Bun.*` 禁止）

**受け入れ基準**: test-cases.md 不在 → skipped。must TC 全網羅 → passed。must TC 部分欠損 → failed + missingTcIds にリスト。

## T-03: runVerification に test-coverage phase の分岐を追加

- [x] `src/core/verification/runner.ts` の `runVerification` ループ内で、`PHASE_SCRIPTS` にキーが存在しない phase を内部処理 phase として分岐
- [x] `phaseName === "test-coverage"` の場合、`runTestCoveragePhase(slug, cwd)` を呼ぶ
- [x] 結果を `PhaseResult` に変換: `{ phase: "test-coverage", status, stdout: result.stdout, stderr: "", exitCode: status === "passed" ? 0 : status === "failed" ? 1 : null, durationMs }`
- [x] fail-fast ロジックは既存と同じ（前の phase が failed なら test-coverage も skipped）
- [x] `writeVerificationResult` の skipped 出力ロジックを変更: test-coverage phase が skipped かつ `p.stdout` が非空の場合は、hardcoded 文言 `"_(skipped — script not found in package.json)_"` の代わりに `p.stdout` を出力する（skip 理由を human-readable に表示するため）

**受け入れ基準**: build/typecheck/test/lint/security が全 passed の状態で test-coverage が実行される。test-coverage failed で verification verdict = "failed"。verification-result.md の Phase Results テーブルと `## Phase: test-coverage` セクションに結果が出力される。test-coverage が skipped の場合、verification-result.md に `"test-cases.md not found at ..."` のような skip 理由が表示される。

## T-04: implementer prompt に TC ID 記載規律を追加

- [x] `src/prompts/implementer-system.ts` の実装手順セクションに追記:
  - test 関数名または直前の comment に対応 TC ID を必ず記載すること
  - 例: `it("TC-070: Agent 定義ハッシュ — 同一定義は同一ハッシュ", ...)`
  - 「後続の verification step が TC ID の存在を grep で検証する」旨を明記

**受け入れ基準**: `IMPLEMENTER_SYSTEM_PROMPT` に TC ID 記載規律の指示が含まれる。

## T-05: test-case-gen prompt に downstream 参照規律を補足

- [x] `src/prompts/test-case-gen-system.ts` の Constraints セクション付近に追記:
  - 「TC ID は implementer が test 関数名 / comment に記載し、verification step が grep で検証する。TC ID は一意かつ安定的に grep 可能であること」

**受け入れ基準**: `TEST_CASE_GEN_SYSTEM_PROMPT` に TC ID の downstream 利用規律が含まれる。

## T-06: build-fixer prompt に test-coverage 失敗時の対処を追加

- [x] `src/prompts/build-fixer-system.ts` の修正手順セクションに追記:
  - 「Phase: test-coverage が failed の場合、verification-result.md に記載された missing TC ID を確認する」
  - 「change folder の test-cases.md から該当 TC の GIVEN/WHEN/THEN を読み取り、対応する test を `tests/` 配下に追加する」
  - 「test 関数名または comment に TC ID を必ず記載する（例: `it("TC-003: ...", ...)`）」

**受け入れ基準**: `BUILD_FIXER_SYSTEM_PROMPT` に test-coverage 失敗時の修正指示が含まれる。

## T-07: delta spec を作成

- [x] `specrunner/changes/verification-tc-coverage/specs/verification-runner/spec.md` に delta spec を作成:
  - Requirement: verification は 6 phase を fail-fast 順次実行する (build / typecheck / test / lint / security / test-coverage)
  - Requirement: test-coverage phase は test-cases.md の must TC ID を tests/ 配下から grep で検証する
  - Requirement: test-coverage phase は test-cases.md 不在時に skipped で記録する
- [x] `specrunner/changes/verification-tc-coverage/specs/test-case-generator/spec.md` に delta spec を作成:
  - Requirement: TC ID は downstream (implementer / verification) で grep 参照されるため一意かつ安定的に grep 可能であること
- [x] `specrunner/changes/verification-tc-coverage/specs/implementer-session/spec.md` に delta spec を作成:
  - Requirement: implementer は test 関数名または comment に TC ID を記載する規律を持つ
- [x] `specrunner/changes/verification-tc-coverage/specs/build-fixer-session/spec.md` に delta spec を作成:
  - Requirement: build-fixer は test-coverage phase 失敗時に test-cases.md から missing TC の test を追加する

**受け入れ基準**: 4 capability の delta spec が作成され、各 Requirement に Scenario が含まれる。

## T-08: unit test — test-coverage phase

- [x] `tests/unit/core/verification/test-coverage.test.ts` を新規作成
- [x] テストケース:
  - test-cases.md 不在 → `status: "skipped"`
  - must TC 全網羅 → `status: "passed"`
  - must TC 部分欠損 → `status: "failed"` + `missingTcIds` に欠損 TC リスト
  - must TC 0 件（should/could のみ）→ `status: "passed"`
  - TC-NNN フラット型と TC-NN-NN 階層型の両方を検出可能
  - test-cases.md にフラット型 TC ID を含む must TC → tests/ で grep → found

**受け入れ基準**: `bun run test` で全テスト green。

## T-09: unit test — runVerification に test-coverage phase が統合されている

- [x] 既存の verification runner テストを拡張、または新規テストファイルを作成
- [x] テストケース:
  - 全 5 phase passed + test-coverage passed → verdict "passed"、phase 6 件
  - 全 5 phase passed + test-coverage failed → verdict "failed"
  - test phase failed → test-coverage は skipped（fail-fast）
  - test-cases.md 不在 → test-coverage は skipped、verdict は他 phase 次第

**受け入れ基準**: `bun run test` で全テスト green。

## T-10: integration test — PR #331 同型ケース再現

- [x] テストケース:
  - test-cases.md に 5 件の must TC を定義
  - tests/ 配下に 2 件のみ TC ID を記載
  - `runTestCoveragePhase` を実行 → `status: "failed"` + `missingTcIds` に 3 件
  - stdout に "test-coverage: 2/5 must TCs covered" のような summary を含む

**受け入れ基準**: PR #331 で発生した「大量 TC 生成 → 部分実装」パターンが test-coverage phase で catch される。
