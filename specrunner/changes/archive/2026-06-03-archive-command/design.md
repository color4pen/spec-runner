# Design: finish を分解し archive を client-closed な最終片づけコマンドにする

## Context

現状 `job finish` は Phase 0–4 を一括実行する（`src/core/finish/orchestrator.ts`）。Phase 1–2 がローカル git 操作（archive folder 移動・push）、Phase 3 が GitHub REST API squash merge、Phase 4 が worktree 片づけ・status 更新。merge の不確定性（branch protection・required check・タイミング）が決定的なローカル片づけに波及している。

orchestrator.ts は GitHubClient port に依存し、preflight.ts / pr-status.ts が PR の mergeStateStatus を polling する。これら全てが `job finish` 1 コマンドに束ねられている。

## Goals / Non-Goals

**Goals**:

- `job archive <slug>` を新設し、merge を含まない決定的ローカル片づけ（change folder 移動・main へ commit+push・worktree 撤去・status→archived）を提供する
- archive orchestrator を GitHubClient port に依存しない構造（client-closed）にする
- `job finish` コマンドを削除し、merge する経路は `job archive --with-merge` opt-in のみにする
- `awaiting-merge` status を `awaiting-archive` に rename し、旧 status を load 時 remap する

**Non-Goals**:

- `archive-change-folder.ts` / `commit-archive.ts` / `derive-usage.ts` のロジック変更（既存の Phase 1 部品をそのまま再利用する）
- pr-create step や pipeline の動作変更
- merge strategy の変更（squash merge のまま）

## Decisions

### D1: ArchiveOrchestrator は GitHubClient を受け取らない

archive の構造的不変条件は「GitHubClient port に依存しない」こと。`ArchiveInput` に `githubClient` / `owner` / `repo` フィールドを持たせない。merge は `--with-merge` オプションが指定されたときのみ、CLI エントリ（`src/cli/archive.ts`）が merge フェーズを先に実行し、成功後に archive orchestrator を呼ぶ。

**rationale**: orchestrator 内部に merge 分岐を持つと、Phase 3 の polling / retry ロジックが archive に再侵入する。merge と archive を呼び出し側で直列合成すれば、orchestrator は決定的なまま。

**alternatives**: orchestrator に `withMerge` flag を渡して内部分岐する案 → 不採用。GitHubClient 依存が orchestrator に戻り、構造的不変が崩れる。

### D2: --with-merge は CLI 層で merge → archive を直列実行する

`src/cli/archive.ts` が `--with-merge` フラグを見て:
1. GitHubClient を組み立て、PR の mergeStateStatus を確認
2. CLEAN なら squash merge 実行
3. merge 成功後に archive orchestrator を呼ぶ
4. BLOCKED / UNSTABLE / DIRTY なら merge せず escalation で停止

merge ロジックは既存 `pr-status.ts` の `checkMergeableForMerge` と orchestrator の `mergeFeaturePrPhase3` 相当を `src/core/archive/merge-then-archive.ts` として切り出す。archive orchestrator 自体には touch しない。

**rationale**: merge の成否が archive orchestrator に影響しないため、archive の client-closed 不変を維持できる。

### D3: awaiting-merge → awaiting-archive の rename は schema.ts の remap で行う

`validateJobState` 内の既存 `success → awaiting-merge` remap パターンに倣い、`awaiting-merge → awaiting-archive` remap を追加する。`JobStatus` 型から `"awaiting-merge"` を削除し `"awaiting-archive"` を追加。VALID_TRANSITIONS の key/value も同様に rename。

**rationale**: 既存の remap パターンと同方式なので migration リスクが低い。永続化済み JSON を直接書き換えない。

### D4: job finish コマンドは削除、エラーメッセージで archive を案内する

`COMMANDS.job.subcommands.finish` をヒント付きエラーハンドラに置き換える。`specrunner job finish <slug>` 実行時に `"job finish" は廃止されました。"job archive <slug>" を使ってください。` を stderr に出力し exit 2 を返す。

**rationale**: 旧コマンドを単純削除すると `Unknown subcommand: finish` になり、ユーザーが混乱する。一方、handler を残して `archive` にリダイレクトすると挙動が曖昧。明示的な deprecation メッセージが最も安全。

**alternatives**: finish を archive の alias にする → 不採用。finish は merge を含む意味を持っていたため、alias にすると merge されない期待とのギャップが生じる。

### D5: archive orchestrator のフェーズ構成

```
Phase 0: pre-flight (job state load + finishable gate + change folder 存在確認)
Phase 1: main branch checkout → archive change folder → commit → push to main
Phase 2: worktree 撤去 + branch 削除（best-effort）
Phase 3: status → archived
```

Phase 0 は GitHubClient を使わない。PR status の確認は行わない（merge 済み前提）。
Phase 1 は main 上で実行する（feature branch ではなく main に commit + push）。
既存の `archiveChangeFolder` / `commitArchive` / `deriveAndWriteUsage` をそのまま再利用。

### D6: archive は main worktree からのみ実行可能

既存の worktree guard パターン（`guardedSubcommands`）に `"archive"` を追加。worktree 内からの実行を禁止する。

### D7: resolve-target は archive でも再利用、ただし PR 必須を緩和

既存 `resolveTarget` は `pullRequest.number` が必須。archive 単体では PR info が不要（merge しない）。`--with-merge` 時のみ PR info が必要。

archive orchestrator 側では `resolveTarget` を使わず、slug → job state load → slug / jobId / branch / worktreePath を直接取得する。`--with-merge` 時の merge フェーズでのみ `resolveTarget` 相当の PR 解決を行う。

## Risks / Trade-offs

- [Risk] 既存の `rebase-finish` / `request-merge` skill が `specrunner job finish` を参照している → skill ファイルのコマンド参照を `job archive` に更新する必要がある
  - Mitigation: tasks に skill 更新タスクを含める

- [Risk] `awaiting-merge` → `awaiting-archive` rename により、外部ツールや手動スクリプトが壊れる可能性
  - Mitigation: load 時 remap で永続化済みデータは透過的に移行。コード内の全参照を grep で洗い出し一括置換する

- [Risk] `--with-merge` 付き archive が失敗した場合の状態：merge 成功後 archive 失敗で、PR は merged だが status が archived にならない
  - Mitigation: merge 成功直後の archive 失敗は再実行で回復可能（archive は冪等設計）

## Open Questions

なし
