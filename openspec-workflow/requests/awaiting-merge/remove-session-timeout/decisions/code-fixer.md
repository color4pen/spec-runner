# code-fixer decisions — remove-session-timeout

## Fix History

### iteration 1 (2026-05-03)

**#1 (HIGH): `parseTimeout` dead code 削除**
`src/cli/run.ts` の `parseTimeout` 関数と JSDoc コメント（lines 13-26）を完全削除する :: 呼び出し元ゼロが確認されており、export された未使用 helper を残すと将来の再利用で timeout 概念が復活するリスクがある。本 request の設計方針「wall-clock timeout の完全撤廃」と直接矛盾する。テスト参照もゼロのため削除のみで完結する。

**#2 (MEDIUM): JSDoc `timeout` variant 記述修正**
`src/adapter/anthropic/session-runner.ts:31` の JSDoc 行 `4. Return result (idle / terminated / timeout)` を `4. Return result (idle / terminated)` に修正する :: `ManagedAgentSessionResult.status` 型は `"idle" | "terminated"` であり `timeout` は存在しない。型と doc の乖離は将来の編集者を誤誘導する。

**#3 (MEDIUM): hardcoded `SESSION_TERMINATED` 文字列をヘルパー経由に統一**
`src/core/step/executor.ts` の 2 箇所（polling fallback / pollResult エラーパス）で `code: "SESSION_TERMINATED"` をハードコードしているのを `sessionTerminatedError()` ヘルパー経由に置き換える :: `sessionTerminatedError` は既にインポート済み。ただし呼び出しサイトでは `pollResult.error` が存在する場合はそれを優先しており、fallback 専用の箇所のみ対象。`sessionTerminatedError()` の返す message/hint と hardcode の message（`Session ${pollResult.status}` 等）は異なるため、fallback object の `code` のみを `ERROR_CODES.SESSION_TERMINATED` 相当に揃えるより、`sessionTerminatedError()` の error info を直接使う方が一貫性が高い。

**#4 (LOW): test fixture の `SESSION_TIMEOUT` 文字列を中立値に置換**
`tests/unit/step/executor-helpers.test.ts` の fixture 文字列 `"SESSION_TIMEOUT"` を `"GENERIC_ERROR_CODE_FOR_TEST"` に置換する :: `SESSION_TIMEOUT` は本 request で型・spec から削除済み。汎用 error propagation テストとして fixture の semantics は変わらないが、廃止コードを test fixture として残すのは grep 監査の継続性を損なう。

**#5 (LOW): `SpecFixerConfig` 空 interface に明示的 marker 追加**
`src/config/schema.ts` の `SpecFixerConfig` に `readonly _placeholder?: never` を追加する :: 空 interface は ESLint `@typescript-eslint/no-empty-interface` 等で warn 対象になりうる。削除（option a）より marker 追加（option b）を選ぶ理由は、将来の per-step config 追加時の migration コストが低く、schema から消すと interface 名も消えるため下流型参照が破壊される可能性があるため。

**#6 (LOW): tasks.md の unchecked 項目更新**
`openspec/changes/remove-session-timeout/tasks.md` の 5.1 / 5.2 / 7.5 を `[x]` に更新する :: review-feedback-001.md に「本セッション内で手動確認したところ pass」と記載されており、progress 整合性のため反映する。

### iteration 2 (2026-05-03)

**#1 (MEDIUM): `normalizeSessionError` ヘルパを `session-error.ts` に抽出し両 caller を置換する :: `session-client.ts` の catch が常に `SESSION_TERMINATED` に丸めており、実際の error code が失われる。`session-runner.ts` も同一パターン。1 箇所で正規化ルール（code が存在すれば保持、なければ `SESSION_TERMINATED` を default）を定義することで情報損失と重複を同時に解消できる。配置先として既存の `src/errors.ts` は core 層であり adapter 依存を持ち込まない設計のため、adapter 内の新規ファイル `session-error.ts` を選ぶ。**

**#2 (LOW): `SpecFixerConfig` を `type` alias `Record<string, never>` に置き換える :: `_placeholder?: never` は空 interface の code smell 回避のための workaround。`Record<string, never>` type alias に変換することで同等の型安全性を保ちつつ workaround 表現を排除できる。`SpecRunnerConfig.specFixer?: SpecFixerConfig` など既存 caller の型参照は変わらない。**

**#3 (LOW): lazy migration コメントをコードの実際の挙動に合わせて書き換える :: 「in-memory remap」という表現は mutation を行わない実装を連想させ、実際の動作（parsed object を直接 mutate する）と乖離している。コメントを「on-read remap; mutates the parsed object so subsequent persists do not write SESSION_TIMEOUT.」に修正し、挙動はそのまま維持する。**
