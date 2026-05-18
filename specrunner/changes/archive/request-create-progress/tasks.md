# Tasks: request create / review のプログレス表示

## [x] Task 1: request-create.ts に進捗表示を追加

**file**: `src/core/command/request-create.ts`

1. `stderrWrite` を `../../logger/stdout.js` から import する
2. `manager.create()` 呼び出し直前に `stderrWrite("Generating request.md...")` を追加
3. `manager.create()` 成功後（`process.stdout.write` の前）に `stderrWrite("✓ Generated " + slug)` を追加
4. catch ブロック内、既存の `process.stderr.write("Error: ...")` の前に `stderrWrite("✗ Failed: " + (err instanceof Error ? err.message : String(err)))` を追加

## [x] Task 2: request-review.ts に進捗表示を追加

**file**: `src/core/command/request-review.ts`

1. `stderrWrite` を `../../logger/stdout.js` から import する
2. `runReview()` 呼び出し直前（Step 3 の config load 後）に `stderrWrite("Reviewing request.md...")` を追加
3. `runReview()` 成功後（Step 10 の output 前）に `stderrWrite("✓ Reviewed")` を追加
4. `runReview()` の catch ブロック内、既存の `process.stderr.write("Error: ...")` の前に `stderrWrite("✗ Failed: " + message)` を追加（`message` は既存の変数を流用）

## [x] Task 3: request-create のユニットテストを新規作成

**file**: `tests/unit/command/request-create.test.ts` (新規)

テストパターンは既存の `tests/unit/command/request-review.test.ts` に合わせる。

1. `vi.mock("../../src/core/request/manager.js")` で `manager.create` をスタブ化
2. `vi.mock("../../src/config/store.js")` で `loadConfig` をスタブ化
3. `process.stderr.write` を `vi.spyOn` で監視

テストケース:
- **TC-PROG-01**: `executeCreate("test text", ...)` を呼び、stderr 出力に `"Generating request.md..."` が含まれることを検証
- **TC-PROG-02**: `manager.create` が slug `"test-slug"` を返す設定で呼び、stderr 出力に `"✓ Generated test-slug"` が含まれることを検証

## [x] Task 4: request-review の既存テストに進捗表示テストを追記

**file**: `tests/unit/command/request-review.test.ts` (既存)

1. `executeReview` の統合テスト describe ブロックを追加（または既存 describe に追記）
2. `vi.mock` で `runReview` / `fs.readFile` / `parseRequestMdContent` / `loadConfig` をスタブ化
3. `process.stderr.write` を `vi.spyOn` で監視

テストケース:
- **TC-PROG-03**: `executeReview("dummy.md", { json: false })` を呼び、stderr 出力に `"Reviewing request.md..."` が含まれることを検証

## [x] Task 5: delta spec を作成

**file**: `specrunner/changes/request-create-progress/specs/cli-commands/spec.md` (新規)

`## MODIFIED Requirements` セクションで以下を記述:
- `specrunner request create` / `specrunner request review` コマンドが LLM 呼び出しの開始と完了時に stderr へ進捗を出力する旨の Requirement を追加

## [x] Task 6: typecheck & test で green を確認

```
bun run typecheck && bun run test
```
