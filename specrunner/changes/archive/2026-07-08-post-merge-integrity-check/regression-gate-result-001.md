# Regression Gate Result — Iteration 001

- **verdict**: approved
- **findings**: []

## Verification Summary

All 6 findings from the ledger are fixed. All 66 relevant tests pass.

```
Test Files  3 passed (3)
     Tests  66 passed (66)
```

## Finding-by-Finding Verification

### [HIGH] TC-001〜TC-008: archive.postMergeVerify config schema バリデーション

**Status: FIXED**

`tests/unit/config/schema.test.ts` の `"validateConfig: archive.postMergeVerify (TC-001–TC-008)"` describe ブロック（lines 241–317）に 8 シナリオすべて実装済み:

- TC-001: absent → valid
- TC-002: empty array → valid
- TC-003: string command → valid
- TC-004: object `{ name, run }` → valid
- TC-005: not an array → `CONFIG_INVALID`
- TC-006: empty string element → `CONFIG_INVALID` with `archive.postMergeVerify[0]` path
- TC-007: object without `run` field → `CONFIG_INVALID`
- TC-008: object with empty `run` string → `CONFIG_INVALID` with `archive.postMergeVerify[0].run` path

### [HIGH] TC-015: merge-during-wait 経路で integrity check 非起動

**Status: FIXED**

`src/core/archive/__tests__/merge-then-archive.test.ts` lines 345–375 に TC-015 実装済み。

`getPullRequest` を 1 回目 OPEN → 2 回目 MERGED と序列モックし、`postMergeVerify` 設定済みで実行したとき:
- `result.exitCode === 0`
- `runPostMergeIntegrityCheck` が呼ばれていないこと
- `runPostMergeCleanup` は呼ばれること

の 3 点をアサート。

### [LOW] TC-023/TC-024: failedStep・resumeCommand の exact 値アサーション

**Status: FIXED**

`src/core/archive/__tests__/post-merge-integrity.test.ts` lines 164–167:

```ts
// TC-023: failedStep exact value
expect(escalation).toContain(`Failed Step:       post-merge integrity check (${FAKE_BASE})`);
// TC-024: resumeCommand exact value
expect(escalation).toContain(`Resume Command:    specrunner job archive --with-merge ${FAKE_SLUG}`);
```

`FAKE_BASE = "main"`, `FAKE_SLUG = "my-job"` により exact 値が固定されている。

### [LOW] TC-026: git worktree add 失敗 → warn + `{ ok: true }`

**Status: FIXED**

lines 253–281 に実装済み。`git worktree add` を exit code 1 で失敗させ:
- `result === { ok: true }`
- `stderrWrite` に `"NOT verified"` を含む警告が出力されること
- `sh -c` コマンドが一切 spawn されないこと

をアサート。

### [LOW] TC-027: git rev-parse 失敗 → warn + `{ ok: true }`

**Status: FIXED**

lines 283–310 に実装済み。`git rev-parse` を exit code 1 で失敗させ:
- `result === { ok: true }`
- `stderrWrite` に `"NOT verified"` を含む警告が出力されること
- `git worktree add` および `sh -c` が spawn されないこと

をアサート。

## Regressions

なし。
