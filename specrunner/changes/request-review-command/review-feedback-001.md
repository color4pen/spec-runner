# Code Review Feedback — request-review-command — iter 1

- **reviewer**: code-reviewer
- **date**: 2026-05-14
- **verdict**: needs-fix

---

## Findings Summary

| # | Severity | Category | Description |
|---|----------|----------|-------------|
| 1 | MEDIUM | config-application | `resolvedConfig.maxTurns` が query() に渡されない（config で設定しても無効） |
| 2 | MEDIUM | config-application | `resolvedConfig.timeoutMs` が AbortController に接続されない（ハング時タイムアウトなし） |
| 3 | LOW | error-handling | query() ループで例外が throw された場合、executeReview 内では捕捉されず top-level の `Fatal:` prefix で出力される（design: "stderr + exit 1" は満たすが形式不一致） |

---

## Finding 1 — MEDIUM: maxTurns が query() に渡されない

### 問題箇所

`src/core/command/request-review.ts` lines 190–205:

```typescript
const resolvedConfig = getStepExecutionConfig(config, "request-review", {
  model: "claude-opus-4-5",
  maxTurns: 30,          // ← resolve する
  timeoutMs: 300_000,    // ← resolve する
});

const messages = query({
  prompt: buildInitialMessage(content, projectContext),
  options: {
    cwd: process.cwd(),
    allowedTools: ["Read", "Grep", "Glob"],
    permissionMode: "bypassPermissions",
    model: resolvedConfig.model,  // ← model のみ使用
    systemPrompt: REQUEST_REVIEW_SYSTEM_PROMPT,
    // maxTurns: ??? ← 渡していない
  },
});
```

`resolvedConfig.maxTurns` (デフォルト 30) は resolve されるが query() options に含まれない。  
結果として config.json で `steps.request-review.maxTurns` を設定しても silent ignore される。

### 参照実装

`src/adapter/claude-code/agent-runner.ts` lines 130–131 で正しく条件付き適用:

```typescript
const maxTurnsOption: Record<string, unknown> =
  resolvedConfig.maxTurns !== null ? { maxTurns: resolvedConfig.maxTurns } : {};
// options: { ...maxTurnsOption, ... }
```

### 修正案

```typescript
const maxTurnsOption =
  resolvedConfig.maxTurns !== null ? { maxTurns: resolvedConfig.maxTurns } : {};

const messages = query({
  prompt: buildInitialMessage(content, projectContext),
  options: {
    cwd: process.cwd(),
    allowedTools: ["Read", "Grep", "Glob"],
    permissionMode: "bypassPermissions",
    ...maxTurnsOption,
    model: resolvedConfig.model,
    systemPrompt: REQUEST_REVIEW_SYSTEM_PROMPT,
  },
});
```

---

## Finding 2 — MEDIUM: timeoutMs が AbortController に接続されない

### 問題箇所

同じく `executeReview()` の query() 呼び出し部分。`resolvedConfig.timeoutMs` (デフォルト 300,000ms = 5分) は resolve されるが wall-clock タイムアウトが設定されない。API 障害やレート制限でレスポンスが来ない場合、コマンドが無期限にハングする。

### 参照実装

`src/adapter/claude-code/agent-runner.ts` lines 138–154:

```typescript
const abortController = new AbortController();
let timeoutId: ReturnType<typeof setTimeout> | undefined;
if (resolvedConfig.timeoutMs !== null && resolvedConfig.timeoutMs > 0) {
  timeoutId = setTimeout(() => abortController.abort(), resolvedConfig.timeoutMs);
}

try {
  const messages = this.queryFn({
    prompt: fullPrompt,
    options: { ...maxTurnsOption, abortController, ... },
  });
  // ...
} finally {
  if (timeoutId !== undefined) clearTimeout(timeoutId);
}
```

### 修正案

```typescript
const abortController = new AbortController();
let timeoutId: ReturnType<typeof setTimeout> | undefined;
if (resolvedConfig.timeoutMs !== null && resolvedConfig.timeoutMs > 0) {
  timeoutId = setTimeout(() => abortController.abort(), resolvedConfig.timeoutMs);
}

try {
  const messages = query({
    prompt: buildInitialMessage(content, projectContext),
    options: {
      cwd: process.cwd(),
      allowedTools: ["Read", "Grep", "Glob"],
      permissionMode: "bypassPermissions",
      ...maxTurnsOption,
      model: resolvedConfig.model,
      systemPrompt: REQUEST_REVIEW_SYSTEM_PROMPT,
      abortController,
    },
  });

  let lastResult: SDKResultMessage | null = null;
  for await (const message of messages as AsyncGenerator<SDKMessage, void>) {
    if (message.type === "result") lastResult = message as SDKResultMessage;
  }
  // ... rest of handling
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error: Review session failed: ${message}\n`);
  return 1;
} finally {
  if (timeoutId !== undefined) clearTimeout(timeoutId);
}
```

---

## Finding 3 — LOW: query() ループの例外が executeReview 内で未捕捉

### 問題箇所

`executeReview()` の for-await ループに try/catch がない。query() 呼び出し中に例外（ネットワークエラー、AbortError 等）が throw された場合、`specrunner.ts` の top-level catch が受け、`Fatal: <message>` を stderr に出力して exit 1 で終了する。

exit code は design.md の仕様（exit 1）と一致するが、メッセージ prefix が `Fatal:` になり、`Error:` を期待する TC-13 の THEN 記述と形式不一致。

Finding 2 の修正（try/catch ブロック追加）で同時に解消される。

---

## Test Coverage Assessment

| TC # | Priority | Category | Covered? |
|------|----------|----------|----------|
| TC-01 | must | CLI Integration | ✓ (USAGE 文字列に追加済み) |
| TC-02 | must | CLI Integration | ✓ (positional required: true) |
| TC-03–TC-08 | must | E2E | — (tasks.md で省略可と明記) |
| TC-09–TC-13 | must | Error Handling (executeReview) | — (tasks.md で省略可と明記) |
| TC-14 | must | Parse Fallback | ✓ (TC-RR-002, TC-RR-005) |
| TC-15 | must | Code Structure | ✓ (静的確認: StepExecutor 等のインポートなし) |
| TC-16 | must | Type Safety | ✓ (RequestReviewVerdict を独立定義) |
| TC-17 | must | Unit Test | ✓ (TC-RR-001) |
| TC-18 | must | Unit Test | ✓ (TC-RR-003) |
| TC-19 | must | Unit Test | ✓ (TC-RR-006/007/008) |
| TC-20 | must | Unit Test | ✓ (TC-RR-009/010) |
| TC-27 | must | Code Structure | ✓ (ファイル存在・export 確認) |
| TC-28 | must | Documentation | ✓ (delta-spec/cli-commands.md 存在・R-request-review-command 記載) |
| TC-29 | must | Build | ✓ (verification-result: typecheck passed) |
| TC-30 | must | Build | ✓ (verification-result: 146 test files passed) |
| TC-32 | must | Code Structure | ✓ (git diff: request.ts 変更なし) |

tasks.md の省略可判断（TC-03〜TC-13）はスコープとして妥当。

---

## Additional Observations (non-blocking)

- **system prompt の設計**: architect レビュープロセス 6 ステップ、アンチパターン表、verdict 導出ルール、JSON 強制出力指示が request.md の仕様通りに実装されている。
- **parseReviewOutput の多重 JSON ブロック処理**: lastMatch を正規表現ループで更新する方式で「末尾のブロックを使う」を正しく実装している（TC-RR-004 でテスト済み）。
- **フォールバック設計**: JSON parse 失敗時に throw せず needs-discussion を返す実装は design.md と一致している。
- **TC-32 の満足**: `src/core/command/request.ts` に変更なし（diff 確認済み）。
- **delta spec**: R-request-review-command が ADDED として記載されており、要件が spec.md baseline への差分として明示されている。

---

## Verdict Detail

HIGH findings 0 件のため approve ベースだが、Finding 1/2 は config resolution の結果が query() に接続されていないという **設計意図と実装の乖離** であり、次のイテレーションで修正すべき。

Finding 1/2 は agent-runner.ts に実装済みのパターンをそのまま適用するだけで解消できる。Finding 3 は Finding 2 の修正（try/catch 追加）で自動的に解消される。

- **verdict**: needs-fix
