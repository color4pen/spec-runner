# Regression Gate Result — detached-run-lifecycle / Iteration 1

## Evidence Summary

Checked: 11 / 11 findings. All confirmed fixed.

---

## Finding Verification

### F-01 [MEDIUM] job wait: 起動直後の race condition — slug not found で exit 2 を誤報する
**Status: FIXED**

`src/cli/job-wait.ts:181-188` に `notFoundRetryCount` / `notFoundRetryIntervalMs` を用いた retry ループが実装されている。
`makeDefaultDeps` (line 141-143) で `notFoundRetryCount: 5`, `notFoundRetryIntervalMs: 2000` がデフォルト値として設定されている。
`spec.md:138-141` および `tasks.md T-06 AC` にも 2 秒 × 5 回のリトライ要件が明記されている。

### F-02 [LOW] D5 parent slug 解決: parseRequestMdRaw 後の SLUG_REGEX 検証が未言及
**Status: FIXED**

`src/cli/command-registry.ts:333-368` の `resolveSlugForDetach` 関数が内部で SLUG_REGEX を 3 箇所（line 335, 345, 359）で検証している。slug が SLUG_REGEX を満たさない場合は null を返し、呼び出し元 (line 546-549) が GENERAL_ERROR で非ゼロ終了する。`tasks.md T-05 AC` にも明記済み。

### F-03 [LOW] T-01 / T-02: detach log ファイルのパーミッション（0o600）が未指定
**Status: FIXED**

`src/util/spawn.ts:107` に `openSync(opts.logFilePath, "a", 0o600)` が実装されている。`tasks.md T-01 AC`（line 31）および `T-02 AC`（line 48）にも 0o600 モードの要件が明記されている。

### F-04 [LOW] job wait: pid-present-then-dead パスで disk status が running のとき挙動が未定義
**Status: FIXED**

`spec.md:118-124` にシナリオ「プロセス死亡後に disk status が running のままなら awaiting-resume として扱う」が追加されている。
`src/cli/job-wait.ts:236-238` に `if (finalStatus === "running") { finalStatus = "awaiting-resume"; }` の実装が存在する。

### F-05 [HIGH] emitForegroundNotice が本番コードから呼ばれていない — T-04 AC 未充足
**Status: FIXED**

`src/core/command/runner.ts:46` で import、`src/core/command/runner.ts:121` で `emitForegroundNotice(process.env as Record<string, string | undefined>)` が呼ばれている。コメント（line 118-120）も正しく統合理由を説明している。

### F-06 [MEDIUM] job wait に worktree guard がない — T-05 AC 逸脱
**Status: FIXED**

`src/cli/job-wait.ts:166-173` に `detectSpecrunnerWorktree(repoRoot)` による guard が実装されている。worktree 内なら `logError` + `stderrWrite` で hint を出し `return 2` する。job show / job ls と同じ様式。

### F-07 [MEDIUM] makeDefaultDeps が includeArchived: true なしで list するため archived 済み slug は解決できない
**Status: FIXED**

`src/cli/job-wait.ts:127` が `JobStateStore.list(root, { includeArchived: true })` を呼んでいる。archived job も loadState で解決できる。

### F-08 [LOW] SpawnBackgroundOptions に [key: string]: unknown index signature が付いており TypeScript の型チェックが弱まる
**Status: FIXED**

`src/util/spawn.ts:46-68` の `SpawnBackgroundOptions` interface に index signature は存在しない。フィールドは `cwd`, `env`, `onError`, `detached`, `logFilePath`, `rawEnv` のみで型安全性が保たれている。

### F-09 [LOW] TC-011 sabotage: settledEarly は到達不能コード（misleading）
**Status: FIXED**

`src/cli/__tests__/job-wait.test.ts:197-243` の TC-011 に `settledEarly` 変数は存在しない。コメント（line 206-210）が「settledEarly-style assertions on tickCount inside sleep are always false and not meaningful here」と明記し、実効的な sabotage teeth は `isProcessAlive.mock.calls.length >= 1`（line 239）が担っている。

### F-10 [LOW] TC-027 quiet mode テストに実効的アサーションなし
**Status: FIXED**

`src/cli/__tests__/detach-output-contract.test.ts:133-146` の TC-027 に `expect(vi.mocked(logInfo)).toHaveBeenCalled()` アサーションが追加されている。`isLevelEnabled` を false に mock した状態で `emitForegroundNotice` が `logInfo` を呼ぶことを検証する実効的なテストになっている。

### F-11 [LOW] SpawnBackgroundOptions の index signature が型安全性を弱める（iter1 F-004 引き継ぎ）
**Status: FIXED**

F-08 と同一の確認。`src/util/spawn.ts:46-68` に index signature なし。F-08 参照。
