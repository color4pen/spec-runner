# Test Cases: verification-tc-coverage

## Summary

verification step に `test-coverage` phase を追加し、implementer が生成した test code が test-cases.md の `must` TC を網羅しているかを機械的に検証する変更に対するテストシナリオ。
型定義・phase ロジック・runVerification 統合・prompt 規律・delta spec の各側面と、PR #331 同型ケースの回帰防止を網羅する。

---

## TC-001: PHASE_NAMES が6要素で test-coverage が末尾に追加されている

- **Category**: Type System
- **Priority**: must
- **Source**: T-01, req#2

**GIVEN** `src/core/verification/phases.ts` の `PHASE_NAMES` 定義  
**WHEN** `PHASE_NAMES` の内容を確認する  
**THEN** `["build", "typecheck", "test", "lint", "security", "test-coverage"]` の6要素であり、`"test-coverage"` が末尾に位置する

---

## TC-002: PHASE_SCRIPTS に test-coverage エントリが含まれない

- **Category**: Type System
- **Priority**: must
- **Source**: T-01, design.md ADR-3

**GIVEN** `src/core/verification/phases.ts` の `PHASE_SCRIPTS` 定義  
**WHEN** `PHASE_SCRIPTS` のキーを確認する  
**THEN** `"test-coverage"` キーが存在せず、5エントリのままである

---

## TC-003: ScriptPhaseName 型が test-coverage を除外している

- **Category**: Type System
- **Priority**: must
- **Source**: T-01

**GIVEN** `phases.ts` の `ScriptPhaseName` 型定義  
**WHEN** 型定義を確認する  
**THEN** `ScriptPhaseName = Exclude<PhaseName, "test-coverage">` として export されており、`PHASE_SCRIPTS` が `Record<ScriptPhaseName, string>` 型でコンパイルが通る

---

## TC-004: test-cases.md 不在のとき status "skipped" を返す

- **Category**: test-coverage Phase Logic
- **Priority**: must
- **Source**: T-02, req#2 (test-cases.md 不在時の振る舞い)

**GIVEN** change folder に `test-cases.md` が存在しない  
**WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ  
**THEN** `status: "skipped"` が返る

---

## TC-005: test-cases.md 不在時 stdout に skip 理由が含まれる

- **Category**: test-coverage Phase Logic
- **Priority**: must
- **Source**: T-02, T-03 (skipped stdout 出力規律)

**GIVEN** change folder に `test-cases.md` が存在しない  
**WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ  
**THEN** `stdout` に `"test-cases.md not found at specrunner/changes/<slug>/test-cases.md"` のような skip 理由が含まれる

---

## TC-006: must TC 全件が tests/ に存在するとき status "passed" を返す

- **Category**: test-coverage Phase Logic
- **Priority**: must
- **Source**: T-02, req#2

**GIVEN** `test-cases.md` に3件の must TC（TC-001, TC-002, TC-003）が定義されている  
**AND** `tests/` 配下のファイルに TC-001, TC-002, TC-003 がすべて出現する  
**WHEN** `runTestCoveragePhase` を呼ぶ  
**THEN** `status: "passed"`、`missingTcIds: []`

---

## TC-007: must TC に欠損があるとき status "failed" + missingTcIds を返す

- **Category**: test-coverage Phase Logic
- **Priority**: must
- **Source**: T-02, req#2

**GIVEN** `test-cases.md` に3件の must TC（TC-001, TC-002, TC-003）が定義されている  
**AND** `tests/` 配下に TC-001 のみ出現し TC-002, TC-003 は出現しない  
**WHEN** `runTestCoveragePhase` を呼ぶ  
**THEN** `status: "failed"`、`missingTcIds` に `["TC-002", "TC-003"]` が含まれる

---

## TC-008: must TC が0件（should/could のみ）のとき status "passed" を返す

- **Category**: test-coverage Phase Logic
- **Priority**: must
- **Source**: T-02

**GIVEN** `test-cases.md` に should / could の TC のみが定義されている（must が0件）  
**WHEN** `runTestCoveragePhase` を呼ぶ  
**THEN** `status: "passed"`（検証対象なし）

---

## TC-009: フラット型 TC-NNN を must TC として検出できる

- **Category**: test-coverage Phase Logic
- **Priority**: must
- **Source**: T-02, design.md ADR-1

**GIVEN** `test-cases.md` に `## TC-010` ヘッダを持つ must TC が定義されている  
**AND** `tests/` 配下のファイルに `TC-010` の文字列が出現する  
**WHEN** `runTestCoveragePhase` を呼ぶ  
**THEN** TC-010 が `foundTcIds` に含まれ、`missingTcIds` には含まれない

---

## TC-010: 階層型 TC-NN-NN を must TC として検出できる

- **Category**: test-coverage Phase Logic
- **Priority**: must
- **Source**: T-02, design.md ADR-1（既存の階層型 test との互換）

**GIVEN** `test-cases.md` に `## TC-10-01` ヘッダを持つ must TC が定義されている  
**AND** `tests/` 配下のファイルに `TC-10-01` の文字列が出現する  
**WHEN** `runTestCoveragePhase` を呼ぶ  
**THEN** TC-10-01 が `foundTcIds` に含まれ、`missingTcIds` には含まれない

---

## TC-011: stdout に human-readable な網羅率サマリを生成する

- **Category**: test-coverage Phase Logic
- **Priority**: must
- **Source**: T-02, design.md §2

**GIVEN** `test-cases.md` に5件の must TC があり、tests/ に2件のみ TC ID が出現する  
**WHEN** `runTestCoveragePhase` を呼ぶ  
**THEN** `stdout` に `"test-coverage: 2/5 must TCs covered"` が含まれる  
**AND** `"Missing: "` に続いて欠損 TC ID のリストが含まれる

---

## TC-012: Priority: must の bullet prefix あり・なし両パターンを検出する

- **Category**: test-coverage Phase Logic
- **Priority**: should
- **Source**: T-02（`- **Priority**: must` および `**Priority**: must` の両許容）

**GIVEN** ある TC section の後続行に `- **Priority**: must` が含まれる  
**AND** 別の TC section の後続行に `**Priority**: must`（bullet なし）が含まれる  
**WHEN** `runTestCoveragePhase` が must TC を抽出する  
**THEN** どちらの TC も must TC として抽出される

---

## TC-013: should/could TC は test-coverage 検証の対象外である

- **Category**: test-coverage Phase Logic
- **Priority**: must
- **Source**: T-02, req#2

**GIVEN** `test-cases.md` に must TC 2件・should TC 3件・could TC 1件が定義されている  
**AND** `tests/` 配下に must TC のみ出現し、should/could TC は出現しない  
**WHEN** `runTestCoveragePhase` を呼ぶ  
**THEN** `status: "passed"`（should/could の未実装は verdict に影響しない）

---

## TC-014: h2/h3 両形式の TC section header を抽出できる

- **Category**: test-coverage Phase Logic
- **Priority**: should
- **Source**: T-02（`## TC-NNN` と `### TC-NNN` 両対応）

**GIVEN** `test-cases.md` に `## TC-020` (h2) と `### TC-021` (h3) の must TC が定義されている  
**WHEN** `runTestCoveragePhase` が TC ID を抽出する  
**THEN** TC-020 と TC-021 がともに must TC として抽出される

---

## TC-015: tests/ 配下の複数ファイルにまたがって TC ID を検出できる

- **Category**: test-coverage Phase Logic
- **Priority**: should
- **Source**: T-02

**GIVEN** `test-cases.md` に3件の must TC がある  
**AND** TC-001 は `tests/unit/a.test.ts` に出現し、TC-002 は `tests/unit/b.test.ts` に出現し、TC-003 は `tests/integration/c.test.ts` に出現する  
**WHEN** `runTestCoveragePhase` を呼ぶ  
**THEN** `status: "passed"`（ファイルをまたいでも全件 found と判定される）

---

## TC-016: 全5 phase passed + test-coverage passed → verdict "passed"・6 phase 記録

- **Category**: runVerification Integration
- **Priority**: must
- **Source**: T-09, req#2

**GIVEN** build/typecheck/test/lint/security の全5 phase が passed  
**AND** test-coverage phase も passed  
**WHEN** `runVerification` を実行する  
**THEN** `verdict: "passed"`  
**AND** `verification-result.md` の Phase Results テーブルに6行が記録される

---

## TC-017: 全5 phase passed + test-coverage failed → verdict "failed"

- **Category**: runVerification Integration
- **Priority**: must
- **Source**: T-09, req#2 受け入れ基準

**GIVEN** build/typecheck/test/lint/security の全5 phase が passed  
**AND** test-coverage phase が failed（must TC に欠損あり）  
**WHEN** `runVerification` を実行する  
**THEN** `verdict: "failed"`

---

## TC-018: test phase failed → test-coverage は fail-fast でスキップされる

- **Category**: runVerification Integration
- **Priority**: must
- **Source**: T-09, design.md §6（fail-fast 順序）

**GIVEN** build/typecheck が passed だが test phase が failed  
**WHEN** `runVerification` を実行する  
**THEN** test-coverage phase は `status: "skipped"` として記録される（実行されない）

---

## TC-019: test-cases.md 不在 → test-coverage skipped・verdict は他 phase 次第

- **Category**: runVerification Integration
- **Priority**: must
- **Source**: T-09, design.md §7

**GIVEN** 全5 phase が passed  
**AND** change folder に `test-cases.md` が存在しない  
**WHEN** `runVerification` を実行する  
**THEN** test-coverage phase は `status: "skipped"`  
**AND** `verdict: "passed"`（skipped は failed に算入されない）

---

## TC-020: test-coverage skipped + stdout 非空 → verification-result.md に stdout を出力する

- **Category**: runVerification Integration
- **Priority**: must
- **Source**: T-03（skipped stdout 出力規律）

**GIVEN** test-cases.md が不在で test-coverage phase が skipped  
**AND** `runTestCoveragePhase` が stdout に `"test-cases.md not found at ..."` を返す  
**WHEN** `writeVerificationResult` が verification-result.md を生成する  
**THEN** `## Phase: test-coverage` セクションに `"test-cases.md not found at ..."` が出力される  
**AND** hardcoded 文言 `"_(skipped — script not found in package.json)_"` は出力されない

---

## TC-021: verification-result.md に test-coverage phase の結果が記録される

- **Category**: runVerification Integration
- **Priority**: must
- **Source**: T-03, req#2 受け入れ基準（verification-result.md に未実装 TC リスト記録）

**GIVEN** test-coverage phase が failed（must TC 3件欠損）  
**WHEN** `writeVerificationResult` を呼ぶ  
**THEN** Phase Results テーブルに `test-coverage | failed` の行が含まれる  
**AND** `## Phase: test-coverage` セクションに missing TC ID リストを含む stdout が出力される

---

## TC-022: implementer prompt に TC ID 記載規律が含まれる

- **Category**: Prompt Rules
- **Priority**: must
- **Source**: T-04, req#1 受け入れ基準

**GIVEN** `src/prompts/implementer-system.ts` の `IMPLEMENTER_SYSTEM_PROMPT`  
**WHEN** プロンプト文字列を検査する  
**THEN** test 関数名または直前の comment に TC ID を記載する規律が含まれる  
**AND** `TC-070` または同形式の例示が含まれる  
**AND** 後続の verification step が grep で TC ID を検証する旨が明記されている

---

## TC-023: test-case-gen prompt に TC ID の downstream 参照規律が含まれる

- **Category**: Prompt Rules
- **Priority**: must
- **Source**: T-05, req#1 受け入れ基準

**GIVEN** `src/prompts/test-case-gen-system.ts` の `TEST_CASE_GEN_SYSTEM_PROMPT`  
**WHEN** プロンプト文字列を検査する  
**THEN** TC ID が implementer / verification step で grep 参照される旨の規律が含まれる  
**AND** TC ID が一意かつ安定的に grep 可能であることの要件が明記されている

---

## TC-024: build-fixer prompt に test-coverage 失敗時の対処規律が含まれる

- **Category**: Prompt Rules
- **Priority**: must
- **Source**: T-06, req#2 受け入れ基準

**GIVEN** `src/prompts/build-fixer-system.ts` の `BUILD_FIXER_SYSTEM_PROMPT`  
**WHEN** プロンプト文字列を検査する  
**THEN** Phase: test-coverage が failed の場合に verification-result.md から missing TC ID を確認する指示が含まれる  
**AND** test-cases.md から GIVEN/WHEN/THEN を読んで test を追加する指示が含まれる  
**AND** test 関数名または comment に TC ID を記載する規律が含まれる

---

## TC-025: verification-runner delta spec に test-coverage phase の Requirement が含まれる

- **Category**: Delta Spec
- **Priority**: must
- **Source**: T-07

**GIVEN** `specrunner/changes/verification-tc-coverage/specs/verification-runner/spec.md`  
**WHEN** ファイルの内容を確認する  
**THEN** 6 phase（build/typecheck/test/lint/security/test-coverage）の fail-fast 実行順序の Requirement が含まれる  
**AND** test-coverage phase が test-cases.md の must TC ID を tests/ から grep 検証する Requirement が含まれる  
**AND** test-cases.md 不在時に skipped で記録される Requirement が含まれる

---

## TC-026: 各 capability の delta spec が作成されている

- **Category**: Delta Spec
- **Priority**: must
- **Source**: T-07

**GIVEN** 実装後の `specrunner/changes/verification-tc-coverage/specs/` ディレクトリ  
**WHEN** ファイル一覧を確認する  
**THEN** 以下の4ファイルが存在する:
- `test-case-generator/spec.md`（TC ID grep 可能性の Requirement）
- `implementer-session/spec.md`（TC ID 記載規律の Requirement）
- `build-fixer-session/spec.md`（test-coverage 失敗対処の Requirement）
- `verification-runner/spec.md`（test-coverage phase の Requirement）

---

## TC-027: PR #331 同型ケース — 大量 TC 生成 → 部分実装 → test-coverage で catch

- **Category**: Regression
- **Priority**: must
- **Source**: T-10, req 背景（PR #331 の再発防止）

**GIVEN** `test-cases.md` に5件の must TC（TC-001〜TC-005）が定義されている  
**AND** `tests/` 配下に TC-001, TC-002 の TC ID のみ記載されており、TC-003〜TC-005 は記載されていない  
**WHEN** `runTestCoveragePhase` を実行する  
**THEN** `status: "failed"`  
**AND** `missingTcIds` に TC-003, TC-004, TC-005 が含まれる  
**AND** `stdout` に `"test-coverage: 2/5 must TCs covered"` が含まれる

---

## TC-028: bun run typecheck が green

- **Category**: Build
- **Priority**: must
- **Source**: req 受け入れ基準

**GIVEN** 実装が完了した状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーがゼロで終了する

---

## TC-029: bun run test が green

- **Category**: Build
- **Priority**: must
- **Source**: req 受け入れ基準

**GIVEN** 実装が完了した状態  
**WHEN** `bun run test` を実行する  
**THEN** 新規追加した test-coverage phase のユニットテストを含む全テストが通過する

---

## TC-030: ADR に TC 網羅性検証の責務配置と completionVerdict 判断が記録されている

- **Category**: Documentation
- **Priority**: must
- **Source**: req 受け入れ基準（ADR 記録）

**GIVEN** 実装後の change folder または ADR ファイル  
**WHEN** ADR の内容を確認する  
**THEN** 「TC 網羅性検証の責務配置（verification phase 化）」が記録されている  
**AND** 「implementer completionVerdict の判断（案 A vs 案 B）」と採用理由（案 B）が記録されている  
**AND** 「test-coverage phase の実行方式（CLI 内部処理 vs script spawn）」が記録されている  
**AND** 「TC ID 形式の統一方針（フラット型正規化 + 両形式許容 grep）」が記録されている
