## Context

`specrunner ps` は `state.jobId` の先頭 8 文字を `JOB_ID` 列に表示する。ユーザーが `ps` で確認した Job ID を `rm` や `resume` に渡す際、完全な UUID（36 文字）を毎回コピペする必要がある。Docker CLI（`docker rm <prefix>`）や Git（`git show <short-sha>`）と同様に、短縮 ID での操作を可能にすることで CLI の操作性を向上させる。

## Goals / Non-Goals

**Goals:**

- `resolveJobId(prefix)` を `state/store.ts` に追加し、短縮 ID → 完全 UUID の解決を一元化する
- `rm` コマンドで短縮 ID を受け付ける
- `resume` コマンドで slug 解決失敗時に短縮 ID としてフォールバック解決する
- 曖昧な短縮 ID に対して候補一覧付きエラーを返す
- `resolveJobId` のユニットテストで 0 件/1 件/複数件のケースをカバーする

**Non-Goals:**

- `ps` の表示形式変更（先頭 8 文字表示は現状維持）
- `finish` コマンドへの短縮 ID 適用（finish は slug ベースのため不要）
- slug ベースの検索（既存の `ps --slug` がカバー）
- 短縮 ID の最小長制限（1 文字でも一意なら受け付ける）

## Decisions

### D1. `resolveJobId` は `state/store.ts` に配置する

`resolveJobId(prefix: string): Promise<string>` を `state/store.ts` に export する。

**Rationale:** ジョブ状態ファイルの走査と prefix match は store 層の責務である。`listJobStates()` を使った検索ロジックを store 外に漏らすと、store の内部表現（ファイル名 = UUID）への依存が拡散する。将来 DB バックエンドに切り替える場合も store 内で吸収できる。

**Alternative considered:** `src/core/rm/resolve.ts` 等の core 層に配置する案 → `rm` と `resume` で重複する上、`listJobStates()` の呼び出しが store 外に漏れるため却下。

### D2. 完全 UUID（36 文字）はそのまま返し、`listJobStates` を呼ばない

入力が UUID v4 形式（36 文字、ハイフン含む）の場合は `listJobStates()` を呼ばずそのまま返す。存在確認は呼び出し元の `loadJobState` に委ねる。

**Rationale:** 完全 UUID で `listJobStates()` を呼ぶのは無駄な I/O。`loadJobState` が `JOB_NOT_FOUND` を throw する既存フローで十分。`rm` の `removeSingleJob` は既に `loadJobState` を内部で呼んでいるため、二重チェックにならない。

**Alternative considered:** 全入力で `listJobStates()` を走査して存在確認もする案 → 完全 UUID の典型パスで不要な I/O が増えるため却下。

### D3. `AMBIGUOUS_JOB_ID` エラーで候補一覧を hint に含める

prefix match で 2 件以上ヒットした場合、`AMBIGUOUS_JOB_ID` エラーを throw し、`hint` に候補の完全 UUID 一覧を含める。

```typescript
throw new SpecRunnerError(
  ERROR_CODES.AMBIGUOUS_JOB_ID,
  `Matching jobs:\n${matches.map(s => `  ${s.jobId}`).join("\n")}`,
  `Ambiguous job ID prefix: "${prefix}" matches ${matches.length} jobs`,
);
```

**Rationale:** ユーザーが曖昧性を解消するために候補を即座に確認できる。Docker CLI の `Error response from daemon: Multiple IDs found with provided prefix` と同等の UX。

### D4. `resume` は slug 解決 → job ID prefix 解決の順でフォールバックする

`resume` の positional 引数は slug として解決を試み、見つからなければ `resolveJobId` で job ID prefix として解決する。

**Rationale:** `resume` は slug ベースの操作が primary use case であり、既存ユーザーの操作を壊さない。ただし `ps` が表示する short job ID でも `resume` できる利便性を提供する。slug と job ID prefix が衝突する確率は実質ゼロ（slug は英数ハイフン、job ID は UUID hex）。

**Alternative considered:** `resume --job <jobId>` flag を追加する案 → `finish --job` と同じパターンだが、`resume` の典型ユースケースでは positional が自然。slug/jobId の判定は自動で行える。

### D5. `rm --all-terminated` は変更しない

`rm --all-terminated` は `listJobStates()` で全件取得してフィルタする既存フローのため、ID 解決は不要。

## Risks / Trade-offs

- **[Risk] `listJobStates()` の全件走査がジョブ数に比例する** → Mitigation: 実運用ではジョブ数は数十件程度（終了後は `rm --all-terminated` で掃除される）。数百件でもファイルシステム走査は十分高速
- **[Trade-off] resume の positional が slug にも job ID にもなる二重解釈** → Mitigation: UUID hex と slug（英数ハイフンの意味のある名前）は実質的に衝突しない。万が一衝突しても slug が優先されるため、既存動作が壊れない

## Migration Plan

1. `src/errors.ts` に `AMBIGUOUS_JOB_ID` エラーコードと factory helper を追加
2. `src/state/store.ts` に `resolveJobId` を追加
3. `resolveJobId` のユニットテストを追加（0 件/1 件/複数件/完全 UUID pass-through）
4. `src/cli/rm.ts` に `resolveJobId` 呼び出しを挿入
5. `src/core/command/resume.ts` に slug 解決失敗時の job ID prefix フォールバックを追加
6. `bun run typecheck && bun run test` で全件 pass を確認

## Open Questions

- なし
