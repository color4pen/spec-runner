# Design: local runtime の公開を job 境界へ集約する

## Context

local runtime は通常 step、fixer、parallel review round、verification の成果を commit 直後に push する。commit は write scope、staging exclusion、revision binding、`synthesizedCommits` 台帳、resume に必要だが、同じ worktree で続行する間の remote 公開は不要で、対象 repository の CI/preview を途中成果でも起動し得る。

一方 remote branch は PR head、別環境へ渡す quiescent checkpoint、PR を作らない正常完了、archive の耐久境界である。現在の terminal commit は管理 path に限定され、差分なしなら return するため、commit 済み・未 push の再送と、未検査残余を送らない安全性を同時に設計する必要がある。対象は Actions 上を含む local runtime であり、remote handoff を担う managed runtime は対象外である。

## Goals / Non-Goals

**Goals**:

- step/round/verification の既存検査・commit・OID 記録を維持し、途中 push をゼロにする。
- PR 前、PR 後の最終記録、PR なし正常終了、設定で有効な制御 halt、archive で台帳検査済み branch を公開する。
- 新規差分がなくても未送信 commit を再送し、公開 phase ごとの失敗を正確に返す。
- `pipeline.publishCheckpointOnHalt`（既定 true）を job に snapshot し、legacy job は true と扱う。

**Non-Goals**:

- Git/worktree/remote/fetch の廃止、base への merge、step ごとの push を残す設定、定期/専用 checkpoint branch。
- signal/runner 消失の新しい遠隔復旧、Actions artifact 復元、外部 CI 設定変更。
- managed runtime、agent provider、pipeline step、verification/review 構成の変更。

## Decisions

### D1. step 完了は検査済み local commit の生成に限定する

local の step finalizer、round coordinator、verification propagation は、scoped/guarded staging、除外、容量 guard、revision binding、journal/state 永続化、OID 台帳追記を保ち、push を呼ばない。低水準の `commitAndPush` は commit-only と publish-only に分割し、agent prompt に push を迂回させない。

**Rationale:** commit は検査済み revision の保存、push は remote 公開で責務が異なる。最後に squash/一 commit 化すると step revision と resume 契約を失う。

**Alternatives considered:** step push の opt-in、終了時 squash、local の git 無効化は要求外かつ安全契約を弱めるため却下する。

### D2. 未送信 range を公開する narrow capability を設ける

既存 commit/push module の egress 検査と retry を再利用する。remote feature ref が存在する場合は `origin/<branch>..HEAD`、初回公開で存在しない場合は `HEAD --not --remotes=origin` 相当（既知の origin ancestry を除外する revision walk）で outgoing OID を列挙し、その全 OID が `synthesizedCommits` に含まれる場合だけ新しい remote feature ref へ push する。worktree diff や新規 commit の有無を push 条件にしない。publish-only capability は LocalRuntime が既存 Git 操作に用いる transport-authenticated spawn seam（HTTPS credential/header 注入を含む）をそのまま受け取り、独自の未認証 spawn 経路を作らない。Git 引数、credential 入り URL、remote stderr/error を含む phase diagnostics は既存 secret redaction を通し、typed result、stderr、state、journal、通常/verbose log のいずれにも token や credential を保存・表示しない。結果は published / already-synchronized / phase 付き failure とし、Pipeline/CommandRunner の公開境界だけが利用する。unknown commit、dirty/excluded path は自動 stage/adopt せず、手動 commit は既存 `--adopt-commits` のみで採用する。

**Rationale:** terminal commit の no-diff early return と publish 判定を分けなければ再送できず、未作成の `origin/<branch>` を range endpoint にすると初回公開が unknown revision で失敗する。また、既存の認証 seam と redaction を外れた publish は HTTPS remote で失敗するか credential を永続化し得る。狭い capability は巨大 runtime facade を避ける。

**Alternatives considered:** `git status` 判定、unknown range の自動台帳追加、force push は未送信を見落とすか egress fail-closed を壊すため却下する。

### D3. 正常完了の公開順序を pipeline 境界で保証する

GitHub 有効かつ PR を作る profile は、必要な verification/review 完了後、`pr-create` API 前に成果を publish する。失敗時は API を呼ばない。API 成功（existing-open を含む）後に PR 情報と `awaiting-archive` を保存・管理 path commit し、最終記録を再 publish する。GitHub 無効または PR なし profile は `awaiting-archive` の最終記録を commit 後、成果と一緒に publish し、PR を作らない。

pre-PR push、PR API、post-PR push は別 phase として失敗させ、成功表示しない。PR 後失敗でも PR identity と local commits を残し、reopen/retry は existing PR を再利用する。

**Rationale:** PR head は API 前に必要だが、PR 番号等は API 後にしか確定しないため、完了付近の二回 push は統合できない。

**Alternatives considered:** API 後の初回 push、一回への統合、新 agent step は head または checkpoint を欠くため却下する。

### D4. halt 公開方針を明示設定し job に固定する

config は boolean `pipeline.publishCheckpointOnHalt`、省略時 true とする。job 作成時に `checkpointPublication.publishOnHalt` へ解決値を保存し、resume/reopen/attach は current config で再解決しない。legacy state の accessor は不在を true とする。`config effective` は値/default/source を表示する。runtime、GitHub、provider、CI env から推測しない。

**Rationale:** 別環境引き継ぎは環境耐久性についての利用者選択で、job 中に意味が変わってはならない。

**Alternatives considered:** `CI`/provider/runtime 自動判定、resume 時再解決は環境・時点依存になるため却下する。

### D5. 制御 halt は safe checkpoint を保存後、条件付き公開する

pipeline 内 halt と pipeline 前 fidelity gate halt は、resume point、必要入力、journal を含む quiescent state をローカル保存し、既存管理 path だけを checkpoint commit する。policy=true のみ D2 で publish し、成功後だけ remote attach/resume を案内する。false は同一 worktree resume のみ案内する。push failure は local retryability を残し remote-ready と表示しない。halt step の未検査変更や除外対象を sweep しない。signal/beforeExit/強制終了は従来の local 保存だけとする。

**Rationale:** attach は quiescent checkpoint を要求し、running 中の push や `git add -A` は復旧保証にも安全な公開にもならない。

**Alternatives considered:** halt 全差分 stage、signal 内 push、best-effort 成功表示は安全範囲か真実性を壊すため却下する。

### D6. archive と managed runtime の契約を維持する

archive record push 成功後だけ archived 遷移・cleanup する順序を保つ。未公開の正常終了を cleanup 成功へ進めない。managed runtime の finalize/remote handoff には local の commit-only 省略を適用しない。

**Rationale:** 未送信 commit が複数蓄積するため cleanup 前の remote 到達確認は不可欠で、managed の remote は別責務である。

**Alternatives considered:** archive で初めて無条件 publish、失敗後 cleanup、全 runtime 共通省略は成果消失または handoff 破壊を招く。

### D7. isolated Git fixture と既存 CLI 経路で検証する

temporary bare remote、spawn/API spy、既存 Pipeline/CommandRunner fixture で push zero、順序、no-diff retry、unknown OID、halt policy、legacy、archive、managed regression を検証する。初回用 fixture は remote feature ref を作らず既知 origin ancestry のみを置き、outgoing ledger 照合から新規 branch push が成功することを確認する。transport spy には dummy token と credential 入り URL/remote error を注入し、認証済み spawn seam が全 publication boundary で使われること、および result、stderr、state、journal、通常/verbose log の全出力・永続化先に secret が現れないことを確認する。実 GitHub/Vercel/credential は使わず、implementer verification の証跡を review で再利用する。

**Rationale:** mock のみでは git range semantics を、実 service では決定性と隔離を保証できない。

**Alternatives considered:** call-count mock のみ、実 repository push、手動確認のみは回帰検出が不足する。

## Risks / Trade-offs

- [Risk] 突然終了で最後の公開以降の commit が一時 runner と共に失われ得る → 運用文書で制御 halt と突然終了を区別し、Actions では halt 公開を明示有効にする。
- [Risk] 複数 commit の一括 push に manual commit が混入する → outgoing 全 OID を台帳照合し、明示 adopt なしでは fail closed にする。
- [Risk] PR 付近の二回 push が外部 CI を二度起動し得る → 成果 head と PR 後 checkpoint の異なる目的を明記する。
- [Risk] PR 後 push failure の retry が重複 PR を作る → PR identity を先に保存し existing-open を再利用する。
- [Risk] legacy state に policy がない → optional field と単一 accessor で true に正規化する。

## Migration Plan

1. config/state schema、legacy accessor、job snapshot、effective 表示を追加する。
2. commit-only/publish-only を分離し、step/round/verification を commit-only 化する。
3. PR 前後、PR なし終了、halt に publication capability と phase 別失敗を接続する。
4. archive/managed regression と isolated integration tests を通す。
5. README、guide、operations、Actions、architecture を更新する。state field は optional のためデータ migration は不要とする。

## Open Questions

なし。
