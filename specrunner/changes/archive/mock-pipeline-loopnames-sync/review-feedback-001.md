# Code Review Feedback — mock-pipeline-loopnames-sync — iter 1

## Summary

- **verdict**: approved
- **reviewer**: claude code-review
- **date**: 2026-05-17
- **files reviewed**: `src/core/pipeline/run.ts`, `tests/core/pipeline/pipeline.test.ts`, `tests/unit/core/pipeline/buildMockPipeline.test.ts`

---

## Findings

### INFO: sanity check test のファイル名と内容の乖離（許容）

- **severity**: info
- **file**: `tests/unit/core/pipeline/buildMockPipeline.test.ts`

ファイル名が `buildMockPipeline.test.ts` だが、実際にテストしているのは `run.ts` の export 定数（`STANDARD_LOOP_NAMES` / `STANDARD_LOOP_FIXER_PAIRS`）であり、`buildMockPipeline` 関数そのものはテストしていない。

design.md §Decisions #3 に「`loopNames`/`loopFixerPairs` は Pipeline の private フィールドのためアクセス不可、定数値を直接 assert で十分」と明示されており、意図的な設計判断。実用上も structural sync は `buildMockPipeline` が同一定数を import することで達成されているため問題なし。

---

## Test Coverage Check

| TC | Priority | Status | 備考 |
|----|----------|--------|------|
| TC-SC-01 | must | ✅ pass | `buildMockPipeline.test.ts` L7-9 |
| TC-SC-02 | must | ✅ pass | `buildMockPipeline.test.ts` L13-19 |
| TC-SC-03 | should | ✅ pass | typecheck green（verification-result.md 確認）|
| TC-SC-04 | must | ✅ pass | `buildMockPipeline` の `loopNames` 行に dsv なし（diff L14 確認）|
| TC-SC-05 | must | ✅ pass | `{ ...STANDARD_LOOP_FIXER_PAIRS }` で 4 エントリに更新済み |
| TC-SC-06 | must | ✅ pass | typecheck green |
| TC-SC-07 | must | ✅ pass | `buildMockPipeline.test.ts` L7-9 |
| TC-SC-08 | must | ✅ pass | `buildMockPipeline.test.ts` L13-19 |
| TC-SC-09 | must | ✅ pass | 2003 tests all pass |
| TC-SC-10 | must | ✅ pass | 2003 tests all pass |
| TC-SC-11 | should | ✅ pass | 2003 tests all pass |
| TC-SC-12 | should | ✅ pass | 2003 tests all pass |
| TC-SC-13 | should | ✅ pass | stale コメント削除確認（diff L14 確認）|
| TC-SC-14 | should | ✅ pass | 「PR #274」言及の正確なコメントに更新済み |
| TC-SC-15 | must | ✅ pass | 167 files / 2003 tests green |
| TC-SC-16 | must | ✅ pass | grep 結果で helper 本体の loopNames に dsv なし |

全 must TC（10/10）✅、全 should TC（5/5）✅

---

## Acceptance Criteria Check

- [x] `buildMockPipeline` の `loopNames` 既定値が `["spec-review", "verification", "code-review"]`（dsv 除外）
- [x] `buildMockPipeline` の `loopFixerPairs` 既定値が 4 entries
- [x] 既定値変更で崩れる既存 TC なし（2003 tests all pass）
- [x] 不要な個別 override 削除済み（TC-063 は元々 `new Pipeline()` 直接構築のため対象外）
- [x] sanity check test 追加・pass
- [x] `bun run typecheck && bun run test` green
- [x] `buildMockPipeline` の `loopNames` に dsv なし

---

## Overall

実装はシンプルかつ正確。extract-constant → spread into constructor の 2 ステップで、型安全かつ structural sync を実現している。既存テストへの影響もなく、コメント修正も適切。
