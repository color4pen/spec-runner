# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### tasks.md — 全チェックボックス確認

T-01〜T-07 全項目 `[x]` 済みを確認。

### typecheck && test（受け入れ基準 7）

- `bun run typecheck` (`tsc --noEmit`): 出力なし（エラーなし）✓
- `bun run test`: 585 test files passed, 8571 tests passed, 1 skipped ✓

### D1: 判定の state 純粋性

`reverification.ts:108-128` の `conformanceApprovedForVerifiedRevision` は引数 `state: JobState` のみを参照し、git I/O を一切行わない純関数。✓

### D2: entry-HEAD 打刻タイミング

`executor.ts:551-558` — `deps.runtimeStrategy?.captureHeadSha(cwd)` を `step.run()` の**前**に呼び出し、戻り値を `entryHeadSha` に保持。`:599` で success result の `commitOid` に載せる。TC-005 の stateful stub（entry="entry-sha"、run()内でexit="exit-sha"へ進む）で entry が記録されることを固定済み。✓

### D3: guard 置換の完全性

`types.ts:6` — import が `conformanceApprovedForVerifiedRevision` のみに変更済み。
`types.ts:250`（STANDARD_TRANSITIONS）/ `types.ts:307`（FAST_TRANSITIONS）両行が新関数を `when` に設定済み。
`conformanceApprovedLatest` は `@deprecated` で残存するが、production 遷移テーブルからは除去済み（既存テスト TC-012/013/014 の import のみ）。✓

### D4: build-fixer 後の code-review 再入

guard が entry-HEAD != conformance.commitOid のとき false → `verification passed → code-review` フォールバック行へ自然に落ちる設計。TC-003/TC-004/TC-019 の期待値を「code-review 再入 → conformance 再承認 → adr-gen」へ更新済み。`pipeline.build-fixer-reentry.test.ts` で再入が awaiting-archive に収束しループしないことを固定済み。✓

### D5: custom reviewer re-anchor

`reviewer-status.ts:95-122` — `selectPendingMembers` の 3 引数目 `baselineCommit?: string | null`。null/undefined のとき revision check 無効化（managed fail-safe）。
`parallel-review-round.ts:110-157` — baselineCommit を raw `captureHeadSha`（timestamp fallback なし）で取得。`result.kind === "success"` && `invalidated.status === "approved"` && `baselineCommit !== null` の三条件すべて成立したときのみ re-anchor。evidence 不能時は re-anchor せず fail-closed。
TC-011（re-anchor 維持）/ TC-012（evidence 不能時 fail-closed）で固定済み。✓

### D6: レガシー record fail-closed

`conformanceApprovedForVerifiedRevision`: conformance / verification いずれかの `commitOid` が空文字または未設定なら false。`selectPendingMembers`: `approvedAtCommit` が null → pending（fail-closed）。TC-003 / TC-012 で固定済み。✓

### 受け入れ基準 1〜6 の test 確認

| 基準 | テストファイル | 確認 |
|------|------------|------|
| 1 再走事故封鎖 | `conformance-revision-binding.test.ts` TC-001, `pipeline.reverification.test.ts` C2≠C1 経路 | ✓ |
| 2 正常経路 | `conformance-revision-binding.test.ts` TC-002（C1==C1→true）, `pipeline-integration.test.ts` TC-060/062 | ✓ |
| 3 レガシー stale | `conformance-revision-binding.test.ts` TC-003（欠落→false）| ✓ |
| 4 verification 打刻 | `executor-cli-entry-oid.test.ts` TC-005/TC-006 | ✓ |
| 5 custom reviewer | `reviewer-status.test.ts`, `parallel-review-round-invalidation.test.ts` TC-011/TC-012, `select-pending-revision-binding.test.ts` | ✓ |
| 6 既存テスト追随 | `pipeline.reverification.test.ts` TC-001/002/003/004/019, `transition-when.test.ts` TC-2/016/017, `member-resume-routing.test.ts`, `reviewer-status.test.ts` | ✓ |

## 検証できなかった項目

None — 全項目を確認済み。

## Findings 詳細

### Finding 1: `types.ts:287` のコメントに旧関数名が残存（low / fixable）

FAST_TRANSITIONS の JSDoc（line 287）に：
```
reverification chokepoints (conformanceApprovedLatest / codeChangedSinceLastVerification)
```
と記載されているが、実際の guard は `conformanceApprovedForVerifiedRevision` に切り替わっている。import も削除済みのため機能影響なし。コメントのみの修正が必要。

### Finding 2: `kernel/reviewer-snapshot.ts` の `approvedAtCommit` JSDoc が拡張意味を未記載（low / fixable）

`ReviewerStatus.approvedAtCommit` の型定義コメント（`kernel/reviewer-snapshot.ts:47-51`）が旧来の "HEAD SHA at the time this reviewer was approved" のままで、D5 の re-anchor 拡張意味（「reviewed または基準 revision で再確認済みの source revision」）を反映していない。`reviewer-status.ts` の `selectPendingMembers` JSDoc および `parallel-review-round.ts` のインラインコメントで意味は文書化されているため機能上の影響はないが、型定義元が不完全。
