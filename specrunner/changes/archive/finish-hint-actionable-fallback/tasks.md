# Tasks: finish-hint-actionable-fallback

## Task 1: STATUS_HINTS の書き換え ✅

**File**: `src/core/finish/job-state-update.ts`

`STATUS_HINTS` の `failed` と `terminated` を書き換える:

```ts
// Before
failed: "Use 'specrunner cancel' to clean up failed or terminated jobs.",
terminated: "Use 'specrunner cancel' to clean up failed or terminated jobs.",

// After
failed: "Run 'specrunner rm <jobId>' to remove the failed job.",
terminated: "Run 'specrunner rm <jobId>' to remove the terminated job.",
```

## Task 2: pollTimeoutError の hint 書き換え ✅

**File**: `src/errors.ts`

`pollTimeoutError`（L226）の hint を書き換える:

```ts
// Before
"Session may still be running on Anthropic side. Use 'specrunner resume' to retry or 'specrunner cancel' to abort."

// After
"Session may still be running on Anthropic side. Use 'specrunner resume' to retry or 'specrunner rm <jobId>' to abort."
```

## Task 3: hint コマンド存在テストの追加 ✅

**File**: `tests/hint-command-existence.test.ts`（新規）

hint 文字列内に登場する `specrunner <command>` が `COMMANDS` registry に存在することを検証するテスト。

**実装方針**:

1. `COMMANDS` を `src/cli/command-registry.ts` から import し、`Object.keys(COMMANDS)` で有効コマンド集合を取得
2. `STATUS_HINTS` を `src/core/finish/job-state-update.ts` から export して import（現在は module-private の `const` なので `export` を追加する）
3. `pollTimeoutError` を `src/errors.ts` から import し、ダミー引数で呼び出して `.hint` を取得
4. 各 hint 文字列に対し `/specrunner (\w+)/g` で verb を抽出
5. 抽出した各 verb が `Object.keys(COMMANDS)` に含まれることを `expect` で assertion

**`STATUS_HINTS` の export 追加**:
`src/core/finish/job-state-update.ts` の `const STATUS_HINTS` を `export const STATUS_HINTS` に変更する。テスト専用の export だが、Record 定数なので外部公開しても副作用なし。

**テスト構造**:
```ts
describe("hint command existence", () => {
  it("STATUS_HINTS reference only registered commands", () => { ... });
  it("pollTimeoutError hint references only registered commands", () => { ... });
});
```

## Task 4: 検証 ✅

`bun run typecheck && bun run test` が green であることを確認。

## 依存関係

Task 1, 2 は独立。Task 3 は Task 1 の `STATUS_HINTS` export 変更に依存。Task 4 は全タスク完了後。
