# orphan worktree（state 無し）の検出と掃除をツールで可能にする

## Meta

- **type**: new-feature
- **slug**: orphan-worktree-doctor
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->
<!-- 新しい掃除（GC）能力を追加し、置き場所（doctor 検出＋専用 prune コマンド）という設計選択を伴うため true -->

## 背景

job の起動中（worktree 生成後・job state 永続前）にプロセスが死ぬと、`.git/specrunner-worktrees/<slug>-<jobId8>/` の worktree とその feature ブランチが残るが、対応する job state / sidecar が無い。この「state 無し orphan worktree」は:

- `job cancel <jobId>` で掃除できない（cancel は jobId と state を必要とする）
- 既存の `doctor` の `orphan-sidecars` check でも拾えない（sidecar が無いため、かつ同 check は orphan **sidecar** のみ対象）

結果、利用者は手動で `git worktree remove` / `git branch -D` する必要がある（実運用で複数回発生）。本リクエストは、この orphan worktree をツールで検出・掃除できるようにする。

## 現状コードの前提

<!-- 書く直前に grep で再検証する。 -->

- src/core/runtime/local.ts:466 — `manager.create(...)` で worktree+ブランチを生成。続く src/core/runtime/local.ts:479（`if (opts?.bootstrapState)` で state.json 永続）と src/core/runtime/local.ts:484（liveness sidecar 書込）より**前**にプロセスが死ぬと、worktree は存在するが state/sidecar が無い orphan になる
- src/core/command/pipeline-run.ts:121-122 — `bootstrapJob` は in-memory（コメント「persistence is deferred to setupWorkspace」）。最初の永続は setupWorkspace
- src/core/cancel/runner.ts — `job cancel` は `loadStateByJobId`（src/core/job-access/load-by-job-id.js）で jobId から state を解決して掃除する。state が無い orphan は解決できず掃除対象にできない
- src/cli/doctor.ts — `specrunner doctor` は公開済み。`commonChecks`/`managedChecks`/`localChecks`（src/core/doctor/checks/index.ts）を実行する
- src/core/doctor/checks/storage/orphan-sidecars.ts — orphan **sidecar**（`.specrunner/local/<slug>/`）を検出するが **read-only（削除せず warn＋rm ヒント）**。worktree は対象外
- src/core/doctor/checks/index.ts:49-67 — `commonChecks` に `orphanSidecarsCheck` 等が登録されている。**orphan worktree を検出する check は存在しない**
- src/core/worktree/manager.ts `buildWorktreePath` — worktree は `<repoRoot>/.git/specrunner-worktrees/<slug>-<jobId8>/`
- `JobStateStore.list(repoRoot, { includeArchived: true })`（src/store/job-state-store.ts）で既知 job を列挙できる（worktree が「既知 job に属するか」の判定に使える）

## 要件

<!-- 実装の最重量部を名指しする。 -->

1. **orphan worktree 検出 check（doctor, 読み取り専用）**: `commonChecks` に新 check を追加する。`.git/specrunner-worktrees/*` を列挙し、各 worktree が「非終了（running / awaiting-* / failed / terminated）の既知 job state に対応するか」を `JobStateStore.list({ includeArchived: true })` 等で判定する。対応する live/解決可能な job が無い worktree を **orphan** として報告する（パス・ブランチ名・掃除ヒントを列挙）。`orphan-sidecars` と同じ read-only 哲学に揃える
2. **掃除コマンド（guarded）**: orphan worktree とその local ブランチを削除する `job prune` コマンドを追加する。**既定は dry-run**（削除せず対象を列挙）、`--force`（または明示フラグ）で実削除。削除は best-effort かつ idempotent（再実行で no-op）
3. **work 保護ガード**: 掃除は **uncommitted な変更または未 push のコミットを持つ worktree をスキップ**し、その旨を警告する（orphan は通常空だが、誤って作業を破壊しない）。live job・state/sidecar で解決可能な job の worktree は対象外（それらは `job cancel`/`job archive` 経由）
4. detection ロジックは check と prune で共有する（二重実装しない）

## スコープ外

- setupWorkspace で state/sidecar を worktree 生成と原子的に先行永続して orphan 窓を縮める runtime 変更（別件。窓は小さく、本リクエストは症状＝既存 orphan の検出・掃除に絞る）
- `job ls` の可視化タイミング（state は setupWorkspace で早期永続される設計で、遅延の機構が未確証のため対象外）
- フラグ無しの自動 prune（破壊的操作は明示フラグ必須）
- managed runtime 固有の orphan（local runtime に絞る）
- orphan **sidecar** の掃除（既存 `orphan-sidecars` check の責務）

## 受け入れ基準

<!-- 機械検証できる文にする。 -->

- [ ] state を持たない worktree（`.git/specrunner-worktrees/` 配下に存在するが対応する非終了 job state が無い）を doctor が orphan として報告することを fixture テストで固定する
- [ ] 非終了の既知 job に属する worktree は orphan として報告しないことをテストで固定する
- [ ] `job prune`（既定 dry-run）が orphan worktree を**削除せず**列挙し、`--force` で worktree+local ブランチを削除し、再実行が no-op（idempotent）であることをテストで固定する
- [ ] uncommitted/未 push の変更を持つ worktree は `--force` でもスキップされ警告されることをテストで固定する
- [ ] 既存 doctor check（orphan-sidecars 等）の挙動が不変であることを確認する
- [ ] 既存テスト無変更で `bun test` green、`typecheck` green、`bun run build` 成功

## architect 評価済みの設計判断

<!-- 採用した判断＋却下した代替案とその理由。 -->

1. **採用: 既存 doctor framework を拡張（orphan-sidecars と対の orphan-worktrees check）** — 健全性診断は doctor に集約されており、検出は同パターンで read-only に揃えるのが一貫的かつ発見しやすい。
2. **採用: 掃除は専用 `job prune` コマンド（dry-run 既定＋明示 force）** — doctor は現状すべて read-only（診断専用）。doctor に fix-mode を導入すると診断の契約が広がる。worktree は `job` 名前空間にあり、`job prune` が発見的。**却下案**: `doctor --fix`（read-only 契約を崩す）、`job cancel` 拡張（cancel は jobId+state 前提で state 無し orphan を扱えない）。
3. **採用: work 保護ガード（uncommitted/未 push はスキップ）** — orphan は通常空だが、破壊的削除で万一の未 push 作業を失わない安全側。
4. **却下: orphan 窓そのものを消す runtime 変更（state 先行永続）** — setupWorkspace の hot path に触れ、窓は小さい。症状（既存 orphan の掃除）を先に低リスクで解決し、根本の窓縮小は別件とする。
