# Code Review Feedback — file-permission-hardening — iter 2

- **verdict**: approved

## Summary

iter 1 で指摘した F-01（テスト未実装）が解消された。`tests/unit/util/atomic-write.test.ts`（新規）と `tests/unit/logger/verbose-log.test.ts`（TC-10 追加）により、test-cases.md の `must` シナリオが全件カバーされている。実装は設計通りで変更なし。verification も全フェーズ green。

---

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| F-01 (iter1) | HIGH | test-coverage | — | **解消済み**。TC-01/02/03/06/07 を `atomic-write.test.ts` に、TC-10 を `verbose-log.test.ts` に実装。 | テスト追加済み | yes |

新規 finding なし。

---

## Must Coverage Check

| TC | Priority | Status |
|----|----------|--------|
| TC-01: mode 未指定 → 0o600 | must | ✅ `atomic-write.test.ts` L60-67 |
| TC-02: options={} → 0o600 | must | ✅ `atomic-write.test.ts` L73-81 |
| TC-03: 明示 mode 優先 | must | ✅ `atomic-write.test.ts` L87-95 |
| TC-04: credentials-io.ts 後退なし | must | ✅ TC-03 で 0o644 明示指定が機能することを確認（間接カバー維持）|
| TC-05: config/store.ts 後退なし | must | ✅ 同上（間接カバー維持）|
| TC-06: O_EXCL `wx` フラグ確認 | must | ✅ `atomic-write.test.ts` L101-123（mode デフォルト・明示の 2 ケース）|
| TC-07: EEXIST + unlink | must | ✅ `atomic-write.test.ts` L129-144 |
| TC-08: if/else 削除・chmod 常時実行 | must | ✅ 実装コードで静的確認済み（if/else 消去、chmod 無条件実行）|
| TC-10: initVerboseLog 0o600 | must | ✅ `verbose-log.test.ts` L215-224 |
| TC-12: job-state-store 0o600 | must | ✅ TC-01 の unit カバーで充足（integration test は optional）|
| TC-14: typecheck green | must | ✅ verification-result.md 参照 |
| TC-15: test suite green | must | ✅ 3132 tests passed |

---

## Implementation Verification

- `options?.mode ?? 0o600` — デフォルト mode 確定 ✅
- `{ flag: "wx", mode }` — O_EXCL 適用・if/else 分岐削除 ✅
- `chmod(filePath, mode)` 常時実行 ✅
- `openSync(currentLogPath, "a", 0o600)` ✅
- credentials-io.ts / config/store.ts の明示指定は変更なし（コードで確認）✅

---

## Positive Notes

- TC-06 を 2 ケース（デフォルト mode / 明示 mode）に分けて `wx` フラグの不変性を確認している点が丁寧
- TC-10 が `stat.mode & 0o777 === 0o600` で実ファイルを検証しており、openSync の引数だけでなく OS レベルの mode を確認している
- iter 1 で LOW・対応不要とした F-02（umask 適用後 mode / chmod で上書き）は引き続き問題なし
