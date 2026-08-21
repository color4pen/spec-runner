# Code Review Feedback — archive-state-after-merge — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### ファイル・コード確認

- `src/core/archive/orchestrator.ts` — `markJobArchived` の呼び出しが存在しないこと、`GitHubClient` import がないこと、`deferArchivedTransition` が deprecated として残っていることを確認
- `src/core/archive/plain-archive.ts` — 処理順序（Step1-5）の実装、`getCheckStatus`/`mergePullRequest` の不在、`completeAfterMerge` 経由のみ `runPostMergeCleanup` が呼ばれること、PR-less job の即時 terminal 化を確認
- `src/core/archive/job-context.ts` — `archiveRecorded`/`recordDir` の導出ロジックが単一化されていること、`listWithSourceDirs(cwd, { includeArchived: true })` を使用していることを確認
- `src/core/archive/merge-completion.ts` — `completeAfterMerge`（best-effort transition + cleanup）と `mergedBeforeRecordEscalation`（resumeCommand 注入可能）が実装されていることを確認
- `src/core/archive/merge-then-archive.ts` — `markJobArchived`/`runPostMergeCleanup` の直接呼び出しが存在しないこと（`completeAfterMerge` 経由のみ）、`archiveRecorded`/`recordDir` の導出ロジックが除去されていることを確認
- `src/cli/archive.ts` — 非 `--with-merge` 分岐が `runPlainArchive` に委譲していること、GitHub client のベストエフォート構築、`--with-merge` 分岐が変更されていないことを確認
- `src/cli/command-registry.ts` — `ARCHIVE_USAGE` に「Archive the completed change folder」が含まれること、plain archive の新しい意味（awaiting-archive 維持・merge 後再実行）が明記されていること、command summary が更新されていることを確認
- `src/core/archive/__tests__/plain-archive.test.ts` — TC-011〜TC-026, TC-040, TC-041 の各テストケースが実装されていることを確認
- `src/core/archive/__tests__/orchestrator.test.ts` — TC-010 のみが更新（markJobArchived NOT called → 旧: IS called）されていることを確認
- `tests/unit/cli/archive-plain-merge-detection.test.ts` — TC-027〜TC-030 の CLI 配線テストが実装されていることを確認
- `README.md` — archive コマンド説明が新しい意味に更新されていることを確認

### テスト実行

`bun run test` を実行し、811 test files / 12 132 tests pass（1 skipped, 2 todo）を確認。

### 不変条件確認

| 不変条件 | 結果 |
|---------|------|
| orchestrator.ts に GitHubClient import なし | ✅ |
| orchestrator.ts に markJobArchived 呼び出しなし | ✅ |
| merge-then-archive.ts が markJobArchived / runPostMergeCleanup を直接呼ばない | ✅ |
| plain-archive.ts に getCheckStatus / mergePullRequest なし | ✅ |
| runPostMergeCleanup が MERGED 検出分岐の外で呼ばれる箇所なし | ✅ |
| VALID_TRANSITIONS / TERMINAL_STATUSES / attachArchivePolicy 変更なし | ✅ |
| orchestrator.test.ts の変更対象が TC-010 のみ | ✅ |
| merge-then-archive.test.ts / archive-from-issue.test.ts / archive-minimum-assurance.test.ts が無変更 green | ✅ |
| ARCHIVE_USAGE に "Archive the completed change folder" が含まれる | ✅ |
| ARCHIVE_USAGE に merge 前 awaiting-archive / merge 後再実行で完了の旨が明記される | ✅ |

### 受け入れ基準確認

| # | 受け入れ基準 | テスト | 結果 |
|---|------------|--------|------|
| 1 | plain archive 成功後、PR 未merge なら awaiting-archive | TC-011 | ✅ |
| 2 | archive record commit が feature branch に push される | TC-012 | ✅ |
| 3 | archive record push 後に CI failure でも awaiting-archive | TC-017 + TC-018（後述 F-01） | △ implicit |
| 4 | out-of-band merge 後、正規コマンド再実行により archived + cleanup | TC-013 | ✅ |
| 5 | --with-merge は既存どおり CI green 後 merge → archived | merge-then-archive.test.ts TC-006 等 | ✅ |
| 6 | archive record 済み状態からの再実行は冪等 | TC-017 | ✅ |
| 7 | branch/worktree cleanup は merge 前には行われない | TC-014, TC-026 | ✅ |
| 8 | 既存テスト変更は orchestrator.test.ts TC-010 のみ許容 | diff 確認 | ✅ |

## 検証できなかった項目

- out-of-band merge の E2E 動作（GitHub API との実結合）: unit mock で代替検証。機能的には TC-013 が担保。

## Findings 詳細

### F-01: TC-019 の専用 `it()` ブロック欠落

**File**: `src/core/archive/__tests__/plain-archive.test.ts`

describe ブロックタイトル（line 165）に TC-019 が列挙されているが、対応する `it()` ブロックが存在しない。

test-cases.md では TC-019 は priority `must` で、spec.md の Scenario「archive record push 後に CI が failure でも状態は変わらない」に対応する：

```
Given: plain archive が成功し archive record が push 済み、job は awaiting-archive
When:  その archive commit に対する CI が failure に終わり、PR が未 merge のまま
And:   plain archive を再実行する
Then:  job status は awaiting-archive のまま
And:   post-merge cleanup は行われない
```

この振る舞いは TC-017（archiveRecorded + OPEN → idempotent re-run / no transition）と
TC-018（getCheckStatus が呼ばれない）の組み合わせで機能的には担保されているが、
TC-019 用の専用 `it()` が存在しないためトレーサビリティに不明瞭さが残る。

推奨修正: `makeArchiveEntries()` セットアップ（archiveRecorded=true）で
getPullRequest が OPEN を返し再実行しても markJobArchived / runPostMergeCleanup /
getCheckStatus が呼ばれないことを直接 assert する `it("TC-019: ...")` ブロックを追加する。
これは TC-017 の describe ブロック（または "PR OPEN path" の describe ブロック）に追加できる。
