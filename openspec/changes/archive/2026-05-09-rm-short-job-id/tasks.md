## 1. Error Code 追加

- [x] 1.1 `src/errors.ts` の `ERROR_CODES` に `AMBIGUOUS_JOB_ID: "AMBIGUOUS_JOB_ID"` を追加する
- [x] 1.2 `src/errors.ts` に `ambiguousJobIdError(prefix: string, matchingJobIds: string[]): SpecRunnerError` factory helper を追加する。`hint` に候補の完全 UUID 一覧を含める

## 2. `resolveJobId` 関数の実装

- [x] 2.1 `src/state/store.ts` に `resolveJobId(prefix: string): Promise<string>` を export する
- [x] 2.2 入力が 36 文字（UUID v4 形式）の場合はそのまま返す（`listJobStates` を呼ばない）
- [x] 2.3 短縮 ID の場合は `listJobStates()` を呼び、`state.jobId.startsWith(prefix)` で prefix match する
- [x] 2.4 一意に特定できれば（1 件 match）完全 UUID を返す
- [x] 2.5 0 件の場合は `JOB_NOT_FOUND` エラーを throw する（既存のエラーコードを再利用）
- [x] 2.6 2 件以上の場合は `AMBIGUOUS_JOB_ID` エラーを throw する（候補一覧を hint に含める）

## 3. `rm` コマンドへの統合

- [x] 3.1 `src/cli/rm.ts` の `runRm` 関数内、single job removal パス（`removeSingleJob` 呼び出し前）に `resolveJobId(jobId)` を挿入し、返り値の完全 UUID を `removeSingleJob` に渡す
- [x] 3.2 `resolveJobId` が throw する `JOB_NOT_FOUND` / `AMBIGUOUS_JOB_ID` を `SpecRunnerError` として catch し、`message` + `hint` を stderr に出力して exit code 1 を返す

## 4. `resume` コマンドへの統合

- [x] 4.1 `src/core/command/resume.ts` の `prepare()` 内、`resolveJobStateBySlug(this.slug)` が `null` を返した場合に `resolveJobId(this.slug)` でフォールバック解決を試みる
- [x] 4.2 `resolveJobId` が完全 UUID を返したら `loadJobState(fullId)` で `JobState` を取得して処理を継続する
- [x] 4.3 `resolveJobId` が throw した場合（`JOB_NOT_FOUND` / `AMBIGUOUS_JOB_ID`）は既存のエラーハンドリング（`PrepareError`）に統合する

## 5. ユニットテスト

- [x] 5.1 `tests/` に `resolveJobId` のテストファイルを作成する（テスト配置は既存の `tests/state-store.test.ts` のパターンに従う）
- [x] 5.2 テストケース: 完全 UUID（36 文字）が渡された場合はそのまま返す（`listJobStates` を呼ばない）
- [x] 5.3 テストケース: 短縮 ID で 1 件 match → 完全 UUID を返す
- [x] 5.4 テストケース: 短縮 ID で 0 件 match → `JOB_NOT_FOUND` エラーを throw する
- [x] 5.5 テストケース: 短縮 ID で 2 件以上 match → `AMBIGUOUS_JOB_ID` エラーを throw する（候補一覧が hint に含まれる）
- [x] 5.6 テストケース: 1 文字の prefix でも一意なら解決できる

## 6. 検証

- [x] 6.1 `bun run typecheck` が pass する
- [x] 6.2 `bun run test` が pass する（既存テストの regression なし）
