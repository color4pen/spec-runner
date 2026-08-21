# Test Cases: 実効モデル名を SDK の supportedModels() で実在検証する

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>
  gate TC:
    GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップは更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 33 cases
- **Automated** (unit/integration): 32
- **Manual**: 0
- **Priority**: must: 22, should: 9, could: 2

---

## Category: 実効モデル収集 (collectEffectiveModels)

### TC-001: custom reviewer と regression-gate の実効モデルが収集される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 実効モデルは composed pipeline の解決後モデルから収集される > Scenario: custom reviewer と regression-gate の実効モデルが収集される

### TC-002: config の byRequestType override が実効モデルに反映される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 実効モデルは composed pipeline の解決後モデルから収集される > Scenario: config の byRequestType override が実効モデルに反映される

### TC-003: CliStep は収集対象外

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** composed descriptor に kind が `"agent"` でないステップ（CliStep 等）が含まれる
**WHEN** `collectEffectiveModels()` を呼ぶ
**THEN** CliStep は収集結果に含まれず、`EffectiveModelRef[]` のエントリ数は agent step の数のみになる

### TC-004: provider 未登録モデルは provider が undefined になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** merged registry に登録のないモデル ID を持つ agent step が composed descriptor に存在する
**WHEN** `collectEffectiveModels()` を呼ぶ
**THEN** 当該エントリの `provider` は `undefined` となり、他のフィールド（stepName, model, configPath）は正しく設定されている

---

## Category: 照合ロジック (checkModelExistence)

### TC-005: OpenAI モデルは一覧に無くても未知として扱われない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: OpenAI provider のモデルは live 照合の対象外である > Scenario: OpenAI モデルは一覧に無くても未知として扱われない

### TC-006: alias は live 検証で実在扱いされる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: alias 3 種は静的検証・provider 解決・live 検証の全経路を pass する > Scenario: alias は live 検証で実在扱いされる

### TC-007: 腐った Anthropic model ID が invalid.unknown に含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `provider === "anthropic"` かつ `supportedModels()` 一覧に存在しない ID（例: `"claude-defunct-99"`）を持つ `EffectiveModelRef` と、その ID を含まない `{ kind: "listed", models: [...] }` result
**WHEN** `checkModelExistence(refs, result)` を呼ぶ
**THEN** `{ kind: "invalid", unknown: [<該当 ref>] }` が返り、unknown エントリに stepName / configPath が含まれる

### TC-008: result が unavailable のとき常に skipped を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `{ kind: "unavailable", reason: "offline" }` の result と任意の `EffectiveModelRef[]`
**WHEN** `checkModelExistence(refs, result)` を呼ぶ
**THEN** `{ kind: "skipped", reason: "offline" }` が返る

### TC-009: 全モデルが既知のとき ok を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `provider === "anthropic"` のモデルがすべて `{ kind: "listed", models: [...] }` の models に含まれる状況
**WHEN** `checkModelExistence(refs, result)` を呼ぶ
**THEN** `{ kind: "ok" }` が返る

### TC-010: provider が undefined のモデルは照合対象外

**Category**: unit
**Priority**: should
**Source**: design.md > D4

**GIVEN** `provider` が `undefined` の `EffectiveModelRef`（registry 未登録モデル）と `{ kind: "listed", models: [] }` result
**WHEN** `checkModelExistence(refs, result)` を呼ぶ
**THEN** 当該エントリは `invalid.unknown` に入らない（照合は `provider === "anthropic"` のみ対象）

---

## Category: alias 登録 (BUILTIN_MODEL_REGISTRY / ANTHROPIC_MODEL_ALIASES)

### TC-011: alias が静的検証と provider 解決を pass する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: alias 3 種は静的検証・provider 解決・live 検証の全経路を pass する > Scenario: alias が静的検証と provider 解決を pass する

### TC-012: ANTHROPIC_MODEL_ALIASES が 3 alias を含み export される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `src/config/model-registry.ts` がインポートされた状態
**WHEN** `ANTHROPIC_MODEL_ALIASES` を参照する
**THEN** `Set` に `"sonnet"`, `"opus"`, `"haiku"` の 3 要素が含まれており、`has()` で各 alias が確認できる

### TC-013: alias が BUILTIN_MODEL_REGISTRY に anthropic として登録されている

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `BUILTIN_MODEL_REGISTRY` を参照する
**WHEN** `"sonnet"`, `"opus"`, `"haiku"` のエントリを確認する
**THEN** 各エントリの `provider` が `"anthropic"` であり、既定モデル（`"claude-sonnet-5"` 等）は変更されていない

### TC-014: resolveProvider が 3 alias に対して anthropic を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `mergeModelRegistry(makeConfig())` で作成した merged registry
**WHEN** `resolveProvider("sonnet", merged)`, `resolveProvider("opus", merged)`, `resolveProvider("haiku", merged)` を呼ぶ
**THEN** それぞれ `"anthropic"` が返る（例外を投げない）

### TC-015: validateConfig が alias を含む config を CONFIG_INVALID を投げずに受理する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `steps.design.model = "sonnet"` および `byRequestType.new-feature.model = "opus"` を含む config
**WHEN** `validateConfig()` を呼ぶ
**THEN** `CONFIG_INVALID` を投げず、バリデーションが pass する

---

## Category: SDK probe (createClaudeSupportedModelsProbe)

### TC-016: 一覧取得成功時に listed result を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** `supportedModels()` が `[{ value: "claude-sonnet-5" }, { value: "claude-opus-5" }]` を返す fake SDK loader を注入した probe
**WHEN** probe を呼ぶ
**THEN** `{ kind: "listed", models: ["claude-sonnet-5", "claude-opus-5"] }` が返る

### TC-017: SDK loader throw 時に unavailable を返す（never throw）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** SDK loader が `new Error("ENOENT")` を throw する fake を注入した probe
**WHEN** probe を呼ぶ
**THEN** throw せず `{ kind: "unavailable", reason: <非空文字列> }` が返る

### TC-018: timeout 経路でも session が閉じられる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: SDK session / subprocess は全経路で後始末される > Scenario: timeout 経路でも session が閉じられる

### TC-019: 取得成功後に session が閉じられる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: SDK session / subprocess は全経路で後始末される > Scenario: 取得成功後に session が閉じられる

### TC-020: 取得失敗（SDK throw）経路でも session が閉じられる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** fake SDK が Query.close() / AbortController.abort() の呼び出しを追跡でき、`supportedModels()` が throw する状態
**WHEN** probe を呼ぶ
**THEN** `AbortController.abort()` と `Query.close()` が finally 経路で呼ばれ、`{ kind: "unavailable" }` が返る

### TC-021: token 値が返り値・ログに現れない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** OAuth token `"my-secret-token"` を返す `resolveTokenFn` を注入し、SDK が認証エラーを throw する probe
**WHEN** probe を呼ぶ
**THEN** 返り値の `reason` 文字列にトークン値 `"my-secret-token"` が含まれない

---

## Category: runtime port + preflight 統合 (T-06)

### TC-022: managed 相当 runtime では probe が起動されない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 検証は local runtime に限定される > Scenario: managed runtime では実在検証が行われない

### TC-023: 腐った Anthropic model ID で job 開始前に CONFIG_INVALID 停止

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 未知 Anthropic モデルは job 開始前に CONFIG_INVALID で停止する > Scenario: 腐った Anthropic model ID で job 開始前に停止する

### TC-024: offline で一覧取得に失敗しても job は継続する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 一覧取得失敗時は warning を出して検証を skip し job を継続する > Scenario: offline で一覧取得に失敗しても job は継続する

### TC-025: anthropic 実効モデルが 0 件のとき probe が起動されない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** composed descriptor に `provider === "anthropic"` の agent step が存在しない（全ステップが OpenAI モデルを使用）状況と、呼び出し確認可能な fake probe を持つ LocalRuntime 相当の runtime
**WHEN** `assertEffectiveModelsExist()` を呼ぶ
**THEN** fake probe が一度も呼ばれず、関数が正常 return する

### TC-026: alias のみの構成では live 検証が pass する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** 実効モデルがすべて alias（`"sonnet"`, `"opus"`, `"haiku"`）であり、`listSupportedModels` が `{ kind: "listed", models: [] }`（alias 未含有）を返す runtime
**WHEN** `assertEffectiveModelsExist()` を呼ぶ
**THEN** `CONFIG_INVALID` を throw せず正常 return する

### TC-027: invalid 時のエラーメッセージに step 名と config path を含む

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** 実効 Anthropic モデルが `{ stepName: "design", model: "claude-defunct-99", provider: "anthropic", configPath: "steps.design.model" }` であり、`listSupportedModels` が `{ kind: "listed", models: [] }` を返す runtime
**WHEN** `assertEffectiveModelsExist()` を呼ぶ
**THEN** throw された `SpecRunnerError` の code が `CONFIG_INVALID`、message に `"design"` および `"steps.design.model"` が含まれる

### TC-028: skipped 時に warning が出力される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** `listSupportedModels` が `{ kind: "unavailable", reason: "Network unreachable" }` を返す runtime と、ログキャプチャ可能な `logWarn` 注入
**WHEN** `assertEffectiveModelsExist()` を呼ぶ
**THEN** throw せず、`logWarn` が `"Network unreachable"` を含む文字列で呼ばれる

### TC-029: ManagedRuntime に listSupportedModels が存在しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** `ManagedRuntime` クラスの実装
**WHEN** `listSupportedModels` メソッドの存在を確認する
**THEN** `ManagedRuntime` は `listSupportedModels` を持たない（method が undefined）

---

## Category: SupportedModelsProbe port 定義 (T-04)

### TC-030: port ファイルが adapter / core/runtime に依存しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** `src/core/port/model-listing.ts` のインポートグラフ
**WHEN** `bun run typecheck` を実行する
**THEN** adapter/ または core/runtime/ への静的 import が存在せず、型チェックが green になる（DSM 準拠）

---

## Category: doctor 統合 (T-07)

### TC-031: doctor check で取得成功 + 未知モデルのとき fail を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** `supportedModelsProbe` が `{ kind: "listed", models: [] }` を返し、base descriptor に `provider === "anthropic"` かつ一覧に無いモデルを持つ agent step が存在する `DoctorContext`
**WHEN** model-existence doctor check を呼ぶ
**THEN** `{ status: "fail", details: [<step 名/config path を含む文字列>] }` が返る

### TC-032: doctor check で probe 未注入または unavailable のとき warn を返す

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** `supportedModelsProbe` が `undefined`（未注入）または `{ kind: "unavailable" }` を返す `DoctorContext`
**WHEN** model-existence doctor check を呼ぶ
**THEN** `{ status: "warn" }` が返り、fail にはならない

---

## Category: 全体 green 確認

### TC-033: typecheck && test が green

**Category**: gate
**Priority**: could
**Source**: tasks.md > T-08 Acceptance Criteria

`bun run typecheck && bun run test` が全 pass。既存テスト（`tests/config/model-registry.test.ts` / registry 依存テスト / `tests/core/provider-readiness-gate.test.ts` 等）は無変更で green のまま。

---

## Result

```yaml
result: completed
total: 33
automated: 32
manual: 0
must: 22
should: 9
could: 2
blocked_reasons: []
```
