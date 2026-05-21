# Code Review Feedback — job-cancel-command — iter 2

- **verdict**: needs-fix
- **reviewer**: code-reviewer
- **date**: 2026-05-21

---

## Summary

iter 1 で指摘した 3 件の必須修正 (F-01/F-02/F-03) は全て正しく対処されている。verification は all-green。しかし新たに [major] 1 件を検出したため needs-fix とする。

---

## iter 1 修正確認

| # | 内容 | 確認 |
|---|------|------|
| F-01 | `specrunner job rm` unknown subcommand テスト追加 | ✅ `removed-commands.test.ts` TC-32 として実装済み |
| F-02 | `removed: 0` + `as CancelResult` 除去 | ✅ 該当コードが消えている |
| F-03 | TTY インタラクティブ confirm テスト追加 | ✅ TC-27 として実装済み |

---

## Findings

### F-01 [major] UUID_REGEX が short-prefix lookup を遮断している

**場所**: `src/cli/command-registry.ts` line 299–303

```typescript
if (jobId !== undefined && !UUID_REGEX.test(jobId)) {
  process.stderr.write(`Error: invalid jobId format\n`);
  process.exit(1);
}
```

`UUID_REGEX = /^[a-f0-9-]{36}$/` は 36 文字の完全 UUID のみ受け付ける。短縮プレフィックス (例: `e3fa227e`) は 8 文字のため不一致となり、registry 層でエラーになる。

一方、`runCancel` 内では:
```typescript
resolvedJobId = await JobStateStore.resolveId(jobId!);
```
`resolveId` は `prefix.length < 36` の場合に `startsWith` で全件検索するよう実装されている。しかし registry が先に弾くため、この短縮プレフィックス解決ロジックは到達不能になっている。

**設計との齟齬**: task 4.1 に「resolveJobId (short prefix → full UUID)」と明記されており、短縮プレフィックスは設計意図の機能。`job show` サブコマンドは UUID 検証を持たない (`job show e3fa227e` は動作する) ため、`job cancel` だけが不整合な挙動を示す。

**修正**: registry 側の検証を `UUID_REGEX` から「path traversal を弾く最低限のサニタイズ」に緩める。最も単純な修正:

```typescript
// セキュリティ目的 (path traversal 防止) に絞る; 短縮プレフィックスも許容
const VALID_JOB_ID_CHARS = /^[a-f0-9-]+$/;
if (jobId !== undefined && !VALID_JOB_ID_CHARS.test(jobId)) {
  process.stderr.write(`Error: invalid jobId format\n`);
  process.exit(1);
}
```

または `UUID_REGEX` チェック自体を削除し、不正形式は `resolveId` → `JobNotFound` エラーとして統一的に扱う (`job show` と同じパターン)。

---

### F-02 [info] iter 1 F-04 の stale コメント未修正

**場所**:
1. `tests/unit/cli/specrunner-worktree-guard.test.ts` line 7: ファイルヘッダーに `TC-WG-007: job rm from worktree → NOT guarded` が残存 (実体は `job cancel` をテスト)
2. `tests/unit/core/command/validation-tc.test.ts` line 5: ファイルヘッダーに `TC-49: ... （job rm）` が残存 (実体は `job cancel`)

機能への影響なし。コメントのみ。

---

## 必須修正

| # | 種別 | 内容 |
|---|------|------|
| F-01 | major | UUID_REGEX を緩めて短縮プレフィックスを許容する |
