# finish を分解し、archive を client-closed な最終片づけコマンドにする

## Meta

- **type**: spec-change
- **slug**: archive-command
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

現状 `job finish` は1コマンドで Phase 0-4 を一括実行する（`src/core/finish/orchestrator.ts`）:

- Phase 1: change folder `changes/<slug>/` を `changes/archive/<slug>/` へ移動・commit（feature branch 上）
- Phase 2: feature branch を push
- Phase 3: squash merge
- Phase 4 + markJobArchived: worktree を畳む・status を `archived` に更新

このため、決定的なローカルの片づけ（folder 移動・worktree 撤去・status 更新）が、外部かつ非同期な GitHub 上の merge と同一コマンドに密結合している。merge のタイミングを GitHub / 人に委ねられず、merge の不確定性（branch protection 充足・required check の green/red・タイミング）が片づけ処理にまで波及する。

## 要件

### 1. archive コマンドの新設（client-closed な最終片づけ）

review・merge が完了した change を片づける `job archive <slug>` を新設する。動作は:

- change folder `changes/<slug>/` を `changes/archive/<slug>/` へ移動し、main に commit + push する。
- 対象 job の worktree を畳む。
- job status を `archived`（最終状態）に更新する。

archive は merge を行わず、外部状態の待ち・polling・merge 分岐を一切含まない。決定的なローカル処理と、folder 移動コミットの main への push のみで完結する（client-closed）。client-closed の構造的不変として、**archive は GitHubClient(port) に依存しない**（merge も PR status 問い合わせも持たない。`architecture/components.md` の ArchiveOrchestrator）。

### 2. merge を片づけ責務から切り離す

merge は外部（GitHub / 人）が任意のタイミングで行う前提とし、片づけ（archive）の動作から merge を除く。merge 済みであることを archive の前提条件として扱う。`job finish` コマンドは削除する（旧 merge+archive 一括動作も同時に廃され、merge する経路は `job archive --with-merge` の opt-in のみになる）。

### 3. (opt-in) green-gated な merge 便利オプション

利便のため、opt-in のオプション `job archive --with-merge` で「PR が mergeable（branch protection 充足 = green）になるまで待って merge → 続けて archive」を一気通貫で行う経路を提供する。green でない（BLOCKED / UNSTABLE）場合は merge せず止める。このオプションを使わない場合、CLI は merge を行わない。

### 4. merge 待ち status の rename

`awaiting-merge`（`src/state/schema.ts` の `JobStatus`、`src/state/lifecycle.ts` の遷移表）を **`awaiting-archive`** へ置き換える（VALID_TRANSITIONS の遷移形は不変・rename のみ。`architecture/domain-model.md` の状態機械）。永続化済み job state（`.specrunner/jobs/*.json`）の旧 status は **load 時に `awaiting-archive` へ remap** する（legacy `success` の既存 remap と同方式）。

## 受け入れ基準

- [ ] `job archive <slug>` が change folder 移動・main へ commit + push、worktree 片づけ、status 更新を行い、merge を行わない
- [ ] archive が **GitHubClient(port) に依存せず**（merge / PR status 問い合わせを持たない）、外部状態の待ち・polling を含まず、前提（merge 済み）を満たせば決定的に完結する
- [ ] merge がデフォルトの片づけ経路から切り離されている（オプション未指定時は CLI が merge しない）
- [ ] `job finish` コマンドが削除され、merge する経路は `job archive --with-merge` のみ
- [ ] `job archive --with-merge` で green 到達まで待って merge → archive する経路があり、green でなければ merge しない
- [ ] `awaiting-merge` が `awaiting-archive` へ置換され、旧 status（`success` / `awaiting-merge`）を持つ永続 job state が load 時に `awaiting-archive` へ remap される
- [ ] `rebase-finish` / `request-merge` skill が新コマンド構成に追従している
- [ ] `bun run typecheck && bun run test` が green
