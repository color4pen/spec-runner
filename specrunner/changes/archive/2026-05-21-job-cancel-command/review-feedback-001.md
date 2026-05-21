# Code Review Feedback — job-cancel-command — iter 1

- **verdict**: needs-fix
- **reviewer**: code-reviewer
- **date**: 2026-05-21

---

## Summary

実装品質は全体的に高い。設計意図（audit trail 保持・best-effort cleanup・DI テスタビリティ）は忠実に実現されており、verification も all-green。ただし [must] TCs のうち 2 件が未カバーであるため needs-fix とする。

---

## Findings

### F-01 [major] TC-32 [must] `specrunner job rm <jobId>` が未テスト

**場所**: `tests/unit/cli/removed-commands.test.ts`

`removed-commands.test.ts` の TC-32 は top-level `specrunner rm` を検証しているが、test-cases.md の TC-32 が求める **`specrunner job rm <jobId>` → unknown subcommand エラー** のテストが存在しない。

request の受け入れ基準:
> `specrunner job rm` / `specrunner rm` は unknown subcommand エラーで exit する

top-level `rm` (= test-cases.md TC-33) はカバー済み。`job rm` サブコマンド (= TC-32) が未カバー。`command-registry.ts` から `rm` エントリは削除されているため実挙動は正しいが、リグレッション保護がない。

**修正**: `removed-commands.test.ts` に以下相当のテストを追加する。

```typescript
describe("TC-32: 旧 job rm サブコマンドの削除確認", () => {
  it("specrunner job rm <jobId> → 'Unknown job subcommand: rm' を出力し exit 2 で終了", async () => {
    const result = await runMain(["job", "rm", "some-job-id"]);
    expect(result).toBe("process.exit(2)");
    const stderr = (stderrSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(stderr).toContain("Unknown job subcommand: rm");
  });
});
```

---

### F-02 [minor] `cancelAllTerminated` の非 TTY reject 戻り値に余分な `removed: 0` フィールド

**場所**: `src/core/cancel/runner.ts` line 240–244

```typescript
return {
  exitCode: 1,
  removed: 0,
  message: "Non-interactive mode requires --yes to bulk-delete jobs.",
} as CancelResult;
```

`CancelResult` に `removed` フィールドは存在しない。`as CancelResult` は TypeScript の excess property check を抑圧するための型アサーションであり、デッドコードが残る。`removed: 0` は不要。

**修正**: `removed: 0` を削除し `as CancelResult` キャストを除去する。

```typescript
return {
  exitCode: 1,
  message: "Non-interactive mode requires --yes to bulk-delete jobs.",
};
```

---

### F-03 [minor] TC-27 [must] TTY インタラクティブ確認パスが未テスト

**場所**: `tests/unit/core/cancel/runner.test.ts` — `cancelAllTerminated` section

test-cases.md TC-27 [must]:
> TTY 環境, `--yes` 未指定, failed 1 件で y 入力 → 削除対象一覧表示 + 確認後削除 + exit 0

現状のテストは非 TTY reject (TC-26) と `--yes` バイパス (TC-25) のみ。TTY+y 入力パスはカバーされていない。

**修正**: `Readable` ストリームの `isTTY = true` を設定して 'y\n' を push するテストを追加する。

```typescript
it("TTY + y 入力で削除される", async () => {
  await makeJob("failed");
  const { Readable } = await import("node:stream");
  const ttyStdin = new Readable({ read() {} }) as NodeJS.ReadStream;
  (ttyStdin as unknown as { isTTY: boolean }).isTTY = true;

  const resultPromise = cancelAllTerminated({ yes: false, stdin: ttyStdin });
  ttyStdin.push("y\n");
  ttyStdin.push(null);
  const result = await resultPromise;

  expect(result.exitCode).toBe(0);
});
```

---

### F-04 [info] stale コメントが 2 箇所残存

**場所**:
1. `tests/unit/cli/specrunner-worktree-guard.test.ts` line 10: `TC-WG-007: job rm from worktree → NOT guarded` → 実体は `job cancel` をテスト
2. `tests/unit/core/command/validation-tc.test.ts` line 5: `TC-49: jobId validation — UUID 形式でない jobId の拒否（job rm）` → 実体は `job cancel`

機能への影響なし。次回 pass でコメントのみ修正可。

---

### F-05 [info] `isAlive` 本番実装はスロー可能、モックは `false` 返却

**場所**: `src/cli/cancel.ts` lines 92–95

```typescript
isAlive: (pid) => {
  process.kill(pid, 0);
  return true;
},
```

`process.kill(pid, 0)` はプロセスが存在しない場合 ESRCH をスローする。型シグネチャ `(pid: number) => boolean` とは異なり `false` を返さずスローする。`gracefulKill` の try/catch がこれを正しく処理しているため動作上のバグはない。ただしテストモック (`vi.fn().mockReturnValue(false)`) と本番挙動が非対称であることは認識しておく価値がある。

修正は任意（コメント追加 or 実装を `try/catch` で包んで `false` 返却に統一）。

---

## 必須修正

| # | 種別 | 内容 |
|---|------|------|
| F-01 | major | `specrunner job rm` の unknown subcommand テスト追加 |
| F-02 | minor | `removed: 0` の余分フィールドと `as CancelResult` 除去 |
| F-03 | minor | TTY インタラクティブ confirm テスト追加 |
