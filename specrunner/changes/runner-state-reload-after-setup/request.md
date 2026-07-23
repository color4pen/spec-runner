# setupWorkspace 後の in-memory state を store から reload し、field 手動 mirror を廃止する

## Meta

- **type**: bug-fix
- **slug**: runner-state-reload-after-setup
- **base-branch**: main
- **adr**: false

## 背景

外部リポジトリでの v0.4.2 初回実運用(job ef93ae2a)で、新規 run の最初の push が EGRESS_UNKNOWN_COMMIT で halt した。遮断された commit は bootstrap の materialization commit と request-review の合成 commit — いずれも pipeline 自身のものである。

根本原因は state の二重管理にある。setupWorkspace(materializer)は bootstrap commit の OID を **store(slug store の state.json)にのみ**追記する(#895)。一方 runner は pipeline に渡す **in-memory の jobState** へ、store に書かれた field のうち worktreePath と branch だけを**手動 mirror**しており、synthesizedCommits は mirror されない。結果、pipeline は ledger 空の in-memory state で走り、egress 照合が bootstrap commit を unknown と判定して halt する。さらに halt 経路の persist が ledger 無しの in-memory state を store へ書き戻し、実観測どおり `synthesizedCommits: null` を残す。

field を 1 つ mirror に足す修正は同型の再発(次に store へ書かれる新 field がまた漏れる)を許すため、**mirror という seam 自体を廃止**し、setupWorkspace 完了後に store から state を reload して in-memory を一本化する。

## 現状コードの前提

- `src/core/command/runner.ts:170-180` — setupWorkspace 後、in-memory jobState へ `worktreePath` と `branch` のみを手動 mirror している(「setupWorkspace() persists to the state store, but the in-memory object passed to…」のコメント付き)。synthesizedCommits の mirror は存在しない
- `src/core/runtime/workspace-materializer.ts:112-116` — seed(bootstrapState を slug store へ persist)→ `updateJobState`(worktreePath / request.path / **appendSynthesizedCommit** / branch)の順で **store のみ**を更新する
- `src/core/step/commit-push.ts` — 各 egress 照合は `state.synthesizedCommits`(pipeline に渡された in-memory state)を ledger の正として読む
- `tests/unit/core/runtime/bootstrap-egress-ledger-wm.test.ts` — TC-001 は host.updateJobState を mock して mutator 適用を検証、TC-002(local)は store を直読して検証。**「store に書いた ledger が pipeline の in-memory state に到達する」経路はどのテストも踏んでいない**
- 実発現環境: specrunner 0.4.2 / 外部 repo / local runtime / worktree あり / slug store。halt 後の state.json は `synthesizedCommits: null`・`worktreePath: null`・checkpoint egress warning の branch が空文字(mirror 漏れ+halt persist の書き戻しで説明が付く症状群)

## 要件

1. **reload による一本化**: runner は setupWorkspace 完了後、slug store から state を reload し、以降の pipeline 実行にはその state を渡す。`worktreePath` / `branch` の手動 mirror コード(runner.ts:170-180)は削除する。reload 失敗は fail-closed(run を開始しない)。
2. **in-memory 専用 field の保全**: bootstrapJob 後〜setupWorkspace 前に in-memory にのみ設定される field(reviewers snapshot / noWorktree / issueNumber 等)が reload で失われないこと。seed(bootstrapState の persist)がそれらを含む時点で行われる現行順序を前提に、reload 後の state にそれらが含まれることをテストで固定する。
3. **封鎖テスト(実 store + 実 git)**: 手動 seed なしで「bootstrap → 最初の scoped step の commit + push」を実 store・実 worktree で通し、egress が EGRESS_UNKNOWN_COMMIT を出さないことを固定する(外部 repo 実発現の再現封鎖)。pipeline に渡った state の synthesizedCommits に bootstrap OID が含まれることを直接 assert する。
4. **halt 経路の非破壊**: 途中 halt の persist が store 上の synthesizedCommits を null に退行させないことをテストで固定する(reload 一本化により in-memory が常に store 由来となることの帰結を明示的に固定)。

## スコープ外

- egress 照合の意味論変更(fail-closed は正しく機能した)
- managed runtime の同型確認(store 構成が異なる。必要なら別 request)
- 外部 repo 側の halt 済み job の救済手順(operator の branch 手 push + resume で回復可能 — 運用文書)

## 受け入れ基準

- [ ] 実 store + 実 git の統合テストで、新規 bootstrap → 初回 scoped commit + push が EGRESS_UNKNOWN_COMMIT なしで通ることを固定する(手動 seed なし)
- [ ] pipeline に渡る state の synthesizedCommits に bootstrap OID が含まれることを直接 assert する(store 直読でなく in-memory 経路)
- [ ] runner.ts の worktreePath / branch 手動 mirror が削除され、reload に置換されていること
- [ ] reviewers / noWorktree / issueNumber が reload 後も保持されることをテストで固定する
- [ ] reload 失敗(store 読取り不能)で run が開始されないことをテストで固定する(fail-closed)
- [ ] 修正前の挙動(mirror 方式)に戻すと封鎖テストが fail することを破壊確認として記録する
- [ ] 既存の bootstrap-egress-ledger / egress / 合成テストは無改変で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: reload による一本化(mirror の廃止)**。真実の所在を「setupWorkspace 後は store」と一意にし、store へ書かれる field が増えても pipeline に自動で届く構造にする。field 単位の mirror 追加は同型再発(今回の synthesizedCommits がその実例)を許す対症療法であり却下。
- **採用: reload 失敗は fail-closed**。state 不明のまま pipeline を走らせない(#893 以降の一貫方針)。
- **却下: egress 側で bootstrap commit を特別扱い(除外)** — 照合範囲の縮小は resume 盲点を作るため設計 D4 で禁止済み。台帳側の完全性で解く。
