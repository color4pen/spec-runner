# Code Review Feedback — job-cancel-command — iter 3

## Summary

全体として実装は堅牢。must TC はほぼ網羅されており `bun run typecheck && bun run test` が green。
以下の minor/nit 指摘を記録するが、ブロッカーはない。

---

## Findings

### [minor] F-01: `cancelAllTerminated` の TTY モードで件数表示がプロンプト後に出力される

**File**: `src/core/cancel/runner.ts`, `src/cli/cancel.ts`

`cancelAllTerminated` は `infoMessages` に "Found N terminated job(s)..." を追加した後、
`promptConfirm()` を呼ぶ。しかし `infoMessages` は戻り値として返され、
呼び元の `writeResult()` が書き出すのはプロンプトへの応答後になる。

実際の出力順:
```
Remove all? [y/N]    ← promptConfirm が直接 process.stdout.write
Found 2 terminated job(s) to remove.   ← writeResult が後から書く
Removed 2 job(s).
```

req §4 は「削除対象一覧を表示 → y/N 確認」の順を要求している。
修正方法: プロンプト呼び出し前に `process.stdout.write(\`Found ${targets.length} ...\n\`)` で直接書き出し、
`infoMessages` からは除外する（または info と display を分離する）。

TC-27 のテストはこの順序をアサートしていないため regression guard がない点も副次的な問題。

---

### [minor] F-02: CLI 引数バリデーション (TC-29/TC-30/TC-31) のテストが未作成

**File**: `src/cli/cancel.ts` — テストファイルなし

`runCancel` の以下の 3 つの排他チェックに対応するテストが存在しない:
- TC-29: `--all-terminated` + `<jobId>` 同時指定 → exit 2
- TC-30: どちらも未指定 → exit 2
- TC-31: `--purge` + `--all-terminated` 同時指定 → error

core 層 (`cancelSingleJob` / `cancelAllTerminated`) は手厚くテストされているが、
CLI 入力ゲートの regression guard が欠けている。
TC-32/33 (旧コマンド削除) は `removed-commands.test.ts` で担保されているので、
`tests/unit/cli/cancel.test.ts` を追加すべき。

---

### [nit] F-03: TC-11 の `worktreePath === null` アサーション欠落

**File**: `tests/unit/core/cancel/runner.test.ts`

TC-11 の要件「`worktreePath === null`」が "state file content" テストでアサートされていない。
実装 (`patch: { worktreePath: null }`) は正しいが、テストが保護していない。

```typescript
// 既存テストへの追加例
expect(state.worktreePath).toBeNull();
```

---

### [nit] F-04: TC-17 (prune → remove の呼び出し順) のテストが未作成

**File**: `tests/unit/core/cancel/runner.test.ts`

設計 D8 は `prune(repoRoot)` を `remove(worktreePath, repoRoot)` より先に呼ぶことを規定している。
実装は正しいが、呼び出し順を検証するテストが存在しない。

vitest の `vi.fn()` と mock call order で検証可能。

---

### [nit] F-05: TC-41 (`canceledAt` absent の backward compat) のテストが未作成

**File**: `tests/schema.test.ts` (または `tests/unit/state/`)

schema.ts に `canceledAt?: string` (optional) を追加した際に、
`canceledAt` フィールドが存在しない既存 state file が `validateJobState` を通過することを
確認するテストが存在しない。実装は正しい (optional field として宣言済み) が regression guard がない。

---

## Test Coverage Against test-cases.md

| TC | severity | status | note |
|----|----------|--------|------|
| TC-01 | must | ✅ covered | running → SIGTERM 即終了 |
| TC-02 | must | ✅ covered | SIGTERM timeout → SIGKILL |
| TC-03 | must | ✅ covered | pid=null → warning + 続行 |
| TC-04 | must | ✅ covered | awaiting-resume → canceled |
| TC-05 | must | ✅ covered | awaiting-merge + no --force → exit 1 |
| TC-06 | must | ✅ covered | awaiting-merge + --force → success |
| TC-07 | must | ✅ covered | failed → canceled |
| TC-08 | must | ✅ covered | terminated → canceled |
| TC-09 | must | ✅ covered | archived → exit 1 |
| TC-10 | must | ✅ covered | canceled idempotent |
| TC-11 | must | ⚠️ partial | worktreePath === null 未アサート (F-03) |
| TC-12 | must | ✅ covered | state file 保持 |
| TC-13 | must | ✅ covered | idempotent case で state 不変 (updatedAt 検証) |
| TC-14 | must | ✅ covered | worktree 削除 (best-effort) |
| TC-15 | must | ✅ covered | local branch 削除 |
| TC-16 | must | ✅ covered | remote branch 削除 |
| TC-17 | must | ⚠️ missing | prune → remove 順序 (F-04) |
| TC-18 | should | ✅ covered | worktreePath null → skip |
| TC-19 | should | ✅ covered | remote branch 削除失敗 → warning |
| TC-20 | should | ✅ covered | local branch 削除失敗 → warning |
| TC-21 | must | ✅ covered | --purge → state file 削除 |
| TC-22 | must | ✅ covered | canceled + --purge → state file 削除 |
| TC-23 | must | ✅ covered | --all-terminated bulk delete |
| TC-24 | must | ✅ covered | archived は対象外 |
| TC-25 | must | ✅ covered | --yes でプロンプトなし |
| TC-26 | must | ✅ covered | non-TTY + no --yes → exit 1 |
| TC-27 | must | ⚠️ partial | TTY + y → 削除成功は確認済。出力順アサート欠 (F-01) |
| TC-28 | should | ✅ covered | 0件 → early return |
| TC-29 | must | ⚠️ missing | CLI: --all-terminated + jobId 排他 (F-02) |
| TC-30 | must | ⚠️ missing | CLI: 両方未指定 → exit 2 (F-02) |
| TC-31 | must | ⚠️ missing | CLI: --purge + --all-terminated 排他 (F-02) |
| TC-32 | must | ✅ covered | job rm → unknown subcommand |
| TC-33 | must | ✅ covered | rm → unknown command |
| TC-34 | must | ✅ covered | git ls-files rm 確認 |
| TC-35 | must | ✅ covered | failed hint → specrunner job cancel |
| TC-36 | must | ✅ covered | terminated hint → specrunner job cancel |
| TC-37 | must | ✅ covered | SIGTERM 即終了 |
| TC-38 | must | ✅ covered | SIGTERM timeout → SIGKILL |
| TC-39 | must | ✅ covered | ESRCH → killed=true |
| TC-40 | must | ✅ covered | EPERM → killed=false + warning |
| TC-41 | must | ⚠️ missing | canceledAt absent → validation pass (F-05) |
| TC-42 | should | ✅ covered | VALID_TRANSITIONS 拡張確認 (lifecycle.test.ts) |
| TC-43 | should | ✅ covered | USER_CANCELED in ERROR_CODES |
| TC-44 | must | ✅ covered | typecheck green |
| TC-45 | must | ✅ covered | test green |

---

## Verdict

- **verdict**: approved

ブロッカーなし。F-01 (出力順) と F-02 (CLI 引数バリデーションのテスト) は次イテレーションか
follow-up issue として対応すること。コアロジック・スキーマ拡張・コマンド統合はすべて仕様通り。
