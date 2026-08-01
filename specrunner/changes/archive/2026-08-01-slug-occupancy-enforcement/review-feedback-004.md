# Code Review Feedback — iteration 004

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `src/store/job-catalog.ts` — `listWithSourceDirs` の 4 セクション（main checkout / worktrees / sidecar supplement / managed markers）を実読し、`list()` が `scanSlugOccupancy` の全スキャン対象を包含することを確認
- `specrunner/changes/slug-occupancy-enforcement/review-feedback-003.md` — 前回 iteration の finding 一覧と escalation 理由を確認
- operator 裁定（resume note）— F-1 棄却理由・F-2 Option A 採択理由を確認
- 受け入れ基準 8 項目の充足状況（前回 iteration での確認を継承）

## operator 裁定の適用

前回 iteration 003 は 2 件のブロッキングでない finding（F-1: medium SHOULD / F-2: low decision-needed）で escalation となった。
operator は次の裁定を下した:

- **F-1 棄却**: `JobStateStore.list()` のスキャン範囲が `scanSlugOccupancy` より狭いという前提は成立しない。
  `src/store/job-catalog.ts` の `listWithSourceDirs` は section 2（line 98）で
  `.git/specrunner-worktrees/*/specrunner/changes/*/state.json` を走査するため、
  `scanSlugOccupancy` の 3 スキャン対象をすべて包含する上位集合である。
  残る差分は破損 state の扱い（`list()` は skip、`scan` は unreadable として fail-closed）のみ。
  この corner では guard が拒否するため invariant は intact であり、
  comment が出ない点は advisory 層の gap（既存 observations と同クラス）で非ブロッキング。

- **F-2 Option A 採択**: `list()` は worktree を走査するため TC-034 の fixture は
  `SLUG_OCCUPANCY_AMBIGUOUS` 経路を実際に踏んでいる（verification green と整合）。
  スキャンスコープは `job-catalog.ts` 冒頭の doc comment に既に記載されている。

## 裁定後の確認

`src/store/job-catalog.ts` を実読して裁定を検証した:
- Section 1（line 50）: `specrunner/changes/*/state.json`（main checkout）
- Section 2（line 98）: `.git/specrunner-worktrees/*/specrunner/changes/*/state.json`（worktrees）
- Section 3（line 176）: sidecar supplement（非標準 worktree パスの補完）
- Section 4（line 196）: `.specrunner/local/<slug>/marker.json`（managed markers）

`list()` = `listWithSourceDirs` の 4 セクションが `scanSlugOccupancy` の全 location を包含することを確認。
operator 裁定は code の事実と整合している。

## 各 finding の最終状態

| ID | 種別 | 内容 | 最終状態 |
|----|------|------|----------|
| F-1 | SHOULD (medium) | inbox pre-check が `list()` を使用、worktree-only 占有者での reject comment 欠落リスク | **operator 棄却** — `list()` は worktree を走査するため前提不成立。非ブロッキング gap として observation 記録のみ |
| F-2 | decision-needed (low) | TC-034 の worktree fixture と `list()` スキャン整合性 | **Option A 確認** — `list()` が worktree を走査するため `SLUG_OCCUPANCY_AMBIGUOUS` 経路は実際に踏まれる |
| F-3 | PASS | `slugOccupiedError` ヒントの `awaiting-archive` 分岐 | 継続 PASS |
| F-4 | PASS | cancel の jobId スコープが liveness sidecar・managed marker・`--purge` の全経路に適用 | 継続 PASS |
| F-5 | PASS | managed cancel の managed state.json 上書き順序（state 上書き → marker unlink）| 継続 PASS |
| F-6 | PASS | `duplicate-slug-guard.ts` 削除と移行の整合性 | 継続 PASS |

## 受け入れ基準の最終確認

- [x] シナリオ歯（end-to-end）: `occupancy-e2e.test.ts` が halt → 拒否（state 作成なし）→ cancel（sidecar 削除）→ 成功を確認
- [x] guard 単体テスト: awaiting-resume / running+dead-pid / terminal-only / unreadable の 4 ケース固定
- [x] cancel テスト: 自 jobId 一致 → 削除（通常 cancel でも）、他 jobId → 残存を固定
- [x] 解決テスト: 非 terminal 1 件 + terminal N 件 → 非 terminal 返す（updatedAt 逆転含む）、非 terminal 複数 → `SLUG_OCCUPANCY_AMBIGUOUS`
- [x] doctor テスト: breach（≥2 非 terminal）検出・一意修復・非一意修復拒否を固定
- [x] Next 案内テスト: awaiting-resume → resume 案内、awaiting-archive → archive 案内
- [x] 既存テスト: 旧 fail-open 期待値変更は R1/R2 帰属コメントで明示
- [x] verification-result.md が typecheck && test green を証明

## 検証できなかった項目

None（operator 裁定により前回の未確認事項はすべて解消）

## Findings 詳細

新規のブロッキング指摘なし。operator 裁定により F-1 / F-2 は非ブロッキングとして解消された。
実装・テスト・受け入れ基準はすべて充足している。
