# Spec: config schema zod migration

## Requirements

### Requirement: validateConfig は zod スキーマで構造検証する

`validateConfig` は config の型・範囲・enum・必須/任意の検証を、手書きの `typeof` ガード連鎖ではなく
単一の zod スキーマで行う。検証システムは型と検証ルールの情報源を一本化 SHALL し、フィールド追加時に
検証ロジックを手で書き足す必要が無いこと。MUST not retain the hand-written `typeof`-guard chain.

#### Scenario: 妥当な config がスキーマ検証を通る

**Given** `{ version: 1, agents: {}, steps: { implementer: { model: "claude-sonnet-4-5" } } }` という migrated config
**When** `validateConfig` を呼ぶ
**Then** 例外を throw せず、引数として渡したオブジェクトを返す

#### Scenario: 型不一致をスキーマが検出する

**Given** `{ version: 1, specReview: { pollIntervalMs: "10000" } }`（数値であるべき値が文字列）
**When** `validateConfig` を呼ぶ
**Then** `CONFIG_INVALID` を含むメッセージで throw する

### Requirement: エラー契約（code / exit code / hint / メッセージ形式）を維持する

検証失敗時の `Error` は、現行と互換な機械可読 code と人向けメッセージ形式を維持 MUST。検証システムは zod の
素の検証エラーメッセージをそのままユーザーに露出させては MUST NOT、`CONFIG_INVALID: <path> <reason>.` 形式へ
変換 SHALL。`.code` の有無に依存する store 経由の `SpecRunnerError` 変換・exit code・hint 写像が現行と一致すること。

#### Scenario: 検証失敗は CONFIG_INVALID code とパス入りメッセージを持つ

**Given** `{ version: 1, steps: { implementer: { model: "" } } }`（空文字 model）
**When** `validateConfig` を呼ぶ
**Then** 投げられた error の `message` は `CONFIG_INVALID` と `steps.implementer.model` を含み、
`.code` は `"CONFIG_INVALID"` である

#### Scenario: model registry 不在は CONFIG_INVALID code を持ち store で CONFIG_INVALID になる

**Given** project local standalone config の step model が registry に存在しない値
**When** `loadConfig` 経由で検証される
**Then** `SpecRunnerError` の `code` は `"CONFIG_INVALID"` である

#### Scenario: no-code 例外サイトの挙動を忠実に再現する

**Given** `{ version: 1, pipeline: { maxRetries: 11 } }`
**When** `validateConfig` を呼ぶ
**Then** error の `message` は `CONFIG_INVALID: pipeline.maxRetries must be between 1 and 10.` を含み、
現行同様に `.code` を **持たない**（root 非オブジェクトガード・version ガードも同じく no-code を維持する）

### Requirement: 複雑条件はスキーマ後段の独立チェックとして分離する

スキーマで素直に表現できない条件は、スキーマ検証成功後に走る独立したチェックとして実装 SHALL。検証システムは
これらを `validateConfig` 内の `if-then` 連鎖へ戻しては MUST NOT。対象は model registry 存在検証・managed
runtime での OpenAI model 排他・`byRequestType` の空文字キー検出・nested `byRequestType` 禁止（1-level limit）・
未知 request type の警告である。

#### Scenario: nested byRequestType を後段チェックが拒否する

**Given** `steps.code-review.byRequestType["spec-change"].byRequestType` が存在する config
**When** `validateConfig` を呼ぶ
**Then** `CONFIG_INVALID` かつ `1-level limit` を含むメッセージで throw する

#### Scenario: byRequestType の空文字キーを後段チェックが拒否する

**Given** `steps.code-review.byRequestType[""]` が存在する config
**When** `validateConfig` を呼ぶ
**Then** `CONFIG_INVALID` かつ `empty string key` を含むメッセージで throw する

#### Scenario: managed runtime での OpenAI model を後段チェックが拒否する

**Given** `{ version: 1, runtime: "managed", steps: { implementer: { model: "o3" } } }`
**When** `validateConfig` を呼ぶ
**Then** `CONFIG_INVALID` かつ `cannot be used with runtime "managed"` を含むメッセージで throw する

### Requirement: 未知 request type は警告のみで拒否しない

`byRequestType` のキーが既知 request type（bug-fix / spec-change / new-feature / refactoring / chore）以外の
場合、後段チェックは `stderrWrite` で警告を出力 SHALL し、検証は throw せず通過 MUST。

#### Scenario: 未知 request type キーは throw しない

**Given** `steps.code-review.byRequestType["unknown-custom-type"] = { model: "claude-sonnet-4-5" }`
**When** `validateConfig` を呼ぶ
**Then** 例外を throw しない（警告は stderr に出力されうる）

### Requirement: 未知/レガシーフィールドを保持し load / migration 挙動を変えない

`validateConfig` は未知のトップレベルフィールドを検証エラーにしては MUST NOT、返り値として元のオブジェクトを
そのまま返 SHALL（未知フィールドを strip しない）。`validateConfig` のシグネチャ、および `store.ts` /
`migrate.ts` の読み込み・migration 経路は変更しないこと。

#### Scenario: 旧 config の未知フィールドを拒否せず保持する

**Given** `{ version: 1, agents: {}, jobs: { location: "xdg" } }`（`jobs` は現行スキーマに無い）
**When** `validateConfig` を呼ぶ
**Then** 例外を throw せず、返り値は `jobs` フィールドを保持している

#### Scenario: runtime 未設定は migration で local になり検証を通る

**Given** runtime フィールドの無い config を `applyMigration` した結果
**When** `validateConfig` を呼ぶ
**Then** `runtime` は `"local"` で、例外を throw しない
