# cancel 時にジョブを canceled/<slug>-<jobId8>/ へ退避し、キャンセル記録・request の消失を解消する

## Meta

- **type**: spec-change
- **slug**: cancel-canceled-dir
- **base-branch**: main
- **adr**: true

## 背景

現在の `job cancel` は破壊的で、キャンセルした事実すら残らない：

1. worktree 削除の**後**に canceled state を persist するため、worktree-only state の local 実行ではキャンセル記録（`USER_CANCELED` / `canceledAt`）が**消える**。
2. request.md も既定では消える（`--restore-draft` を付けた時だけ drafts へ戻すが、同名 slug で skip して捨てる）。
3. canceled ディレクトリの概念が無く、キャンセルしたジョブの記録・成果物が一切残らない。

cancel の語義は「止めて片付ける（終わり）」で正しい——worktree 撤去も branch 削除も維持すべき。**ただし「何をいつなぜキャンセルしたか」の記録と成果物は残すべき**。本 request は、片付け（worktree 撤去 + branch 削除）は維持しつつ、ジョブの change-folder を main space の `canceled/<slug>-<jobId8>/` へ退避し、キャンセル記録を確実に残す。再開は「canceled を参考に**新しい jobId の新規 job** を起こす」想定で、in-place resume はしない（cancel は終わり）。

## 現状コードの前提

- `src/core/cancel/runner.ts:284` — `cleanupJobResources(...)` が worktree prune+remove（:167,:177）と local/remote branch 削除（:187,:193）を行う。
- `src/core/cancel/runner.ts:288-303` — その**後**に `transitionJob(..., "canceled", { patch: { error.code=USER_CANCELED, canceledAt, worktreePath:null } })` し、`resolveStateStoreByJobId(...)` で見つかった時のみ persist。worktree-only state の local job では保存先が消えており persist が skip → 記録喪失。
- `src/core/cancel/runner.ts:135-146` — `--restore-draft` は request.md を `drafts/<slug>/` へ戻すが、同名で skip（衝突時消失）。既定では request は保全されない。
- canceled ディレクトリの概念は存在しない（grep ゼロ）。完走 job は `src/core/finish/archive-change-folder.ts` で change-folder を `archive/<date>-<slug>/` へ移動する。
- branch / worktree 命名は `<slug>-<jobId8>`（`src/core/command/pipeline-run.ts:155` `${prefix}${slug}-${jobId.slice(0,8)}`）。`state.branch` に正確な branch 名が記録される。

## 要件

1. cancel 時、worktree を撤去する**前に**、ジョブの change-folder（request.md / state.json / events.jsonl / design・spec・tasks・test-cases・各 result アーティファクト）を main space の `specrunner/changes/canceled/<slug>-<jobId8>/` へ退避する。`jobId`（先頭8桁）を名前に含めて一意化し、**同名 slug を同日に複数回 cancel しても衝突しない**ようにする。
   - **退避は move（copy でなく）**：退避後に元の change-folder を削除し、`job ls` に重複が残らないようにする。特に **`--no-worktree` モードでは元が main の canonical `changes/<slug>/` に残る**ため、これを必ず削除する（worktree モードでは元は worktree 内なので worktree 撤去で消える）。退避先 `canceled/` を `list()` 等のスキャンが active job として拾わないことも保証する。
2. 退避した state にキャンセル記録（`error.code=USER_CANCELED` / `canceledAt` / reason）を含め、これが worktree 撤去後も残ることを保証する（記録喪失バグの解消）。
3. 片付けは維持する：worktree 撤去 + local/remote branch 削除（cancel の語義どおり）。**branch は残さない**。
4. in-place resume はしない。`canceled/` は参照用。やり直すときはそこを参考に**新規 job（新 jobId）**を起こす運用とする（canceled からの直接 resume は本 request のスコープ外）。
5. 退避先を main へ commit / tracking するか（archive と同様に commit するか、untracked で置くか）は design が決める。
6. `--restore-draft`（opt-in で drafts へ request 復元）は存置する。

## スコープ外

- archive/ の同種の衝突（`<date>-<slug>` に jobId 無し）の修正（別 request）。
- canceled からの直接 resume / pause・suspend（再開を前提に途中を保つ機能。cancel とは別概念・別 request）。
- managed runtime での変更ファイル導出など他の confirmed findings。

## 受け入れ基準

- [ ] local 実行（worktree-only state）のジョブを cancel すると、`canceled/<slug>-<jobId8>/` に change-folder が退避され、その state に `USER_CANCELED` / `canceledAt` が残ることをテストで固定する（記録喪失の回帰防止）。**既存テストが `makeJob` で canonical を直書きして穴を隠していた点も、worktree-only を再現する形に直す。**
- [ ] 同名 slug を同日に複数回 cancel しても `canceled/` で衝突しないことをテストで固定する（jobId 一意化）。
- [ ] cancel 後に local/remote branch と worktree が削除されることをテストで固定する（片付け維持）。
- [ ] request.md が `canceled/` に保全されることをテストで固定する（消失 issue の解消）。
- [ ] **`--no-worktree` モードで cancel 後、元の `changes/<slug>/` が残らず（`job ls` に active として現れない）、`canceled/<slug>-<jobId8>/` にのみ存在することをテストで固定する（copy でなく move の保証）。**
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- cancel の語義 = 止めて片付ける（終わり）。branch は削除し保全しない。**却下: branch を残して in-place resume 可能にする案** — それは cancel でなく pause/suspend であり語義に反する。
- ただし「キャンセルした事実＋成果物」の記録は残す価値があるため、change-folder を `canceled/` へ退避（墓標＋参照）。**却下: 何も残さず完全破棄** — キャンセル記録すら消えるのは監査上不可（現バグ）。
- 一意鍵は `jobId`（`<slug>-<jobId8>`）。**却下: `<date>-<slug>`（日付のみ）** — 同名 slug を同日に複数キャンセルすると衝突する（日単位の粒度では防げない）。`state.branch` に正確な branch 名が残るので、参照時の対応づけにも使える。
- 退避は **move（退避後に元 change-folder を削除）**。**却下: copy のみ** — `--no-worktree` モードでは canonical の `changes/<slug>/` が残り、キャンセル済みなのに `job ls` に active として重複表示される（前回の実装でこの gap が実際に発生した）。worktree モードでは元が worktree 内なので copy + worktree 撤去でも消えるが、両モードを揃えるため move を要件とする。
- 再開は新 jobId の新規 job。`canceled/` は参照材料で、in-place resume はしない（cancel は終わり）。
- 外部制約なし（内部 state / ディレクトリ規約のみ）。
