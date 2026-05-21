# Code Review Feedback — cli-noun-verb-restructure — iter 2

- **date**: 2026-05-20
- **reviewer**: code-reviewer (agent)
- **verdict**: needs-fix

---

## Summary

iter 1 の major 指摘（`progress.ts` stale command reference）は正しく修正済み。実装全体の品質は高く、worktree guard / slug-UUID validation / ADR / README / delta spec はすべて仕様通り。ビルド・型検査・テスト全件 green。ただし以下 2 点が要修正。

---

## Findings

### [medium] TC-36 が未テスト — カバレッジ計測が false positive を返している

**File**: `tests/unit/cli/removed-commands.test.ts`（TC-36 が欠落）

`test-cases.md` TC-36 は must 優先度：

```
WHEN:  `specrunner request list` を実行する
THEN:  "Unknown request subcommand: list" のようなメッセージが出力される
```

この挙動を検証するテストが `removed-commands.test.ts` に存在しない。同ファイルは TC-35（`request create`）まで収録しているが TC-36 が欠落している。

**false positive の原因**: `ps-filter.test.ts` が `// TC-36: 既存の ps --active 動作が変わらない` という別のテストで TC-36 ラベルを使用しており、カバレッジチェッカーがこれを test-cases.md の TC-36 と同一視して「56/56 covered」を報告している。実際は 55/56。

**修正**: `removed-commands.test.ts` に以下を追加する。

```typescript
// TC-36: 旧 request list コマンドの削除確認
describe("TC-36: 旧 request list コマンドの削除確認", () => {
  it("specrunner request list → 'Unknown request subcommand: list' を出力し exit 2 で終了", async () => {
    const result = await runMain(["request", "list"]);

    expect(result).toBe("process.exit(2)");
    const stderr = (stderrSpy.mock.calls as unknown[][]).map((c) => String(c[0])).join("");
    expect(stderr).toContain("Unknown request subcommand: list");
  });
});
```

---

### [low] `job show` ハンドラに dead code（if/else 両分岐が同一）

**File**: `src/cli/command-registry.ts` L303–311

```typescript
handler: async (parsed) => {
  const input = parsed.positional!;
  // UUID validation: if input matches UUID pattern, validate it strictly.
  // Non-UUID inputs are treated as slugs (no validation error).
  if (UUID_REGEX.test(input)) {
    await runJobShow(input);   // ← 同じ
  } else {
    await runJobShow(input);   // ← 同じ
  }
},
```

if/else 両分岐が `await runJobShow(input)` で同一。コメントの「validate strictly」は実行されていない（実際の UUID/slug 分岐ロジックは `job-show.ts` 内の `runJobShow` が担っている）。意図と実装が乖離したコメントが残るリスクがある。

**修正**: if/else を削除してフラットに書く。

```typescript
handler: async (parsed) => {
  await runJobShow(parsed.positional!);
},
```

---

## Confirmed Fixes from iter 1

- `src/cli/progress.ts:50` の `specrunner finish` → `specrunner job finish` 修正済み ✅
- `tests/unit/cli/progress.test.ts:93` の期待値も `specrunner job finish` に更新済み ✅

---

## Positive Observations

- worktree guard（TC-WG-001〜008）: 実装・テストともに正確
- slug validation（SLUG_REGEX）と UUID validation（UUID_REGEX）: `request-new/show/rm` および `job rm / job finish --job` で一貫して適用済み
- `request validate` / `request review` の slug 解決ロジック: file path 優先 → slug fallback の順序が正しい
- `managed` → `runtime` rename: key 変更のみで handler は再利用、最小変更
- ADR 002: 5 つの判断（noun-verb / 責務境界 / run alias / runtime rename / guardedSubcommands）すべて記録済み
- README: `init → login → request new → job start → job ls → job finish` の最短フロー記述済み
- delta spec 4 capabilities（cli-commands / cli-finish-command / cli-resume-command / managed-cli-commands）: 更新済み
