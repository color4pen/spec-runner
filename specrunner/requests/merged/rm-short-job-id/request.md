# rm コマンドで短縮 Job ID を受け付ける

## Meta

- **type**: new-feature
- **slug**: rm-short-job-id
- **base-branch**: main

## 背景

`specrunner ps` は Job ID の先頭 8 文字を表示するが、`specrunner rm` は完全な UUID しか受け付けない。`ps` → `rm` のワークフローで 36 文字の UUID をコピペする必要があり煩雑。

```bash
# ps が表示する短縮 ID
3f1a1f29  worktree-guard  running  2m ago

# rm は完全 UUID が必要
specrunner rm 3f1a1f29  # => Error: Job not found
specrunner rm 3f1a1f29-0669-482a-b2d4-0f272e1caaf3  # => OK
```

## 要件

1. `state/store.ts` に prefix match でジョブを検索する関数を追加する
   - `resolveJobId(prefix: string): Promise<string>` — 完全 UUID または短縮 ID を受け取り、完全 UUID を返す
   - 完全 UUID（36 文字）が渡された場合はそのまま返す（既存の `loadJobState` に委ねる）
   - 短縮 ID の場合、`listJobStates()` から prefix match で候補を検索
   - 一意に特定できれば完全 UUID を返す
   - 0 件: `JOB_NOT_FOUND` エラーを throw
   - 2 件以上: `AMBIGUOUS_JOB_ID` エラーを throw（候補一覧を hint に含める）
2. `errors.ts` に `AMBIGUOUS_JOB_ID` エラーコードを追加する
3. `rm` コマンド（`src/cli/rm.ts`）が `resolveJobId` を呼んでから `removeSingleJob` に渡す
4. `resume` コマンドでも同様に短縮 ID を受け付ける（同じ `resolveJobId` を使用）

## スコープ外

- `ps` コマンドの表示形式変更
- `finish` コマンドへの適用（finish は slug ベースのため不要）
- slug ベースの検索（既存の `ps --slug` がカバー）

## 受け入れ基準

- [ ] `specrunner rm <8文字>` で一意に特定できるジョブを削除できる
- [ ] 曖昧な短縮 ID に対してエラーメッセージが候補を表示する
- [ ] 完全 UUID での rm が引き続き動作する
- [ ] `specrunner resume <8文字>` でも短縮 ID が使える
- [ ] `resolveJobId` のユニットテストが存在する（0件/1件/複数件）
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

- `resolveJobId` は `state/store.ts` に配置。ジョブ状態ファイルの検索は store の責務
- 短縮 ID の最小長は制限しない。1 文字でも一意なら受け付ける
- `rm --all-terminated` は ID 解決不要のため変更なし
