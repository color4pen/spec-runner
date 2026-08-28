# Code Review Feedback — fixer-unpushable-path-coverage — Iteration 3

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 概要

イテレーション 3 は resume 条件の履行確認が主目的。

前回（iteration 2）の escalation 条件: 「executor.ts の計画外変更を design.md / tasks.md に遡及文書化すること」。
この条件が **未履行** であることを確認した。

---

## 検証した項目

### Resume 条件の履行確認

**条件（human resume note）**: design.md の Non-Goals / ゲート設計の記述を実装に一致させ、tasks.md に executor.ts の変更を追記する（doc-only 修正）。

**検証方法**: `git log --oneline main...HEAD` で design.md / tasks.md に触れたコミットを確認。

結果:

```
git log -- specrunner/changes/fixer-unpushable-path-coverage/design.md
  34c6511e implementer  (checkbox 更新)
  77f478c1 spec-fixer
  dedda721 design       (初回生成)

git log -- specrunner/changes/fixer-unpushable-path-coverage/tasks.md
  34c6511e implementer  (checkbox 更新)
  77f478c1 spec-fixer
  dedda721 design       (初回生成)
```

iteration 2 の code-review コミット（`89ae2b1c`、2026-08-28 02:10:01）以降、
design.md / tasks.md への書き込みコミットがゼロ。

条件は **未履行**。

### 追記が必要な内容（参照）

**design.md** に追記すべき事項:

1. Non-Goals の `step-context-builder.ts`, `output-verify.ts`, `commit-push.ts` のリストに executor.ts の状況を明記する（executor.ts は実際に変更されているため、現在の Non-Goals 記述と実装が不整合）
2. 新決定 D6 として executor gate から unpushable-path contract を除外した設計を記録する:
   - **理由**: gate は `commitAndPush` の `git reset --mixed` 正規化より前に実行されるため、agent self-commit の unpushable path を誤検知する偽陽性 halt が発生する。Layer 2（mixed reset 後の collectPublishablePaths）が最終 publishable 状態を正確に評価するため、gate からの除外が correct。
   - **Layer 1 への影響なし**: `step-context-builder.ts` は `step.outputContracts` を独立して読むため、gate 除外は Layer 1 follow-up prompt の発動に影響しない。

**tasks.md** に追記すべき事項:

- T-06（または T-05 の修正）として executor.ts の変更を記録する:
  - `buildAllOutputContracts(...)` の結果に `.filter((c) => c.kind !== "unpushable-path")` を追加
  - 目的: executor gate で unpushable-path contract を評価せず、Layer 2（commitAndPush）に任せる
  - チェックボックス: `[x]`（実装済み）

---

### 実装・テスト・検証（反復 3 での変更確認）

`bec45ddc implementer` (2026-08-28 01:58:21) で変更されたファイル:

- `src/core/step/__tests__/fixer-push-capability.test.ts` のみ（TC-015 のリファクタリング）

変更内容:

- 定数条件 lint エラーを回避するため `filterForAttempt` ヘルパ関数を導入（`1 > 1` / `2 > 1` を関数でラップ）
- テストのセマンティクスは変更なし
- 29テスト全 pass を維持

verification iter 3 (2026-08-28 02:02:17):

| Phase | Status |
|---|---|
| build | passed |
| typecheck | passed |
| test | passed (12599 tests, 841 test files) |
| lint | passed |
| changed-line-coverage | passed |

### 受け入れ基準の再確認（実装面）

前回 iteration 2 で確認済みの実装事項に変更なし:

| AC | 確認方法 | 状態 |
|---|---|---|
| AC-1: code-fixer / spec-fixer 全 return path に capability notice | diff 確認（iteration 2 時点と同一） | ✓ |
| AC-2: outputContracts が unpushable-path contract を返す | テスト TC-004/005/010/011 pass | ✓ |
| AC-3: Layer 2 backstop 維持 | commit-push.ts 未変更、executor の UnpushablePathBlockedError ハンドリング確認 | ✓ |
| AC-4: implementer / request-review 不変 | `git diff main...HEAD -- implementer.ts request-review.ts` → 0行 | ✓ |
| AC-5: typecheck / test green | verification iter 3 passed | ✓ |

### Gate TCs（TC-018 〜 TC-021）

- TC-018 typecheck: verification passed ✓
- TC-019 full test suite: 12599 passed ✓
- TC-020 implementer.ts / request-review.ts 未変更: `git diff` → 0行 ✓
- TC-021 step-context-builder.ts / output-verify.ts / commit-push.ts 未変更: `git diff` → 0行 ✓

### TC-017 フォールバックパス（前回からキャリーオーバー）

coordinator loop の fallback sub-path（findings なし、members 存在）のテストが引き続き存在しない。
TC-017 は `priority: should` のため非ブロッキング。コード実装（L232）は正しい。

---

## 検証できなかった項目

- TC-015（integration）のエンドツーエンド: unit test チェーン方式 + unpushable-path-escalation.test.ts で代替されており、引き続き許容範囲。

## Findings 詳細

### F-1: resume 条件（design.md / tasks.md ドキュメント更新）が未履行

**対象ファイル**:
- `specrunner/changes/fixer-unpushable-path-coverage/design.md`
- `specrunner/changes/fixer-unpushable-path-coverage/tasks.md`

**内容**: human resume note の条件「executor.ts のゲート変更を design.md / tasks.md に遡及文書化する」が iteration 3 時点で未実施。
iteration 2 code-review コミット（89ae2b1c、2026-08-28 02:10:01）以降、これら 2 ファイルへの書き込みがない。

**必要な変更（コード変更なし、doc-only）**:
1. design.md: Non-Goals の記述を実装と整合させる + 新決定 D6 として executor gate 除外の rationale を追記
2. tasks.md: T-06（または T-05 修正）で executor.ts 変更をチェックボックス付きで記録

コード実装は承認済みのため追加のコード変更は不要。ドキュメント追記のみで解決可能。
