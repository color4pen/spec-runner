# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` で変更範囲を確認（34 ファイル、4224 挿入 / 815 削除）
- `specrunner/changes/single-phase-archive/design.md` / `test-cases.md` を精読
- 実装コア: `plain-archive.ts` / `cleanup.ts` / `orchestrator.ts` / `merge-completion.ts` / `job-context.ts`
- CLI: `src/cli/archive.ts`（plain 分岐と `--with-merge` 分岐の分離を確認）
- `src/core/job-list/operations-view.ts`（`deriveNextAction`・CATEGORY_META ラベル変更を確認）
- `.github/workflows/specrunner-dispatch.yml`（archive action コメントブロック + 実行コマンド）
- テストスイート全体: `bun run test` → 839 ファイル・12 545 テスト（全 pass）
- Gate grep チェック（TC-021 / TC-027–029 / TC-032 / TC-033 / TC-034）

### Gate チェック結果

| Gate | コマンド / 確認内容 | 結果 |
|------|---------------------|------|
| TC-021 | `grep -rn "runPostMergeCleanup\|PostMergeCleanupInput\|post-merge-cleanup" src/ tests/ .github/` | ✅ 空（削除済み） |
| TC-027 | `grep -n "GitHubClient\|merge-completion\|getPullRequest\|mergePullRequest" src/core/archive/plain-archive.ts` | ✅ 0 件 |
| TC-028 | `grep -n "createGitHubClient\|getOriginInfo" src/cli/archive.ts`（plain 分岐の行に存在しない） | ✅ `--with-merge` 分岐のみ（L204, L214） |
| TC-029 | `grep -rn "merge-completion" src/ tests/` | ✅ `merge-then-archive.ts` のみ（1 件） |
| **TC-032** | `grep -n "2 相\|2相\|再実行\|completeAfterMerge\|1 回目\|2 回目\|..." .github/workflows/specrunner-dispatch.yml` | ❌ **4 件ヒット**（詳細後述） |
| TC-033 | workflow archive ブロックの実行コマンド確認 | ✅ `bun ./bin/specrunner.ts job archive --from-issue "$ISSUE"` 不変 |
| TC-037 | `bun run test`（全スイート） | ✅ 839 files / 12 545 tests all pass |

## 検証できなかった項目

- TC-016（manual）: workflow YAML の目視確認は自動検証の範囲外だが、TC-032 gate grep の結果から同等に検証済み。
- `bun run build` の個別実行（`bun run typecheck` は `tsc --noEmit` のみ出力で green を確認）。

## Findings 詳細

### Finding 1: workflow YAML の archive コメントブロックが旧 2 相契約のまま（high / fixable）

**ファイル**: `.github/workflows/specrunner-dispatch.yml` L30–35

TC-032 gate grep が次の 4 行をヒットする:

```
30:# - archive: 完走した job を issue 番号から取り込む。2 相の実行を前提とする。
31:#            1 回目（merge 前）: completed marker → archive record を feature branch に push し
33:#            2 回目（merge 後・head branch 削除済み）: checkout 済み base の archive record から
34:#            slug を解決し completeAfterMerge を実行して exit 0 で終わる。
```

D8-1 は「archive の説明を『完走した job を issue 番号から 1 回の実行で取り込む』に書き換え、
『2 相』『1 回目 / 2 回目』『merge 後・head branch 削除済み』の記述を除去する」と明示している。
TC-032（gate/must）の合格条件は grep 結果が空であること。現状では 4 件ヒットして失敗する。

受け入れ条件「workflow_dispatch archive の実行も 1 回で完結し、merge後にもう一度 archiveの案内がない」にも違反する。

**修正方法**: L30–35 のコメントブロックを D8-1 の記述に沿って単相契約の説明に書き換える。
実行コマンド（L242–243）は変更不要（TC-033 pass 済み）。

---

### Finding 2: orchestrator.ts JSDoc に "after the PR is merged via completeAfterMerge" という旧記述が残る（low / fixable）

**ファイル**: `src/core/archive/orchestrator.ts` L16

```ts
 *          (status transition is NOT performed here — caller is responsible for calling
 *          markJobArchived after the PR is merged via completeAfterMerge)
```

`runPlainArchive`（plain archive path）は push 成功直後に `markJobArchived` を呼ぶ（PR merge 待ちなし）。
「after the PR is merged via completeAfterMerge」は `--with-merge` 経路にしか当てはまらない旧記述であり、
plain archive の新しい契約を誤解させる可能性がある。テストで検証される項目ではないが、
モジュール間の理解の齟齬を招く。

**修正方法**: JSDoc を「plain-archive は push 成功後に直接呼び、--with-merge は completeAfterMerge 経由で merge 後に呼ぶ」という二路線の記述に更新する。
