# Code Review Feedback — file-permission-hardening — iter 5

- **verdict**: approved

## Summary

実装・テストともに設計通り。全 must シナリオをカバーし、verification も全フェーズ green（3132 tests passed）。iter 4 承認以降、実装に変更なし。独立レビューとして同じ結論。

---

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|

（指摘なし）

---

## Must Coverage Check

| TC | Priority | Status |
|----|----------|--------|
| TC-01: mode 未指定 → 0o600 | must | ✅ `atomic-write.test.ts` L60-67（実ファイル stat 検証）|
| TC-02: options={} → 0o600 | must | ✅ `atomic-write.test.ts` L73-81 |
| TC-03: 明示 mode 優先 | must | ✅ `atomic-write.test.ts` L87-95（0o644 明示 → 0o644）|
| TC-04: credentials-io.ts 後退なし | must | ✅ TC-03 で明示 mode の優先動作を確認 + `{ mode: CREDENTIALS_MODE }` がコード上に存在 |
| TC-05: config/store.ts 後退なし | must | ✅ 同上（`{ mode: CONFIG_MODE }` 存在）|
| TC-06: O_EXCL `wx` フラグ確認 | must | ✅ `atomic-write.test.ts` L101-123（デフォルト・明示の 2 ケース）|
| TC-07: EEXIST + unlink | must | ✅ `atomic-write.test.ts` L129-144 |
| TC-08: if/else 削除・chmod 常時実行 | must | ✅ 実装コード確認（単一 writeFile、chmod 常時呼び出し）|
| TC-10: initVerboseLog 0o600 | must | ✅ `verbose-log.test.ts` L215-224（stat.mode & 0o777 検証）|
| TC-12: job-state-store 0o600 | must | ✅ TC-01 の unit カバーで充足（job-state-store は mode 未指定で atomicWriteJson を呼び出す）|
| TC-14: typecheck green | must | ✅ verification-result.md（exit code 0）|
| TC-15: test suite green | must | ✅ 3132 tests passed |

---

## Implementation Verification

- `options?.mode ?? 0o600` — デフォルト mode 確定 ✅
- `{ flag: "wx", mode }` 単一 writeFile — O_EXCL 適用・if/else 分岐削除 ✅
- `chmod(filePath, mode)` 常時実行（umask 影響を上書き）✅
- `openSync(currentLogPath, "a", 0o600)` ✅
- `credentials-io.ts` / `config/store.ts` の明示指定は変更なし ✅
- スコープ外ファイル（session-log-writer.ts, pipeline-logger.ts）は未変更 ✅
