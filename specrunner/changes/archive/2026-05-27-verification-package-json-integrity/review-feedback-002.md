# Code Review Feedback — verification-package-json-integrity — iter 2

- **verdict**: approved
- **reviewer**: code-review agent
- **date**: 2026-05-27

---

## Summary

iter 1 の required fixes（HIGH×1、MEDIUM×2）がすべて解消されている。実装・テスト・型チェック・lint すべて通過。`must` 優先度テストケース（TC-01〜TC-11）が完全にカバーされている。

---

## iter 1 fixes 確認

| # | iter 1 Severity | Description | Status |
|---|-----------------|-------------|--------|
| 1 | HIGH | `code-fixer.ts` scope creep（requiresCommit 変更）revert | ✓ 解消。diff に `code-fixer.ts` なし、pre-existing 失敗テストが1件のみ残留（本タスクと無関係） |
| 2 | MEDIUM | TC-10（dependencies 変更・scripts 不変）テスト追加 | ✓ TC-INT-10 が `runner-integrity.test.ts` に追加済み |
| 3 | MEDIUM | TC-11（VerificationStep.run の baseBranch 配線）テスト追加 | ✓ `verification-step.test.ts` 新規追加、2ケース通過 |
| 4 | LOW | errorCode JSDoc 更新（iter 1 で Fix: no） | 未更新（許容範囲）。下記 Findings #1 参照 |

---

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | Documentation | `runner.ts` L36 | `VerificationResult.errorCode` の JSDoc が旧記述（"all phases were skipped" のみ）のまま。`PACKAGE_JSON_SCRIPTS_TAMPERED` のケースが未反映。iter 1 から持ち越し、Fix: no とされていたため approve の障害にはならない | JSDoc を「`VERIFICATION_NO_RUNNABLE_PHASES` または `PACKAGE_JSON_SCRIPTS_TAMPERED` 時に設定」と更新する | no |
| 2 | LOW | Style | `runner.ts` `checkPackageJsonScriptsIntegrity` | `git show` の spawn で `stderr` を消費していない。既存の `spawnScript` パターン（stderr を Buffer で収集）と非対称。`git show` の stderr は短いので実用上問題ないが、パターン統一の観点で次 request 以降に検討余地あり | `spawnScript` と同様に `stderr` を Buffer で収集する listener を追加する | no |

---

## Test Coverage

| TC | Priority | Covered by |
|----|----------|-----------|
| TC-01 scripts unchanged | must | TC-INT-02 ✓ |
| TC-02 scripts tampered → failed | must | TC-INT-01 ✓ |
| TC-03 verification-result.md に diff 記録 | must | TC-INT-08 ✓ |
| TC-04 custom commands path → no check | must | TC-INT-07 ✓ |
| TC-05 baseBranch undefined → skip | must | TC-INT-06 ✓ |
| TC-06 git show 失敗 → skip | must | TC-INT-03 ✓ |
| TC-07 worktree package.json 不在 → skip | must | TC-INT-09 ✓ |
| TC-08 両方 scripts undefined → 差分なし | must | TC-INT-04 ✓ |
| TC-09 キー順序違い → 正規化 → 差分なし | must | TC-INT-05 ✓ |
| TC-10 dependencies 変更・scripts 不変 | must | TC-INT-10 ✓ |
| TC-11 baseBranch 配線 | must | verification-step.test.ts ✓ |
| TC-12 JSON.parse 失敗 → skip | should | 未テスト（should のため許容） |

---

## Positive Notes

- セキュリティ核心ロジック（phase fallback path のみ integrity check、custom commands path は対象外）が仕様通りに実装されている。
- `normalize = (s) => JSON.stringify(Object.fromEntries(Object.entries(s).sort()))` によるキー順序正規化が正確。
- baseBranch が falsy の場合に git show を呼ばない guard (`if (baseBranch)`) が正しく機能。
- `must` 優先度テスト 11 件すべて通過。全体テスト 3188 件通過（既存 1 件失敗は本タスクと無関係）。
- 型チェック・lint エラーなし。
