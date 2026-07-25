# egress backstop の台帳完全性不変式 — commit OID は push 試行前に永続化する

## Status

Accepted (2026-07-25)

## Context

egress backstop は「publish range のすべての commit が `synthesizedCommits` 台帳に記録済みであること」を
push 前に検証する fail-closed の関所である。この不変式は「pipeline が commit を作成したら、その OID は
必ず台帳に永続化される」という前提に立つ。

### 実運用で観測された障害連鎖（2026-07-24）

1. request-review 完了後、pipeline が synthesis commit を作成し push を試行。
   GitHub 側の一過性障害（16:17–17:36 UTC）により push が 2 回とも exit 1 で失敗、
   `PUSH_FAILED` throw で step が halt した。
2. OID の台帳追記は step 成功確定時（`commitSuccess`）にのみ `persist()` されるため、
   **branch 上に commit は残るが台帳追記は失われた**。
3. `commitFinalState` が checkpoint commit を作成したが、egress 検証が手順 1 の OID を
   unknown と判定して push を skip。checkpoint commit の OID 自体も「terminal path では
   persist 不要」という設計メモの誤前提により永続化されなかった。
4. resume 後の再実行で publish range に孤児 commit 2 件が残り続け、`EGRESS_UNKNOWN_COMMIT`
   で halt。**以後何度 resume しても同一地点で halt し、job cancel 以外の出口がなくなった。**

一過性の push 失敗（1 時間 19 分の GitHub 障害）が、台帳完全性の欠落により恒久的な詰みに変換された。

### 既存の非対称性

`parallel-review-round.ts:435-448` には同じ問題への対処が既に実装されていた
（push 失敗時も round commit の OID をキャプチャして `synthesizedCommits` に記録・persist する
「egress デッドロック防止」）。逐次 step の synthesis 経路（`commitAndPush`）と
`commitFinalState`（checkpoint / finalize commit）にはこの不変式が移植されていなかった。

### 診断を困難にした副問題

- `pushOnly` の失敗 detail が `exit code ${N}` のみ（git stderr は `gitExecExitCode` 層で破棄）
- `verifyEgressLedger` が branch 名を渡さず `egressUnknownCommitError(oid, "")` と空文字をハードコード

## Decision

### D1: commit 作成と OID 永続化を不可分にする（push 前に persist）

逐次 step の synthesis 経路（`commitAndPush`、scoped / guarded 両モード）は、
commit 作成直後・push 試行前に `rev-parse HEAD` で OID を取得し、store へ永続化する。
push の成否は台帳の完全性に影響しない。

`commitFinalState`（checkpoint / finalize commit）も同様に、commit 作成直後・push 試行前に
OID を永続化する。`commitFinalState` は best-effort パスのため try-catch で warn に留めて
push を継続する（synthesis 経路はコールバック失敗で fail-closed）。

`persistBeforePush` が失敗した場合（synthesis 経路）は rethrow して push を実行しない。
台帳への書き込みが確認できなければ push しない方が安全（fail-closed の維持）。

### D2: `persistBeforePush` コールバックによる注入（DI seam）

`CommitPushInfra` インターフェースにオプショナルフィールド
`persistBeforePush?: (oid: string) => Promise<void>` を追加する。

- `LocalRuntime.finalizeStepArtifacts` から `slugStoreOpts()` と `appendSynthesizedCommit` を
  使って callback を `CommitPushInfra` に注入する。
- `commitFinalState` の params オブジェクトに同名のオプショナルフィールドを追加し、
  `LocalRuntime.commitFinalState` から同様の callback を渡す。
- optional field のため、`parallel-review-round` など既存の caller は無変更で green になる。

`commitAndPush` は store を直接知らなくてよい（コールバック経由で疎結合を保つ）。

### D3: checkpoint commit OID は disk 上の store への永続化で十分

checkpoint commit 内部の state.json に自身の OID が含まれないことは許容する。
resume は disk 上の store（events.jsonl + snapshot）を読むため整合し、
push 済みの checkpoint は origin 到達により publish range から除外されるため
attach 経路とも整合する。

sidecar 台帳（branch 外の追加ファイル）の新設は不要。

### D4: `pushOnly` の失敗 detail に git stderr を含める

`pushOnly` 内の `gitExecExitCode`（stderr 破棄）を `runSubprocess`（git-exec.ts 既存関数）に
置き換え、最終試行の `stderr` を `pushFailedError` の detail に含める。
`commitFinalState` の push 失敗警告にも stderr を含める。

### D5: `verifyEgressLedger` に branch パラメータを追加

`verifyEgressLedger` の params に `branch?: string` を追加し、
`egressUnknownCommitError(oid, params.branch ?? "")` で使用する。
空文字ハードコード（既存の `""` リテラル）を解消し、EGRESS_UNKNOWN_COMMIT メッセージに
実際の branch 名が含まれるようにする。

## Alternatives Considered

### Alternative 1: push 失敗時のみ OID を persist する（条件付き persist）

push の結果を受けて、失敗時にのみ `appendSynthesizedCommit` + `persist()` を呼ぶ変種。

- **Pros**: 成功時の store 書き込みタイミングが変わらない（既存の `commitSuccess` 経路を維持できる）
- **Cons**: push 結果を `commitAndPush` の呼び出し元まで伝播させる必要があり、成功 / 失敗で経路分岐が増えて検証が複雑になる。「push が成功した場合の台帳追記」と「失敗した場合の台帳追記」を別経路で保証しなければならず、テストカバレッジも二分される
- **Why not**: 順序保証（作成 → 記録 → push）の方が経路分岐がなく単純。`parallel-review-round.ts` の先行実装も push 前 persist を採用しており、同一不変式を持つ方が検証が統一される

### Alternative 2: resume 時に publish range を再走査して未記録 commit を推測補完する

resume 実行時に publish range の commit を全走査し、台帳に存在しない commit を「おそらく pipeline 由来」と推測して台帳に追補するリカバリ機構を追加する。

- **Pros**: 既存コードの台帳追記タイミングを変えずに resume を救済できる
- **Cons**: 「正当な commit」（pipeline が作成した commit）と「本当に不審な commit」（外部から混入した commit）を機械的に区別できない。backstop の意味（publish range ⊆ 台帳の不変式）を推測補完で弱める。事故後の推測リカバリより、事故を起こさない順序保証が先
- **Why not**: egress backstop の設計目的（不審な commit のブロック）と根本的に矛盾する。「台帳に記録されていない commit は不審である」という前提を崩すとバックストップ全体が無力化する

### Alternative 3: push 失敗を warn に格下げして走行を続行する

`pushOnly` が失敗しても throw せず警告ログを出すだけで step の走行を継続する。

- **Pros**: push 失敗が一過性の障害の場合に job が自動回復する。resume を必要としない
- **Cons**: egress 不変式（「push は進捗の永続保存」）と矛盾する。続行した step が状態を進めるが push されていないため、branch 上の commit と origin が乖離したままアクティビティが積み重なる。「publish range のすべての commit が origin に届いている」という backstop の前提も崩れる
- **Why not**: 修正すべきは台帳の完全性であり、push 失敗の握り潰しではない。push の fail-closed 動作はエラークラスを変えず維持する（スコープ外）

### Alternative 4: `commitAndPush` がストアを直接受け取る

`CommitPushInfra` を拡張するのではなく、`commitAndPush` の引数に store インスタンスを直接渡す。

- **Pros**: コールバック経由の間接層がなくなり、呼び出しが見通しやすい
- **Cons**: `commitAndPush` が store の具体型に依存するようになり、テストでのモック構築が複雑になる。`CommitPushInfra` は既に `spawnFn / events / sleepFn` の DI seam として機能しており、同一セムに store まで取り込むと責務が広がる
- **Why not**: コールバック経由（`persistBeforePush?: (oid: string) => Promise<void>`）の方が `commitAndPush` を store に非依存のまま保てる。疎結合の維持とテスト容易性を優先する

### Alternative 5: `gitExecResult` を使って `pushOnly` の stderr を取得する

`gitExecExitCode` の代わりに `gitExecResult` を使用して stderr を取得する。

- **Pros**: `git-exec.ts` 内の既存関数を活用できる
- **Cons**: `gitExecResult` は `SpawnFn` を引数に取り ok/exitCode のみを返し、stdout / stderr まで取れない。目的（stderr の取得）に対して不十分
- **Why not**: `runSubprocess`（`git-exec.ts` 既存関数）は stdout / stderr / exitCode の三つを返すため適切。インターフェース変更なしに診断情報を改善できる

## Consequences

### Positive

- 逐次 step 経路（`commitAndPush`）と `commitFinalState` で、commit 作成 → OID 永続化 → push
  という順序保証が確立される。push の成否が台帳の完全性に影響しなくなる。
- `parallel-review-round.ts` との不変式の非対称性が解消され、全 commit 経路で同一の保証が成立する。
- push 失敗後の resume で `EGRESS_UNKNOWN_COMMIT` による永久 halt が発生しなくなる
  （TC-005 の再発 pin テストで固定）。
- push 失敗の診断情報（git stderr）と egress エラーの branch 名が改善され、障害調査コストが下がる。
- `CommitPushInfra` への optional field 追加のみのため、既存テストへの影響なし。

### Negative / Trade-offs

- `persistBeforePush` コールバックが失敗した場合（synthesis 経路）、commit は作成済みだが
  push が実行されず step が halt する。ただし台帳への書き込みが不確かな状態で push するより
  安全（fail-closed の維持が正しい）。
- commit 後・push 前に store への書き込みが追加されるため、同箇所でのタイミングによっては
  OID 永続化とすぐ後の push の間にプロセス crash が発生しうる。その場合 OID は台帳に記録済みで
  branch 上に commit が残るため、resume 後の egress 検証では「既知 commit」として扱われ
  詰みにはならない（不変式が保証する意図した挙動）。
- `rev-parse HEAD` が scoped / guarded 両モードで 2 回ずつ実行される
  （persistBeforePush 用と `runInlineEgressCheck` 内の `newCommitOid` 用）。
  OID は同一であり機能的問題はないが git プロセスが 1 回余分に走る。
  将来の最適化（共有変数化）は scope 外で妥当。

### Known Gaps / Future Work

- 台帳がずれた既存 job の事後回復経路（operator 承認で unknown commit を台帳に追記する resume フロー）
  は本修正のスコープ外。本修正で事故クラス自体を根絶するため、回復経路は信号を見て別 request で判断する。
- `persistBeforePush` の null OID 時（rev-parse 失敗 = git repo 破損時）は永続化をスキップして
  push が継続する。実運用で rev-parse が失敗するケースは commit 自体も成功していない想定であり、
  現実的リスクは極めて低い。

## References

- Request: `specrunner/changes/egress-ledger-push-failure/request.md`
- Design: `specrunner/changes/egress-ledger-push-failure/design.md`
- Spec: `specrunner/changes/egress-ledger-push-failure/spec.md`
- Review: `specrunner/changes/egress-ledger-push-failure/review-feedback-001.md` (approved)
- Related: `specrunner/adr/2026-07-10-journal-integrity-fail-closed.md` — event journal の台帳完全性不変式の前例
- Related: `src/core/pipeline/parallel-review-round.ts:435-448` — 先行実装の「egress デッドロック防止」
