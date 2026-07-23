# Design: pipeline-owned evidence journal を agent が偽造できないよう authorship を検証＋復元＋全経路再検査する

## Context

達成 provenance（test-case-gen / spec-review / test-materialize / implementer の commit OID・verdict・凍結基準）はすべて journal（`specrunner/changes/<slug>/{events.jsonl,state.json}`）に記録された値に根を持つ。archive floor（`deriveAchievedAssurance`）はその anchor を最終 HEAD の git tree から再導出する（ADR-20260717）。したがって journal が偽造可能なら、floor の判定根拠そのものが崩れる。

現状、次の理由でこの journal が agent により偽造可能である（調査済み・本 design はこの前提に沿う）:

- **journal は agent-writable**: `stateRoot = worktreePath`（`src/store/job-catalog.ts:115`）。journal は cwd（agent の worktree）配下にあり、agent は Edit/Write/Bash/`git` plumbing で書ける。`usage.json` も同 dir。
- **per-node commit が journal を agent commit に同梱**: sequential 経路の `commitAndPush`（`src/core/step/commit-push.ts:48`）は `git add -A` で journal を agent code と同一 commit に載せる。round 経路には既に除外の前例がある（`partitionRoundChanges` が `pipelineManagedPaths` を除外、`src/core/pipeline/round-git-scope.ts:54-56`）が sequential にはない。
- **事後の authenticity 検査が無い**: main-checkout guard（`snapshotMainCheckoutGuard`）は main checkout の `.specrunner/**` のみを見る。resume（`resolveJobStateBySlug` → `JobStateStore.list`, `src/core/resume/resolve-job.ts:19`）は on-disk を素通り。attach（`verifyCheckpoint`, `src/core/attach/verify-checkpoint.ts`）は fold/counter/profile/identity の **self-consistency** のみを見て authenticity を見ない。

ADR-20260718 が定めた不変を本 change で閉じる:

> agent は、正常/異常終了・crash・resume/attach のいずれを経ても、forged な pipeline-owned evidence を正規記録として成立させられない。

pipeline は唯一の persistence owner（`JobJournal.persist` → `JobStateStore.persist` → `CommitOrchestrator` のみが呼ぶ）であり、**自分が書いた journal の bytes を知っている**。この事実を anchor 化し、per-node / resume / attach の全経路で「on-disk / committed-tree が pipeline-authored anchor と一致するか」を fail-closed 検証し、不一致なら **trusted bytes へ復元してから halt** する。復元＋halt を全経路で行うため、検査前 crash も洗浄経路にならない。

### 構造的前提（調査済み・実装はこれに沿う）

- **単一 writer**: journal の全 write（`persist` の delta append / state.json overwrite、`appendInterruption`、`appendLineage`、`appendHistory`）は `JobJournal`（`src/store/job-journal.ts`）を通る。pipeline は書いた全 bytes を in-memory で保持できる。
- **書式**: state.json は `atomicWriteJson`（`JSON.stringify(data, null, 2) + "\n"`, `src/util/atomic-write.ts:26`）で atomic overwrite。events.jsonl は `appendEventRecord`（`JSON.stringify(record) + "\n"`, `src/store/event-journal.ts:342-349`）で append。
- **node lifecycle**（sequential, `src/core/step/executor.ts`）: `begin`（step-started persist）→ agent → drift/output-gate 検査 → `finalizeStepArtifacts`（`commitAndPush`, `:445`）→ `captureHeadSha`（commitOid, `:463-466`）→ 返却 → 呼び出し側 `CommitOrchestrator.commitSuccess`（verdict/commitOid persist）。**inspection は commit 前、evidence persist は commit 後。**
- **round lifecycle**（`src/core/pipeline/parallel-review-round.ts`）: members は `produceResult`（persist しない、`roundOwnsGitEffects=true` で `finalizeStepArtifacts` skip）→ coordinator が `commitRoundArtifacts`（declared paths のみ stage、journal は既に除外）→ `CommitOrchestrator.commitRound`（単一 persist）。
- **terminal push**（`src/core/pipeline/pipeline.ts`）: running→awaiting-archive で `commitFinalState`（messageLabel="finalize", `:394`）、awaiting-resume で `commitFinalState`（messageLabel="checkpoint", `:529`）。`LocalRuntime.commitFinalState`（`src/core/runtime/local.ts:668-674`）→ `commit-push.ts:105-146` の `commitFinalState`（`git add -A` → commit → push）。**checkpoint は feature branch へ push 済み。agent は origin push 権を持たない（前提）ため origin の checkpoint は agent 到達不能。**
- **git primitive**: `listCommitChangedFiles(oid, cwd)`（`<oid>^ <oid>` diff）、`diffPathsBetweenCommits(baseOid, headOid, paths, cwd)`、`readFileAtCommit`、`captureHeadSha`、`digestArtifacts` が port `RuntimeStrategy`（`src/core/port/runtime-strategy.ts`）に既存。`git show <ref>:<path>` 前例（`src/git/checkpoint-ref.ts:152`）。custom ref namespace（`refs/specrunner/**`）は現状未使用。
- **attach 読取**: `runAttachVerification`（`src/core/attach/orchestrator.ts`）が `git fetch origin <branch>` → rev-parse OID → `readCheckpointFromRef`（stateJson / eventsJsonl / treeFiles）→ `verifyCheckpoint`。
- **fail-closed / halt 前例**: `StepHalt` DU と factory（`src/core/step/step-halt.ts`）、`CommitOrchestrator.commitHalt`（persist → attach → rethrow）。`journalCorruptedError` / `checkpointNotAttachableError`（`src/errors.ts`）。
- **managed runtime は本 change の射程外**: managed の journal は `.specrunner/local/<slug>/`（machine-local sidecar）にあり、agent は cloud 実行で local worktree を持たない＝journal 到達不能。tamper 面が存在しないため、新規 seam は managed で no-op（既存の多数の runtime メソッドと同じ pattern）。

## Goals / Non-Goals

**Goals**:

- **authorship 分離**: sequential per-node commit を `pipelineManagedPaths`（events.jsonl / state.json / usage.json）非包含にし、agent code commit が journal を運ばないようにする。pipeline は persist した journal を pipeline 管理の別 commit で載せる。
- **pipeline-authored anchor**: pipeline が persist するたび、author した journal（events.jsonl＋state.json の全体）の content digest を **in-process anchor** として保持する。resume（新 process）では delta を書く前に on-disk を1度だけ full 読みして seed する。**durable anchor** を git blob ref `refs/specrunner/evidence/<branch>` に置き、checkpoint push 時に origin へ push する（agent 到達不能・crash 生存）。
- **全経路検証（fail-closed）**: per-node commit 後（baseline=in-process anchor）／ resume load 時（baseline=durable origin anchor）／ attach 時（baseline=durable origin anchor）で、journal（committed tree と on-disk）が anchor と一致するか検証する。判定不能は tamper 扱いで halt。
- **復元してから halt**: 不一致検知時は anchor の pipeline-authored journal を復元してから escalation で halt する。tampered bytes のまま進めず・persist せず・merge へ渡さない。
- **false-positive を出さない**: pipeline 自身の正当な persist/checkpoint は違反にしない。継続実行・意図的 `awaiting-resume` 停止からの resume・attach の正常系で halt しない。
- **backward-compat**: 既存 pipeline / commit-push / resume / attach / verify-checkpoint / archive の挙動保存テストを（authenticity 追加期待を除き）無変更 green に保つ。

**Non-Goals**（歯を黙って削らない — 理由を明示）:

- **sandbox OS レベルの journal 除外＋#783 の fail-open 是正**: agent の write を OS sandbox で journal から締め出し、sandbox 利用不能をこの境界で fail-closed にする defense-in-depth（ADR-20260718 D2 の sandbox 層）。claude-code adapter（`agent-runner.ts`）と #783 に跨る独立 seam なので **follow-up request**。本 change は「検出＋復元を全経路で」＝ agent がどう書いても正規記録に成立させない、を検出側で閉じる。sandbox 除外はそれを前段で防ぐ第二層。
- **#464 の一般 commit denylist**（`.specrunner/**` 等 machine-state 全般）: 本 change は pipeline-owned **evidence journal**（events.jsonl / state.json / usage.json）に限定。他 machine-state paths の denylist は別。
- **managed runtime での authorship 強制**: managed は local worktree を持たず agent が journal に到達しないため tamper 面が無い。全 seam を no-op とする（機能欠落ではなく構造的非該当）。
- **B（全 step epistemic-contract 監査）/ C（per-scenario・dogfood 有効化）/ R5 provenance carry / R6 fast**: 既定どおり別。

## Decisions

### D1: agent per-node commit を journal 非包含にし、pipeline が journal を別 commit で載せる（authorship 分離）

sequential 経路 `commitAndPush`（`commit-push.ts:36-84`）の staging を、`pipelineManagedPaths(slug)`（events.jsonl / state.json / usage.json、`round-git-scope.ts:54-56`）を除外する形にする。実装は `git add -A -- . ':(exclude)<state.json>' ':(exclude)<events.jsonl>' ':(exclude)<usage.json>'` の pathspec 除外（round 経路の「pipelineManagedPaths は agent commit に混ぜない」不変を sequential へ拡張）。agent の self-commit 検出（HEAD advance）分岐は保持する。

per-node の **pipeline journal commit** を新設する: pipeline が persist した journal を pipeline 管理 paths のみ stage して commit（message `journal: <slug>`）＋push する。これは既存 `commitScopedPaths`（`commit-push.ts:172-206`）を `pipelineManagedPaths` 引数で再利用する形の新 runtime seam `commitJournalArtifacts` として実装し、executor が `finalizeStepArtifacts`＋commitOid capture＋per-node 検証（D4）**の後** に呼ぶ。commitOid は agent code commit を指したまま（journal commit の前に capture）＝bite-evidence / archive floor の changed-files 導出に journal が混ざらなくなる（むしろ改善）。

**round 終端の journal sweep**: round member は `roundOwnsGitEffects` で per-node journal commit を持たない。coordinator は `commitRound` 完了後・`commitFinalState` 前に `commitJournalArtifacts` を1回呼ぶ（round 分の journal bytes を origin へ載せる）。後続の sequential node がある通常 round でも idempotent（次 node が superset を載せるだけ）なので、terminal 判定を coordinator に持ち込まず **round 後は常に1回 sweep** する。

**単一 writer 不変（B-13）の保持**: journal の commit/push は git side effect であり、`CommitOrchestrator`（state single-writer）には持ち込まない。executor の `finalizeStepArtifacts` 隣接 seam と coordinator（既に `commitRoundArtifacts` の git-effect owner）が呼ぶ。`commitFinalState` の `git add -A` は既存どおり（pipeline-authored final state、backward-compat）。

**Rationale**: agent commit と journal commit を物理的に分けることで「agent が正規の journal 記録を authored した」状態を作れなくする。round 経路の既存除外を sequential に広げる最小変更で、conduit の対称性も上がる。

**Alternatives considered**:
- `git add -A` のまま journal を agent commit に同梱 → authorship が分離せず、committed-tree 検証の baseline が曖昧になる。却下（architect 評価済）。
- `git add -A` → `git restore --staged <journal>` で除外 → pathspec exclude より手数が多く、部分失敗時の index 状態が不定。却下。

### D2: in-process anchor は authored bytes の**累積**で保持する（read-back しない）

`JobJournal` が pipeline-authored の journal 全 bytes を in-memory で累積する。digest はそこから計算する。**書いた bytes を再読しない**:

- **fresh write**: append する各 events 行（`JSON.stringify(record)+"\n"`）と atomic write する state.json 文字列（`JSON.stringify(obj,null,2)+"\n"`）を、書き込みと同一の serialization で holder へ蓄積する（二重 serialize でも決定的なので byte 一致）。
- **delta write**: 既に fold のため読んだ on-disk events content に、append する delta 行を足したものを events 全体とする。state.json 文字列を holder の state に置く。
- **fast path**: events 不変、state.json 文字列のみ更新。
- **interruption / lineage append**: events.jsonl への追記なので、これらも holder の events に足す（on-disk と holder の byte 一致を保つ）。

digest は pure 関数 `computeJournalDigest(eventsBytes, stateBytes)`（length-delimited concat の sha256、`"sha256:"+hex`）で計算する。検証側は on-disk / committed tree の raw bytes を同関数へ渡すので、byte 一致がそのまま digest 一致になる。

**resume seed（新 process）**: `persist`（あるいは任意の events/state mutation）の最初の呼び出しで、既存 journal（`existingCounters !== null`）を検出したら、delta を書く**前**に on-disk の events.jsonl＋state.json を1度だけ full 読みして holder を seed する。これは write 前の read であり「書込後は再読しない」に反しない。seed 後の append で holder は full bytes を反映する。seed の直前・直後に agent 実行窓は無い（seed は `begin` persist 内＝agent step 実行前）ため、seed は authentic bytes を読む。

holder は `LocalRuntime` が単一 job scope で所有し、`storeFactory`（`local.ts:546-549`）が生成する全 `JobStateStore` に注入する。managed / test / pre-pipeline の直接構築は holder 未注入（optional）で anchor 追跡なし＝no-op。

**Rationale**: 「pipeline は自分が書いた bytes を知っている」を厳密化する。累積は agent-writable disk に一切依存しない（seed の1回を除く。seed は resume 検証済み＋agent 窓なしで保護される）。digest 計算を書き込みと同一 serialization に束ねることで on-disk 検証との byte 一致を保証する。

**Alternatives considered**:
- **書込直後に on-disk を read-back して digest**: 実装は簡単だが、pipeline の write と read-back の間で agent（別 session・真の並行）が file を tamper すると read-back が tampered bytes を holder に取り込み、**tampered を authentic として洗浄する TOCTOU**。安全性を満たさない。却下。
- **digest を state.json 内に書く**: agent が state.json と digest を同時に整合改竄できる。却下（architect 評価済）。
- **incremental hash（crypto Hash.copy）**: 任意時点の full digest 取得が煩雑で、復元用の full bytes も別途要る。累積 string の方が復元とも共用でき単純。却下。

### D3: durable anchor は `refs/specrunner/evidence/<branch>` の blob（checkpoint push 時に origin へ）

digest 文字列を encode した git blob（`git hash-object -w --stdin`）を作り、local ref `refs/specrunner/evidence/<branch>` に `git update-ref` で指す（history を持たない最小形）。`commitFinalState`（checkpoint / finalize の両方）時に in-process anchor の現 digest でこの ref を更新し、明示 refspec で origin へ push する（`git push origin refs/specrunner/evidence/<branch>:refs/specrunner/evidence/<branch>`、best-effort・throw しない）。

読取は明示 refspec fetch（`git fetch origin refs/...:refs/...`）→ `git cat-file blob <ref>` → digest 文字列。git plumbing は `src/git/evidence-anchor-ref.ts`（`SpawnFn` 直叩き、`checkpoint-ref.ts` と同じ src/git 層規約）に置く。

- agent は origin push 権も pipeline 管理 ref namespace も持たない（前提）ため、origin の ref は改竄不能。local ref は agent-writable だが、検証 baseline は常に in-process（同一 process・memory）か origin（agent 到達不能）であり、local ref の可信性には依存しない（push の staging 用）。
- digest は in-process anchor（pipeline-authored のみ反映）から取る。checkpoint 時点で on-disk == in-process（最後の persist は pipeline-authored、checkpoint と persist の間に agent 窓なし）なので、origin の ref と origin/<branch> の checkpoint journal は byte・digest ともに整合する。
- **push 頻度**: 要件どおり `commitFinalState`（awaiting-resume / awaiting-archive の両 terminal）でのみ push する。継続実行中は push しない。含意は D8 の crash-window（accepted fail-closed）。

**Rationale**: durable・agent 到達不能・crash 生存の anchor を、branch 履歴を汚さない最小の object 形で持つ。checkpoint は既に origin へ push される durable point なので、そこに ref push を1つ足すのが自然。

**Alternatives considered**:
- **worktree 内 / local ref のみ**: agent が到達し得る／crash 後の trust 源にならない。却下（architect 評価済）。
- **branch 上の別ファイルに digest commit**: branch 履歴を汚し、agent が feature branch に commit できる範囲だと改竄面が増える。custom ref namespace の方が agent 到達不能で最小。却下。

### D4: per-node authorship 検証（committed-tree＋on-disk、baseline=in-process anchor）

executor の sequential 経路で、`finalizeStepArtifacts`＋commitOid capture の**後**、`commitJournalArtifacts`（D1）と `commitSuccess` の**前**に、新 runtime seam `verifyNodeJournalAuthorship` を呼ぶ。二つの歯:

1. **committed-tree**: `diffPathsBetweenCommits(headBeforeStep, HEAD, pipelineManagedPaths, cwd)` が非空 → agent の node commit（複数の self-commit を含む）が journal を触った＝git plumbing 偽造（T3）。`headBeforeStep === null`（初回）または HEAD 不変（agent commit 無し）→ この歯は skip（触った commit が無い）。
2. **on-disk**: on-disk events.jsonl＋state.json の raw bytes を `computeJournalDigest` し、in-process anchor digest と比較。不一致 → Edit/Write/Bash 偽造（T1/T2/T5）。

`begin` persist（step-started）以降・この検証まで pipeline の legit journal write は無いため、正常系では on-disk == in-process anchor が成立し halt しない（T6）。

不一致検知時（tampered）は `restoreJournalToAnchor`（in-process anchor の full bytes を on-disk へ書く）→ 新 halt factory `makeJournalTamperHalt`（awaiting-resume、新 error code `JOURNAL_AUTHENTICITY_VIOLATION`）を返す → `CommitOrchestrator.commitHalt` が persist（復元済み authentic bytes＋halt 記録）→ `commitFinalState` が authentic checkpoint＋anchor を push。tampered agent commit は checkpoint commit の ancestor に埋まり、tip は authentic になる。

round member は `roundOwnsGitEffects` でこの経路を通らない（member は agent commit を作らず、coordinator が declared paths のみ commit）。round の journal authorship は commitRound（単一 persist で in-process anchor 更新）＋round sweep（D1）＋terminal 検証で担う。

**Rationale**: worktree だけでなく committed tree も見ることで、agent が worktree を綺麗にしたまま commit の tree だけ差し替える plumbing 攻撃を捕える。復元してから halt することで、次経路（resume/attach）が汚染 bytes を拾わない。

**Alternatives considered**:
- **worktree のみ検証**: `git add`/plumbing で commit tree に注入する経路を見逃す。却下（T3 の歯）。
- **tampered bytes のまま halt**: 次の resume/attach が汚染 bytes を拾う。却下（architect 評価済）。

### D5: resume authenticity（baseline=durable origin anchor、復元してから halt）

`ResumeCommand.prepare`（`src/core/command/resume.ts`）で state を resolve した後・running 遷移 persist（`:203-216`）の**前**に、新 module `verifyResumeJournalAuthenticity` を呼ぶ:

- state.branch から `readEvidenceAnchor(spawnFn, cwd, branch)`（D3）で origin anchor を取得（明示 refspec fetch）。
- resolve 元の source dir（`JobStateStore.listWithSourceDirs` の `sourceChangeDir`）の on-disk events.jsonl＋state.json を `computeJournalDigest`。
- **absent 規則の統一（D7）** に従い判定:
  - anchor present → on-disk digest と比較。一致 → ok（proceed）。不一致 → tamper。
  - anchor absent（branch 無し／origin に ref 無し）→ skip。
  - fetch/cat-file が network 等で unavailable → 判定不能 → fail-closed halt。
- tamper 時: source dir の journal を origin/<branch> の checkpoint journal（`git show origin/<branch>:<path>`、origin の ref digest と一致検証済み）から復元 → halt（`PrepareError`＋復元済み anchor 診断）。human が再 resume すると on-disk == origin anchor になり proceed する。

意図的 `awaiting-resume` 停止（escalation / exhaustion / guard-halt）からの resume では、停止時に `commitFinalState` が「on-disk == in-process anchor」を push しているので on-disk == origin anchor が成立し halt しない（T6）。crash resume（停止を経ず on-disk が checkpoint を超えて advance / tamper）は不一致→halt（D8 accepted）。

**Rationale**: 検査前 crash が洗浄経路にならないよう、agent 到達不能な origin anchor を resume の baseline にする。復元元を origin にすることで、tampered on-disk を checkpoint の authentic bytes に戻す。

**Alternatives considered**:
- **on-disk の self-consistency のみ（現状）**: authenticity を見ず crash 洗浄を通す。却下（ADR-20260718 D4）。
- **tampered on-disk のまま halt**: 次 resume が汚染 bytes を拾う。却下。

### D6: attach authenticity（`verifyCheckpoint` に述語追加、baseline=durable origin anchor）

`runAttachVerification`（`orchestrator.ts`）が既存 fetch に加えて `readEvidenceAnchor(spawnFn, cwd, branch)` を読み、digest を `verifyCheckpoint` へ渡す。`verifyCheckpoint`（`verify-checkpoint.ts`）に authenticity 述語を1つ足す: checkpoint tree の journal digest（`computeJournalDigest(eventsJsonl, stateJson)`、既に読取済みの raw 文字列）が durable anchor digest と一致すること。

- anchor present かつ不一致 → `checkpointNotAttachableError("journal-authenticity", ...)` で reject（attach は fresh worktree を origin から materialize するので on-disk 復元は不要＝reject が復元相当）。
- anchor absent → skip（D7、backward-compat / pre-anchor checkpoint）。
- fetch unavailable → fail-closed reject。

有効な attach 対象は必ず `awaiting-resume`（`verifyCheckpoint` (a) が要求）＝checkpoint であり、checkpoint 時 origin/<branch> tip journal == origin ref なので正常系は一致する（T6）。self-consistency 述語群は無変更（authenticity を重ねるだけ）。

**Rationale**: self-consistency に authenticity を重ね、別 machine が origin の pipeline-authored checkpoint だけを attach 対象にできるようにする。

**Alternatives considered**:
- **self-consistency のみ（現状）**: fold/counter が整合していても authored かは分からない。却下。

### D7: 復元・fail-closed・absent-anchor 規則の統一

- **fail-closed**: 各検査は判定不能（anchor read unavailable / diff unavailable / on-disk read 失敗）を tamper 相当の halt とする。fail-open にしない。
- **復元してから halt**: per-node は in-process anchor の bytes、resume は origin/<branch> の checkpoint journal を復元元とする。attach は origin から materialize するため reject が復元相当。
- **absent-anchor 規則**（pure predicate として一元化。per-node / resume / attach 共通）:
  - in-process と durable の**両方 absent** かつ on-disk journal も空/不在（新規 job の初回 write 前）→ **skip**（baseline が無い）。
  - 両方 absent だが on-disk journal は存在 → **tamper**（fail-closed）。ただし後述の pre-branch 例外を除く。
  - in-process が absent だが durable が present → **durable を baseline に使う**（resume seed 前の窓）。
- **durable の「absent」判定と pre-branch 例外**: durable anchor は branch が存在して初めて push され得る。**branch が無い**（design 前の pre-branch state）resume/attach は durable を「未確立」とみなし skip する（origin ref を agent が消せない前提下では、ref 不在は pipeline が未 publish であることのみを意味し、agent が作れる状態ではない）。**branch は有るが origin ref が absent** の場合も、in-scope adversary（agent）は origin ref を作れない＝ref 不在は agent が誘発できないため、backward-compat（本 feature 前 / push 失敗の checkpoint）を優先して **skip** する。これは定義された adversary に対して安全（ref の存否は pipeline が制御し agent 到達不能）であり、fail-open ではない。この skip 境界は sandbox follow-up（write 側）と per-node in-process 検査（実行中）で補完される。

**Rationale**: 「証明できないなら通さない」を全経路で統一しつつ、agent が誘発できない ref 不在（pre-branch / pre-feature）を false-positive にしない。境界を安全性根拠込みで明示する。

**Alternatives considered**:
- **branch 有り・ref 無しを一律 fail-closed halt**: 本 feature 前の既存 job / 一時的 push 失敗で resume/attach を壊す。adversary が誘発できない条件で fail-closed にする利得が無い。却下。

### D8: per-node journal push の bytes 範囲と crash-recovery 窓（accepted posture）

per-node の pipeline journal commit（D1）は **begin persist までの journal bytes** を捕える。`commitSuccess` が append する success-era bytes（verdict history＋success persist）は per-node commit に含めず、**次 node の journal commit または checkpoint で push** される（`commitSuccess` は executor 返却の後＝journal commit の後に走るため、単一 writer 不変を保つ意図的 ordering）。

含意: **per-node journal push と次の `commitSuccess` の間で crash → resume すると、success-era bytes が durable anchor（最後の checkpoint）に未反映のため resume 検査が halt し得る**。これは fail-closed 側（human resume）へ倒す accepted posture とする（tamper を通すより安全）。この crash-recovery 窓の halt は、要件5 が禁じる**正常系の false-positive とは区別する**。要件5（T6）は crash を経ない継続実行・意図的停止からの resume・attach を対象とする。

durable anchor は checkpoint（`commitFinalState`）でのみ push する（D3）。したがって resume の baseline は「最後の checkpoint の journal」であり、意図的 `awaiting-resume` 停止では on-disk == その checkpoint（T6 no-false-positive）、crash では on-disk が checkpoint を超えるため不一致→halt（accepted）。T4（crash→resume 検出）は「先行 checkpoint がある job で resume 中 tamper→crash→再 resume」を再現し、on-disk ≠ origin anchor で検出→復元→halt を固定する。

**Rationale**: 単一 writer 不変（B-13）を壊さずに ordering を確定する。crash 窓を fail-closed に倒すことで、検出漏れよりも過検出（human 介入）を選ぶ。

**Alternatives considered**:
- **success-era も per-node commit に含める**: commit を `commitSuccess`（orchestrator＝single-writer）に持ち込むか、executor で二度 persist する必要があり単一 writer 不変を壊す。却下。
- **durable anchor を per-node で毎回 push**: crash 窓を狭められるが、要件2（checkpoint push）を超える network コスト＋要件の明示に反する。checkpoint-only で T4/T6 を満たせるため採らない。却下。

## Risks / Trade-offs

- **[Risk] durable anchor の安全性は「agent が origin へ push 権を持たない」前提に依存する** → Mitigation: これは request / attestation で確立済みの前提。前提が崩れる環境（agent が feature branch / 任意 ref を push できる）では durable anchor が改竄可能になる。write 側を締める sandbox follow-up（Non-Goal）が第二層。本 design は Risks で load-bearing 前提として明示し、per-node in-process 検査（memory・agent 到達不能）は前提が崩れても running 中は有効であることを担保する。
- **[Risk] resume が origin 到達を要求し、offline resume が壊れる** → Mitigation: fetch は小さな evidence ref のみで軽量。unavailable（offline）→ fail-closed halt（要件どおり判定不能＝tamper 扱い）。診断で「online で再 resume」を案内する。branch 無し（pre-branch）は fetch せず skip なので、design 前 job の offline resume は影響を受けない。
- **[Risk] crash-recovery 窓（D8）で正当な進捗が checkpoint まで巻き戻る** → Mitigation: 巻き戻り分は resume で再実行される（pipeline は resume 前提で idempotent 寄り）。tamper を通すより安全。accepted posture として明示。
- **[Risk] per-node journal commit の追加で commit graph に journal commit が増え、HEAD 追跡・no-op 検出に干渉する** → Mitigation: commitOid は agent code commit（journal commit の前に capture）を指したまま。committed-tree 検証は `headBeforeStep → HEAD` の diff（journal commit 前）を見るため journal commit を含まない。既存の HEAD-advance 検出（`commit-push.ts:62-73`）は agent commit 段階のみで、journal commit は別 seam。TC 群で ordering を固定する。
- **[Risk] digest の byte 一致が serialization の非決定性で崩れると false-positive** → Mitigation: holder は書き込みと同一 serialization（`JSON.stringify(record)+"\n"` / `JSON.stringify(obj,null,2)+"\n"`）で蓄積し、検証側は raw bytes を同 pure 関数へ渡す。`atomicWriteJson` を pre-serialized 文字列受け（`atomicWriteString`）へ薄く分離し、書き込み byte と holder byte を単一 source にする。round-trip テストで固定する。
- **[Risk] `interruption`/`lineage` の events append を holder に取り込み損ねると on-disk と holder が乖離** → Mitigation: `JobJournal` の全 events mutation 経路（persist delta / appendInterruption / appendLineage）で holder を更新する不変を1箇所に集約し、per-node 正常系（begin→検証の間に interruption/lineage が無いこと）と併せてテストで固定する。
- **[Risk] `src/store → RuntimeStrategy port` や新 seam の import が DSM 閉包に抵触** → Mitigation: pure digest/holder は `src/store/journal-anchor.ts`（依存無し）、git plumbing は `src/git/evidence-anchor-ref.ts`（`SpawnFn` のみ）に隔離。runtime メソッドは port 経由。conformance / cross-boundary-invariants が指摘したら behavior-preserving に配置を調整する（move であって削除ではない）。

## Open Questions

なし（構造判断は ADR-20260718 D2〜D5 で ratify 済み。durable anchor の object 形＝blob ref、resume seed の read タイミング、per-node journal push の bytes 範囲、absent-anchor 規則は request の architect 評価済み判断と本 design D1〜D8 で確定。pre-branch/pre-feature の ref-absent skip 境界は D7 に安全性根拠込みで明示）。
