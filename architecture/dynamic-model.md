# Dynamic Model — 動的構造（実行時の関係・束縛・状態遷移）

> `domain-model.md`（静的なデータの形）の対になる **実行時の構造**。状態機械・実行時束縛・遷移の「形」を定義する。
> **structure-only**: 状態・遷移・束縛の **形と寿命** を書く。それを駆動する **アルゴリズム/手順は behavior**（spec / `specrunner/adr/`）であり、ここからは参照に留める。
> **SoT 境界**: 正確な遷移ロジックはコードが正典（`→ src/...`）。本書は陳腐化しない粒度（状態集合・許可遷移・束縛の寿命・不変条件）まで。

---

## State machines

### JobStatus 状態機械（lifecycle）— JobState の遷移不変条件
- **状態集合（7値）**: `running | awaiting-resume | awaiting-archive | failed | terminated | archived | canceled`。
- **区分**: active = {`running`, `awaiting-resume`}（実行中・再開待ち）／ terminal = {`archived`, `canceled`}（出口なし。以後どこへも遷移しない）。
- **許可遷移（VALID_TRANSITIONS）**: 下表のセルのみ許可。表に無い遷移は throw（同一 status への遷移は常に noop=許可）。例外は operator reopen（下記・第二の遷移表）のみ。

  | from \ to | running | awaiting-resume | awaiting-archive | failed | terminated | archived | canceled |
  |---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
  | **running** | — | ✓ | ✓ | ✓ | ✓ |  | ✓ |
  | **awaiting-resume** | ✓ | — |  |  |  |  | ✓ |
  | **awaiting-archive** |  |  | — |  |  | ✓ | ✓ |
  | **failed** | ✓ | ✓ |  | — |  |  | ✓ |
  | **terminated** | ✓ |  |  |  | — |  | ✓ |
  | **archived** |  |  |  |  |  | — |  |
  | **canceled** |  |  |  |  |  |  | — |

- **不変条件**:
  - 遷移の**計算**は `transitionJob`（pure・I/O なし）が VALID_TRANSITIONS を引いて行う。不正遷移は throw・同 status は noop。
  - Aggregate への**永続化**は `JobStateStore` 経由のみ（計算と永続化は別レイヤ）。
  - `awaiting-archive → archived` が正常完走の最終遷移（archive が client-closed に確定）。**merge は GitHub 上の外部イベントであり job status の遷移ではない**（CLI は merge を status 遷移として持たない）。`running → awaiting-resume` は異常終了 guard（exit-guard）のほか、着手前 issue 忠実性 gate・resume preflight（いずれも後述）も倒す checkpoint。
- **operator reopen（第二の遷移表）**: `awaiting-archive → running` は `REOPEN_TRANSITIONS` に属し、`transitionJob(..., { allowReopen: true })` でのみ通る operator-scoped edge。opt-in を渡せる call-site は reopen コマンドに限定（B-17）。PR が OPEN であることの検証と operator-event の journal 記録を伴い、指定 step 以降の承認を失効させて再検証する。VALID_TRANSITIONS を常時開放しないための分離。
- **単一 mutator 不変**: `JobState.status` の変更は `transitionJob` 経由のみ。`patch + persist` での status 直書きは禁止。この不変は `model.md` B-9 ＝ `tests/unit/architecture/core-invariants.test.ts` が機械強制する。
- **slug 占有不変条件**: ある時点で非 terminal（`status ∉ TERMINAL_STATUSES`）の job は **slug につき高々一つ**。slug は作業単位の human-facing ハンドルであり（`domain-model.md` identity）、この不変条件が「slug 指定の変更系操作は一意に決まる」ことを成立させる。強制点は job 生成の入口（start guard）— 非 terminal の先住 job がいる slug では job を作らず、先住の状態を名指しして出口（`resume` / `cancel`）を案内して拒否する（検査して throw＝状態を作らない。capability gate と同じ着手前 preflight 位置）。guard は fail-closed: state が読めない（破損・IO 失敗）場合に「確認できないから通す」を選ばない（ADR-20260801）。
- **状態基準の slug 解決**: 変更系コマンドの slug→job 解決は**状態**で決める — 非 terminal が一つならそれ／ゼロなら拒否（続行できる attempt が無い）／複数（占有不変条件の破れ）なら暗黙選択せず候補を列挙して停止。時刻順（`updatedAt`）は表示の並び専用であり、**変更対象の選択根拠にしない**（「最新＝唯一生きている」はヒューリスティックであり、不変条件の代用にしない）。参照系（履歴の閲覧）は terminal を含む全 attempt を対象にできる。
- → `src/state/lifecycle.ts`（VALID_TRANSITIONS / REOPEN_TRANSITIONS / TERMINAL_STATUSES / ACTIVE_STATUSES / transitionJob が正典）／ `src/state/schema.ts`（`JobStatus`。legacy の `success` / `awaiting-merge` は load 時に `awaiting-archive` へ remap）／ `src/core/command/reopen.ts`（reopen の operator 経路）

### Pipeline 状態機械（steps × transitions）
- **状態 ＝ step**、**遷移 ＝ transition 表**（`{from, on: <outcome 値>, to}`）＋ loop（`to` が前 step を指す ＋ 上限）。どの遷移にも一致しない outcome は **fail-closed（escalate）**。
- 状態集合（step）・許可遷移・収束意味論は記述子（`PipelineDescriptor`）が持ち、`pipelineId` で選ぶ。registry は `standard` / `design-only` / `fast` の 3 本。`pipelineId` は request.md Meta の `pipeline`（absent = `standard`）から job 生成時に**一度だけ**解決し、途中で付け替えない。実行時の状態集合は custom reviewer step を挿入した**合成後の descriptor**（`composeReviewerDescriptor`）であり、着手前に `validateDescriptorInputCompleteness` が step 入力の充足を検算して throw する（状態を作らない preflight の列）。
- **scope checkpoint**: descriptor が `permissionScope`（`domain-model.md`）を宣言する場合、その `checkpoint`（judge step）で最終 diff の変更ファイルを forbidden surface に当てて breach を機械導出し、`origin:"scope"` の decision-needed finding を当該 step の findings に合成してから verdict を導出する（＝この step に「scope を越えたら escalate」を束ねる）。`fast` が最初の宣言 profile（checkpoint = `conformance`）。
- → `src/core/pipeline/`（transition 表・収束意味論が正典）／ `src/core/pipeline/registry.ts`（記述子）。routing の解決手順は behavior（spec）。

---

## Runtime bindings

### liveness — 論理ジョブ ↔ 物理実行コンテキストの束縛
- **束縛**: 論理ジョブ（`JobState` Aggregate）↔ 物理実行コンテキスト。物理側は 3 層 — process（`pid` ＋ その **process group**。detach 子は group leader であり detach 子孫を含む）／ worktree `worktreePath` ／ agent `session`（in-flight query は `QueryAbortHub` に登録される中断可能集合）。
- **所在と解決**: `pid` / `worktreePath` は state（branch-borne projection の **machine-scoped 面** — 他マシンでは stale であり durable fact ではない）に記録され、machine-local sidecar（`.specrunner/local/<slug>/`、gitignore）はその写し。解決は **state 優先・sidecar は自 jobId 一致時のみ fallback**（`resolveJobPid`）。
- **再導出**: `worktreePath` は規約 `.git/specrunner-worktrees/<slug>-<jobId8>` から、`pid` / `session` は run ごと新規。**reconstruction contract**: machine-local / machine-scoped な値は branch-borne checkpoint から**導出可能**、または**意味的連続性を失わず新規割当可能**でなければならない ―― 実行継続に必要な durable fact を machine-local にのみ持たない（ADR-20260715）。
- **detach 束縛（起動 ack）**: `--detach`（run / job start / job resume に横断適用。分岐は CLI dispatch 層）は親子 2 プロセスの一時束縛を作る。親の exit は **sidecar への登録完了（pid 一致）または子の死亡まで遅延**し、親の exit 0 は「pipeline process が生存し `job wait` で発見可能」を契約する。sidecar 書き込みは起動 ack の同期チャネルを兼ねる。
- **生存判定と kill**: **生存の真実は pid（プロセスの実生存）であり、on-disk status は遅延しうる投影**（resume 中の disk lag で `awaiting-resume` 表示のまま実プロセスが走る断面がある）。cancel の kill 判定は status を参照せず、pid が解決できれば process group ごと回収する（foreground job は shell の group に属するため group signal しない）。cancel の status 参照は**遷移可否 gate**（`archived` 拒否・`awaiting-archive` は `--force` 必須）のみで、プロセス回収とはレイヤが別。teardown は abort（in-flight query）→ drain → transition → exit の順序契約。`job wait` は pid 死亡を gate に status を報告し、pid 死亡時に status が `running` のままなら**永続化せず** `awaiting-resume` として導出報告する（B-9 の単一 mutator は破らない）。
- **binder**: `WorkspaceMaterializer`（worktree 作成・登録・sidecar 書き込みの順序所有）＋ runtime（sidecar の check-and-claim）。
- **束縛の identity と縮退表現**: 束縛は attempt（jobId）に属する。置き場が `<slug>/` 単位の単一 sidecar であるのは、slug 占有不変条件（同時に生きる attempt は高々一つ）を前提とした**縮退表現**であり、slug が束縛の identity なのではない（ADR-20260801）。
- **所有と解除**: 束縛の所有者は**非 terminal job のみ**。terminal へ遷移した job・state 上に存在しない job の sidecar は stale であり、後続 attempt が check-and-claim（先住の状態を確認してから上書き）で奪ってよい。同時 claim の競合は後着が決定的に敗北する。**sidecar の参照・解除は自 jobId と一致する記録に限る** — establish（claim）・削除・kill 対象解決・worktreePath 解決・生存判定のすべてで、他 job が establish した束縛を自 job のものと誤認しない／巻き添えで壊さない。占有不変条件が破れた断面（非 terminal 複数・sidecar と実体の食い違い）の裁定は機械が推測で行わず、人間の操作（doctor 経路）に委ねる。
- → `src/core/liveness/resolve-pid.ts`（pid 解決）／ `src/core/cancel/pid-kill.ts`（group 回収）／ `src/core/lifecycle/query-abort-hub.ts`（in-flight query 中断）／ `src/core/command/detach.ts`（起動 ack）／ `src/cli/job-wait.ts`（death-gated 待機）／ `src/core/runtime/workspace-materializer.ts`（binder）。確立・撤去・再導出の手順は behavior（spec / in-loop change）。

### reattachment — remote branch から quiescent job を materialize する束縛
- **束縛**: `origin/<branch>` HEAD の checkpoint tree ↔ ローカル実行コンテキスト。**attach → validate → materialize → rebind** の順で、tree の自己整合を検証してから liveness を再 establish する。materialize（tree → 実行環境）と FSM 再開（resume）は責務が別。
- **寿命**: quiescent job（owner が checkpoint で手放した状態。attach-then-resume では `awaiting-resume`）に対する再開前の一回。`running` job の takeover は対象外（lease / epoch を持つ別束縛）。
- **不変条件**: フラグ信頼ではなく tree の性質検証（journal / projection 整合・`status` quiescent・resume point 解決可能・必須成果物存在・repository / job / branch identity 一致）が閉じて初めて liveness を生成する。branch は明示指定（`origin/*` の暗黙走査はしない）。
- **binder**: attach 経路（behavior 相で実装）＋ `WorktreeManager`。
- → 発見・fetch 戦略・エラー分類・attach 後の自動 resume 可否は behavior（spec / `specrunner/adr/`）。

### resume context — 再開時の文脈注入の束縛
- **束縛**: resume 実行で、`ResumeContextSnapshot`（`resumePoint` の写し）＋ 人間の `--prompt` を、最初の agent step の prompt（`AgentRunContext.session.resumePrompt`）へ注入する束縛。自動文脈は state から決定的に生成する（attempt 数 / 前回 verdict / 停止理由 / 「worktree の前 attempt 成果物は完了を意味しない」の再開意味論）。
- **寿命**: one-shot。最初の agent step が消費し後続には残さない（unmatched snapshot も同時に破棄）。初回 run（resume でない）では注入されない。one-shot なのは**注入 deps の面のみ** — 人間 `--prompt` は別途 `JobState.operatorAdjudications` 台帳へ**永続追記**され、後続の custom reviewer 周回へ operator 裁定として再注入される（`domain-model.md` Operator adjudication）。揮発する注入と永続する台帳の二重構造。
- **不変条件**: 自動文脈が存在する ⟺ 解決後の startStep ＝ 記録された `resumePoint.step`（`--from` で別 step を選ぶと自動文脈は伝播しない）。人間 `--prompt` はこの制約の対象外で、常に最初の agent step へ載る。
- **binder**: `ResumeCommand`（snapshot 捕捉・startStep 一致判定）→ `CommandRunner`（deps へ）→ `StepContextBuilder`（`buildResumePrompt` で合成）→ `Pipeline`（one-shot 剥がし）。再開位置の解決（`resolveResumeStep`: `--from` > `resumePoint.step` > throw）は behavior。
- → `src/core/resume/resume-context.ts`（`ResumeContextSnapshot` / `buildResumePrompt`）／ `src/core/resume/resolve-step.ts`（位置解決）／ `src/core/command/resume.ts`（伝播ゲート・台帳追記）

### resume preflight — worktree 実状 ↔ 台帳の再開前検証
- **束縛**: resume は `running` 遷移後・step 実行前に、worktree の実状（dirty tree・publish-range の commit・pipeline 管理 artifact の残骸）を state の台帳と突き合わせる fail-closed gate 列を持つ。機械が黙って採用も破棄もせず、operator の明示フラグを要求する。
- **gate 列**（順序も契約）:
  1. **apply-canon gate** — protected canon paths（spec / tasks 等の正典）が dirty なら halt。`--apply-canon` で operator-apply commit として採用する。
  2. **auto-quarantine** — dirty が**中断 step の宣言 canon writes で完全に説明できる**場合のみ halt せず、書きかけ canon を sidecar 配下へ自動隔離して再走する。判定は純関数（`isInterruptedStepPartialCanon`）で、journal の interruption 記録に接地する（interruption-backed でなければ隔離しない）。
  3. **adopt gate** — publish-range に台帳（`synthesizedCommits` ＋ step 記録）未登録の commit があれば halt。`--adopt-commits` で `synthesizedCommits` へ採択する。
  4. **reconcile** — pipeline 管理 artifact の残骸を隔離してから削除する（隔離失敗は fail-closed）。
- **不変条件**: 採択・裁定の記録は state 台帳へ（`synthesizedCommits` / `operatorAdjudications`）、隔離物は machine-local sidecar 配下へ（Aggregate 外・branch 外）。persist 失敗・判定不能は fail-closed。halt 時の operator 案内は preflight を read-only で統合実行し、必要フラグを一括提示する（halt → 再 resume の往復を 1 回に潰す）。
- → `src/core/command/resume.ts`（gate 列）／ `src/core/resume/canon-provenance.ts`（隔離判定の純関数）／ `src/core/resume/adopt-commits.ts`（採択検出）／ `src/core/resume/reconcile-worktree.ts`（隔離・削除）

### capability gate — pipeline profile ↔ runtime 能力の着手前束縛
- **束縛**: job 生成時、解決した descriptor が `permissionScope` を宣言し、かつ runtime が changed-files を導出できない（`canDeriveChangedFiles?.() === false`）場合、**`bootstrapJob` の前に** typed error で拒否する。判定は `permissionScope` の有無から導出し profile 名でハードコードしない（将来の宣言 profile も同じ gate を継承）。
- **寿命**: 着手前 preflight。`validateReviewerDefinitions` と同じ「検査して throw＝状態を作らない」前例位置に並ぶ。発火時 **job state / worktree は一切作られない**。
- **不変条件**: scope を検証できない runtime では「黙って通す（fail-open）」を選ばず**着手前に止める**（fail-closed）。これは多層防御の front であり、front をすり抜けた場合の back が scope checkpoint の escalation。back（scope checkpoint）は front（構造的非導出 = `canDeriveChangedFiles()===false`）だけでなく、**per-call 導出失敗（`listChangedFiles` の `unavailable`）**も UNKNOWN finding 合成で捕捉する（`canDerive===true` でも呼び出し時に git diff が失敗した場合）。これにより `[]`=「変更なし」への暗黙 fold が runtime 実装レベルでも型レベルでも封じられる。resume 経路は本 gate を持たない（着手前 preflight の設計、back が担保）。
- **binder**: `PipelineRunCommand.prepare`（`assertRuntimeSupportsScope`）。real runtime 側が能力 interface を実装していることは B-11 が固定。
- → `src/core/pipeline/runtime-capability-gate.ts`（gate）／ `src/core/command/pipeline-run.ts`（着手前呼び出し）

### issue fidelity gate — issue 正典 ↔ request.md の開始前束縛
- **束縛**: issue 起点 job（`issueNumber` あり・inbox 起点でない・startStep = request-review）で、pipeline 起動直前に issue 本文と request.md の要件対応を LLM 比較（`IssueFidelityComparator` port）し、**宣言なき要件弱体化（undeclared drop）**を検出する。
- **寿命**: 着手前 gate だが capability gate と位置が異なる — **job state 作成後・step 実行 0 個の時点**で発火し、halt は `running → awaiting-resume`（`resumePoint.step = request-review`）。「検査して throw＝状態を作らない」列（capability gate / start guard）と、「state を作ってから halt」列（本 gate / resume preflight）の 2 クラスがある。
- **不変条件**: fail-closed — undeclared drop だけでなく issue fetch 失敗・内部エラーも halt する。発火条件は startStep のみで run / resume を区別しない ＝ request-review からの resume で**再評価される**（request.md 修正後の再検証口）。issue 本文は state / log に保存しない（non-propagation）。request 入口の決定性（B-18）は破らない — 本 gate は job 実行経路（`CommandRunner`）に属し、request 系入口からは到達しない。
- → `src/core/gate/issue-fidelity-gate.ts`（判定）／ `src/core/port/issue-fidelity-comparator.ts`（port）／ `src/core/command/runner.ts`（発火点）

---

## 使い方
- **状態遷移を読む** → JobStatus FSM（status の遷移）／ Pipeline FSM（step の遷移）。
- **論理↔物理の対応を読む** → Runtime bindings（liveness）。
- 静的な型/データは `domain-model.md`、実行時にどのコンポーネントが絡むか（協調）は `components.md`。
