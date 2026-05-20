# Code Review Feedback — cli-noun-verb-restructure — iter 1

- **date**: 2026-05-20
- **reviewer**: code-reviewer (agent)
- **verdict**: needs-fix

---

## Summary

全体的な実装品質は高い。worktree guard の `guardedSubcommands` 設計、slug/UUID バリデーション、ADR・README・delta spec の整備はすべて仕様通り。ビルド・型検査・テスト 2415 件すべて green。ただし以下 3 点が fixes required。

---

## Findings

### [major] progress.ts のコマンド参照が旧形式のまま（stale command reference）

**File**: `src/cli/progress.ts:50`

```typescript
process.stdout.write(`\nNext: bun ./bin/specrunner.ts finish ${this.options.slug}\n`);
```

パイプライン完了後にユーザーに表示される次アクションのヒントが `bun ./bin/specrunner.ts finish <slug>` のまま。この変更の主目的は `finish` を `job finish` に移動することであり、旧コマンドは削除済みなので **ユーザーが指示通りに実行しても動かない**。Task 6 の stale string 修正対象だったが見落とされている。

`tests/unit/cli/progress.test.ts:93` も旧形式を期待しており、両方の修正が必要:

```typescript
// src/cli/progress.ts:50
process.stdout.write(`\nNext: specrunner job finish ${this.options.slug}\n`);

// tests/unit/cli/progress.test.ts:93
expect(output).toContain("Next: specrunner job finish my-slug");
```

---

### [minor] TC-33 / TC-34 の明示的なテストカバレッジが欠落

**File**: `tests/unit/cli/removed-commands.test.ts`

`removed-commands.test.ts` は TC-31（ps）, TC-32（rm）, TC-35（request create）, TC-40（managed）を網羅しているが、TC-33（`specrunner resume` → Unknown）と TC-34（`specrunner finish` → Unknown）が欠落。いずれも must-priority TC。

verification-result.md の「56/56 must TCs covered」というカウントは不正確（TC-33/TC-34 は他テストファイルの同番号 TC と混同されたと推察）。

機能自体は正しく動作する（`COMMANDS` に `resume`/`finish` エントリが存在しないため dispatch で弾かれる）が、明示的な regression guard がない。追加すべきテスト:

```typescript
// TC-33
it("specrunner resume → 'Unknown command: resume'", async () => {
  const result = await runMain(["resume"]);
  expect(result).toBe("process.exit(2)");
  expect(stderrOutput).toContain("Unknown command: resume");
});

// TC-34
it("specrunner finish → 'Unknown command: finish'", async () => {
  const result = await runMain(["finish"]);
  expect(result).toBe("process.exit(2)");
  expect(stderrOutput).toContain("Unknown command: finish");
});
```

---

### [info] job show ハンドラに dead code

**File**: `src/cli/command-registry.ts:302-311`

```typescript
handler: async (parsed) => {
  const input = parsed.positional!;
  if (UUID_REGEX.test(input)) {
    await runJobShow(input);  // ← 両 branch が同一
  } else {
    await runJobShow(input);  // ← 意味のない分岐
  }
},
```

UUID/slug の振り分けは `runJobShow` 内で行われており（`job-show.ts:24-45`）、handler 側の if-else は何もしていない。コメントは「UUID validation: if input matches UUID pattern, validate it strictly」と書かれているが実装が追いついていない。以下で十分:

```typescript
handler: async (parsed) => {
  await runJobShow(parsed.positional!);
},
```

---

## Coverage Gap Matrix（must TCs）

| TC | 内容 | テストファイル | 状態 |
|----|------|---------------|------|
| TC-33 | specrunner resume → Unknown | 欠落 | ❌ |
| TC-34 | specrunner finish → Unknown | 欠落 | ❌ |
| TC-01〜07 | worktree guard | specrunner-worktree-guard.test.ts | ✅ |
| TC-08〜20 | request commands | request-new/show/rm.test.ts 等 | ✅ |
| TC-21〜29 | job commands | job-show.test.ts, specrunner-resume-dispatch.test.ts 等 | ✅ |
| TC-31, 32, 35, 40 | removed commands | removed-commands.test.ts | ✅ |
| TC-37〜39 | runtime commands | runtime-tc.test.ts | ✅ |
| TC-41, 43 | help output | help-output-tc.test.ts | ✅ |
| TC-44 | README | readme-tc.test.ts | ✅ |
| TC-45〜51 | validation | validation-tc.test.ts | ✅ |
| TC-52〜55 | delta spec | verification/delta-spec-cli-noun-verb.test.ts | ✅ |
| TC-56, 57 | build + ADR | adr-tc.test.ts | ✅ |

---

## Positive Findings

- `guardedSubcommands` による subcommand dispatch path の worktree guard 漏れ修正は設計通り、テストも網羅的（TC-WG-001〜TC-WG-008）
- `request new/show/rm` の slug validation（`/^[a-z0-9][a-z0-9-]{0,63}$/`、exit 2）は path traversal 防止として適切に実装
- `job rm/finish` の UUID validation（exit 1 + "Error: invalid jobId format"）も一貫
- ADR（`docs/adr/002-cli-noun-verb-restructure.md`）に 5 判断すべて記録済み
- README は新体系の最短フローで書き直し完了
- delta spec 4 capability（cli-commands / cli-finish-command / cli-resume-command / managed-cli-commands）すべて更新済み

---

## Required Fixes

1. `src/cli/progress.ts:50` → `specrunner job finish ${this.options.slug}` に修正
2. `tests/unit/cli/progress.test.ts:93` → 同様に期待値を更新
3. `tests/unit/cli/removed-commands.test.ts` → TC-33（resume）/ TC-34（finish）のテストケースを追加
4. `src/cli/command-registry.ts:302-311` → job show ハンドラの dead code を削除（info レベル、ブロッカーではないが同 PR で直すのが合理的）
