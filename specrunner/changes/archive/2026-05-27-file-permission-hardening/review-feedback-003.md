# Code Review Feedback — file-permission-hardening — iter 3

- **verdict**: approved

## Summary

iter 2 approved 以降、実装・テストともに変更なし。コードは設計通りで要件を全件充足。test-cases.md の must シナリオが全件カバーされており、verification も全フェーズ green（3132 tests passed）。

---

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|

---

## Must Coverage Check

| TC | Priority | Status |
|----|----------|--------|
| TC-01: mode 未指定 → 0o600 | must | ✅ `atomic-write.test.ts` L60-67（実ファイル stat 検証）|
| TC-02: options={} → 0o600 | must | ✅ `atomic-write.test.ts` L73-81 |
| TC-03: 明示 mode 優先 | must | ✅ `atomic-write.test.ts` L87-95（0o644 明示 → 0o644）|
| TC-04: credentials-io.ts 後退なし | must | ✅ TC-03 で明示 mode が機能することを確認（間接カバー）|
| TC-05: config/store.ts 後退なし | must | ✅ 同上 |
| TC-06: O_EXCL `wx` フラグ確認 | must | ✅ `atomic-write.test.ts` L101-123（デフォルト・明示の 2 ケース）|
| TC-07: EEXIST + unlink | must | ✅ `atomic-write.test.ts` L129-144 |
| TC-08: if/else 削除・chmod 常時実行 | must | ✅ 静的確認済み（diff で削除を確認）|
| TC-10: initVerboseLog 0o600 | must | ✅ `verbose-log.test.ts` L215-224（stat.mode & 0o777 検証）|
| TC-12: job-state-store 0o600 | must | ✅ TC-01 の unit カバーで充足 |
| TC-14: typecheck green | must | ✅ verification-result.md 参照 |
| TC-15: test suite green | must | ✅ 3132 tests passed |

---

## Implementation Verification

- `options?.mode ?? 0o600` — デフォルト mode 確定 ✅
- `{ flag: "wx", mode }` 単一 writeFile — O_EXCL 適用・if/else 分岐削除 ✅
- `chmod(filePath, mode)` 常時実行（umask 影響を上書き）✅
- `openSync(currentLogPath, "a", 0o600)` ✅
- credentials-io.ts / config/store.ts の明示指定は変更なし ✅
