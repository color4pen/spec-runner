# Review Feedback 002

## Summary

iter 1 で指摘した high finding（TC-06/TC-07 の `state.request.path` 永続化を検証するテスト不在）は、`local.test.ts:589-609` と `managed.test.ts:207-226` で `loadJobState` による事後検証として正しく追加された。`bun run typecheck` clean、40/40 test green。実装と design.md / tasks.md / test-cases.md の整合は問題なし。

## Findings

### [info] iter 1 の high finding が解消されている

- **file**: `tests/unit/core/runtime/local.test.ts:589-609`, `tests/unit/core/runtime/managed.test.ts:207-226`
- **description**:
  iter 1 で未カバーだった TC-06 / TC-07 が両ファイルに追加され、`setupWorkspace` 後に `loadJobState(jobState.jobId)` で `state.request.path` を読み戻し、それぞれ `<worktreePath>/specrunner/changes/test-slug/request.md`（local） / `<cwd>/specrunner/changes/test-slug/request.md`（managed）を指していることをアサートしている。受け入れ基準「新規 path 記録」の検証要件を満たしている。

### [info] resolveRequestPath の実装と test-cases.md の整合は完全

- **file**: `src/core/resume/resolve-request-path.ts`, `tests/unit/core/resume/resolve-request-path.test.ts`
- **description**:
  TC-01 〜 TC-05 のすべてが TC-RRP-001 〜 TC-RRP-004 でカバーされている。`undefined` worktreePath ケース（TC-RRP-003 の 2 ケース目）まで明示的にテストされている点も堅実。`fs.existsSync` の使用は同期 I/O だが path 解決という用途では妥当。

### [info] resume.ts のワイヤリング

- **file**: `src/core/command/resume.ts:171-179`
- **description**:
  `resolveRequestPath(state.request.path, getJobSlug(state), state.worktreePath, cwd)` 呼び出しと、`parseRequestMd` への引き渡し、エラーメッセージの `resolvedPath` 参照は design.md D2 / Task 4 の指示通り。`getJobSlug` が `state.request.slug` を最優先するため、`request.slug` が null だった legacy state でも branch / path basename フォールバックで slug を取得できる。

### [minor] TC-08〜TC-11（integration: resume command）は test-cases.md に must で挙げられているが直接の integration test はない

- **file**: `specrunner/changes/resume-draft-path-fix/test-cases.md:95-143`
- **description**:
  TC-08〜TC-11 は `specrunner job resume <slug>` を end-to-end で実行して ENOENT が出ない／出ることを検証する integration test を想定しているが、対応するテストファイルは追加されていない。iter 1 feedback でも「`parseRequestMd` がモック前提のため fallback ロジックの実質的な動作検証ではない」と認識されており、`resolveRequestPath` 自体が TC-RRP-002/003 で十分テストされているため、regression リスクは低く実害は限定的。test-cases.md の priority 表記と実装範囲のズレとして記録。
- **fix**:
  追加対応は不要。test-cases.md の TC-08〜TC-11 を「resolveRequestPath unit test でカバー済み」として既存の integration coverage に委ねるか、別 request で end-to-end 検証を追加するかは判断対象（本 review では blocker としない）。

### [info] test-coverage の "12/12" は substring マッチによる過大評価（iter 1 と同様）

- **file**: `specrunner/changes/resume-draft-path-fix/verification-result.md`
- **description**:
  iter 1 と verification-result.md は同一（iter 2 では再実行されていない）。`runTestCoveragePhase` の substring マッチで `TC-01` が `TC-010` 等にも一致するため 12/12 と報告されているが、実際の must coverage は前項のとおり TC-06/TC-07 が追加された結果として向上している。本 request のスコープ外。

## Verdict

- **verdict**: approved
