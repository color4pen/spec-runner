# Test Cases: project-config-overlay

## Category: overlay-load

### TC-01 user global のみで動作する（regression）
- **Priority**: must
- **Source**: request.md 受け入れ基準 1
- **GIVEN** `~/.config/specrunner/config.json` が valid な完全 config を持ち、`<repoRoot>/.specrunner/config.json` が存在しない
- **WHEN** `loadConfig(repoRoot)` を呼ぶ
- **THEN** user global config の値がそのまま返る（既存挙動 regression なし）

### TC-02 project local のみで standalone として動作する
- **Priority**: must
- **Source**: request.md 受け入れ基準 2 / design.md D1
- **GIVEN** `~/.config/specrunner/config.json` が存在せず、`<repoRoot>/.specrunner/config.json` に `version: 1` + 必須 field を含む完全な config が存在する
- **WHEN** `loadConfig(repoRoot)` を呼ぶ
- **THEN** project local config の値が返る（user global なしでも単独で動作）

### TC-03 project local が部分 config のみ + user global なし → migration により valid として扱われる
- **Priority**: must
- **Source**: request.md 要件 1 / design.md D1
- **GIVEN** `~/.config/specrunner/config.json` が存在せず、`<repoRoot>/.specrunner/config.json` に `{ "steps": { "defaults": { "model": "claude-sonnet-4-6" } } }` のみが存在する（version なし）
- **WHEN** `loadConfig(repoRoot)` を呼ぶ
- **THEN** config load は成功する。`applyMigration()` が `version: 1` と `agents: {}` を自動補完するため、部分 config でも standalone として valid と判定される
- **NOTE**: 当初「部分 config → CONFIG_INVALID」としていたが、`applyMigration()` の version 補完挙動を活用することで部分 config も動作するよう決定した（impl に合わせて spec を修正）

### TC-04 両方存在する場合 project local が deep merge で override する
- **Priority**: must
- **Source**: request.md 受け入れ基準 3 / design.md D1
- **GIVEN** user global に `steps.design.model = "claude-sonnet-4-6"` と `steps.code-review.model = "claude-sonnet-4-6"` が設定されており、project local に `steps.code-review.model = "claude-opus-4-6[1m]"` のみが存在する
- **WHEN** `loadConfig(repoRoot)` を呼ぶ
- **THEN** `steps.design.model` は `"claude-sonnet-4-6"`（user global を継承）、`steps.code-review.model` は `"claude-opus-4-6[1m]"`（project local で override）になる

### TC-05 両方なし → 既存挙動（CONFIG_MISSING or default）
- **Priority**: must
- **Source**: request.md 要件 1 / design.md D1
- **GIVEN** `~/.config/specrunner/config.json` も `<repoRoot>/.specrunner/config.json` も存在しない
- **WHEN** `loadConfig(repoRoot)` を呼ぶ
- **THEN** 既存挙動通り（CONFIG_MISSING または default config を返す）

### TC-06 repoRoot なしの場合 user global のみ（既存挙動）
- **Priority**: must
- **Source**: design.md D1
- **GIVEN** `~/.config/specrunner/config.json` が valid な config を持つ
- **WHEN** `loadConfig()` を引数なしで呼ぶ
- **THEN** user global config の値のみが返る（project local の探索は行わない）

### TC-07 project local の JSON parse error → CONFIG_INVALID
- **Priority**: must
- **Source**: tasks.md Task 4
- **GIVEN** `<repoRoot>/.specrunner/config.json` が不正な JSON（構文エラー）を含む
- **WHEN** `loadConfig(repoRoot)` を呼ぶ
- **THEN** `CONFIG_INVALID` エラーが返る

### TC-08 project local のパスが `<repoRoot>/.specrunner/config.json` として解決される
- **Priority**: should
- **Source**: design.md D3
- **GIVEN** `resolveRepoRoot()` が `/path/to/repo` を返す
- **WHEN** `loadConfig("/path/to/repo")` を呼ぶ
- **THEN** 内部で `/path/to/repo/.specrunner/config.json` が読み込み対象パスとして使われる

---

## Category: deep-merge

### TC-09 object 型の値は再帰的に deep merge される
- **Priority**: must
- **Source**: design.md D2 / tasks.md Task 3
- **GIVEN** `base.steps.design = { model: "sonnet", maxTurns: 10 }` と `overlay.steps.design = { model: "opus" }` を渡す
- **WHEN** `deepMergeConfig(base, overlay)` を呼ぶ
- **THEN** 結果の `steps.design` は `{ model: "opus", maxTurns: 10 }`（model は上書き、maxTurns は継承）

### TC-10 primitive は overlay が上書きする
- **Priority**: must
- **Source**: design.md D2
- **GIVEN** `base.runtime = "local"` と `overlay.runtime = "managed"` を渡す
- **WHEN** `deepMergeConfig(base, overlay)` を呼ぶ
- **THEN** 結果の `runtime` は `"managed"`

### TC-11 overlay に存在しない key は base を維持する
- **Priority**: must
- **Source**: design.md D2
- **GIVEN** `base.steps.design = { model: "sonnet" }` を持ち、overlay に `steps.design` の記述がない
- **WHEN** `deepMergeConfig(base, overlay)` を呼ぶ
- **THEN** 結果の `steps.design.model` は `"sonnet"`（base から継承）

### TC-12 overlay の null は null で上書きする（explicit clear）
- **Priority**: must
- **Source**: design.md D2
- **GIVEN** `base.steps.design.maxTurns = 10` と `overlay.steps.design.maxTurns = null` を渡す
- **WHEN** `deepMergeConfig(base, overlay)` を呼ぶ
- **THEN** 結果の `steps.design.maxTurns` は `null`

### TC-13 array は overlay が完全置換する
- **Priority**: must
- **Source**: design.md D2
- **GIVEN** `deepMergeConfig` に `base` の任意フィールドが配列値（例: `["model-a", "model-b"]`）を持ち、`overlay` の同フィールドが別の配列（例: `["model-c"]`）を持つ場合
- **WHEN** `deepMergeConfig(base, overlay)` を呼ぶ（型キャストで array fixture を注入）
- **THEN** 結果の該当フィールドは `["model-c"]`（concat ではなく完全置換）
- **NOTE**: `SpecRunnerConfig.models` は `Record<string, ModelEntry>` であり array ではない。本 TC は `deepMergeObjects` 内部の array-replace 分岐を検証するため、テストでは `as unknown` キャストで synthetic array field を使用する

### TC-14 steps の部分 overlay — 指定した step のみ変わり他は継承される
- **Priority**: must
- **Source**: request.md 受け入れ基準 3
- **GIVEN** user global に複数の step config が設定されており、project local に `steps.code-review.model` のみ記述がある
- **WHEN** `deepMergeConfig(userGlobal, projectLocal)` を呼ぶ
- **THEN** `code-review` は project local の値、他の step は全て user global の値を維持する

---

## Category: byRequestType-resolution

### TC-15 type 別 step level が最優先（resolution level 1）
- **Priority**: must
- **Source**: request.md 受け入れ基準 5 / design.md D5
- **GIVEN** `config.steps.design.byRequestType.spec-change.model = "claude-opus-4-6[1m]"` と `config.steps.design.model = "claude-sonnet-4-6"` と `config.steps.defaults.model = "claude-haiku"` が設定されている
- **WHEN** `getStepExecutionConfig(config, "design", stepDefaults, "spec-change")` を呼ぶ
- **THEN** 返る model は `"claude-opus-4-6[1m]"`（type 別 step level が最優先）

### TC-16 step level が type 別 default より優先される（level 2 > level 3）
- **Priority**: must
- **Source**: request.md 要件 2 / design.md D5
- **GIVEN** `config.steps.design.byRequestType` に `spec-change` の記述がなく、`config.steps.design.model = "claude-sonnet-4-6"` と `config.steps.defaults.byRequestType.spec-change.model = "claude-opus-4-6[1m]"` が設定されている
- **WHEN** `getStepExecutionConfig(config, "design", stepDefaults, "spec-change")` を呼ぶ
- **THEN** 返る model は `"claude-sonnet-4-6"`（step level が type 別 default より優先）

### TC-17 type 別 default が global default より優先される（level 3 > level 4）
- **Priority**: must
- **Source**: design.md D5
- **GIVEN** `config.steps.test-case-gen.byRequestType` なし・`config.steps.test-case-gen.model` なし・`config.steps.defaults.byRequestType.spec-change.model = "claude-opus-4-6[1m]"` と `config.steps.defaults.model = "claude-sonnet-4-6"` が設定されている
- **WHEN** `getStepExecutionConfig(config, "test-case-gen", stepDefaults, "spec-change")` を呼ぶ
- **THEN** 返る model は `"claude-opus-4-6[1m]"`（type 別 default が global default より優先）

### TC-18 global default がハードコード default より優先される（level 4 > level 5）
- **Priority**: must
- **Source**: design.md D5
- **GIVEN** byRequestType・step model・type 別 defaults いずれもなく、`config.steps.defaults.model = "claude-sonnet-4-6"` のみが設定されている
- **WHEN** `getStepExecutionConfig(config, "design", { model: "claude-haiku" }, undefined)` を呼ぶ
- **THEN** 返る model は `"claude-sonnet-4-6"`（global default がハードコード default より優先）

### TC-19 requestType が undefined の場合は level 1 と 3 をスキップし既存挙動と同等
- **Priority**: must
- **Source**: design.md D5 / tasks.md Task 6
- **GIVEN** `config.steps.design.byRequestType.spec-change.model = "claude-opus-4-6[1m]"` と `config.steps.design.model = "claude-sonnet-4-6"` が設定されている
- **WHEN** `getStepExecutionConfig(config, "design", stepDefaults, undefined)` を呼ぶ（requestType なし）
- **THEN** 返る model は `"claude-sonnet-4-6"`（type 別 resolution はスキップ、既存 4 レベルと同等）

### TC-20 bug-fix で byRequestType に記述がない step は step level の model を返す
- **Priority**: must
- **Source**: request.md 受け入れ基準 5
- **GIVEN** `config.steps.design.byRequestType = { "spec-change": { model: "claude-opus-4-6[1m]" } }` と `config.steps.design.model = "claude-sonnet-4-6"` が設定されている
- **WHEN** `getStepExecutionConfig(config, "design", stepDefaults, "bug-fix")` を呼ぶ
- **THEN** 返る model は `"claude-sonnet-4-6"`（bug-fix は byRequestType に存在しないため step level にフォールバック）

### TC-21 byRequestType 内の null は有効値として扱われる
- **Priority**: should
- **Source**: tasks.md Task 6
- **GIVEN** `config.steps.design.byRequestType.spec-change.maxTurns = null` が設定されている
- **WHEN** `getStepExecutionConfig(config, "design", { maxTurns: 10 }, "spec-change")` を呼ぶ
- **THEN** 返る `maxTurns` は `null`（null は明示的な unlimited として有効）

### TC-22 defaults の byRequestType が step 固有設定を持たない step に適用される
- **Priority**: should
- **Source**: design.md D5
- **GIVEN** `config.steps.defaults.byRequestType.spec-change.model = "claude-opus-4-6[1m]"` が設定されており、`config.steps.implement` に byRequestType も model も記述がない
- **WHEN** `getStepExecutionConfig(config, "implement", stepDefaults, "spec-change")` を呼ぶ
- **THEN** 返る model は `"claude-opus-4-6[1m]"`（type 別 defaults が適用）

---

## Category: validation

### TC-23 byRequestType 内の valid config が validation を通過する
- **Priority**: must
- **Source**: tasks.md Task 8
- **GIVEN** `steps.code-review.byRequestType = { "spec-change": { model: "claude-opus-4-6[1m]" } }` を含む config を用意する
- **WHEN** `validateConfig(config)` を呼ぶ
- **THEN** エラーなしで通過する

### TC-24 byRequestType の空文字列 key で CONFIG_INVALID
- **Priority**: must
- **Source**: request.md 受け入れ基準 / design.md D7
- **GIVEN** `steps.code-review.byRequestType = { "": { model: "claude-opus-4-6[1m]" } }` を含む config を用意する
- **WHEN** `validateConfig(config)` を呼ぶ
- **THEN** `CONFIG_INVALID` エラーが返る

### TC-25 byRequestType 内の model が空文字列で CONFIG_INVALID（path 付き）
- **Priority**: must
- **Source**: request.md 受け入れ基準 / design.md D7
- **GIVEN** `steps.code-review.byRequestType = { "spec-change": { model: "" } }` を含む config を用意する
- **WHEN** `validateConfig(config)` を呼ぶ
- **THEN** `CONFIG_INVALID` エラーが返り、error message に `steps.code-review.byRequestType.spec-change.model` というパス情報が含まれる

### TC-26 byRequestType 内の model が非 string で CONFIG_INVALID
- **Priority**: must
- **Source**: request.md 受け入れ基準
- **GIVEN** `steps.code-review.byRequestType = { "spec-change": { model: 123 } }` を含む config を用意する
- **WHEN** `validateConfig(config)` を呼ぶ
- **THEN** `CONFIG_INVALID` エラーが返る

### TC-27 byRequestType 内にネストした byRequestType があれば CONFIG_INVALID（1 階層制限）
- **Priority**: must
- **Source**: design.md D4 / D7 / tasks.md Task 8
- **GIVEN** `steps.design.byRequestType.spec-change.byRequestType = { "new-feature": { model: "opus" } }` を含む config を用意する
- **WHEN** `validateConfig(config)` を呼ぶ
- **THEN** `CONFIG_INVALID` エラーが返る

### TC-28 validation error message に問題の key path が含まれる
- **Priority**: must
- **Source**: request.md 受け入れ基準
- **GIVEN** `steps.code-review.byRequestType.spec-change.model = ""` を含む config を用意する
- **WHEN** `validateConfig(config)` を呼ぶ
- **THEN** エラーメッセージに `steps.code-review.byRequestType.spec-change.model` が含まれる（例: `CONFIG_INVALID: steps.code-review.byRequestType.spec-change.model must be a non-empty string`）

### TC-29 未知の type key は warning ログのみで通過する（reject しない）
- **Priority**: must
- **Source**: request.md 要件 3 / design.md D7
- **GIVEN** `steps.code-review.byRequestType = { "my-custom-type": { model: "claude-sonnet-4-6" } }` を含む config を用意する
- **WHEN** `validateConfig(config)` を呼ぶ
- **THEN** `CONFIG_INVALID` にならず通過し、warning ログが出力される

### TC-30 byRequestType 内の maxTurns が負値で CONFIG_INVALID
- **Priority**: should
- **Source**: tasks.md Task 8
- **GIVEN** `steps.design.byRequestType.spec-change.maxTurns = -1` を含む config を用意する
- **WHEN** `validateConfig(config)` を呼ぶ
- **THEN** `CONFIG_INVALID` エラーが返る

### TC-31 byRequestType 内の model が model registry に存在しない名前で CONFIG_INVALID
- **Priority**: should
- **Source**: tasks.md Task 8
- **GIVEN** `steps.design.byRequestType.spec-change.model = "nonexistent-model-xyz"` を含む config を用意する
- **WHEN** `validateConfig(config)` を呼ぶ
- **THEN** `CONFIG_INVALID` エラーが返る

### TC-32 byRequestType が object でなければ CONFIG_INVALID
- **Priority**: should
- **Source**: tasks.md Task 8
- **GIVEN** `steps.design.byRequestType = "invalid-string"` を含む config を用意する
- **WHEN** `validateConfig(config)` を呼ぶ
- **THEN** `CONFIG_INVALID` エラーが返る

---

## Category: cli-early-validation

### TC-33 run コマンド起動直後に config validate が実行される
- **Priority**: must
- **Source**: request.md 受け入れ基準 / design.md D7
- **GIVEN** `steps.design.byRequestType.spec-change.model = ""` という不正な config が存在する
- **WHEN** `specrunner run <slug>` コマンドを実行する
- **THEN** pipeline の中盤に到達する前に、起動直後に `CONFIG_INVALID` エラーが出て終了する

### TC-34 bootstrap コマンド起動直後に config validate が実行される
- **Priority**: should
- **Source**: design.md D7 / tasks.md Task 9
- **GIVEN** `byRequestType` に不正な空文字列 key を持つ config が存在する
- **WHEN** `specrunner bootstrap <slug>` コマンドを実行する
- **THEN** 起動直後に `CONFIG_INVALID` エラーが出て終了する

### TC-35 loadConfig に repoRoot が渡されて project local config が探索される
- **Priority**: must
- **Source**: tasks.md Task 9
- **GIVEN** `run.ts` の `runPreflight()` が `loadConfig(cwd)` を呼ぶ形に変更されており、`<cwd>/.specrunner/config.json` に project local config が存在する
- **WHEN** `specrunner run <slug>` コマンドを cwd から実行する
- **THEN** project local config が読み込まれ deep merge が適用される

---

## Category: regression

### TC-36 user global config のみで既存の動作が維持される
- **Priority**: must
- **Source**: request.md 受け入れ基準 1 / 要件 4
- **GIVEN** `~/.config/specrunner/config.json` のみが存在し、`byRequestType` は設定されていない
- **WHEN** `specrunner job start <slug>` を実行する
- **THEN** 既存挙動通りに動作し、新機能によって影響を受けない

### TC-37 byRequestType が指定されない場合は既存 resolution chain と完全同等
- **Priority**: must
- **Source**: request.md 要件 4
- **GIVEN** config に `byRequestType` の記述が一切ない
- **WHEN** `getStepExecutionConfig(config, "design", stepDefaults, "spec-change")` を呼ぶ
- **THEN** 返る値は `byRequestType` 追加前の実装と同一（level 2 → 4 → 5 の順で解決）

### TC-38 typecheck と test suite が green である
- **Priority**: must
- **Source**: request.md 受け入れ基準
- **GIVEN** 全実装が完了している
- **WHEN** `bun run typecheck && bun run test` を実行する
- **THEN** エラーなしで完了する

### TC-39 saveConfig は user global のみに書き込む（project local に書かない）
- **Priority**: should
- **Source**: design.md D8
- **GIVEN** project local config が存在する環境で `saveConfig(cfg)` を呼ぶ
- **WHEN** `saveConfig(cfg)` を実行する
- **THEN** `~/.config/specrunner/config.json` のみが更新され、`<repoRoot>/.specrunner/config.json` は変更されない
