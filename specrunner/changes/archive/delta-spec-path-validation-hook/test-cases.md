# Test Cases: delta-spec-path-validation-hook

Source: request.md / design.md / tasks.md (T-11〜T-15)

---

## Category: validator — path violation detection

### TC-V-01
- **Priority**: must
- **Source**: T-11 / requirement §1
- **Category**: validator

**GIVEN** changePath 配下に `specs/my-capability/spec.md` が存在し、`## ADDED Requirements` セクションと 1 つ以上の Requirement block を含む  
**WHEN** `validateDeltaSpecPaths()` を呼ぶ  
**THEN** `{ ok: true }` を返す

---

### TC-V-02
- **Priority**: must
- **Source**: T-11 / requirement §1 (legacy-flat-dir)
- **Category**: validator

**GIVEN** changePath 配下に `delta-spec/my-capability.md` のみ存在する（正規 path なし）  
**WHEN** `validateDeltaSpecPaths()` を呼ぶ  
**THEN** `{ ok: false, violations: [{ path: ".../delta-spec/my-capability.md", reason: "legacy-flat-dir" }] }` を返す

---

### TC-V-03
- **Priority**: must
- **Source**: T-11 / requirement §1 (legacy-flat-file — delta-spec.md)
- **Category**: validator

**GIVEN** changePath 配下に `delta-spec.md` のみ存在する（正規 path なし）  
**WHEN** `validateDeltaSpecPaths()` を呼ぶ  
**THEN** `{ ok: false, violations: [{ path: ".../delta-spec.md", reason: "legacy-flat-file" }] }` を返す

---

### TC-V-04
- **Priority**: must
- **Source**: T-11 / requirement §1 (legacy-flat-file — *.delta.md)
- **Category**: validator

**GIVEN** changePath 配下に `specs/my-capability.delta.md` のみ存在する（正規 path なし）  
**WHEN** `validateDeltaSpecPaths()` を呼ぶ  
**THEN** `{ ok: false, violations: [{ path: ".../specs/my-capability.delta.md", reason: "legacy-flat-file" }] }` を返す

---

### TC-V-05
- **Priority**: must
- **Source**: T-11 / requirement §1 (non-canonical-path)
- **Category**: validator

**GIVEN** changePath 配下に `specs/my-capability.md` が直置きされている（サブディレクトリなし）  
**WHEN** `validateDeltaSpecPaths()` を呼ぶ  
**THEN** `{ ok: false, violations: [{ path: ".../specs/my-capability.md", reason: "non-canonical-path" }] }` を返す

---

### TC-V-06
- **Priority**: must
- **Source**: T-11 / requirement §1 (missing-requirements-section)
- **Category**: validator

**GIVEN** changePath 配下に `specs/my-capability/spec.md` が存在し、セクションヘッダーが `## ADDED`（`Requirements` suffix なし）のみ  
**WHEN** `validateDeltaSpecPaths()` を呼ぶ  
**THEN** `{ ok: false, violations: [{ path: ".../specs/my-capability/spec.md", reason: "missing-requirements-section" }] }` を返す

---

### TC-V-07
- **Priority**: must
- **Source**: T-11 / requirement §1 (empty-section)
- **Category**: validator

**GIVEN** changePath 配下に `specs/my-capability/spec.md` が存在し、`## ADDED Requirements` セクションはあるが Requirement block が 0 個  
**WHEN** `validateDeltaSpecPaths()` を呼ぶ  
**THEN** `{ ok: false, violations: [{ path: ".../specs/my-capability/spec.md", reason: "empty-section" }] }` を返す

---

### TC-V-08
- **Priority**: must
- **Source**: T-11 / requirement §1 (mixed — 旧形式 + 正規が共存)
- **Category**: validator

**GIVEN** changePath 配下に `specs/my-capability/spec.md`（正規・合格） と `delta-spec/my-capability.md`（旧形式）の両方が存在する  
**WHEN** `validateDeltaSpecPaths()` を呼ぶ  
**THEN** `{ ok: false }` を返し、violations に `delta-spec/my-capability.md` の `legacy-flat-dir` が含まれる（正規ファイルは違反に含まれない）

---

### TC-V-09
- **Priority**: must
- **Source**: T-11 / requirement §1 (multiple capabilities — all ok)
- **Category**: validator

**GIVEN** changePath 配下に `specs/cap-a/spec.md` と `specs/cap-b/spec.md` が存在し、双方とも正規セクション + 非空 Requirement block を持つ  
**WHEN** `validateDeltaSpecPaths()` を呼ぶ  
**THEN** `{ ok: true }` を返す

---

### TC-V-10
- **Priority**: must
- **Source**: T-11 / requirement §1 (multiple violations)
- **Category**: validator

**GIVEN** changePath 配下に `delta-spec.md` と `delta-spec/cap.md` の両方が存在する  
**WHEN** `validateDeltaSpecPaths()` を呼ぶ  
**THEN** violations に `legacy-flat-file` と `legacy-flat-dir` の 2 件が含まれる

---

### TC-V-11
- **Priority**: should
- **Source**: T-11 / requirement §1 (MODIFIED / REMOVED section も正規と認める)
- **Category**: validator

**GIVEN** changePath 配下に `specs/my-capability/spec.md` が存在し、`## MODIFIED Requirements` セクションと 1 つ以上の Requirement block を含む  
**WHEN** `validateDeltaSpecPaths()` を呼ぶ  
**THEN** `{ ok: true }` を返す

---

### TC-V-12
- **Priority**: should
- **Source**: T-11 / requirement §1 (delta spec が 0 ファイル)
- **Category**: validator

**GIVEN** changePath 配下に `.md` ファイルが一切存在しない  
**WHEN** `validateDeltaSpecPaths()` を呼ぶ  
**THEN** `{ ok: true }` を返す（delta spec が無い状態は違反ではない）

---

### TC-V-13
- **Priority**: should
- **Source**: T-11 / DI 設計 (D5)
- **Category**: validator

**GIVEN** `readdir` / `readFile` に fs mock を注入し、特定のファイル構造を返すよう設定する  
**WHEN** `validateDeltaSpecPaths(changePath, { readdir: mockReaddir, readFile: mockReadFile })` を呼ぶ  
**THEN** 実 fs に依存せず期待した violations 結果を返す（DI 経由で fs が差し替え可能であることを確認）

---

## Category: step-validation — delta-spec-validation CliStep

### TC-S1-01
- **Priority**: must
- **Source**: T-12 / requirement §2
- **Category**: step-validation

**GIVEN** validator が `{ ok: true }` を返すようモックされている  
**WHEN** `DeltaSpecValidationStep.run()` を実行する  
**THEN** step の verdict が `"approved"` になる

---

### TC-S1-02
- **Priority**: must
- **Source**: T-12 / requirement §2
- **Category**: step-validation

**GIVEN** validator が `{ ok: false, violations: [{ path: "...", reason: "legacy-flat-dir" }] }` を返すようモックされている  
**WHEN** `DeltaSpecValidationStep.run()` を実行する  
**THEN** step の verdict が `"needs-fix"` になり、`delta-spec-validation-result.md` が change フォルダ内に生成される

---

### TC-S1-03
- **Priority**: must
- **Source**: T-12 / requirement §2 (result file format)
- **Category**: step-validation

**GIVEN** validator が複数の violations を返すようモックされている  
**WHEN** `DeltaSpecValidationStep.run()` を実行して result file を生成する  
**THEN** result file は violations の一覧を含む markdown table 形式（path / reason / suggested fix 列）で出力される

---

### TC-S1-04
- **Priority**: must
- **Source**: T-12 / requirement §2 (result file が delta-spec-fixer の入力として parse 可能)
- **Category**: step-validation

**GIVEN** `delta-spec-validation-result.md` が violations 付きで生成される  
**WHEN** `DeltaSpecFixerStep.buildMessage()` がそのファイルパスを読み込む  
**THEN** result file の内容が user prompt に注入され、parse エラーが発生しない

---

### TC-S1-05
- **Priority**: should
- **Source**: T-03 / CliStep interface
- **Category**: step-validation

**GIVEN** `DeltaSpecValidationStep` を StepExecutor 経由で実行する  
**WHEN** executor が `run()` → `parseResult()` の順に呼ぶ  
**THEN** CliStep interface の要件を満たし、agent runner を呼び出さない

---

## Category: step-fixer — delta-spec-fixer AgentStep

### TC-S2-01
- **Priority**: must
- **Source**: T-13 / requirement §3 (system prompt 流用)
- **Category**: step-fixer

**GIVEN** `DeltaSpecFixerStep` の agent definition を参照する  
**WHEN** `agent.systemPrompt` を確認する  
**THEN** `SPEC_FIXER_SYSTEM_PROMPT` と同一の文字列を使用している

---

### TC-S2-02
- **Priority**: must
- **Source**: T-13 / requirement §3 (validation feedback 注入)
- **Category**: step-fixer

**GIVEN** `delta-spec-validation-result.md` に `legacy-flat-dir` 違反が記録されている  
**WHEN** `DeltaSpecFixerStep.buildMessage()` を呼ぶ  
**THEN** 返す user prompt に validation result file のパスおよび違反内容の説明が含まれる

---

### TC-S2-03
- **Priority**: must
- **Source**: T-13 / requirement §3 (completionVerdict)
- **Category**: step-fixer

**GIVEN** `DeltaSpecFixerStep` の設定を参照する  
**WHEN** `completionVerdict` プロパティを確認する  
**THEN** 値が `"approved"` である

---

### TC-S2-04
- **Priority**: should
- **Source**: T-04 (requiresCommit / maxTurns)
- **Category**: step-fixer

**GIVEN** `DeltaSpecFixerStep` のメタデータを参照する  
**WHEN** `requiresCommit` と `maxTurns` を確認する  
**THEN** `requiresCommit: true`、`maxTurns: 25` になっている

---

### TC-S2-05
- **Priority**: should
- **Source**: T-04 (isFixerContinuation — 継続 prompt)
- **Category**: step-fixer

**GIVEN** `DeltaSpecFixerStep.buildMessage()` が `isFixerContinuation: true` で呼ばれる  
**WHEN** 生成された user prompt を確認する  
**THEN** 初回より短縮されたプロンプトが返される（冗長な context を繰り返さない）

---

## Category: pipeline — integration

### TC-P-01
- **Priority**: must
- **Source**: T-14 / requirement §5 (design → validation approved → spec-review)
- **Category**: pipeline

**GIVEN** pipeline が `design` step → 完了 (success) し、`delta-spec-validation` が `approved` を返す状態  
**WHEN** pipeline を実行する  
**THEN** 遷移順が `design → delta-spec-validation → spec-review` になる

---

### TC-P-02
- **Priority**: must
- **Source**: T-14 / requirement §5 (design → validation needs-fix → fixer → validation approved → spec-review)
- **Category**: pipeline

**GIVEN** `design` 完了後に `delta-spec-validation` が初回 `needs-fix`、`delta-spec-fixer` 実行後の `delta-spec-validation` 再実行で `approved` を返す状態  
**WHEN** pipeline を実行する  
**THEN** 遷移順が `design → delta-spec-validation → delta-spec-fixer → delta-spec-validation → spec-review` になる

---

### TC-P-03
- **Priority**: must
- **Source**: T-14 / requirement §5 (spec-fixer 経由でも delta-spec-validation を通る)
- **Category**: pipeline

**GIVEN** `spec-review` が `needs-fix` を返し `spec-fixer` が実行完了した後  
**WHEN** pipeline が次の遷移を選択する  
**THEN** `spec-fixer → delta-spec-validation` の遷移が行われる（`spec-fixer → spec-review` の直接遷移は存在しない）

---

### TC-P-04
- **Priority**: must
- **Source**: T-14 / requirement §5 (delta-spec-validation exhaust → escalation)
- **Category**: pipeline

**GIVEN** `delta-spec-validation` が `maxIterations` 回連続で `needs-fix` を返す  
**WHEN** pipeline が loop 終端を検出する  
**THEN** `DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED` エラーコードで escalation し、`pipeline.error` にエラーメッセージが設定される

---

### TC-P-05
- **Priority**: must
- **Source**: T-14 / requirement §5 (counter 独立 — spec-review counter を消費しない)
- **Category**: pipeline

**GIVEN** `delta-spec-validation` が 2 回 `needs-fix` を繰り返した後 `approved` となり `spec-review` ループに入る  
**WHEN** `spec-review` の `loopIters` を確認する  
**THEN** `spec-review` のカウンターは 0 から始まっており、`delta-spec-validation` の反復回数が加算されていない

---

### TC-P-06
- **Priority**: must
- **Source**: T-14 / requirement §5 (観測例 managed-reset-status-stale-guard 相当)
- **Category**: pipeline

**GIVEN** `design` step が `specrunner/changes/<slug>/delta-spec/managed-cli-commands.md`（旧形式）を書き、セクションが `## ADDED`（suffix なし）のファイルを生成した状態  
**WHEN** pipeline が `delta-spec-validation` step を実行する  
**THEN** `legacy-flat-dir` + `missing-requirements-section` の 2 違反が検出され、`delta-spec-fixer` へ遷移する。その後 `delta-spec-fixer` が正規 path に修正し `delta-spec-validation` が `approved` を返し、pipeline が `spec-review` まで完走する

---

### TC-P-07
- **Priority**: should
- **Source**: T-08 / loopFixerPairs (loopFixerPairs エントリが参照される)
- **Category**: pipeline

**GIVEN** Pipeline が `loopFixerPairs: { "delta-spec-validation": "delta-spec-fixer" }` で初期化されている  
**WHEN** `delta-spec-validation` の loop が exhaustion に達する  
**THEN** fixer step name が `"delta-spec-fixer"` として解決される（`loopFixerPairs` が正しく参照される）

---

### TC-P-08
- **Priority**: should
- **Source**: T-06 / STANDARD_TRANSITIONS (DELTA_SPEC_FIXER → escalate on: "error")
- **Category**: pipeline

**GIVEN** `delta-spec-fixer` が `"error"` verdict を返す（agent が crash / timeout）  
**WHEN** pipeline が遷移を選択する  
**THEN** `escalate` に遷移し pipeline が停止する

---

## Category: prompt — 共通定数統一

### TC-PR-01
- **Priority**: must
- **Source**: T-10 / requirement §9 (design-system が共通定数を import)
- **Category**: prompt

**GIVEN** `src/prompts/design-system.ts` のソースを参照する  
**WHEN** delta spec format rules のセクションを確認する  
**THEN** `DELTA_SPEC_FORMAT_RULES` を `delta-spec-format.ts` から import して使用しており、同内容のリテラル文字列を直接定義していない

---

### TC-PR-02
- **Priority**: must
- **Source**: T-10 / requirement §9 (spec-fixer-system が共通定数を import)
- **Category**: prompt

**GIVEN** `src/prompts/spec-fixer-system.ts` のソースを参照する  
**WHEN** delta spec format rules のセクションを確認する  
**THEN** `DELTA_SPEC_FORMAT_RULES` を `delta-spec-format.ts` から import して使用しており、同内容のリテラル文字列を直接定義していない

---

### TC-PR-03
- **Priority**: must
- **Source**: T-10 / requirement §9 (BANNED_DELTA_SPEC_PATHS が明示列挙されている)
- **Category**: prompt

**GIVEN** `src/prompts/delta-spec-format.ts` を参照する  
**WHEN** `BANNED_DELTA_SPEC_PATHS` の内容を確認する  
**THEN** `delta-spec.md` / `delta-spec/<capability>.md` / `<name>.delta.md` の 3 variant が明示的に禁止パターンとして列挙されている

---

### TC-PR-04
- **Priority**: should
- **Source**: T-10 / requirement §9 (prompt 出力の内容が変更前と同等)
- **Category**: prompt

**GIVEN** `design-system.ts` の最終的な prompt 文字列を共通定数 import 前後でスナップショット比較する  
**WHEN** 置換後の prompt 出力を確認する  
**THEN** delta spec format rules セクションの実効文言に差分がない

---

## Category: constants — step-names / LOOP_ERROR_CODES

### TC-C-01
- **Priority**: must
- **Source**: T-01 / requirement §4
- **Category**: constants

**GIVEN** `src/core/step/step-names.ts` を参照する  
**WHEN** `STEP_NAMES.DELTA_SPEC_VALIDATION` と `STEP_NAMES.DELTA_SPEC_FIXER` を参照する  
**THEN** それぞれ `"delta-spec-validation"` と `"delta-spec-fixer"` の文字列値を持ち、型安全に参照可能

---

### TC-C-02
- **Priority**: must
- **Source**: T-07 / requirement §7
- **Category**: constants

**GIVEN** `src/core/pipeline/types.ts` の `LOOP_ERROR_CODES` を参照する  
**WHEN** `LOOP_ERROR_CODES["delta-spec-validation"]` を確認する  
**THEN** `code: "DELTA_SPEC_VALIDATION_RETRIES_EXHAUSTED"` と `message` 関数（引数: 反復数 n）が定義されている

---

## Category: regression — 既存機能

### TC-R-01
- **Priority**: must
- **Source**: T-15 / requirement §10 (spec-merge fail-fast 維持)
- **Category**: regression

**GIVEN** `src/core/finish/spec-merge.ts:474` の semantic empty delta check が存在する  
**WHEN** コードを参照する  
**THEN** `delta-spec-validation` 追加後もこの check が削除されず維持されている

---

### TC-R-02
- **Priority**: must
- **Source**: T-15 (既存 spec-merge / executor / pipeline test の regression)
- **Category**: regression

**GIVEN** 本 change の実装が完了した状態  
**WHEN** `bun run test` を実行する  
**THEN** 既存の spec-merge / executor / pipeline integration テストが全て pass する（regression なし）

---

### TC-R-03
- **Priority**: must
- **Source**: T-15 (typecheck)
- **Category**: regression

**GIVEN** 本 change の実装が完了した状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で pass する

---

### TC-R-04
- **Priority**: should
- **Source**: T-06 / STANDARD_TRANSITIONS (既存の design → spec-review 直接遷移が存在しないこと)
- **Category**: regression

**GIVEN** `STANDARD_TRANSITIONS` の定義を参照する  
**WHEN** `design` step の `on: "success"` 遷移先を確認する  
**THEN** 遷移先が `"spec-review"` ではなく `"delta-spec-validation"` になっており、直接遷移エントリが存在しない

---

### TC-R-05
- **Priority**: should
- **Source**: T-06 / STANDARD_TRANSITIONS (既存の spec-fixer → spec-review 直接遷移が存在しないこと)
- **Category**: regression

**GIVEN** `STANDARD_TRANSITIONS` の定義を参照する  
**WHEN** `spec-fixer` step の `on: "approved"` 遷移先を確認する  
**THEN** 遷移先が `"spec-review"` ではなく `"delta-spec-validation"` になっており、直接遷移エントリが存在しない

---

## Category: paths-helper

### TC-H-01
- **Priority**: must
- **Source**: T-05
- **Category**: paths-helper

**GIVEN** `src/util/paths.ts` に `deltaSpecValidationResultPath(slug)` が追加されている  
**WHEN** `deltaSpecValidationResultPath("my-change")` を呼ぶ  
**THEN** `"specrunner/changes/my-change/delta-spec-validation-result.md"` を返す
