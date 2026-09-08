# local runtime の commit と remote publication を分離し、job 境界で公開する

## Status

Accepted (2026-09-08)

## Context

local runtime は従来、通常 step、fixer、parallel review round、verification の完了ごとに成果を commit して remote feature branch へ push していた。commit は scoped staging、除外、revision binding、journal、`synthesizedCommits` 台帳、同一 worktree での再開に必要である。一方、後続処理が同じ worktree で続く間の push は成果の受け渡しに不要であり、対象 repository の CI や preview deployment を実装途中にも繰り返し起動し得る。

remote branch が必要になるのは、PR head の公開、別環境へ渡す quiescent checkpoint、PR を作らない正常完了、archive 前の耐久境界である。したがって local 保存と remote 公開を同一操作として扱い続けると、不要な公開を避けながら再開安全性を保つことができない。

また、複数の local commit を後でまとめて送る設計では、次の契約を同時に満たす必要がある。

- 新しい file diff がなくても、commit 済み・未送信の range を再送できること
- outgoing commit を既存の `synthesizedCommits` 台帳で全件検証し、未知の commit を公開しないこと
- PR 前の成果公開、PR API、PR 後の最終記録公開の失敗を区別すること
- controlled halt の remote handoff と、signal・runner loss の local-only 保存を区別すること
- archive と managed runtime の既存の remote handoff 契約を変えないこと

## Decision

### D1: local step completion は検査済み commit の生成までとする

local runtime の通常 step、fixer、parallel review round、verification は、既存の staging scope、除外、容量 guard、revision binding、journal/state 永続化、commit OID 台帳追記を維持するが push は行わない。

commit 作成と publication を別 capability とする。commit-only operation の失敗は step completion の失敗として扱い、特に verification result を commit できなければ publication や PR processing へ進まない。

### D2: publication は worktree diff ではなく outgoing commit range を検査する

publication-only operation は remote feature ref と local `HEAD` の差を調べる。remote feature ref が存在する場合はその ref から `HEAD` までを、初回公開で ref が存在しない場合は既知の origin ancestry を除外した commit を outgoing range とする。

outgoing OID はすべて `synthesizedCommits` 台帳に存在しなければならない。未知の commit、dirty path、excluded path を publication のために自動採用しない。手動 commit の採用には既存の明示的な operator flow を使う。

publication の要否を新しい diff や commit の有無で判定しない。このため、すべての記録が既に local commit 済みでも、失敗した push を再試行できる。結果は published、already-synchronized、phase 付き failure として返す。

Git transport は LocalRuntime の既存 authenticated spawn seam と secret redaction を再利用する。credential を含む URL や remote error を typed result、state、journal、通常 log、verbose log に露出させない。

### D3: 正常完了の publication 順序を pipeline 境界で保証する

PR を作る profile は、必要な verification と review の完了後、PR API より先に成果 range を publish する。pre-PR publication が失敗した場合は PR API を呼ばない。

PR API の成功後（既存 open PR の再利用を含む）、PR identity と `awaiting-archive` を保存して管理 path を commit し、その最終記録を再度 publish する。pre-PR publication、PR API、post-PR publication は別 phase の failure として保存・報告する。

GitHub integration が無効、または profile に PR creation がない場合は、`awaiting-archive` の最終記録を commit した後、成果と最終 checkpoint をまとめて publish する。失敗した no-PR publication は `reopen` から差分なしで再試行できる状態を残す。

PR 前後の二回の push は、それぞれ PR head と PR 後に初めて確定する branch-borne checkpoint を公開するため、意図した動作とする。

### D4: controlled halt の publication policy を明示し、job に snapshot する

config に boolean `pipeline.publishCheckpointOnHalt` を置き、default を `true` とする。job 作成時の解決値を `checkpointPublication.publishOnHalt` に保存し、resume、reopen、attach では current config から再解決しない。field のない legacy job は `true` と解釈する。

policy は runtime 種別、GitHub の有無、agent provider、CI environment variable から推測しない。

### D5: controlled halt は常に safe local checkpoint を作り、条件付きで公開する

pipeline 内の halt と pipeline 前の fidelity gate halt は、quiescent state、resume point、必要入力、journal を local に保存し、policy にかかわらず既存の管理 path だけを checkpoint commit する。

保存済み policy が `true` の場合だけその commit を publish し、成功後だけ remote attach/resume を案内する。policy が `false` の場合は同一 worktree での resume のみを案内する。commit または publication の失敗時は remote-ready と表示せず、local retryability と phase-specific error を残す。halt した step の未検査変更や除外対象を checkpoint に sweep しない。

signal、`beforeExit`、強制終了、runner loss は従来どおり local 保存だけとし、自動 publication や新しい遠隔復旧保証を追加しない。

### D6: archive と managed runtime の契約は維持する

archive は record の push 成功を確認した後にだけ archived transition と cleanup を行う。未公開成果を cleanup で失わせない。

managed runtime は remote を介した agent handoff を別責務として持つため、本 ADR の local commit-only policy を適用しない。Actions 上で local runtime を実行していることも managed runtime と同一視しない。

## Alternatives Considered

### Alternative 1: step ごとの push を設定で残す

- **Pros:** 各 step の終了時点で remote copy が存在するため、突然終了や ephemeral runner loss で失われる local commit を減らせる。
- **Cons:** 途中成果による外部 CI や preview deployment の反復を残し、environment ごとに publication boundary が変わる。利用者と合意した「各 step では commit だけ」という一貫した local runtime 契約にも反する。
- **Why not:** 突然終了への備えを理由に step push を既定または選択肢として残さないという request の方針を優先した。設定可能なのは quiescent state を作れる controlled halt の publication だけとする。

### Alternative 2: job 終了時に一 commit へ squash して一回だけ push する

- **Pros:** remote に送る commit と push の回数を最小化でき、branch history も短くなる。
- **Cons:** step revision、verification/review binding、OID 台帳、resume に使う commit identity を失う。さらに PR identity は PR API 後にしか確定しないため、PR head と最終 checkpoint を常に一回で公開できない。
- **Why not:** local commit が担う検査・revision 束縛・再開契約を維持し、PR 前後の異なる耐久境界を正しく公開する必要があるため採用しない。

### Alternative 3: dirty worktree または新規 commit の有無で publication を判定する

- **Pros:** 既存の terminal commit の no-diff 判定を流用でき、publication 判定の追加実装が小さい。
- **Cons:** push failure 後に file change がない retry で、commit 済み・未送信の range を見落とす。その結果、成果や最終記録が未公開のままでも同期済みと誤認し得る。
- **Why not:** request と review feedback が要求する no-diff retry を成立させるには、commit creation の要否と remote publication の要否を独立に判定する必要がある。

### Alternative 4: outgoing commit を自動的に台帳へ採用する

- **Pros:** ledger に不足があっても publication を続行でき、unknown commit による halt を減らせる。
- **Cons:** pipeline が生成した commit と外部から混入した commit を区別できず、`synthesizedCommits` を使う egress backstop を実質的に無効化する。未検査成果を remote に送る可能性がある。
- **Why not:** unknown commit は自動採用せず、既存の明示的な `--adopt-commits` flow だけで operator が採用する fail-closed 契約を維持する。

### Alternative 5: signal handler でも checkpoint を push する

- **Pros:** signal を受けた ephemeral runner から未送信成果を回収できる可能性が高まり、remote recovery の対象を controlled halt より広げられる。
- **Cons:** process termination 中には quiescent state、必要入力、検査済み staging scope、認証 transport の完了を保証できない。途中の push を attach 可能な checkpoint と誤認させる危険もある。
- **Why not:** request の non-goal どおり signal と runner loss の復旧保証は拡張せず、既存の local persistence のみを維持する。remote-ready guidance は安全な controlled halt publication の成功後に限定する。

### Alternative 6: local と managed runtime に同じ push suppression を適用する

- **Pros:** runtime 間で commit/publication behavior を統一でき、capability の分岐を減らせる。
- **Cons:** managed runtime の remote handoff は agent 間の成果受け渡しに必要であり、同一 worktree 内で続行する local runtime とは remote の責務が異なる。一括抑止すると managed execution が後続成果を受け取れない。
- **Why not:** request と design が managed runtime を明示的に scope 外としているため、local runtime の publication 集約だけを適用し、managed の既存 handoff を維持する。

## Consequences

### Positive

- local runtime の中間成果は revision として保存されながら、remote publication と外部 automation の起動が job 境界へ集約される。
- commit 済み・未送信 range を差分なしで再送でき、PR creation と final checkpoint publication の retry が冪等になる。
- egress ledger の fail-closed 契約、scoped staging、excluded path、archive cleanup safety が維持される。
- controlled halt の remote handoff 可否が job ごとに安定し、通知が実際の publication result と一致する。
- GitHub-disabled job と no-PR profile も、PR API に依存せず正常完了成果を remote branch に公開できる。

### Negative / Trade-offs

- 最後の publication より後に ephemeral runner が突然失われると、local commits も失われ得る。controlled halt と突然終了では復旧保証が異なる。
- PR を作る job は成果 head と PR 後 checkpoint のため、完了付近で通常二回 push する。外部 CI が二回起動する可能性は残る。
- 複数 step の commits が local に蓄積するため、publication 時の outgoing range と ledger の検査対象が大きくなる。
- default `true` と legacy fallback は従来の remote resume を維持する一方、永続的な local environment で push を避けたい利用者には明示的な opt-out が必要になる。

## References

- Request: `specrunner/changes/publish-at-job-boundaries/request.md`
- Design: `specrunner/changes/publish-at-job-boundaries/design.md`
- Spec: `specrunner/changes/publish-at-job-boundaries/spec.md`
- Reviews: `specrunner/changes/publish-at-job-boundaries/review-feedback-001.md` through `review-feedback-006.md`
- Related: `specrunner/adr/2026-07-25-egress-commit-oid-persist-before-push.md`
- Related: `specrunner/adr/2026-08-20-checkpoint-verification-policy-split.md`
- Related: `specrunner/adr/2026-09-06-optional-github-integration.md`
