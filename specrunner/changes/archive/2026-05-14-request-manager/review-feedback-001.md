# Code Review Feedback — request-manager — iter 1

- **date**: 2026-05-14
- **reviewer**: code-reviewer
- **verdict**: needs-fix

---

## Summary

実装は設計仕様に忠実で、アーキテクチャは clean。typecheck と全 1760 テストが green。
ただし **generator.ts の timeoutMs 未適用**（設計との乖離、機能的バグ）と **TC-GEN-003 must テスト欠落**が修正必須。

---

## Findings

### F-01 [MEDIUM] `generator.ts` — `timeoutMs` 解決済みだが AbortController 未設定

**ファイル**: `src/core/request/generator.ts` 行 37–65

`getStepExecutionConfig` で `resolvedConfig.timeoutMs` を解決しているが、AbortController が一切作成されず `queryFn` 呼び出しに渡されていない。

```typescript
// (c) Resolve execution config
const resolvedConfig = getStepExecutionConfig(config, "request-generate", {
  model: "claude-opus-4-5",
  maxTurns: 1,
  timeoutMs: 120_000,
});
// ← ここで timeoutMs が解決されているが以降一切使われない

const messages = queryFn({
  prompt: buildGeneratePrompt(text),
  options: {
    cwd,
    allowedTools: [],
    permissionMode: "bypassPermissions",
    ...maxTurnsOption,
    model: resolvedConfig.model,
    systemPrompt: REQUEST_GENERATE_SYSTEM_PROMPT,
    // abortController が渡されていない
  },
});
```

`reviewer.ts` では同パターンで正しく実装されている（行 161–165）:

```typescript
const abortController = new AbortController();
let timeoutId: ReturnType<typeof setTimeout> | undefined;
if (resolvedConfig.timeoutMs !== null && resolvedConfig.timeoutMs > 0) {
  timeoutId = setTimeout(() => abortController.abort(), resolvedConfig.timeoutMs);
}
// ... finally { if (timeoutId !== undefined) clearTimeout(timeoutId); }
```

`maxTurns: 1` で実質 1 turn 制限はあるが、SDK の turn 完了まで任意に時間がかかりうる。設定値が無視される点は設計との乖離。

**Fix**: `reviewer.ts` と同パターンで AbortController + setTimeout を追加し、`finally` でクリアする。

---

### F-02 [MEDIUM] TC-GEN-003 (must) テスト欠落

**ファイル**: `tests/unit/core/request/generator.test.ts`

`test-cases.md` の TC-GEN-003 は **must** 指定:

```
GIVEN active/my-feature/request.md が存在する
WHEN  generate("my feature", cwd, config) を呼ぶ
THEN  SLUG_COLLISION エラーを throw する
AND   queryFn は呼ばれない
```

実装は正しく `checkSlugCollision` が `queryFn` より先に呼ばれている（generator.ts 行 34）。しかし、この振る舞いを保証するテストがない。「queryFn が呼ばれないこと」の検証は将来のリグレッション防止に重要。

**Fix**: TC-GEN-003 テストを `generator.test.ts` に追加する。`vi.fn()` で mock queryFn を用意し、`checkSlugCollision` が throw した際に mock が 0 回呼ばれたことを確認する。

---

### F-03 [LOW] `request-review.ts` — `verdictToExitCode` に dynamic import を使用

**ファイル**: `src/core/command/request-review.ts` 行 90

```typescript
// Step 12: Return exit code based on verdict
const { verdictToExitCode } = await import("../request/reviewer.js");
return verdictToExitCode(result.verdict);
```

ファイル上部で `verdictToExitCode` を静的に re-export しているにもかかわらず、内部使用には dynamic import を使っている。一貫性がなく、不要な非同期呼び出し。

```typescript
// 既存の re-export（上部）
export {
  parseReviewOutput,
  verdictToExitCode,
  buildInitialMessage,
} from "../request/reviewer.js";
```

**Fix**: `runReview` と共に `verdictToExitCode` を static import し、`await import(...)` を削除する。

```typescript
import { runReview, verdictToExitCode } from "../request/reviewer.js";
```

---

### F-04 [LOW] TC-ST-010 (store.read() must) テスト欠落

**ファイル**: `tests/unit/core/request/store.test.ts`

`test-cases.md` の TC-ST-010 は **must** 指定（Task-2.4 対応）:

```
GIVEN active/my-feature/request.md に valid な request.md が存在する
WHEN  store.read(cwd, "my-feature") を呼ぶ
THEN  ParsedRequest オブジェクトを返す
```

`read()` 自体は単純だが、`manager.list()` の内部で使われており、パース失敗スキップロジックとセットで重要。

**Fix**: TC-ST-010 を `store.test.ts` に追加する（write + read のラウンドトリップ確認）。

---

## Positive Notes

- **型安全性**: `SpecRunnerError(code, hint, message)` の引数順を全箇所で正しく踏襲している（errors.ts の factory パターンと一致）
- **DI パターン**: `reviewer.ts` と `generator.ts` で `queryFn` を注入可能にし、testability を確保
- **後方互換**: `src/parser/request-md.ts` と `src/util/slugify.ts` の re-export が既存 13 ファイルを無変更のまま通している
- **パス知識の集約**: `ACTIVE_SUBDIR` / `MERGED_SUBDIR` 定数が store.ts に集約され、設計意図を達成
- **manager.ts の薄さ**: thin coordinator として独自ロジックを持たず、設計方針を遵守
- **エラーメッセージの品質**: slug collision 等の stderr 出力に Hint が付いており UX 良好
- `ERROR_CODES` 定数に `SLUG_COLLISION` / `GENERATE_SESSION_FAILED` / `REVIEW_SESSION_FAILED` が未追加だが機能的影響なし（LOW informational）

---

## Fix Checklist

- [ ] F-01: `generator.ts` に AbortController + setTimeout を追加（reviewer.ts パターンに合わせる）
- [ ] F-02: `generator.test.ts` に TC-GEN-003 を追加（slug collision → queryFn 未呼び出し確認）
- [ ] F-03: `request-review.ts` の dynamic import を static import に変更
- [ ] F-04: `store.test.ts` に TC-ST-010 (read()) を追加
