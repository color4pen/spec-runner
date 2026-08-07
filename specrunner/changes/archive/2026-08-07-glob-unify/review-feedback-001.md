# Code Review Feedback — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

**差分スコープ確認**
- `git diff main...HEAD --stat` で変更ファイルを確認（src/ 側: scope.ts, activation.ts, main-checkout-guard.ts, glob-match.ts の削除, util/glob-match.ts, テスト群）

**受け入れ基準 1: 実装が 1 つだけ**
- `src/util/glob-match.ts` を読了。`globMatch` (L17) と `matchesGlob` (L77) の 2 関数があるが、`matchesGlob` は `return globMatch(filePath, pattern);` の 1 行委譲のみ。regex 化関数は `matchRegex`（内部）と `escapeRegex`（内部）の 1 系統だけ存在する ✓
- `src/core/reviewers/glob-match.ts` が削除されていることを `ls` で確認 ✓

**受け入れ基準 2: `matchGlob` grep 0 件 / `matchesGlob` は委譲のみ**
- `grep -rn '\bmatchGlob\b' src/ tests/` → 0 件 ✓
- `grep -c 'function matchesGlob' src/util/glob-match.ts` → 1 ✓

**受け入れ基準 3: 引数順 `(file, pattern)` 統一**
- `src/core/pipeline/scope.ts` L67: `globMatch(file, pattern)` ✓
- `src/core/reviewers/activation.ts` L87: `globMatch(file, pattern)` ✓
- `src/core/step/main-checkout-guard.ts` L76: `globMatch(filePath, g)` ✓
- Import パスは 3 ファイルとも `../../util/glob-match.js` ✓

**受け入れ基準 4: 意味論固定テスト**
- `tests/unit/util/glob-match.test.ts` に以下の describe block を確認:
  - `TC-007/TC-008: **/segment non-empty semantics` — `a//b` が false、`a/x/b` が true ✓
  - `TC-009: production pattern representative cases` — `src/**`, `vendor/**`, `**/*.test.*`, 完全一致各ケース ✓
  - `TC-014/TC-015: injection safety` — `.` のエスケープ、`()` のエスケープ ✓
  - `TC-006/TC-016: matchesGlob delegation (? wildcard)` — `matchesGlob` 経由で `?` が wildcard として動作 ✓

**受け入れ基準 5: 既存テスト無改変で green**
- `tests/unit/util/glob-match.test.ts` の既存 describe blocks（single-segment, double-star, leading **/, literal, ?, negative, edge cases）は無改変 ✓
- `src/core/reviewers/__tests__/glob-match.test.ts` が削除されていることを `ls` で確認 ✓
- `bun run test` → 725 test files passed, 10657 tests passed / 1 skipped ✓

**受け入れ基準 6: typecheck && test green**
- `bun run typecheck` → exit 0 ✓
- `bun run test` → exit 0 (上記) ✓
- verification-result.md にも build/typecheck/test/lint/changed-line-coverage 全 passed 記録あり ✓

**注記コメント削除（TC-012）**
- `src/util/glob-match.ts` L71-79 付近の「2 実装は独立・統一はスコープ外」コメントブロック・`// ---` 区切りが削除されていることを読了で確認 ✓

**doc comment 更新（TC-017）**
- `src/core/step/main-checkout-guard.ts` L12 の doc comment が `step → util: globMatch` に更新されていることを確認 ✓

## 検証できなかった項目

None

## Findings 詳細

None — 全受け入れ基準を機械的に確認し、不一致は見当たらなかった。
