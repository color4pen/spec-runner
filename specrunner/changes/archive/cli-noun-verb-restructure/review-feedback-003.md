# Code Review Feedback — cli-noun-verb-restructure — iter 3

- **date**: 2026-05-20
- **reviewer**: code-reviewer (agent)
- **verdict**: needs-fix

---

## Summary

iter 2 の medium 指摘（TC-36 テスト欠落）は正しく修正済み。`removed-commands.test.ts` に TC-36 が追加され、`specrunner request list` → `"Unknown request subcommand: list"` の検証が完了した。ビルド・型検査・テスト全件（2418 tests / 221 files）green。

ただし iter 2 の [low] 指摘（`job show` ハンドラの dead code）が未修正のまま残っている。

---

## Findings

### [low] `job show` ハンドラの dead code が未修正（iter 2 持ち越し）

**File**: `src/cli/command-registry.ts` L302–311

iter 2 で修正を要求したが、iter 3 で対応されていない。

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

両分岐が同一。コメントの「validate it strictly」は実行されていない（UUID/slug 分岐は `job-show.ts` 内の `runJobShow` が担う）。意図と実装が乖離したコメントが残る。

**修正**:

```typescript
handler: async (parsed) => {
  await runJobShow(parsed.positional!);
},
```

---

## Confirmed Fixes from iter 2

- `tests/unit/cli/removed-commands.test.ts` に TC-36（`specrunner request list` → `Unknown request subcommand: list`）を追加済み ✅
- 2418 tests / 221 files — 全件 green ✅
- typecheck — clean ✅

---

## Positive Observations

- iter 1〜2 の修正（`progress.ts` stale command reference、TC-36 test 追加）が正しく積み上げられている
- worktree guard（TC-WG-001〜008）・slug/UUID validation・ADR・README・delta spec はすべて仕様通り（変動なし）
