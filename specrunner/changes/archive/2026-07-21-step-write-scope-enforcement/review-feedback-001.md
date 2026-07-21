# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 受け入れ基準のトレース

| 受け入れ基準 | 検証方法 | 結果 |
|---|---|---|
| judge step の request.md 変更が commit に含まれない | TC-003 テストコード + commit-push.ts 実装確認 | ✅ |
| guarded step の request.md 変更で halt + 違反 path 列挙 | TC-005 テストコード + write-scope.ts / errors.ts 確認 | ✅ |
| 正常経路で commit 内容が現行と同一 | TC-004 / TC-006 テストコード確認 | ✅ |
| 単一ソースが rules.md 責任範囲表と矛盾しない | TC-001 / TC-002 テストコード + write-scope.ts 確認 | ✅ |
| spec-review の reads() に request.md 含まれる | TC-007 テストコード + spec-review.ts diff 確認 | ✅ |
| typecheck && test が green | verification-result.md（全フェーズ passed） | ✅ |

### 実装確認の詳細

**`src/core/step/write-scope.ts`（T-01）**

- `GUARDED_WRITE_STEPS` = { implementer, build-fixer, code-fixer, test-materialize, adr-gen }。5 step が guarded、その他は scoped。
- `stagingModeFor(stepName)`: GUARDED_WRITE_STEPS に含まれれば "guarded"、既定 "scoped"。custom reviewer 等の未知名は fail-safe("scoped")に倒れる。
- `protectedCanonPaths(slug)`: request.md / spec.md / design.md / tasks.md / test-cases.md / request-review-attestation.json の 6 path を返す。
- `isJudgeArtifact(filePath, slug)`: `/-result-/` または `/^review-feedback-/` で slug フォルダ内の判定成果物を検出。
- `forbiddenWritePaths(...)`: `protectedCanonPaths` から `declaredWritePaths` を差し引いた集合。
- `findWriteScopeViolations(...)`: changedPaths のうち `forbiddenWritePaths` または `isJudgeArtifact` に一致し `declaredWritePaths` に含まれないものを返す。
- **leaf 制約**: import は `../../util/paths.js` のみ。TC-010 の grep-pin でも確認済み。

**`src/errors.ts`（T-02）**

- `ERROR_CODES.WRITE_SCOPE_VIOLATION` 追加済み。`writeScopeViolationError` factory が message に violatedPaths を列挙し hint に resume 手順を記述。

**`src/core/step/commit-push.ts`（T-03/T-04）**

- `stagingModeFor(step.name)` で scoped / guarded を分岐。
- scoped mode: `step.writes?.(state, deps)` の `artifact !== "gitState"` エントリの path と `pipelineManagedPaths(slug)`（state.json / events.jsonl / usage.json）の union を `git add -A -- <stagePaths>` で stage。stagePaths が空なら即 return（no-op）。
- guarded mode: `git status --porcelain -z --no-renames` で worktree 変更を列挙 → `findWriteScopeViolations` で禁止領域を検査 → 1 件でも違反なら `writeScopeViolationError` を throw して halt（fail-closed）。spawn 失敗も fail-closed。
- 共有 tail（`commitAndPushTail`）: diff → HEAD-advance 検出 → commit → push。HEAD-advance 検出（agent 自主 commit → push-only）は guarded / scoped 両 mode で保存される。
- round 経路（`commitScopedPaths` / `commitFinalState`）は変更なし。

**`src/core/step/spec-review.ts`（T-05）**

- `reads()` に `{ path: requestMdPath(deps.slug) }` を追加。import に `requestMdPath` を追加。

**implementer の tasks.md 宣言確認**

`implementer.writes()` が `{ path: changeFolderPath(slug)/tasks.md, verify: false }` を返すことを確認。この path が `declaredWritePaths` に入るため、guarded 検査で tasks.md は forbidden から除外される（rules.md の "Touch 可能" 整合）。

**テスト群**

- `write-scope.test.ts`: TC-008 ～ TC-014、全 module 関数の単体テスト。
- `write-scope-error.test.ts`: TC-015 / TC-016。
- `write-scope-rules-consistency.test.ts`: TC-001 / TC-002（rules.md 整合性）。
- `spec-review-reads.test.ts`: TC-007。
- `commit-push-write-scope.test.ts`: TC-003 ～ TC-006 / TC-017 ～ TC-020。scoped / guarded 両 mode の境界検査。
- `write-scope-invariants.test.ts`: TC-010 / TC-022（architecture grep-pin）。

## 検証できなかった項目

None — 全受け入れ基準を追跡し、実装・テスト・verification 結果で確認した。

## Findings 詳細

### F-001: TC-017 テストが意図した前提を実際に作れていない（low）

`vi.doMock` は `vi.mock`（ファイル先頭のホイスト済みモック）を上書きしない。そのため TC-017 の実行時は `pipelineManagedPaths` が 3 path（state.json / events.jsonl / usage.json）を返し、`stagePaths` が空にならない。

実際に `commit` が呼ばれない理由は "stagePaths が空 → no-op" ではなく "git diff が exitCode 0 を返す（staged changes なし）→ commit スキップ" である。テストの intent（`stagePaths = [] → git add すら呼ばない`）は検証できていない。

テストタイトル "no git add is called when writes() is empty (stagePaths = [])" の主張と実際の実行パスが一致しない。production code は正しく実装されており（`if (stagePaths.length === 0) return;`）、TC-017 は "should" 優先度のため merge-blocking ではない。

修正案: `vi.resetModules()` + 再 import でモジュールを分離するか、もしくは assertions を `not.toContain("add")` に変更して intent を正確に反映させる。

---

*Observations は report_result に記録済み。*
