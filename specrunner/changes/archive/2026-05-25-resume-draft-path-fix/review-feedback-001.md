# Code Review — resume-draft-path-fix — iter 1

## Summary

実装は正しい。バグの根本原因（`state.request.path` が draft 削除後も古いパスを指す）への対処として `local.ts`/`managed.ts` の `updateJobState` 追加と `resolveRequestPath` の設計・実装は適切。TypeScript/test も green。

1 件の `high` 欠陥あり。TC-06/TC-07（`setupWorkspace` 後に `state.request.path` が永続パスを指すことの検証）が実テストで未カバー。

---

## Findings

### [high] TC-06/TC-07: `setupWorkspace` の `state.request.path` 更新がテストで検証されていない

- **file**: `tests/unit/core/runtime/local.test.ts`, `tests/unit/core/runtime/managed.test.ts`
- **description**:
  `local.ts:227-230` と `managed.ts:116-120` に追加された `updateJobState` 呼び出し（`state.request.path` を `changeFolderRequestPath` に更新する）を実際に検証するテストがない。

  - `TC-LR-010`（local.test.ts）は `git add` / `git commit` の呼び出しを検証するが、state の `request.path` フィールドを読み戻すアサーションがない。
  - `draft-move.test.ts` は `LocalRuntime.setupWorkspace` を呼ばないスタブ実装であり、実コードの `updateJobState` は一切実行されない。

  受け入れ基準の「関連 unit test を追加（**新規 path 記録** / legacy fallback / 完全 ENOENT の 3 ケース）」のうち「新規 path 記録」が未達成。test-cases.md の `TC-06`/`TC-07` は Priority: must。

- **fix**:
  `local.test.ts` の TC-LR-010 相当のテスト（`requestFilePath` を渡す run パス）に、`setupWorkspace` 完了後に job state を読み戻して `state.request.path` が `<worktreePath>/specrunner/changes/<slug>/request.md` を指していることをアサートするテストを追加する。
  `managed.test.ts` でも同様に、`<cwd>/specrunner/changes/<slug>/request.md` を指していることをアサートする。

  例（local.test.ts）:
  ```ts
  const { loadJobState } = await import("../../../../src/state/store.js");
  const finalState = await loadJobState(jobState.jobId);
  const expectedPath = path.join(createdPaths[0], "specrunner", "changes", "test-slug", "request.md");
  expect(finalState?.request.path).toBe(expectedPath);
  ```

---

### [low] test-coverage "12/12" は substring マッチによる false positive

- **file**: `specrunner/changes/resume-draft-path-fix/verification-result.md`
- **description**:
  `runTestCoveragePhase` は `text.includes(tcId)` でサブストリング検索するため、`TC-01` は他テストファイルの `TC-010`/`TC-011` などにも一致する。test-cases.md の `TC-01`〜`TC-14` が実際には `resolve-request-path.test.ts` の `TC-RRP-001`〜`TC-RRP-004` 等と対応しているが、ツールは別 TC の一部として一致している。

  実装のバグではないが、coverage カウントが実態を過大に評価している。test-coverage フェーズの精度問題として別途 issue 化を推奨。

---

## Test Coverage vs test-cases.md (must)

| TC | 説明 | カバー状況 |
|----|------|-----------|
| TC-01 | non-draft パスはそのまま返る | ✓ resolve-request-path.test.ts (TC-RRP-001) |
| TC-02 | legacy + worktreePath あり → worktreePath 配下 | ✓ TC-RRP-002 |
| TC-03 | legacy + worktreePath のファイル不在 → cwd フォールバック | ✓ TC-RRP-002 second case |
| TC-04 | legacy + worktreePath null → cwd 配下 | ✓ TC-RRP-003 |
| TC-05 | legacy + 両候補不在 → statePath そのまま | ✓ TC-RRP-004 |
| TC-06 | job start 後 state.request.path が永続パス（local） | ✗ **未カバー** |
| TC-07 | job start 後 state.request.path が永続パス（managed） | ✗ **未カバー** |
| TC-08 | 新規 job resume → ENOENT なし | △ resume.test.ts で parseRequestMd がモックされ fallback 未検証 |
| TC-09 | legacy + local resume → fallback 動作 | △ 同上 |
| TC-10 | legacy + managed resume → cwd fallback | △ 同上 |
| TC-11 | legacy + 両候補不在 → ENOENT | △ 同上 |
| TC-14 | typecheck + test green | ✓ verification-result.md |

TC-08〜TC-11 は `parseRequestMd` がモックされているため fallback ロジックの実質的な動作検証ではないが、`resolveRequestPath` 自体は TC-RRP-002/TC-RRP-003 で十分にテストされており、`resume.ts` へのワイヤリングはコンパイル + 静的解析で確認可能。実態としての regression リスクは TC-06/TC-07 の欠如が主要。

---

## Implementation Notes

- `resolve-request-path.ts`: 純粋関数として分離済み、`fs.existsSync` の使い方も正しい
- `local.ts:227-230`: `fs.cp` 直後・`fs.rm` 前の正しい位置に `updateJobState` 追加済み
- `managed.ts:116-120`: 同上
- `resume.ts:172-173`: `resolveRequestPath` のワイヤリングも正しく、エラーメッセージの `resolvedPath` 参照も修正済み

---

- **verdict**: needs-fix
