# Tasks: job 境界での成果公開

## T-01: 設定と job policy snapshot を追加する

- [ ] config schema/resolver に boolean `pipeline.publishCheckpointOnHalt`（default true）を追加する。
- [ ] optional state `checkpointPublication.publishOnHalt`、validation、legacy=true accessor を追加する。
- [ ] 全 job creation で解決値を保存し、resume/reopen/attach は保存値を維持する。
- [ ] config effective の text/JSON と schema/merge/state/legacy tests を更新する。

**Acceptance Criteria**:
- true/false のみ受理され、新規 job は値を固定し、legacy job は true で動く。
- effective output が値と source/default を示す。

## T-02: commit-only と publish-only を分離する

- [ ] commit/push module の synthesis を既存 staging・scope・guard・OID persist を保つ commit-only API にする。
- [ ] remote..HEAD の全 OID を台帳検査し、差分なしでも未送信 commit を retry する publish-only API を作る。
- [ ] published/already-synchronized/phase failure を typed result として返す。
- [ ] unknown/dirty/excluded output は自動採用せず既存 `--adopt-commits` を維持する。
- [ ] bare remote で batch、no-diff retry、unknown OID、retry diagnostics をテストする。

**Acceptance Criteria**:
- commit-only は push ゼロで既存安全契約を満たす。
- publish-only は未送信 range を送り、ledger 外 commit を拒否する。

## T-03: local の途中経路を commit-only 化する

- [ ] LocalRuntime の通常 step/fixer/reverification finalizer から push を除く。
- [ ] parallel round coordinator を scoped commit-only にし、revision invalidation を保つ。
- [ ] verification propagation を保存・commit-only にし、同一 worktree から結果を読む。
- [ ] prompt/低水準経路にも途中 push がないことを behavior/static test で固定する。

**Acceptance Criteria**:
- normal/fixer/round/verification 実経路で commit・journal・OID は残り、push はゼロである。
- exclusion、egress、revision binding に回帰がない。

## T-04: PR 前後の公開を編成する

- [ ] narrow publication capability を Pipeline に注入し、最終検証後かつ pr-create API 前に成果 publish を必須にする。
- [ ] pre-PR failure は API を呼ばず retryable state と phase diagnosis を残す。
- [ ] API 後に PR identity/awaiting-archive を保存・commit して post-PR publish する。
- [ ] existing-open と保存 PR identity を使い、post-PR failure retry の重複 PR を防ぐ。
- [ ] API/spawn spy と bare remote で初回・existing・各 failure の順序をテストする。

**Acceptance Criteria**:
- verification/review → publish → PR API → final publish の順序が成立する。
- 三 phase の失敗は別に報告され、no-diff retry と PR 冪等性が成立する。

## T-05: PR なし正常終了を公開する

- [ ] GitHub-disabled と pr-create なし profile の awaiting-archive 記録を commit 後、成果と共に publish する。
- [ ] GitHub client なしで git transport を使い、failure は成功表示せず local retry を残す。
- [ ] 両経路を CLI/CommandRunner integration fixture で検証する。

**Acceptance Criteria**:
- 成果と最終 checkpoint が remote に存在し PR API はゼロである。
- failure 時は未公開を成功と表示しない。

## T-06: halt checkpoint を条件付き公開する

- [ ] pipeline halt を local persist → managed-path commit → stored policy による publish の順にする。
- [ ] pipeline 前 fidelity gate halt を同じ policy/result semantics に接続する。
- [ ] success 後だけ remote guidance/notification、disabled は local resume guidance、failure は retry diagnosis を出す。
- [ ] halt 残余を stage しない scope を保ち、true/false/gate/failure/attach/resume tests を追加する。

**Acceptance Criteria**:
- enabled は別 checkout attach、disabled は push ゼロの同一 worktree resume が成立する。
- gate を含め表示が結果に一致し、未検査残余を公開しない。

## T-07: signal、archive、managed の回帰を防ぐ

- [ ] signal/beforeExit/process-loss が新 publication API を呼ばない test を追加する。
- [ ] archive record push → archived → cleanup の順序と failure 時保全を維持する。
- [ ] managed runtime の finalize/remote handoff に local の省略が適用されない architecture/integration test を追加する。

**Acceptance Criteria**:
- sudden termination に push が増えない。
- archive push 前に cleanup せず、managed behavior に回帰がない。

## T-08: CLI と文書を同期する

- [ ] README/guide/config reference に公開境界、default、job snapshot を記載する。
- [ ] Actions 例で halt publish=true を明示し、token 種別によらず SpecRunner の境界契約は同じと説明する。
- [ ] operations に controlled halt と signal/runner loss の保証差、一時 runner の喪失可能性を書く。
- [ ] architecture の Runtime/Commit Orchestrator/Event/Archive を更新し、設計判断の記録は adr-gen に委ねる。
- [ ] docs/CLI snapshot tests と古い途中 push/復旧表現を更新する。

**Acceptance Criteria**:
- config、README/guide、Actions、operations、architecture が実装と一致する。
- disabled/sudden loss で remote recovery を約束しない。

## T-09: 統合検証と証跡を完了する

- [ ] isolated git fixture と既存 CLI/CommandRunner path で全 MUST scenario を対応付ける。
- [ ] PR 初回/existing、GitHub disabled、no-PR、policy、legacy、unknown、retry、archive、managed suite を実行する。
- [ ] build/typecheck/test/lint を一度実行し verification evidence に記録する（実 GitHub/Vercel/credential 不要）。
- [ ] tasks checkbox と証跡を更新し reviewer の重複実行を不要にする。

**Acceptance Criteria**:
- 全 scenario が自動/静的契約 test で検証される。
- 全 verification が成功し、実 external service への push はない。
