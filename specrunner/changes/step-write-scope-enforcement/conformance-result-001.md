# Conformance Result: step-write-scope-enforcement
## Iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

---

## 検証した項目

### 1. tasks.md チェックボックス

`tasks.md` の全タスク T-01〜T-12 が `[x]` で完了マーク済みであることを確認。

### 2. Design Decisions 適合

| Decision | 実装状況 |
|----------|----------|
| **D1** commit 境界での強制 | `commitAndPush` が single enforcement point として機能。round 経路は無変更 |
| **D2** 単一ソース `write-scope.ts`（leaf module） | `src/core/step/write-scope.ts` が `src/util/paths.ts` のみを import する leaf module として実装。TC-010 が静的に検証 |
| **D3** scoped staging に pipeline 管理 path を含める | `filterExistingFiles(pipelineManagedPaths(slug), cwd)` で state.json / events.jsonl / usage.json を stagePaths に union |
| **D4** guarded は差分検査 + fail-closed | `getWorktreeChangedPaths` → `findWriteScopeViolations` → 違反あれば restore + throw。spawn 失敗も fail-closed |
| **D5** `writeScopeViolationError` と halt 経路 | `ERROR_CODES.WRITE_SCOPE_VIOLATION` 追加。message に違反 path を列挙。`makeCommitFailHalt` 経路でそのまま halt 化 |
| **D6** spec-review reads() に request.md 追加 | `spec-review.ts:83` に `{ path: requestMdPath(deps.slug) }` 確認。TC-007 でテスト固定 |

### 3. Spec Requirements (SHALL/MUST) 適合

**Requirement: write-scope は単一ソースで定義され責任範囲表と矛盾しない**
- `write-scope.ts` が唯一の定義元（leaf module 制約 + TC-010 で grep-pin）
- `forbiddenWritePaths("implementer", slug, [])` に spec.md / design.md が含まれることを TC-001 で検証
- tasks.md（Touch 可能）が `forbiddenWritePaths("implementer", slug, [tasksMd])` で禁止集合に含まれないことを TC-002 で検証
- **SHALL/MUST 充足 ✓**

**Requirement: 確定的 step は宣言出力に限定して scoped stage する**
- `stagingModeFor` が既定 `"scoped"` を返す（GUARDED_WRITE_STEPS 以外すべて）
- `git add -A -- <stagePaths>` で pathspec 付き stage（bare `git add -A` を使わない）
- TC-003: spec-review の add args に request.md が含まれないこと + `"--"` separator の存在を assert
- scoped add 後に残存違反を restore（git clean + git checkout HEAD）— 後続 guarded step への誤検知防止
- **MUST NOT / MUST 充足 ✓**

**Requirement: 広域 write step は禁止領域変更を検出したら fail-closed で halt する**
- `GUARDED_WRITE_STEPS = { implementer, build-fixer, code-fixer, test-materialize, adr-gen }`
- stage **前** に `git status --porcelain -z --no-renames` で変更 path 列挙
- spawn 失敗 / 非 0 exit → `commitEffectFailedError` throw（fail-closed）
- violations 検出 → violated paths を restore → `writeScopeViolationError` throw → commit/push なし
- TC-005 で「commit/push NOT called」「WRITE_SCOPE_VIOLATION code」「message に request.md path」を assert
- TC-019 で spawn 失敗 → halt を assert
- **MUST / MUST NOT 充足 ✓**

**Requirement: spec-review は request.md を入力として宣言する**
- `SpecReviewStep.reads()` が `{ path: requestMdPath(deps.slug) }` を含む（`spec-review.ts:83` 確認）
- TC-007 でテスト固定
- **MUST 充足 ✓**

### 4. 受け入れ基準 適合

| 基準 | テスト | 結果 |
|------|--------|------|
| judge step の request.md 変更が commit に含まれないことをテストで固定 | TC-003（commit-push-write-scope.test.ts） | ✓ |
| 広域 write step が request.md 変更で commit されず halt、halt 報告に違反 path | TC-005（commit-push-write-scope.test.ts） | ✓ |
| 正常経路で commit 内容・挙動が現行と同一（既存テスト無改変 green） | TC-004 / TC-006 + 全既存テスト 8421件通過 | ✓ |
| write-scope 単一ソースと rules.ts 責任範囲表が矛盾しないことをテストで固定 | TC-001 / TC-002（write-scope-rules-consistency.test.ts） | ✓ |
| spec-review の reads() に request.md が含まれることをテストで固定 | TC-007（spec-review-reads.test.ts） | ✓ |
| `typecheck && test` が green | `bun run typecheck`（exit 0）/ `bun run test`（8421 passed, 1 skipped） | ✓ |

### 5. 実装スコープ確認

`git diff main...HEAD --stat` で確認（45ファイル変更、4918行挿入）:

- 新規ソース: `src/core/step/write-scope.ts`（+131行）
- 変更ソース: `src/core/step/commit-push.ts`（+241行）、`src/errors.ts`（+18行）、`src/core/step/spec-review.ts`（+3行）、`src/core/step/round-git-scope.ts`（+7行）
- 新規テスト: `commit-push-write-scope.test.ts`（1280行）等6ファイル
- 並列 round 経路（`parallel-review-round.ts`）への変更なし ✓

---

## 検証できなかった項目

None。全受け入れ基準・spec 要件・設計判断を機械的に確認した。

---

## Findings 詳細

### 非ブロッキング観察: T-12 の実装配置の逸脱（optional タスク）

tasks.md T-12 は「`architecture/conformance.md` に B-17 を追加」「`core-invariants.test.ts` に grep 検査を追加」と指定しているが:
- `architecture/conformance.md` の不変条件表は B-16 で終わっており、B-17 エントリが追加されていない
- grep-pin テストは `core-invariants.test.ts` ではなく `tests/unit/architecture/write-scope-invariants.test.ts` に実装された

T-12 は「任意・強化」タスクであり受け入れ基準は「追加した場合、grep-pin テストが green」。
grep-pin テスト（TC-010 / TC-022）は存在し green。機械的保護としての歯は機能しているため非ブロッキング。

