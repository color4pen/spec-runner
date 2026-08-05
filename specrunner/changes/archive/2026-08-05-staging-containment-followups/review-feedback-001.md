# Code Review Feedback — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat`：変更スコープ確認（実装 4 ファイル＋テスト 4 ファイル＋docs 1 ファイル＋change folder）
- `src/core/step/staging-containment.ts`：T-01 実装全体を精読（resolver / probe type / measureStagedBytes / summarizeTopDirectoriesBySize）
- `src/errors.ts`：`STAGED_BYTES_LIMIT_EXCEEDED` の ERROR_CODES 位置・factory 実装・EXIT_CODE_MAP 不在を確認
- `src/core/step/commit-push.ts`：byte guard 挿入位置（file-count guard 後、git add 前）・measurement fail-closed ラップ・statFn optional 設計を確認
- `src/config/schema/types.ts`：`maxStagedBytes?: number` の docstring 付き追加を確認
- `src/config/schema/validation.ts`：`maxStagedFiles` と同形の positive-integer validation を確認
- `src/prompts/fragments.ts`：`COMMIT_DISCIPLINE` への生成物衛生規律追記（git 禁止ルール保持・生成物/scratch/.gitignore 言及）を確認
- `docs/configuration.md`：Guarded staging 節への `maxStagedBytes` 記載・table 行・JSONC 例を確認
- 全 4 テストファイルを精読し TC カバレッジを確認
- `bun run typecheck`：エラー 0 件（verified）
- `bun run test`：10220 passed, 1 skipped（verified）
- `git diff main...HEAD -- package.json bun.lockb .specrunner/config.json`：差分なし（verified）
- scoped ブランチ（`mode === "scoped"`）が未変更であることを grep で確認
- `EXIT_CODE_MAP`（`src/errors.ts:19-31`）に `STAGED_BYTES_LIMIT_EXCEEDED` が存在しないことを確認
- `executor.ts:102`：`commitPushInfra` 構築が `statFn` を含まず optional で問題ないことを確認

## 検証できなかった項目

None

## Findings 詳細

### F-001 — TC-033 の第1サブテストが `add` の不実行を assert しない（low severity）

**Location**: `src/core/step/__tests__/commit-push-staged-bytes-guard.test.ts`

第1サブテスト（EACCES on `src/b.ts`）は以下を assert する：
```ts
expect(subcommands).not.toContain("commit");
expect(subcommands).not.toContain("push");
```
`not.toContain("add")` は第2サブテスト（EPERM）で assert されており、2 本合わせると受け入れ基準「add / commit / push が一切実行されずに halt」は充足される。TC-004（既存）が 3 つを同一 it ブロックで assert する形と比べてやや分散しているが、機能的な穴はない。

---

## 受け入れ基準チェック

- [x] file 数閾値以下 × バイト閾値超過で git add / commit / push が不実行 halt（TC-030 破壊確認込み）
- [x] バイト閾値以下は従来どおり commit + push（TC-031）
- [x] 削除予定 path が 0 バイト扱いで誤発火しない（TC-032）
- [x] halt メッセージに総バイト数・閾値・サイズ内訳・対処が含まれる（TC-034 / TC-042）
- [x] maxStagedBytes schema validation（正の整数のみ許容）（TC-038 / TC-039）
- [x] COMMIT_DISCIPLINE の生成物衛生規律文言存在（TC-040）
- [x] 既存テスト（TC-001〜TC-020 含む）無変更 green（10220 passed）
- [x] typecheck && test が green

## Non-Goal 適合確認

- push 経路の変更なし（pushOnly 未変更、diff 確認）
- scoped 分岐への guard 追加なし（mode==="scoped" ブロック未変更）
- maxStagedFiles / stagingExcludePatterns の挙動変更なし
- runtime dependency 追加なし（package.json / bun.lockb 差分なし）
- .specrunner/config.json 変更なし
- 既存テストファイルへの変更なし（新規 4 ファイルのみ追加）
