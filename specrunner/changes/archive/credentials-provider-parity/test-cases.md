# Test Cases: credentials-provider-parity

## Overview

Resolver 対称化・runtime 要件宣言化の変更に対するテストシナリオ。
Unit / Integration / Manual の 3 層で、Task 1〜14 の受け入れ基準をカバーする。

---

## Category: Unit — anthropic resolver (Task 3, 4)

### TC-ANTH-001 [must] credentials.json の apiKey を優先する
- **Source**: Task 3, Task 4, Request 要件 1
- **Priority**: must
- **GIVEN** credentials.json に `anthropic.apiKey: "cred-key"` が存在し、`SPECRUNNER_API_KEY=env-key` が env にも設定されている
- **WHEN** `resolveSpecRunnerApiKey(env)` を呼ぶ
- **THEN** `{ apiKey: "cred-key", source: "credentials" }` が返る（credentials が env より優先）

### TC-ANTH-002 [must] credentials に apiKey が無い場合 env を返す
- **Source**: Task 3, Task 4, Request 要件 1
- **Priority**: must
- **GIVEN** credentials.json に `anthropic` フィールドが無く、`SPECRUNNER_API_KEY=env-key` が設定されている
- **WHEN** `resolveSpecRunnerApiKey(env)` を呼ぶ
- **THEN** `{ apiKey: "env-key", source: "env" }` が返る

### TC-ANTH-003 [must] credentials も env も無い場合 ANTHROPIC_KEY_MISSING をスローする
- **Source**: Task 3, Task 4, Request 要件 1
- **Priority**: must
- **GIVEN** credentials.json に `anthropic.apiKey` が無く、`SPECRUNNER_API_KEY` env も未設定
- **WHEN** `resolveSpecRunnerApiKey(env)` を呼ぶ（optional 未指定）
- **THEN** `SpecRunnerError` がスローされ、`error.code === "ANTHROPIC_KEY_MISSING"` である

### TC-ANTH-004 [must] optional:true で両方無い場合 undefined を返す
- **Source**: Task 3, Task 4, Request 要件 1 (optional semantics)
- **Priority**: must
- **GIVEN** credentials.json に `anthropic.apiKey` が無く、`SPECRUNNER_API_KEY` env も未設定
- **WHEN** `resolveSpecRunnerApiKey(env, { optional: true })` を呼ぶ
- **THEN** `undefined` が返り、例外はスローされない

### TC-ANTH-005 [must] optional:true で credentials に値がある場合は返す
- **Source**: Task 3, Task 4
- **Priority**: must
- **GIVEN** credentials.json に `anthropic.apiKey: "cred-key"` がある、`SPECRUNNER_API_KEY` env 未設定
- **WHEN** `resolveSpecRunnerApiKey(env, { optional: true })` を呼ぶ
- **THEN** `{ apiKey: "cred-key", source: "credentials" }` が返る

### TC-ANTH-006 [must] optional:true で env にのみ値がある場合は返す
- **Source**: Task 3, Task 4
- **Priority**: must
- **GIVEN** credentials.json に `anthropic` フィールドが無く、`SPECRUNNER_API_KEY=env-key` が設定されている
- **WHEN** `resolveSpecRunnerApiKey(env, { optional: true })` を呼ぶ
- **THEN** `{ apiKey: "env-key", source: "env" }` が返る

---

## Category: Unit — saveSpecRunnerApiKey (Task 3, 4)

### TC-SAVE-001 [must] saveSpecRunnerApiKey が credentials.json に書き込む
- **Source**: Task 3, Task 4, Request 要件 1
- **Priority**: must
- **GIVEN** credentials.json が存在しない（または空）
- **WHEN** `saveSpecRunnerApiKey("sk-ant-test123")` を呼ぶ
- **THEN** credentials.json の `anthropic.apiKey` が `"sk-ant-test123"` になる

### TC-SAVE-002 [must] saveSpecRunnerApiKey が既存の github.token を保持する
- **Source**: Task 3, Task 4, Request 受け入れ基準
- **Priority**: must
- **GIVEN** credentials.json に `github.token: "ghp_existing"` が存在する
- **WHEN** `saveSpecRunnerApiKey("sk-ant-new")` を呼ぶ
- **THEN** credentials.json の `github.token` は `"ghp_existing"` のまま保持され、`anthropic.apiKey` に `"sk-ant-new"` が追加される

### TC-SAVE-003 [should] saveSpecRunnerApiKey が既存の anthropic.apiKey を上書きする
- **Source**: Task 3, Task 4
- **Priority**: should
- **GIVEN** credentials.json に `anthropic.apiKey: "sk-ant-old"` が存在する
- **WHEN** `saveSpecRunnerApiKey("sk-ant-new")` を呼ぶ
- **THEN** credentials.json の `anthropic.apiKey` が `"sk-ant-new"` に更新される

---

## Category: Unit — saveCredentials deep merge (Task 2)

### TC-MERGE-001 [must] github.token 保存時に anthropic フィールドを保持する
- **Source**: Task 2, Design D8
- **Priority**: must
- **GIVEN** credentials.json に `anthropic.apiKey: "sk-ant-existing"` が存在する
- **WHEN** `saveCredentials({ github: { token: "ghp_new" } })` を呼ぶ
- **THEN** credentials.json に `github.token: "ghp_new"` と `anthropic.apiKey: "sk-ant-existing"` の両方が存在する

### TC-MERGE-002 [must] anthropic.apiKey 保存時に github.token を保持する
- **Source**: Task 2, Design D8, Request 受け入れ基準
- **Priority**: must
- **GIVEN** credentials.json に `github.token: "ghp_existing"` が存在する
- **WHEN** `saveCredentials({ anthropic: { apiKey: "sk-ant-new" } })` を呼ぶ
- **THEN** credentials.json に `github.token: "ghp_existing"` と `anthropic.apiKey: "sk-ant-new"` の両方が存在する

### TC-MERGE-003 [should] 同一 provider への上書き保存で他フィールドが消えない
- **Source**: Task 2, Design D8
- **Priority**: should
- **GIVEN** credentials.json に `github.token: "ghp_old"` と `anthropic.apiKey: "sk-ant-old"` が存在する
- **WHEN** `saveCredentials({ github: { token: "ghp_new" } })` を呼ぶ
- **THEN** `github.token: "ghp_new"` に更新され、`anthropic.apiKey: "sk-ant-old"` は保持される

---

## Category: Unit — requirementsFor matrix (Task 5)

### TC-REQ-001 [must] local runtime は github.token のみ要求する
- **Source**: Task 5, Request 要件 2
- **Priority**: must
- **GIVEN** (なし)
- **WHEN** `requirementsFor("local")` を呼ぶ
- **THEN** 返り値に `{ key: "github.token", envVar: "GITHUB_TOKEN" }` が含まれ、`anthropic.apiKey` は含まれない

### TC-REQ-002 [must] managed runtime は github.token と anthropic.apiKey を要求する
- **Source**: Task 5, Request 要件 2
- **Priority**: must
- **GIVEN** (なし)
- **WHEN** `requirementsFor("managed")` を呼ぶ
- **THEN** 返り値に `{ key: "github.token", envVar: "GITHUB_TOKEN" }` と `{ key: "anthropic.apiKey", envVar: "SPECRUNNER_API_KEY" }` の両方が含まれる

### TC-REQ-003 [must] local の要求数は 1 件のみ
- **Source**: Task 5, Design D2
- **Priority**: must
- **GIVEN** (なし)
- **WHEN** `requirementsFor("local")` を呼ぶ
- **THEN** 配列の長さが 1 である

### TC-REQ-004 [must] managed の要求数は 2 件のみ
- **Source**: Task 5, Design D2
- **Priority**: must
- **GIVEN** (なし)
- **WHEN** `requirementsFor("managed")` を呼ぶ
- **THEN** 配列の長さが 2 である

---

## Category: Unit — DoctorContext pre-resolve (Task 6)

### TC-DCTX-001 [must] Anthropic key が credentials.json にある場合 ctx に注入される
- **Source**: Task 6, Request 要件 5
- **Priority**: must
- **GIVEN** credentials.json に `anthropic.apiKey: "sk-ant-cred"` が存在する
- **WHEN** `runDoctor` が DoctorContext を組み立てる
- **THEN** `ctx.resolvedSpecRunnerApiKey === "sk-ant-cred"` かつ `ctx.specRunnerApiKeySource === "credentials"` である

### TC-DCTX-002 [must] Anthropic key が env にある場合 ctx に注入される
- **Source**: Task 6, Request 要件 5
- **Priority**: must
- **GIVEN** credentials.json に `anthropic` フィールドが無く、`SPECRUNNER_API_KEY=sk-ant-env` が設定されている
- **WHEN** `runDoctor` が DoctorContext を組み立てる
- **THEN** `ctx.resolvedSpecRunnerApiKey === "sk-ant-env"` かつ `ctx.specRunnerApiKeySource === "env"` である

### TC-DCTX-003 [must] Anthropic key が無い場合 ctx は null になる
- **Source**: Task 6, Request 要件 5
- **Priority**: must
- **GIVEN** credentials.json に `anthropic.apiKey` が無く、`SPECRUNNER_API_KEY` env も未設定
- **WHEN** `runDoctor` が DoctorContext を組み立てる
- **THEN** `ctx.resolvedSpecRunnerApiKey === null` かつ `ctx.specRunnerApiKeySource === null` である

---

## Category: Unit — doctor checks ctx 移行 (Task 7, 8)

### TC-DCHK-001 [must] managed-key-present: resolvedSpecRunnerApiKey が存在すれば pass する
- **Source**: Task 7a, Task 8, Request 要件 5
- **Priority**: must
- **GIVEN** `ctx.resolvedSpecRunnerApiKey: "sk-ant-test"` かつ `ctx.specRunnerApiKeySource: "env"`
- **WHEN** `managed-key-present` check を実行する
- **THEN** check が pass し、メッセージに `source: env` が含まれる

### TC-DCHK-002 [must] managed-key-present: resolvedSpecRunnerApiKey が null なら fail する
- **Source**: Task 7a, Task 8
- **Priority**: must
- **GIVEN** `ctx.resolvedSpecRunnerApiKey: null`
- **WHEN** `managed-key-present` check を実行する
- **THEN** check が fail し、credentials.json または env var に設定する旨の hint が含まれる

### TC-DCHK-003 [must] managed-key-valid: resolvedSpecRunnerApiKey が null なら fail する（ガード不要）
- **Source**: Task 7b, Task 8
- **Priority**: must
- **GIVEN** `ctx.resolvedSpecRunnerApiKey: null`
- **WHEN** `managed-key-valid` check を実行する
- **THEN** check が fail する（先頭のガードを通らずとも正規の fail として処理される）

### TC-DCHK-004 [must] managed-key-valid: resolvedSpecRunnerApiKey で API 呼び出しをする
- **Source**: Task 7b, Task 8
- **Priority**: must
- **GIVEN** `ctx.resolvedSpecRunnerApiKey: "sk-ant-valid"` かつ fetch mock が 200 を返す
- **WHEN** `managed-key-valid` check を実行する
- **THEN** fetch の `x-api-key` header に `"sk-ant-valid"` が使われ、check が pass する

### TC-DCHK-005 [should] agent-provider-alive: resolvedSpecRunnerApiKey が null なら skip/warn する
- **Source**: Task 7c
- **Priority**: should
- **GIVEN** `ctx.resolvedSpecRunnerApiKey: null`
- **WHEN** `agent-provider-alive` check を実行する
- **THEN** check が warn または skip となり、ガードボイラープレートではなく正規の skip 判定として処理される

### TC-DCHK-006 [should] environment-provider-alive: resolvedSpecRunnerApiKey が null なら skip/warn する
- **Source**: Task 7d
- **Priority**: should
- **GIVEN** `ctx.resolvedSpecRunnerApiKey: null`
- **WHEN** `environment-provider-alive` check を実行する
- **THEN** check が warn または skip となる

---

## Category: Integration — callsite 書き換え (Task 9, 10)

### TC-CALL-001 [must] bootstrap: managed runtime で apiKey が無い場合にエラーになる
- **Source**: Task 9a, Design D4 パターン A
- **Priority**: must
- **GIVEN** `config.runtime === "managed"` かつ credentials.json に `anthropic.apiKey` が無く、`SPECRUNNER_API_KEY` 未設定
- **WHEN** bootstrap の apiKey resolve ステップが実行される
- **THEN** `ANTHROPIC_KEY_MISSING` エラーが発生し、プロセスが異常終了する

### TC-CALL-002 [must] bootstrap: local runtime で apiKey が無い場合でも続行できる
- **Source**: Task 9a, Design D4 パターン A
- **Priority**: must
- **GIVEN** `config.runtime === "local"` かつ credentials.json に `anthropic.apiKey` が無く、`SPECRUNNER_API_KEY` 未設定
- **WHEN** bootstrap の apiKey resolve ステップが実行される
- **THEN** エラーにならず、`sessionClient` が undefined のまま続行する

### TC-CALL-003 [must] managed.ts runManagedSetup: apiKey 不在で exit(1) する
- **Source**: Task 10a, Design D4 パターン B
- **Priority**: must
- **GIVEN** credentials.json に `anthropic.apiKey` が無く、`SPECRUNNER_API_KEY` 未設定
- **WHEN** `runManagedSetup` が実行される
- **THEN** エラーログが出力されプロセスが exit(1) する

### TC-CALL-004 [should] managed.ts runManagedStatus: apiKey が無くても presence false として返す
- **Source**: Task 10b, Design D4 パターン C
- **Priority**: should
- **GIVEN** credentials.json に `anthropic.apiKey` が無く、`SPECRUNNER_API_KEY` 未設定
- **WHEN** `runManagedStatus` が実行される
- **THEN** `apiKeyPresent: false` として status が表示され、エラーにならない

### TC-CALL-005 [should] managed.ts runManagedReset: apiKey が無くても続行できる
- **Source**: Task 10c, Design D4 パターン D
- **Priority**: should
- **GIVEN** credentials.json に `anthropic.apiKey` が無く、`SPECRUNNER_API_KEY` 未設定
- **WHEN** `runManagedReset` が実行される
- **THEN** apiKey が無くても例外にならずリセット処理が継続する（apiKey を必要としない範囲で）

---

## Category: Integration — preflight declarative 化 (Task 11, 12)

### TC-PRE-001 [must] managed runtime の preflight は anthropic.apiKey が無い場合失敗する
- **Source**: Task 11, Design D6
- **Priority**: must
- **GIVEN** `config.runtime === "managed"` かつ credentials.json に `anthropic.apiKey` が無く、`SPECRUNNER_API_KEY` 未設定
- **WHEN** `checkRuntimePrereqs` が実行される
- **THEN** preflight が失敗し、`ANTHROPIC_KEY_MISSING` に相当するエラーが含まれる

### TC-PRE-002 [must] managed runtime の preflight は anthropic.apiKey が env にある場合成功する
- **Source**: Task 11, Design D6
- **Priority**: must
- **GIVEN** `config.runtime === "managed"` かつ `SPECRUNNER_API_KEY=sk-ant-env` が設定されている
- **WHEN** `checkRuntimePrereqs` が実行される
- **THEN** preflight が成功し、`specRunnerApiKeySource === "env"` が結果に含まれる

### TC-PRE-003 [must] local runtime の preflight は anthropic.apiKey 不在を気にしない
- **Source**: Task 11, Design D6, Request 要件 2
- **Priority**: must
- **GIVEN** `config.runtime === "local"` かつ `SPECRUNNER_API_KEY` 未設定、github.token は有効
- **WHEN** `checkRuntimePrereqs` が実行される
- **THEN** preflight が成功する（local は anthropic.apiKey を要求しない）

### TC-PRE-004 [must] src/ 配下に SPECRUNNER_API_KEY 直読が resolver 内部以外に残っていない
- **Source**: Task 14, Request 受け入れ基準
- **Priority**: must
- **GIVEN** 実装完了後の src/ ディレクトリ
- **WHEN** `grep -rn 'process\.env\["SPECRUNNER_API_KEY"\]' src/` を実行する
- **THEN** マッチが `src/core/credentials/anthropic.ts` 内の 1 箇所のみである

### TC-PRE-005 [must] src/ 配下に runtime 直結の apiKey 判定が残っていない
- **Source**: Task 14, Request 受け入れ基準
- **Priority**: must
- **GIVEN** 実装完了後の src/ ディレクトリ
- **WHEN** `grep -rn 'config\.runtime === "managed" && process\.env\["SPECRUNNER_API_KEY"\]' src/` を実行する
- **THEN** マッチが 0 件である

---

## Category: Integration — CredentialsFile 型整合性 (Task 1, 3)

### TC-TYPE-001 [must] CredentialsFile 型に anthropic フィールドが追加されている
- **Source**: Task 1, Request 要件 3
- **Priority**: must
- **GIVEN** `src/core/credentials/types.ts` の `CredentialsFile` 型
- **WHEN** `bun run typecheck` を実行する
- **THEN** `{ github?: { token?: string }, anthropic?: { apiKey?: string } }` 形状の型が存在し、型エラーが出ない

### TC-TYPE-002 [must] ANTHROPIC_KEY_MISSING error code が errors.ts に存在する
- **Source**: Task 1, Request 要件 1
- **Priority**: must
- **GIVEN** `src/errors.ts` の `ERROR_CODES`
- **WHEN** `bun run typecheck` を実行する
- **THEN** `ERROR_CODES.ANTHROPIC_KEY_MISSING === "ANTHROPIC_KEY_MISSING"` が成立する

---

## Category: Manual Acceptance

### TC-MAN-001 [must] credentials.json の Anthropic key で managed status が動作する
- **Source**: Request 受け入れ基準（手動 acceptance）
- **Priority**: must
- **GIVEN** `specrunner login`（または手動で credentials.json に `anthropic.apiKey` を書き込み）で apiKey を保存し、`unset SPECRUNNER_API_KEY` で env を削除した状態
- **WHEN** `specrunner managed status` を実行する
- **THEN** エラーにならず managed status が表示される（credentials.json から apiKey が解決される）

### TC-MAN-002 [must] env override が動作する
- **Source**: Request 受け入れ基準（手動 acceptance）
- **Priority**: must
- **GIVEN** credentials.json を空（または `anthropic` フィールドなし）にし、`SPECRUNNER_API_KEY=<valid-key>` を env に設定した状態
- **WHEN** `specrunner managed status` を実行する
- **THEN** エラーにならず managed status が表示される（env から apiKey が解決される）

### TC-MAN-003 [must] GitHub token と Anthropic key が credentials.json に共存できる
- **Source**: Request 受け入れ基準
- **Priority**: must
- **GIVEN** `specrunner login` で GitHub token が credentials.json に保存されている状態
- **WHEN** `saveSpecRunnerApiKey("sk-ant-xxx")` を呼ぶ（または相当する操作）
- **THEN** credentials.json に `github.token` と `anthropic.apiKey` の両方が存在し、既存の GitHub token が消えていない

---

## Category: Regression

### TC-REG-001 [must] 既存の GitHub resolver が変更後も正常動作する
- **Source**: Task 2 (deep merge 変更), Task 9〜11
- **Priority**: must
- **GIVEN** credentials.json に `github.token: "ghp_valid"` が保存されている
- **WHEN** `resolveGitHubToken(env)` を呼ぶ
- **THEN** `{ token: "ghp_valid", source: "credentials" }` が返る（deep merge 変更の影響を受けない）

### TC-REG-002 [must] bun run test が全件 green
- **Source**: Task 14, Request 受け入れ基準
- **Priority**: must
- **GIVEN** 全 Task の実装完了後
- **WHEN** `bun run typecheck && bun run test` を実行する
- **THEN** 型エラー・テスト失敗が 0 件である

### TC-REG-003 [should] credential-store spec.md が新設されている
- **Source**: Task 13a, Request 受け入れ基準
- **Priority**: should
- **GIVEN** 実装完了後
- **WHEN** `specrunner/specs/credential-store/spec.md` の存在を確認する
- **THEN** ファイルが存在し、resolver 優先順位と provider-keyed 格納ルールが Requirement として記載されている
