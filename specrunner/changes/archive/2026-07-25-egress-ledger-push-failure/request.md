# push 失敗時に synthesized commit の台帳追記が失われ、egress backstop が job を回復不能にする問題を修正する

## Meta

- **type**: bug-fix
- **slug**: egress-ledger-push-failure
- **base-branch**: main
- **adr**: true

## 背景

egress backstop は「publish range のすべての commit が synthesizedCommits 台帳に記録済みであること」を push 前に検証する fail-closed の関所である。この不変式は「pipeline が commit を作成したら、その OID は必ず台帳に永続化される」という前提に立つが、現行実装ではこの前提が push 失敗時に破れる。

実運用（外部 repo、specrunner 0.4.x、2026-07-24)で以下の連鎖が観測された:

1. request-review 完了後、pipeline が synthesis commit を作成し push を試行。GitHub 側の一過性障害（同日 16:17 UTC に公式 incident 宣言、17:36 解消)により push が 2 回とも exit 1 で失敗し、PUSH_FAILED throw で step が失敗した
2. OID の台帳追記は step 成功確定時（commitSuccess)にのみ persist されるため、**branch に commit は残るが台帳追記は失われた**
3. 失敗の後始末で commitFinalState が checkpoint commit を作成したが、その egress 検証が手順 1 の commit を unknown と判定して checkpoint push を skip。checkpoint commit の OID 自体も「terminal path では persist 不要」という設計メモの前提により永続化されなかった
4. resume 後の再実行では、publish range に孤児 commit 2 件（手順 1 の synthesis commit と手順 3 の checkpoint commit)が残り続け、egress 検証が EGRESS_UNKNOWN_COMMIT で halt。**以後何度 resume しても同一地点で halt し、job cancel 以外の出口がなくなった**

一過性の push 失敗（障害は 1 時間 19 分で解消)が、台帳の完全性欠落により恒久的な詰みに変換された。なお push 失敗の原因調査は「exit code 1」以外の情報が残らないこと（stderr 破棄)、egress 警告の branch が常に空文字であること（ハードコード)により著しく困難だった。

## 現状コードの前提

- src/core/step/commit-push.ts:531,600 — commitAndPush は synthesis commit 作成 → inline egress 検証 → pushOnly の順で実行する。pushOnly（:801-820)は 2 回失敗で pushFailedError を throw する
- src/core/step/commit-orchestrator.ts:409-421 — appendSynthesizedCommit(commitOid / exitCommitOid) → store.persist は commitSuccess（step 成功確定)の中でのみ実行される。pushOnly が throw した場合ここに到達しない
- src/core/step/commit-push.ts:632-720 — commitFinalState は checkpoint / finalize commit を作成後、in-memory union のみで egress 検証する。:693 の設計メモ「terminal path — in-memory union is sufficient; no need to persist the OID」は awaiting-resume（resume で走行が続く)経路を考慮しておらず誤り。push は best-effort（warn のみ)
- src/core/step/commit-push.ts:299-329 — verifyEgressLedger は branch を引数に持たず、`egressUnknownCommitError(oid, "")` と空文字をハードコードしている（:326)。halt 側の runInlineEgressCheck（:352-381)は branch を渡しており、同一エラーが呼び出し箇所によって branch 有無の異なる表示になる
- src/core/step/commit-push.ts:801-820 — pushOnly の失敗 detail は `exit code ${N}` のみで、git の stderr は gitExecExitCode の層で破棄される。commitFinalState の push 失敗警告（:716-719)も同様に stderr を含まない
- src/core/pipeline/parallel-review-round.ts:418-448 — **並列 round の commit 経路には本問題の対処が既に実装されている**: push 失敗時も round commit の OID を synthesizedCommits に記録・persist してから halt する（「egress デッドロック防止」と明記)。逐次 step の synthesis 経路にはこの不変式が移植されていない
- src/core/step/commit-push.ts — CommitPushInfra が commit/push 操作の infra seam（spawnFn / events / sleepFn)として存在する
- resume 時の state は worktree 内の store（state.json / events.jsonl)から load される。checkpoint commit 内部の state.json ではなく disk 上の store が読まれる

## 要件

1. **台帳完全性の不変式**: pipeline が commit を作成したら、その OID は **push の試行前に** store へ永続化する。push の成否は台帳の完全性に影響しない。逐次 step の synthesis 経路（commitAndPush の guarded / scoped 両モード)に適用する
2. **commitFinalState の checkpoint / finalize commit** も同様に、commit 作成直後・push 試行前に OID を store へ永続化する（:693 の誤った設計メモを撤去する)。checkpoint commit 内部の state.json に自身の OID が含まれないことは許容する — resume は disk 上の store を読むため整合し、push 済みの場合は origin 到達により publish range から除外されるため attach 経路とも整合する
3. **push 失敗の診断情報**: pushFailedError の detail および commitFinalState の push 失敗警告に、git の stderr（最終試行分)を含める
4. **egress エラーの branch 表示**: verifyEgressLedger に branch を渡し、EGRESS_UNKNOWN_COMMIT のメッセージに実際の branch 名が入るようにする（空文字ハードコードの解消)
5. **再発 pin**: 「push 失敗で step が halt → resume → 前回作成した commit が egress 検証で unknown にならず走行が継続する」ことをテストで固定する

## スコープ外

- 台帳がずれた既存 job の事後回復経路（operator 承認で unknown commit を台帳に追記する resume フロー)— 本修正で事故クラス自体を根絶するため、回復経路は信号を見て別 request で判断する
- 並列 job start の明示ブロック / 排他制御（本障害の原因は並列性ではないことが一次資料で確定済み)
- egress 検証の fail-closed 動作そのものの変更（publish range ⊆ 台帳の不変式は維持する)
- push リトライ回数・待機時間の変更

## 受け入れ基準

- [ ] push が 2 回失敗して PUSH_FAILED で halt した後、store に synthesis commit の OID が永続化されていることをテストで固定する
- [ ] commitFinalState 実行後（push 成否を問わず)、checkpoint / finalize commit の OID が store に永続化されていることをテストで固定する
- [ ] push 失敗 → halt → 再実行の egress 検証で、前回作成された synthesis commit / checkpoint commit が unknown と判定されないことをテストで固定する（要件 5 の pin)
- [ ] pushFailedError のメッセージに git stderr が含まれることをテストで固定する
- [ ] EGRESS_UNKNOWN_COMMIT のメッセージに実 branch 名が含まれることをテストで固定する（verifyEgressLedger 経由の警告経路を含む)
- [ ] parallel-review-round の既存テスト（push 失敗時の OID 記録)が無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: 「commit 作成と OID 永続化を不可分にする（push 前に persist)」不変式。parallel-review-round.ts:435-448 で実績のある対処の逐次経路への移植であり、新機構の発明ではない。push 失敗時のみ persist する変種より、順序保証（作成 → 記録 → push)の方が経路分岐がなく検証が単純
- **採用**: checkpoint commit の OID は disk 上の store への永続化で足りる。branch 外の sidecar 台帳の新設は不要 — resume は disk store を読み、attach は push 済み checkpoint（= origin 到達済みで publish range 外)からのみ行われる
- **却下**: push 失敗を warn に格下げして走行を続行する — egress 不変式と「push は進捗の保存」という前提を壊す。修正すべきは台帳の完全性であり、失敗の握り潰しではない
- **却下**: resume 時に publish range を再走査して未記録 commit を推測補完する — 事故後の推測より事故を起こさない順序保証が先。推測補完は「正当な commit」と「本当に不審な commit」を機械的に区別できず、backstop の意味を弱める
