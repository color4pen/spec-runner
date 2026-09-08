# Tasks: job 境界での成果公開

## T-01: 設定と job policy snapshot を追加する

- [x] config schema/resolver に boolean `pipeline.publishCheckpointOnHalt`（default true）を追加する。
- [x] optional state `checkpointPublication.publishOnHalt`、validation、legacy=true accessor を追加する。
- [x] 全 job creation で解決値を保存し、resume/reopen/attach は保存値を維持する。
- [x] config effective の text/JSON と schema/merge/state/legacy tests を更新する。

**Acceptance Criteria**:
- true/false のみ受理され、新規 job は値を固定し、legacy job は true で動く。
- effective output が値と source/default を示す。

## T-02: commit-only と publish-only を分離する

- [x] commit/push module の synthesis を既存 staging・scope・guard・OID persist を保つ commit-only API にする。publish-only API は LocalRuntime の既存 transport-authenticated spawn seam と credential injection/redaction を継承し、未認証の別 spawn 経路を作らない。
- [x] remote feature ref がある場合は `origin/<branch>..HEAD`、ない初回は `HEAD --not --remotes=origin` 相当で既知 origin ancestry を除外して outgoing OID を台帳検査し、差分なしでも未送信 commit を retry する publish-only API を作る。
- [x] published/already-synchronized/phase failure を typed result として返す。
- [x] unknown/dirty/excluded output は自動採用せず既存 `--adopt-commits` を維持する。
- [x] remote feature ref が存在しない bare remote からの初回 branch 作成、batch、no-diff retry、unknown OID、retry diagnostics をテストする。
- [x] transport spy に dummy token と credential 入り URL/remote error を注入し、認証 seam の利用と、typed result・stderr・state・journal・通常/verbose log の全出力/永続化先での sanitization をテストする。

**Acceptance Criteria**:
- commit-only は push ゼロで既存安全契約を満たす。
- publish-only は未送信 range を送り、ledger 外 commit を拒否する。
- 初回 remote branch 不在でも既知 remote ancestry は ledger 対象外となり、credential を露出せず認証済み transport で公開できる。

## T-03: local の途中経路を commit-only 化する

- [x] LocalRuntime の通常 step/fixer/reverification finalizer から push を除く。
- [x] parallel round coordinator を scoped commit-only にし、revision invalidation を保つ。
- [x] verification propagation を保存・commit-only にし、同一 worktree から結果を読む。
- [x] prompt/低水準経路にも途中 push がないことを behavior/static test で固定する。

**Acceptance Criteria**:
- normal/fixer/round/verification 実経路で commit・journal・OID は残り、push はゼロである。
- exclusion、egress、revision binding に回帰がない。

## T-04: PR 前後の公開を編成する

- [x] LocalRuntime の transport-authenticated spawn seam と secret sanitizer を継承する narrow publication capability を Pipeline に注入し、最終検証後かつ pr-create API 前に成果 publish を必須にする。
- [x] pre-PR failure は API を呼ばず retryable state と phase diagnosis を残す。
- [x] API 後に PR identity/awaiting-archive を保存・commit して post-PR publish する。
- [x] existing-open と保存 PR identity を使い、post-PR failure retry の重複 PR を防ぐ。
- [x] API/spawn spy と remote feature ref がない bare remote で初回・existing・各 failure の順序をテストし、phase diagnosis の全出力/永続化先が credential-safe であることを確認する。

**Acceptance Criteria**:
- verification/review → publish → PR API → final publish の順序が成立する。
- 三 phase の失敗は別に報告され、no-diff retry と PR 冪等性が成立する。

## T-05: PR なし正常終了を公開する

- [x] GitHub-disabled と pr-create なし profile の awaiting-archive 記録を commit 後、成果と共に publish する。
- [x] GitHub client なしで git transport を使い、failure は成功表示せず local retry を残す。
- [x] 両経路を CLI/CommandRunner integration fixture で検証する。

**Acceptance Criteria**:
- 成果と最終 checkpoint が remote に存在し PR API はゼロである。
- failure 時は未公開を成功と表示しない。

## T-06: halt checkpoint を条件付き公開する

- [x] pipeline halt を local persist → managed-path commit → stored policy による publish の順にする。
- [x] pipeline 前 fidelity gate halt を同じ policy/result semantics に接続する。
- [x] success 後だけ remote guidance/notification、disabled は local resume guidance、failure は retry diagnosis を出す。
- [x] halt 残余を stage しない scope を保ち、true/false/gate/failure/attach/resume tests を追加する。

**Acceptance Criteria**:
- enabled は別 checkout attach、disabled は push ゼロの同一 worktree resume が成立する。
- gate を含め表示が結果に一致し、未検査残余を公開しない。

## T-07: signal、archive、managed の回帰を防ぐ

- [x] signal/beforeExit/process-loss が新 publication API を呼ばない test を追加する。
- [x] archive record push → archived → cleanup の順序と failure 時保全を維持する。
- [x] managed runtime の finalize/remote handoff に local の省略が適用されない architecture/integration test を追加する。

**Acceptance Criteria**:
- sudden termination に push が増えない。
- archive push 前に cleanup せず、managed behavior に回帰がない。

## T-08: CLI と文書を同期する

- [x] README/guide/config reference に公開境界、default、job snapshot を記載する。
- [x] Actions 例で halt publish=true を明示し、token 種別によらず SpecRunner の境界契約は同じと説明する。
- [x] operations に controlled halt と signal/runner loss の保証差、一時 runner の喪失可能性を書く。
- [x] architecture の Runtime/Commit Orchestrator/Event/Archive を更新し、設計判断の記録は adr-gen に委ねる。
- [x] docs/CLI snapshot tests と古い途中 push/復旧表現を更新する。

**Acceptance Criteria**:
- config、README/guide、Actions、operations、architecture が実装と一致する。
- disabled/sudden loss で remote recovery を約束しない。

## T-09: 統合検証と証跡を完了する

- [x] isolated git fixture と既存 CLI/CommandRunner path で全 MUST scenario を対応付ける。
- [x] PR 初回/existing、GitHub disabled、no-PR、policy、legacy、unknown、retry、archive、managed suite を実行する。
- [x] build/typecheck/test/lint を一度実行し verification evidence に記録する（実 GitHub/Vercel/credential 不要）。
- [x] tasks checkbox と証跡を更新し reviewer の重複実行を不要にする。
- [x] verification iter 1 で残存していた旧 halt-checkpoint-restack テストを、publish-only の fail-closed 契約に合わせて除去する。

**Acceptance Criteria**:
- 全 scenario が自動/静的契約 test で検証される。
- 全 verification が成功し、実 external service への push はない。
