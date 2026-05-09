## Why

`specrunner ps` は Job ID の先頭 8 文字を表示するが、`specrunner rm` と `specrunner resume` は完全な UUID（36 文字）しか受け付けない。`ps` → `rm` のワークフローでユーザーが 36 文字をコピペする必要があり、UX が煩雑である。Docker CLI / Git の短縮 ID と同様に、一意に特定できる prefix で操作できるべきである。

## What Changes

- `src/state/store.ts` に `resolveJobId(prefix: string): Promise<string>` を追加。完全 UUID またはその prefix を受け取り、`listJobStates()` で prefix match して完全 UUID を返す
- `src/errors.ts` に `AMBIGUOUS_JOB_ID` エラーコードと factory helper を追加。prefix match で 2 件以上ヒットした場合に候補一覧を hint に含めて throw する
- `src/cli/rm.ts` が `removeSingleJob` に渡す前に `resolveJobId` で完全 UUID を解決する
- `src/cli/resume.ts` / `src/core/command/resume.ts` で slug 解決失敗時に `resolveJobId` による job ID prefix 解決にフォールバックする
- 対象外: `ps` の表示形式変更、`finish` への適用（slug ベース）、slug ベースの検索

## Capabilities

### New Capabilities

- `resolveJobId`: 完全 UUID または短縮 ID prefix を受け取り、一意に特定された完全 UUID を返す store 関数

### Modified Capabilities

- `rm` コマンド: 短縮 Job ID を受け付ける（内部で `resolveJobId` → `removeSingleJob`）
- `resume` コマンド: slug 解決失敗時に短縮 Job ID としても解決を試みる

## Impact

- **Affected code**:
  - `src/state/store.ts`（`resolveJobId` 関数を追加）
  - `src/errors.ts`（`AMBIGUOUS_JOB_ID` エラーコード + `ambiguousJobIdError` helper 追加）
  - `src/cli/rm.ts`（`removeSingleJob` 呼び出し前に `resolveJobId` を挿入）
  - `src/core/command/resume.ts`（slug 解決失敗時の job ID prefix フォールバック追加）
  - `src/core/rm/runner.ts`（変更なし — `removeSingleJob` は完全 UUID を受け取る既存インターフェース維持）
- **Affected tests**: `resolveJobId` のユニットテスト新規追加（0 件/1 件/複数件）。既存 rm / resume テストへの影響なし
- **Backward compatibility**: 完全 UUID での操作は既存動作を維持。短縮 ID は純粋な追加機能
- **Out of scope**: `ps` の表示形式変更、`finish` コマンドへの適用、slug ベースの検索
