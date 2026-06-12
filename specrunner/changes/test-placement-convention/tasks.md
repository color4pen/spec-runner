# Tasks: test-placement-convention

## T-01: `TestPlacement` / `TestsConfig` 型と `tests` フィールドを config 型に追加

- [x] `src/config/schema.ts` に `TestPlacement` discriminated union を追加する
      （`{ style: "sibling"; suffix?: string }` | `{ style: "mirror"; testsRoot: string; sourceRoot?: string; suffix?: string }`）
- [x] `TestsConfig`（`{ placement?: TestPlacement }`）を追加する
- [x] `SpecRunnerConfig` に `tests?: TestsConfig;` を追加する
- [x] `RawConfig` に `tests?: unknown;` passthrough を追加する（`verification?: unknown` と同パターン）
- [x] 既定 suffix 定数 `export const DEFAULT_TEST_SUFFIX = ".test.ts";` を追加する

**Acceptance Criteria**:
- `typecheck` が green（型追加でビルドが壊れない）
- `SpecRunnerConfig` から `config.tests?.placement` に型安全にアクセスできる
- `DEFAULT_TEST_SUFFIX` が export されている

## T-02: `configSchema`（zod）に `tests.placement` の構造検証を追加

- [x] `src/config/schema.ts` の `configSchema` に `tests: optional(object({ placement: optional(testPlacementSchema) }, ...))` を追加する
- [x] `testPlacementSchema = union([siblingSchema, mirrorSchema], <message>)` を定義する
      - `siblingSchema`: `style: literal("sibling")`, `suffix: optional(non-empty string)`
      - `mirrorSchema`: `style: literal("mirror")`, `testsRoot: non-empty string`, `sourceRoot: optional(non-empty string)`, `suffix: optional(non-empty string)`
- [x] 検証失敗が既存 `throwFromFirstIssue` 経路で `CONFIG_INVALID: tests.placement ...` を throw することを確認する
      （semantic check 層の追加は不要）

**Acceptance Criteria**:
- 有効な sibling / mirror config が `validateConfig` を通る
- 未知の `style` / `mirror` の `testsRoot` 欠落 / 型不一致が `CONFIG_INVALID` で弾かれる
- `tests` 不在の config が引き続き valid（後方互換）
- `typecheck && test` が green

## T-03: 配置指示 renderer（純関数）を新設

- [x] `src/prompts/test-placement.ts` を新規作成し、`renderTestPlacementInstruction(placement: TestPlacement): string` を実装する
- [x] `## Test File Placement` セクション（markdown）を返す。`style` ごとに決定的な配置指示と変換例（before → after）を展開する
      - `sibling`: 対象ソースと同一ディレクトリ、`suffix`（既定 `DEFAULT_TEST_SUFFIX`）。例 `src/foo/bar.ts` → `src/foo/bar<suffix>`
      - `mirror`: `testsRoot/` 配下にミラー。`sourceRoot` 指定時はその prefix を剥がす。例を埋め込む
- [x] 指示文に「この配置規約は既定方針（既存テスト配置に従う）より優先する」旨を明記する
- [x] I/O・副作用を持たない純関数とする

**Acceptance Criteria**:
- `sibling` で同階層配置と suffix が出力に含まれる
- `mirror` で `testsRoot` 値と before→after 変換例が出力に含まれる
- `suffix` 明示時はその値が使われ、既定 `.test.ts` を主張しない
- `typecheck` が green

## T-04: implementer の user message に配置指示を条件付き注入

- [x] `src/core/step/implementer.ts` の `buildImplementerInitialMessage(opts)` に `placement?: TestPlacement` を追加する
- [x] `placement` ありのとき `renderTestPlacementInstruction(placement)` を末尾セクションとして append する
      （`dynamicContext` セクションと同様の条件付き append）。なしのとき message は現状とバイト一致
- [x] `ImplementerStep.buildMessage(state, deps)` が `placement: deps.config.tests?.placement` を渡す
- [x] system プロンプト（`implementer-system.ts`）は無改変（line 49 の既定ガイダンスを残す）

**Acceptance Criteria**:
- `placement` 指定時、user message に `Test File Placement` セクションが含まれる
- `placement` 未指定時、user message が現状と同一（`Test File Placement` セクション不在）
- `IMPLEMENTER_SYSTEM_PROMPT` が無変更（既存 `tests/prompts/implementer-system.test.ts` が green のまま）
- `typecheck && test` が green

## T-05: config schema 検証のテストを追加

- [x] `tests/unit/config/schema.test.ts`（または新規ファイル）に `tests.placement` 検証ケースを追加する
- [x] 有効ケース: sibling / mirror（`testsRoot` + `sourceRoot`）/ `suffix` 上書き が valid
- [x] 不正ケース: 未知 `style` / `mirror` の `testsRoot` 欠落 / `testsRoot` が string 以外 が `CONFIG_INVALID`
- [x] 後方互換ケース: `tests` 不在が valid
- [x] spec.md の各 Scenario（Requirement 1）に対応する must TC を実装する

**Acceptance Criteria**:
- 上記すべての検証ケースが green
- 不正値テストが `CONFIG_INVALID` と `tests.placement` を message で確認する

## T-06: implementer message 注入のテストを追加

- [x] implementer message のテスト（`tests/prompts/` または `tests/unit/step/`）を追加する
- [x] sibling 注入: message に同階層配置指示 + `.test.ts` が含まれる
- [x] mirror 注入: message に `testsRoot` 値 + before→after 変換例が含まれる
- [x] suffix 上書き: `.spec.ts` 指定時に `.spec.ts` が使われる
- [x] 未設定: `placement` なしで message に `Test File Placement` セクションが含まれない（現状不変）
- [x] test-case-gen system prompt に placement 言及がないことを固定する
- [x] spec.md の各 Scenario（Requirement 2 / 3）に対応する must TC を実装する

**Acceptance Criteria**:
- 注入あり / なし両方のケースが green
- test-case-gen prompt の placement 不在テストが green
- `typecheck && test` が green

## T-07: README に `tests.placement` を文書化

- [x] README の Configuration / Supported Scope（`verification.commands` の近傍）に `tests.placement` を追記する
- [x] sibling / mirror の jsonc 設定例を載せる
- [x] 未設定時は agent が既存配置パターンに従う既定挙動である旨を明記する

**Acceptance Criteria**:
- README に sibling / mirror の設定例が含まれる
- 既定（未設定）挙動の説明が含まれる
