# ADR-20260603: archive コマンドを client-closed な最終片づけに分離する

## ステータス

accepted

Supersedes: [ADR-20260501-cli-finish-command](2026-05-01-cli-finish-command.md), [ADR-20260502-finish-1pr-model](2026-05-02-finish-1pr-model.md)

## コンテキスト

`job finish` は Phase 0–4 を一括実行する（`src/core/finish/orchestrator.ts`）。

```
Phase 1: feature branch 上で archive change folder → commit
Phase 2: feature branch を push
Phase 3: GitHub REST API で squash merge
Phase 4: worktree 撤去 + status → archived
```

この設計では、決定的なローカル片づけ（folder 移動・worktree 撤去・status 更新）が外部かつ非同期な GitHub merge と同一コマンドに密結合している。merge の不確定性（branch protection 充足・required check・タイミング）が片づけ処理に波及し、merge タイミングを GitHub / 人に委ねられなかった。

## 決定

### D1: ArchiveOrchestrator は GitHubClient port に依存しない（client-closed）

`ArchiveInput` に `githubClient` / `owner` / `repo` フィールドを持たせない。orchestrator モジュールは `src/core/port/github-client.ts` を import しない。archive 実行パスは GitHub API 呼び出し（PR status 問い合わせ・merge）を一切行わない。

**採用理由**: orchestrator 内部に merge 分岐を持つと Phase 3 の polling / retry ロジックが archive に再侵入する。merge と archive を呼び出し側で直列合成すれば、orchestrator は外部状態によらず決定的に完了する。

**却下案**: orchestrator に `withMerge` flag を渡して内部分岐する → GitHubClient 依存が orchestrator に戻り、構造的不変が崩れる。

### D2: `--with-merge` は CLI 層で merge → archive を直列実行する

`src/cli/archive.ts` が `--with-merge` フラグを見て:
1. GitHubClient を組み立て PR の mergeStateStatus を確認
2. CLEAN なら squash merge 実行
3. merge 成功後に ArchiveOrchestrator を呼ぶ
4. BLOCKED / UNSTABLE / DIRTY なら escalation で停止

merge ロジックは `src/core/archive/merge-then-archive.ts` として切り出す。ArchiveOrchestrator 自体には touch しない。

**採用理由**: merge の成否が archive orchestrator に影響しないため、archive の client-closed 不変を維持できる。`--with-merge` を指定しない通常の `job archive` は GitHub への通信をゼロにできる。

**却下案**: finish を archive の alias にする → finish は merge を含む意味を持っていたため alias にすると merge されない期待とのギャップが生じる。

### D3: `awaiting-merge` → `awaiting-archive` rename を load 時 remap で行う

`validateJobState` 内の既存 `success → awaiting-merge` remap パターンに倣い、`awaiting-merge → awaiting-archive` を追加する。`JobStatus` 型から `"awaiting-merge"` を削除し `"awaiting-archive"` を追加。VALID_TRANSITIONS の key / value も同様に rename。

永続化済み JSON を直接書き換えない。load 時の remap で透過的に移行する。

**採用理由**: status の意味が「merge を待っている」から「archive を待っている」に変わることを型レベルで表現する。既存の remap パターンと同方式のため migration リスクが低い。

### D4: `job finish` コマンドを deprecation メッセージ付きで削除する

`specrunner job finish <slug>` 実行時に stderr へ deprecation メッセージを出力し exit 2 を返す。`Unknown subcommand: finish` にならないよう handler を残す。

**採用理由**: 旧コマンドを単純削除すると `Unknown subcommand: finish` になりユーザーが混乱する。alias にすると merge が行われない点で旧挙動と差異があり誤解を招く。明示的な deprecation メッセージが最も安全。

### D5: archive orchestrator のフェーズ構成（main branch 上での実行）

```
Phase 0: pre-flight（job state load + finishable gate + change folder 存在確認）
Phase 1: main checkout → archive change folder → commit → push to main
Phase 2: worktree 撤去 + branch 削除（best-effort）
Phase 3: status → archived
```

Phase 1 は main 上で実行する（feature branch ではなく main に commit + push）。既存の `archiveChangeFolder` / `commitArchive` / `deriveAndWriteUsage` をそのまま再利用する。`resolveTarget` は使わず、slug → job state load から slug / jobId / branch / worktreePath を直接取得する。

**採用理由**: feature PR の merge 後に archive を実行する前提のため、main に直接 commit + push する設計が自然。feature branch は merge 済みのため参照不要。

## 検討した代替案

### A1: `finish` を 2 コマンドに分割せず merge 済み確認ロジックを追加する

`job finish` が PR 状態を確認し、MERGED であれば archive のみ実行する案。

- **Pros**: コマンド名の変更が不要
- **Cons**: 依然 GitHubClient への依存が残り、archive の決定性が損なわれる
- **Why not**: D1 の client-closed 不変を達成できない

### A2: archive orchestrator に `withMerge` flag を渡して内部分岐する

`ArchiveOrchestrator` に `withMerge: boolean` フラグを持たせ、true の場合は orchestrator 内部で GitHubClient を受け取って merge → archive を実行する案。

- **Pros**: 呼び出し側の分岐が不要になり、CLI 層がシンプルになる
- **Cons**: `ArchiveInput` に `githubClient` / `owner` / `repo` が入り、orchestrator の GitHubClient 非依存（client-closed）不変が崩れる。merge の polling / retry ロジックが orchestrator に再侵入し、archive 単体経路でも GitHubClient の mock が必要になる
- **Why not**: orchestrator を外部状態から切り離すことが本変更の中核的設計目標。flag 分岐は「依存しないことを型・モジュール境界で保証する」の代わりに「依存するが使わない」状態を生む

### A3: archive を merge 後の webhook / CI で自動実行する

GitHub webhook から archive を trigger する案。

- **Pros**: 人間の操作が不要になる
- **Cons**: SpecRunner の外部依存が増え、CLI の自己完結性が失われる
- **Why not**: CLI として deterministic に完結する設計方針に反する

## 影響

### Positive

- archive は GitHubClient に依存しないため、GitHub が到達不能な環境・offline でも実行できる
- merge と archive の責務分離により、merge の不確定性が片づけ処理に波及しなくなる
- `job archive` は冪等設計のため失敗時に再実行で回復できる
- `awaiting-archive` への rename により状態の意味が型レベルで明確になる

### Negative

- `job finish` を使っていた `rebase-finish` / `request-merge` skill のコマンド参照を更新する必要がある
- `--with-merge` 付き archive が merge 成功後 archive 失敗した場合、PR は merged だが status が archived にならない（再実行で回復可能）

### Known Debt

- main への直接 push が branch protection で拒否される環境では escalation が発生し手動対応が必要（`finish-respect-branch-protection` で指摘済みの既存課題と同構造）

## 参照

- Request: `specrunner/changes/archive-command/request.md`
- Design: `specrunner/changes/archive-command/design.md`
- Related: [ADR-20260501-cli-finish-command](2026-05-01-cli-finish-command.md) — finish コマンドの初期設計（本 ADR で supersede）
- Related: [ADR-20260502-finish-1pr-model](2026-05-02-finish-1pr-model.md) — 1-PR モデルへの移行（本 ADR で supersede）
- Related: [ADR-20260603-finish-branch-protection-gate](2026-06-03-finish-branch-protection-gate.md) — merge gate 設計（`--with-merge` 経路で継承）
