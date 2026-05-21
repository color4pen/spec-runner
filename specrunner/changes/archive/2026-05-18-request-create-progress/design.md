# Design: request create / review のプログレス表示

## 方針

`request-create.ts` と `request-review.ts` の LLM 呼び出し前後に stderr へ進捗メッセージを追加する。変更は command 層のみ。下位層 (`generator.ts`, `reviewer.ts`) は触らない。

## 変更箇所

### 1. `src/core/command/request-create.ts`

`manager.create()` 呼び出しの前後を `stderrWrite()` でラップする。

```
stderrWrite("Generating request.md...")
↓
const slug = await manager.create(...)
↓
stderrWrite("✓ Generated <slug>")
```

失敗時は既存の catch ブロック内で `✗ Failed: <message>` を追加出力する。既存の `Error:` / `Hint:` 出力はそのまま維持。

### 2. `src/core/command/request-review.ts`

`runReview()` 呼び出しの前後を `stderrWrite()` でラップする。

```
stderrWrite("Reviewing request.md...")
↓
result = await runReview(...)
↓
stderrWrite("✓ Reviewed")
```

失敗時は既存の catch ブロック内で `✗ Failed: <message>` を追加出力する。

### 3. stderr 出力ユーティリティ

既存の `src/logger/stdout.ts` の `stderrWrite()` を使う。新規ユーティリティは作らない。`stderrWrite()` は `maskSensitive()` を通すため、API key 等が漏れない。

## 設計判断

| 判断 | 選択 | 理由 |
|------|------|------|
| 進捗表示の挿入箇所 | command 層 (`request-create.ts`, `request-review.ts`) | generator/reviewer は testability のために pure に保つ |
| 出力関数 | 既存 `stderrWrite()` | maskSensitive 付き。新規関数不要 |
| spinner | 不採用 | request.md の要件に明記 |
| 失敗メッセージの位置 | 既存 Error 出力の **前** | `✗ Failed` → `Error: ...` → `Hint: ...` の順で統一的 |

## テスト戦略

command 層の `executeCreate()` / `executeReview()` を呼び出し、`process.stderr.write` を spy して出力内容を検証する。LLM 呼び出し (`manager.create`, `runReview`) は vi.mock でスタブ化する。
