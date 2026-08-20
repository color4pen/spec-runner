# Regression Gate Result — Iteration 1

## Evidence

Checked each finding against the current files in the branch.

### Finding 1 (LOW): T-03 AC に TC-004 が含まれていない — tasks.md

- **Status**: FIXED
- tasks.md T-03 Acceptance Criteria line 62 に TC-004 への言及が追加済み:
  > "corrupted journal の checkpoint で `policy.verify()` が呼ばれる前に `journal-corrupted` で throw することがテストで確認できる（generic → policy の実行順序 pin、TC-004）"

### Finding 2 (MEDIUM): spec.md の generic check 列挙に request.md が含まれており tasks.md と矛盾する — spec.md:28

- **Status**: FIXED
- spec.md lines 27–31: MUST 文は "journal / projection integrity, counter reversal, profile self-consistency, identity" のみを列挙。
  request.md については Note として "(d) request.md presence is verified after `policy.verify()` and before identity (e)" と補足されており、tasks.md T-02 の記述と一致する。矛盾は解消済み。

### Finding 3 (LOW): T-03 Acceptance Criteria に TC-004 が記載されておらず自己完結しない — tasks.md:59

- **Status**: FIXED
- Finding 1 と同一箇所。tasks.md T-03 AC に TC-004 pin が追加されており自己完結する。

### Finding 4 (LOW): spec-fixer-deferred コメントが陳腐化 — design.md

- **Status**: FIXED
- design.md に該当 HTML コメントは存在しない（ファイル末尾は "Open Questions / なし。" で終了）。

## Summary

| Finding | Severity | Status |
|---------|----------|--------|
| T-03 AC に TC-004 欠落 (Finding 1) | LOW | FIXED |
| spec.md と tasks.md の矛盾 (Finding 2) | MEDIUM | FIXED |
| T-03 AC に TC-004 欠落・自己完結しない (Finding 3) | LOW | FIXED |
| design.md の陳腐化コメント (Finding 4) | LOW | FIXED |

全 4 件の修正が確認できた。リグレッションなし。
