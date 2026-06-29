# archived だが未マージの job を resume 可能にする

## Meta

- **type**: bug-fix
- **slug**: archive-resume-when-unmerged
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->
<!-- archive/resume 経路の既存 list 呼び出しに既定オプションを渡すだけの挙動修復。新しい port/adapter や設計選択は無いため false -->

## 背景

`job archive --with-merge` は、アーカイブコミットを feature ブランチに記録する段で job status を `archived` に確定してから、その後に CI 待ち・PR マージを行う。ところがマージ段（mergeable 判定や CI など）が失敗して escalation した場合、job は既に `archived` になっているのに、再開（同じ `job archive` コマンドの再実行）が「No job found」で弾かれ、PR 未マージのまま再開不能になる。

原因は、archive/resume 経路の job 解決が archived 状態を走査しないこと。escalation が印字する再開コマンド自体が、その時点では必ず失敗する。本リクエストは「archived だが未マージ」の job を再開可能にする最小修正を行う。

## 現状コードの前提

<!-- 現状のコードについての断定は file:line を伴ってこの節に書く。書く直前に grep で再検証する。 -->

- src/store/job-state-store.ts:210 `JobStateStore.list(repoRoot, opts?: { includeArchived?: boolean })` — 既定では archived 状態を走査しない。`changes/archive/*/state.json` は `opts.includeArchived === true` のときだけ読む（src/store/job-state-store.ts:242-243）
- src/store/job-state-store.ts:379-381 — job 解決の prefix 一致では既に `JobStateStore.list(repoRoot, { includeArchived: true })` を渡しており、「archived job も解決可能であるべき」という前例がある
- src/core/archive/orchestrator.ts:112 `JobStateStore.list(cwd)` — `includeArchived` を渡さない。archived job は見つからず orchestrator.ts:116 で `No job found with slug '<slug>'` を返す
- src/core/archive/merge-then-archive.ts:125 `JobStateStore.list(cwd)` — 同上。archived job は見つからず merge-then-archive.ts:129 で `No job found` を返す
- src/core/finish/job-state-update.ts:79-84 `markJobArchived` — status を `archived` に遷移して persist。`--with-merge` では CI 待ち・マージ（merge-then-archive.ts の Step5 以降）より前に呼ばれる。既に archived のときは no-op（idempotent, job-state-update.ts:83）
- src/core/archive/merge-then-archive.ts:178 — `prData.state === "MERGED" && jobStatus === "archived"` のとき `runPostMergeCleanup` を呼ぶ分岐がある（「archive 記録済みで PR マージ済み → 中断した cleanup を再開」）。だが Step1 の list が archived を除外するため、この分岐には到達できない（事実上デッドコード）
- src/state/lifecycle.ts:46 `TERMINAL_STATUSES = { archived, canceled }`。src/core/archive/orchestrator.ts:129 は terminal status を `Already finished` として exitCode 0 で短絡する
- src/core/finish/resolve-canonical-state-dir.ts:22-28 — active（`changes/<slug>/`）優先、無ければ archive（`changes/archive/<dated>-<slug>/`）を解決する。`markJobArchived` は archived 後も canonical state を解決できる
- 対象外の list 呼び出し元（archived を意図的に除外して良い）: src/core/cancel/runner.ts:486 / src/core/inbox/run-inbox.ts:88,373 / src/core/lifecycle/exit-guard.ts:145。src/cli/archive.ts:96 はパイプラインログ用の best-effort 解決（失敗は握り潰し）で、ユーザー向け「No job found」の出所ではない

## 要件

<!-- 実装の最重量部を名指しする。粒度: 1 request = 1 つのレビュー収束ループで直しきれる範囲。 -->

1. **archive/resume 経路の job 解決を archived 込みにする**: `src/core/archive/orchestrator.ts:112` と `src/core/archive/merge-then-archive.ts:125` の `JobStateStore.list(cwd)` 呼び出しに `{ includeArchived: true }` を渡す。これにより「archived だが PR 未マージ」の job が再開時に解決され、`No job found` で弾かれなくなる
2. **archived+MERGED の cleanup 再開分岐を到達可能にする**: 要件 1 の結果、`job archive --with-merge <slug>` を archived かつ PR が MERGED の job に再実行すると merge-then-archive.ts:178 の分岐に到達し、`runPostMergeCleanup`（worktree/branch 撤去）が走って exitCode 0 で完了する
3. **archived+未マージの resume が前進する**: 同コマンドを archived かつ PR 未マージの job に再実行すると、archive 記録は idempotent な no-op（markJobArchived が archived を検知）で、CI 待ち→マージへ前進する
4. **非 --with-merge の `job archive <slug>` も archived job を解決する**: orchestrator が archived job を解決し、terminal 短絡で `Already finished`・exitCode 0 を返す（idempotent）
5. **対象外の list 呼び出し元の挙動を変えない**: cancel / inbox / exit-guard の `JobStateStore.list` は archived を含めないまま据え置く

## スコープ外

- `awaiting-merge` 等の中間 status を新設して archived 遷移をマージ後まで遅らせる lifecycle 変更（本バグは lookup 既定の見落としであり、archive→merge 順は構造的に必然なので status 先行自体は問題ない）
- mergeable 事前ゲート・CI 待ちの `none` 判定の是正（別リクエスト archive-merge-gate-hardening）
- マージ失敗時の worktree/branch の自動撤去方針の変更（resumability の回復が本リクエストの修正点）
- `job ls` のデフォルト表示や他コマンドの archived 走査方針

## 受け入れ基準

<!-- 機械検証できる文にする。 -->

- [ ] archived かつ PR 未マージの job に `job archive --with-merge <slug>` を再実行したとき `No job found` を返さず、CI 待ち／マージ経路へ進むことをテストで固定する
- [ ] archived かつ PR が MERGED の job に `job archive --with-merge <slug>` を再実行したとき merge-then-archive.ts:178 の分岐に入り `runPostMergeCleanup` が呼ばれ exitCode 0 になることをテストで固定する
- [ ] 非 `--with-merge` の `job archive <slug>` が archived job を解決し `Already finished`・exitCode 0 を返すことをテストで固定する
- [ ] cancel / inbox / exit-guard の `JobStateStore.list` 呼び出しが archived を含めない挙動を維持していることを確認する（無変更）
- [ ] 既存テスト無変更で `bun test` green、`typecheck` green、`bun run build` 成功

## architect 評価済みの設計判断

<!-- 採用した判断＋却下した代替案とその理由。 -->

1. **採用: archive/resume 経路の 2 つの list に `includeArchived: true` を渡す** — 本バグの実体は「lookup の既定値が archived を除外する」見落とし。既存の prefix 解決（store:379-381）が既に同オプションを渡している前例に倣う、整合的かつ最小の修正。
2. **却下: archived 遷移をマージ後まで遅らせる中間 status の新設** — lifecycle と全 status 消費者に波及し、本バグに対して過大。archive folder の移動は PR に乗せる必要があり「archive→merge」順は構造的に必然なので、status を先に立てること自体は誤りではない。
3. **対象限定: cancel / inbox / exit-guard は変更しない** — これらは archived を意図的に除外している（再 cancel・再実行・running 遷移の対象でない）。一律に includeArchived を広げると別の退行を生む。
