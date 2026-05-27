# Tasks: token-mask-pattern-expansion

## T-01: MASK_PATTERNS 配列を 3 パターンに置き換え

**File**: `src/logger/stdout.ts`

L141-146 の `MASK_PATTERNS` を以下に置き換える:

```typescript
const MASK_PATTERNS: RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]+/g,
  /\b(gh[oprsu])_[A-Za-z0-9]+/g,
  /\bgithub_pat_[A-Za-z0-9_]+/g,
];
```

変更点:
1. `gho_*`, `ghp_*`, `ghr_*` の 3 パターンを `(gh[oprsu])_*` に統合（`ghs_*`, `ghu_*` を追加）
2. `github_pat_*` パターンを新規追加
3. `sk-ant-*` は変更なし

**注意**: `maskSensitive` 関数は一切変更しない。

**Acceptance**:
- [x] MASK_PATTERNS が 3 要素である
- [x] `/\b(gh[oprsu])_[A-Za-z0-9]+/g` が含まれる
- [x] `/\bgithub_pat_[A-Za-z0-9_]+/g` が含まれる
- [x] `/\bsk-ant-[A-Za-z0-9_-]+/g` が残っている
- [x] `maskSensitive` 関数に差分がない
- [x] `bun run typecheck` が green

---

## T-02: delta spec — cli-commands のマスクパターン列挙を更新

**File**: `specrunner/changes/token-mask-pattern-expansion/specs/cli-commands/spec.md`

baseline `cli-commands` spec の「CLI 出力チャネル規約」Requirement を MODIFIED として delta spec に記述する。マスクパターン列挙に `ghs_` / `ghu_` / `github_pat_` を追加する。

**Acceptance**:
- [x] delta spec が `specrunner/changes/token-mask-pattern-expansion/specs/cli-commands/spec.md` に存在する
- [x] `### Requirement:` header が baseline と完全一致する
- [x] マスクパターン列挙に `ghs_` / `ghu_` / `github_pat_` が含まれる
- [x] Scenario が最低 1 つ含まれる

---

## T-03: 全体検証

**Command**: `bun run typecheck && bun run test`

T-01 完了後に実行。

**Acceptance**:
- [x] typecheck green
- [ ] test green (pre-existing failure: CodeFixerStep.requiresCommit in requires-commit-flags.test.ts — unrelated to this change)

---

## Task Dependencies

```
T-01 ─┐
T-02 ─┴→ T-03
```

T-01 と T-02 は並列可能。T-03 は T-01 に依存。
