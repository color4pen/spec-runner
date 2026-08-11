# Code Review Feedback — detach-start-ack — iteration 1

## 検証した項目

- `git diff main...HEAD --stat` でスコープ確認（30 files、src/ 側 12 ファイル変更）
- `src/core/command/detach.ts` — async `detachSelf` 全体（ack ループ、D1/D2/D3 の実装）
- `src/util/spawn.ts` — `onExit` 追加、既存オプション不変を確認
- `src/util/xdg.ts` — `readDetachLogTail` / `readSidecarPid` の実装
- `src/cli/command-registry.ts` — 両 detach 分岐の `await detachSelf`、USAGE / JOB_RESUME_USAGE 文言
- `src/cli/job-wait.ts:191-194` — "No job found" 直後の hint 行追加
- `src/core/command/__tests__/detach-ack.test.ts` — TC-001〜TC-007, TC-013/014, TC-022/023
- `src/core/command/__tests__/detach-integration.test.ts` — TC-003, TC-020, TC-021
- `src/core/command/__tests__/detach.test.ts` — TC-001/002/003/011 (old) async 更新
- `src/cli/__tests__/detach-flag-cli.test.ts` — mockResolvedValue 化 確認（TC-015）
- `src/cli/__tests__/detach-output-contract.test.ts` — TC-009/010/016 新 pin 確認
- `src/cli/__tests__/job-wait.test.ts` — TC-008 新規追加、既存 it() 無変更確認
- `src/util/__tests__/spawn-background-detach.test.ts` — TC-012 追加のみ、既存 TC-008/009/021/022 無変更確認
- `src/util/__tests__/xdg-read-sidecar-tail.test.ts` — 新規ファイル（changed-line-coverage 用）
- `xdg-detach-log.test.ts` diff — 変更なし（no diff output）
- `verification-result.md` — build/typecheck/test/lint/changed-line-coverage すべて passed (11 204 tests)

## 検証できなかった項目

None — 全受け入れ基準を確認済み。

## Findings 詳細

### [LOW / FIXABLE] 行内コメントが旧契約のまま（command-registry.ts:422）

```
// --detach + --json are mutually exclusive (detach exits immediately, no JSON contract)
```

括弧内の "detach exits immediately" が新契約（登録まで待機）と矛盾している。
公開文言（USAGE 行 84/91/116、JOB_RESUME_USAGE 行 231-233）は正しく更新されており、動作に影響はない。
`job resume` 側（:691）は短いコメントで矛盾なし。
→ 括弧を削除するか "detach waits for registration, no JSON contract" に変更すれば解消。

---

## 受け入れ基準 照合

| 基準 | 状態 | 証拠 |
|---|---|---|
| 親は登録完了まで exit しない（破壊確認込み） | ✅ | TC-001, TC-014 (detach-ack.test.ts) |
| 子が登録前に死亡 → 非 0 exit + stderr に log 内容 + path | ✅ | TC-005 (detach-ack.test.ts) |
| 登録完了時 → guidance + exit 0 | ✅ | TC-002 (detach-ack.test.ts) |
| resume --detach: 残骸 sidecar を ack と誤認しない | ✅ | TC-004 (detach-ack.test.ts) |
| 統合: exit 0 直後の job wait が exit 2 にならない | ✅ | TC-003 (detach-integration.test.ts) |
| job wait "No job found" に detach log hint | ✅ | TC-008 (job-wait.test.ts) |
| detach-flag-cli: mockResolvedValue に更新 | ✅ | :39 と :217 の両サイト確認 |
| detach-output-contract: failure message + 文言変更 pin | ✅ | TC-009/010/016 |
| spawn-background / xdg-detach-log / job-wait 既存 it() 無変更 green | ✅ | diff 確認 + 11 204 passed |
| typecheck && test green | ✅ | verification-result.md |

## 設計判断の実装照合

- **D1 (sidecar pid identity)**: `readSidecarPidFn() === childPid` — resume 残骸 sidecar は childPid ≠ 旧 pid で排除。✓
- **D2 (event-based death gate)**: `proc.on("exit", onExit)` — zombie hang を回避。`isProcessAlive` は使用していない。✓
- **D3 (registration-first ordering)**: ループは登録チェック → 死亡チェックの順。register-then-die は SUCCESS。✓
- **D4 (40 行 tail)**: `readDetachLogTailFn(logFilePath, 40)` — TC-022 で 40 をピン。✓
- **D5 (async detachSelf + DI seams)**: spawn は async 関数内で最初の await 前に同期実行（TC-013 確認）。✓
- **D6 (job wait hint)**: retry count/interval 変更なし。既存 TC-018 は無変更で green。✓
- **D7 (single-source failure text)**: `buildDetachStartFailure` export — TC-010/016 で substring ピン。✓
- **foreground 経路不変**: `isDetachedChild` gate 保持、DETACH_MARKER_ENV / log redirect 無変更。✓
