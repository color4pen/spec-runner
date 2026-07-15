# Design: remote checkpoint publish / attach correctness closure

## Context

ADR-20260715（`architecture/adr/2026-07-15-remote-checkpoint-reattachment-boundary.md`）は
「remote checkpoint を単一 immutable commit として publish し、その同じ commit を検証・materialize して
安全に再束縛する」という構造判断（D1–D4）を ratify 済みである。attach の**受信側（consumer）**は
既に実装されているが、この不変を behavior として閉じる実装が 4 点欠けており、症状が出ている。

1. **publisher 不在**: 制御された `awaiting-resume` 出口（escalation / exhaustion / guard halt）で
   checkpoint を origin へ commit+push していない。正常完了（`end` → `awaiting-archive`）だけが
   `RuntimeStrategy.commitFinalState`（`src/core/step/commit-push.ts` の publish primitive）を呼ぶ。
   escalation / exhaustion / `CommitOrchestrator.commitHalt`（`src/core/step/commit-orchestrator.ts`）は
   いずれも local persist で終わり commit/push を持たない。
2. **materialize が既存 branch を破壊しうる**: `src/core/worktree/manager.ts` は `git worktree add`
   失敗時、`branchName` があれば無条件に `git branch -D <branchName>` する。new-run の branch は
   `<slug>-<jobId8>` で一意なので自己作成 branch の掃除だが、attach は既存 feature branch 名を渡すため、
   attach 前から存在した local branch を削除しうる（データ損失）。
3. **同一 HEAD が固定されていない**: `src/core/attach/orchestrator.ts` は `origin/<branch>`（symbolic ref）を
   組み立て、`src/git/checkpoint-ref.ts` の複数 git コマンドでそのつど解決する。`src/cli/attach.ts` の
   materialize も `origin/<branch>` を再評価する。検証した commit と materialize する commit が TOCTOU で
   食い違いうる。
4. **checkpoint 述語が ADR より弱い**: `src/core/attach/verify-checkpoint.ts` は `events.jsonl` 欠落を許容し
   （`checkpoint-ref.ts` が非存在を空文字にする）、journal corruption は見るが counter reversal は見ず、
   必須成果物は `request.md` のみ検査する。resume に要る成果物欠落を通す。

### 現状コード（検証済みの前提）

- publish primitive: `commitFinalState({ cwd, branch, slug, spawnFn })`（`src/core/step/commit-push.ts`）。
  `git add -A` → 変更があれば単一 commit → `git push origin <branch>`（1 retry）。**throw しない**
  （push 失敗は stderr 警告のみ）。seam は `RuntimeStrategy.commitFinalState(deps, state)`
  （`src/core/runtime/local.ts`）。
- 全 controlled awaiting-resume 出口は `Pipeline.runInternal`（`src/core/pipeline/pipeline.ts`）の `while`
  ループを抜け、ループ末尾（`notifyJobTerminal` の直前）に収束する。escalation は escalate terminal で
  persist 後 `break`、exhaustion は `handleExhausted` で persist 後 `break`、guard halt は `commitHalt` が
  persist+rethrow したものを step 実行の try/catch が捕捉し、awaiting-resume state のまま loop を継続して
  最終的に terminal `break` に至る。`run()` 外側 catch は「未処理 throw で running のまま」の**安全網**で
  あり、制御された出口ではない。
- attach の read/verify/materialize: `runAttachVerification`（fetch → `readCheckpointFromRef` →
  `verifyCheckpoint`）→ CLI が `LocalRuntime.setupWorkspace({ attachCheckpoint })` →
  `WorkspaceMaterializer` の `attach-from-checkpoint` plan で `manager.create(..., checkpointRef, branchName)`。
- `reads()` 契約: 各 step は `reads(state, deps): IoRef[]` で必須入力を宣言し、
  `StepExecutor.validateRequiredInputs`（`src/core/step/executor.ts`）が `required !== false` を filesystem
  存在で検査する。標準 pipeline の全 `reads()` は `state` と `deps.slug` のみ参照する（監査済み。config /
  request / cwd は不参照）。
- `detectCounterReversal(stored, foldResult)`（`src/store/journal-integrity.ts`）は fold 件数が stored
  `_journal` counter を下回る truncation を検出する。`state.version`（`src/state/schema/types.ts`）は
  1（legacy embedded）/ 2（split-layout）。現行 store は常に version 2 を書く。
- typed error: `checkpointNotAttachableError(reason, detail)` は `CHECKPOINT_NOT_ATTACHABLE` を返し、`reason`
  を自由文字列で受ける。新規 reason の追加に error code 追加は不要。
- util/paths に `slugEventsPath(slug)` = `specrunner/changes/<slug>/events.jsonl`、`requestMdPath(slug)` が
  ある。attach の read フェーズが得る `treeFiles` は change folder 配下の repo-relative path 集合。

## Goals / Non-Goals

**Goals**:

- 制御された `awaiting-resume` 出口で、自己整合な checkpoint を単一 commit として origin へ publish する
  （**単一 seam** が所有する）。
- attach の read・verify・materialize が **fetch 直後に一度だけ解決した commit OID** を貫く。
- attach が **既存 local branch を破壊しない**。掃除は「この呼び出しが作成したと証明できる branch」のみ。
- checkpoint 述語を ADR-20260715 D2 まで強める（v2 は `events.jsonl` 必須・counter reversal 検査・resume step
  の `reads()` 由来必須入力を tree で検査）。いずれの不成立も typed error で拒否し、ローカル状態を一切
  作らない。
- ADR-20260715 の Positive 文言 divergence と、存在しない `ADR-20260715 D7` コードコメント citation を是正する。

**Non-Goals**:

- `running` job の別マシン takeover / lease / epoch（ADR-20260715 D4 で別 ADR に分離済み）。
- `origin/*` の暗黙走査による job 発見（branch は明示指定）。
- attach 後の自動 resume（別動詞 `job resume` のまま）。
- managed runtime の attach（local runtime のみ）。
- checkpoint の commit 粒度・GC・履歴圧縮の最適化。

## Decisions

### D1: fetch 直後に checkpoint commit OID を一度だけ解決し、read/verify に貫かせる

`runAttachVerification`（`src/core/attach/orchestrator.ts`）は `git fetch origin <branch>` の直後に
`git rev-parse origin/<branch>^{commit}` で checkpoint の commit OID を **一度だけ** 解決する。以降の
`readCheckpointFromRef` はこの OID を ref として受け取り、`ls-tree` / `cat-file` / `show` はすべて OID を
対象にする（symbolic `origin/<branch>` を再評価しない）。OID 解決に失敗したら typed error
（`checkpointNotFoundError(branch, ...)`）で拒否する。

`readCheckpointFromRef` の引数は既に `ref: string` であり、OID 文字列を渡せば透過的に機能する（git は OID を
ref として受理する）。関数シグネチャは変えず、呼び出し側が渡す ref を symbolic から OID に変えるだけで
read フェーズが OID 固定になる。

**Rationale**: 検証と materialize の間に remote ref が別 commit へ動いても、単一の immutable commit を掴む
（ADR-20260715 D1）。予測不能な symbolic ref を握らず、fetch 直後の一点で OID を固定するのが最小で確実。

**Alternatives considered**:

- read/verify/materialize が `origin/<branch>` を各段で読み直す現行案 → TOCTOU で別 tree を掴む。却下。
- fetch 時に `FETCH_HEAD` を使う案 → 並行 fetch や refspec 差で不安定。明示 `rev-parse` で OID を固定する方が
  堅牢。却下。

### D2: `VerifiedCheckpoint` に `checkpointOid` を持たせ、materialize はその OID を checkout する

`verifyCheckpoint`（`src/core/attach/verify-checkpoint.ts`）の入力に `checkpointOid` を加え、
`VerifiedCheckpoint` にそのまま透過させる。CLI（`src/cli/attach.ts`）は materialize 時に
`attachCheckpoint.checkpointRef` を `origin/<branch>` ではなく `verified.checkpointOid` にする。
`WorkspaceMaterializer` の `attach-from-checkpoint` plan は `manager.create(..., checkpointOid, branchName)` で
worktree をその **exact commit** から作り、`-b <branch>` で local branch をその OID に作る。

**Rationale**: commit の原子性（tree 全体が 1 commit）と ref 更新の原子性を言い分ける ADR-20260715 D1 を
consumer 側で守る。検証した OID と materialize する OID を型で貫通させ、`origin/<branch>` の後続移動から
独立させる。

**Alternatives considered**:

- CLI が独自にもう一度 `rev-parse` する案 → 二度目の解決の間に ref が動く同じ TOCTOU を再導入する。検証で
  確定した OID を `VerifiedCheckpoint` に載せて 1 本化する方が安全。却下。

### D3: checkpoint 述語を D2（自己整合性）まで閉じる

`verifyCheckpoint` に以下を追加する。既存の検証順（journal/projection 整合 → status → resume 解決可能性 →
request.md → identity）は保存し、追加検査を挿す。すべて **typed error**（`CHECKPOINT_NOT_ATTACHABLE`、新
reason）で拒否し、**ローカル状態を一切作らない**（`verifyCheckpoint` は pure 述語であり失敗時は throw のみ）。

- **(a) attach 対象は `awaiting-resume` のみ**: 既存の `status !== "awaiting-resume"` 検査を維持し、コメント／
  spec の「quiescent」表現を「現在は `awaiting-resume` のみ」に統一する（意味は不変、表現の一意化）。
- **(b) version 2 は `events.jsonl` 必須**: raw `state.json` の `version`（正規化前）が `2` の場合、tree に
  `events.jsonl` が存在しなければ拒否する（reason `events-missing`）。存在判定は `treeFiles` に
  `slugEventsPath(slug)` が含まれるかで行う（`request.md` の存在判定と同じ機構。空文字化に依存しない精密
  判定）。legacy version 1（embedded、`_journal` 無し）は従来どおり欠落を許容する。
- **(c) counter reversal 検査**: raw `state.json` の `_journal` counter と `events.jsonl` を fold した件数を
  `detectCounterReversal` で比較し、reversal を検出したら拒否する（reason `counter-reversal`）。既存の journal
  corruption 検査に加えて truncation を弾く。
- **(d) resume step の `reads()` 必須入力を tree で検査**: 解決した resume step（既存の `resolveResumeStep`
  呼び出しで得る step 名）を、当該 job の pipeline descriptor（`getPipelineDescriptor(getPipelineId(state))`）の
  静的 step 集合から引き当て、`step.reads(state, deps)` を評価する。`required !== false` かつ
  `artifact !== "gitState"` の file 参照について、その path が `treeFiles` に存在しなければ拒否する（reason
  `resume-input-missing`）。`reads()` 評価には最小 `StepDeps`（`slug` を持つ context）を渡す。

  解決した step が descriptor の静的集合に無い場合（custom reviewer を snapshot した job の coordinator /
  regression-gate 等、動的注入 step）は、この tree-precheck を skip する。当該 step の file 入力は他の必須
  成果物として、または resume 実行時の `StepExecutor.validateRequiredInputs`（filesystem 再検査）で覆われる。

**Rationale**: ADR-20260715 D2「attach は tree を検証してから再束縛」を満たす。フラグ信頼ではなく tree の
性質（journal 完全性・必須入力の存在）を検証する。counter reversal は `verify-checkpoint` 内で完結させ
（`stateJson` の `_journal` を parse し `eventsJsonl` を fold して `detectCounterReversal` に渡す。
`journal-integrity.ts` の content ベース helper を切り出して共用してもよい）、`composeSplitLayoutFromContent`
の既存呼び出し（`load` / `list`）への影響を避ける。最小 `StepDeps` は標準 `reads()` が `state` + `deps.slug` の
みを参照する監査済み不変を利用する。

**Alternatives considered**:

- `request.md` のみ検査する現行案 → journal 欠落・resume 必須入力欠落を通す。却下。
- `composeSplitLayoutFromContent` に counter reversal を表面化させ全呼び出しに波及させる案 → `load` / `list`
  の挙動と既存テストへ影響が広がる。attach 述語に閉じる方が blast radius 最小。却下。

### D4: materialize は「この呼び出しが作成したと証明できる branch」のみ掃除する

`git worktree add` 失敗時の branch cleanup を pre-existence 情報に基づく条件付きにする。

- `WorktreeManager.create` に「呼び出し前に branch が既存だったか」を表す明示情報を渡す（新規 optional
  引数、既定は「manager が作成した＝掃除可能」。new-run の呼び出しは引数を渡さず現行挙動を維持する）。
  cleanup は「branch が既存でなかった（＝この呼び出しが作成した）」場合のみ `git branch -D <branchName>` する。
- **attach 経路は呼び出し前に branch 存在を確認する**: attach materialization（`attach-from-checkpoint`）は
  `manager.create` を呼ぶ前に `git rev-parse --verify --quiet refs/heads/<branch>` で local branch の存在を
  確認し、その結果（既存なら「掃除しない」）を `create` に渡す。既存 branch なら worktree add 失敗時も
  削除されない。

**Rationale**: 「呼び出し前に branch が存在したかを確認し、既存なら削除しない」を満たす。pre-existence の
確認は「これは既存 feature branch である」と知る attach 経路（materializer/CLI）で行い、`WorktreeManager` は
明示決定を実行するだけにする。new-run 経路には git 呼び出しを追加しないため、`manager.test.ts` の既存
positional spawn script は無変更で green。

**Alternatives considered**:

- 衝突時に無条件 `branch -D` する現行案 → 既存 local branch のデータ損失。却下。
- `WorktreeManager.create` の先頭で常に `rev-parse` して pre-existence を判定する案 → new-run の spawn
  シーケンスがずれ、`manager.test.ts`（新-run 自己作成 cleanup）が改変を要する（受け入れ基準「new-run test
  無変更」に反する）。確認は attach 経路に限定する。却下。
- attach では常に branch を掃除しない案 → 自己作成した空 attach branch を掃除できず orphan が残る。
  「作成を証明できる branch のみ掃除」に劣る。却下。

### D5: quiescent checkpoint publisher —— 単一 seam が awaiting-resume publish を所有する

制御された `awaiting-resume` 出口（escalation / exhaustion / guard halt）はすべて `Pipeline.runInternal` の
`while` ループ末尾に収束するため、publish を各出口に散らさず、**ループ末尾の単一 seam**
（`notifyJobTerminal` の直前）に集約する。

- ループ末尾で `state.status === "awaiting-resume"` のとき、`deps.runtimeStrategy?.commitFinalState(deps, state)`
  を呼ぶ（既存 publish 経路の再利用）。local persist は各出口で先行完了しているため、この呼び出しは同一
  worktree tree（state.json ＋ events.jsonl ＋ resume に要る成果物）を **単一 commit** に畳んで origin へ
  push する（`git add -A` → 1 commit → push）。commit の原子性が「同一 HEAD に揃った self-consistent な
  checkpoint」を成立させる。
- publish は **throw しない**（`commitFinalState` 契約）。commit/push が失敗しても local persist は先に完了して
  いるため local resume 可能性は壊れない。push 前は locally resumable、ref 更新後のみ remotely resumable ——
  この公開ラグは失敗ではなく能力差として扱う（ADR-20260715 D1）。
- 正常完了（`end` → `awaiting-archive`）の publish は既存の `commitFinalState` 呼び出し（awaiting-archive
  transition 直後）に据え置く。awaiting-resume publish は**新設のループ末尾 seam のみ**が所有する（二つの
  terminal status がそれぞれ単一 owner を持つ。B-13 / B-14 の single-writer 所有権を尊重）。
- commit message ラベルを status で言い分ける（awaiting-archive → `finalize`、awaiting-resume →
  `checkpoint`）。`commitFinalState` primitive に optional `messageLabel`（既定 `finalize`）を足し、
  `LocalRuntime.commitFinalState` が `state.status` から導出する。既定維持のため既存 `commit-final-state`
  テストは無変更で green。
- `run()` 外側 catch（未処理 throw の安全網）は制御された出口ではないため publish しない（local persist のみで
  locally resumable。remotely resumable 未成立は能力差）。

**Rationale**: publisher を single-writer に集約する（ADR-20260715 B-13 / B-14 / execution-ownership ADR）。
3 つの awaiting-resume 経路が唯一収束する loop 末尾に seam を置くことで、commit/push を散らさず、guard halt の
forward routing 有無に関わらず terminal status で publish 漏れが起きない。既存 publish primitive を再利用し、
throw しない契約で local resumability を壊さない。

**Alternatives considered**:

- 各 awaiting-resume 経路（escalation / exhaustion / guard halt）で個別に commit/push する案 → 所有権が分散し
  二重書き込み・順序依存を招く。却下。
- awaiting-archive publish もループ末尾へ移設して 1 箇所に完全統合する案 → 既存 awaiting-archive 挙動・
  `commit-final-state` テスト・`notifyJobTerminal` との順序に影響する。既存挙動保存を優先し据え置く。却下。
- `run()` 外側 catch でも publish する案 → 二つ目の seam を増やし single-owner 原則に反する。安全網は locally
  resumable のままで足りる（能力差）。却下。

### D6: ADR Positive 文言と `ADR-20260715 D7` コードコメントの是正

- ADR-20260715 の Positive 文言（「cross-env resume が…閉じる」）は publisher 完成まで未了だった。本 change で
  publisher が閉じるため、Positive を「publisher（本 behavior 実装）で cross-env resume が閉じる」旨に是正する
  （divergence 解消）。architecture/ 配下・CODEOWNERS 対象の編集。
- コードコメントの `ADR-20260715 D7`（`src/core/attach/orchestrator.ts` / `src/cli/attach.ts`）は存在しない
  番号（ADR は D1–D4）。attach flow（fetch → read → verify → materialize、standalone command）は behavior 設計
  側の決定であるため、citation を **behavior 設計側（本 design の D1–D2 / フロー節）** への参照に修正し、ADR への
  誤 citation を除去する。

**Rationale**: 成果物はそれ単体で読めるべきであり、存在しない ADR 決定番号への citation は読者を誤誘導する。
Positive 文言は「decision は accepted だが提供済み機能を主張しない」という ADR ステータス方針に合わせて、
publisher 完成後の事実に一致させる。

**Alternatives considered**:

- コメントを単に削除する案 → flow の根拠（なぜこの順序か）が失われる。behavior 設計への正しい citation に
  差し替える方が追跡可能性を保つ。却下。

## Risks / Trade-offs

- [Risk] guard halt が forward routing で awaiting-resume 以外の terminal に至ると末尾 seam が publish しない
  → Mitigation: 末尾 seam（awaiting-resume）＋ 既存 awaiting-archive publish の二 status カバレッジで、どちらの
  terminal status でも publish 漏れが起きない。統合テストで guard halt からの publish を固定する。
- [Risk] push 失敗時に remotely resumable 未成立の窓が残る → Mitigation: local persist 先行で locally resumable
  は保証済み。失敗ではなく能力差として運用に開示（ADR-20260715 D1 / Negative）。テストで push 失敗 →
  local resume 可能を固定する。
- [Risk] 最小 `StepDeps` は標準 `reads()` が `state` + `deps.slug` のみ参照する監査済み不変に依存する →
  Mitigation: tasks で不変を明示し、descriptor 全 step の `reads()` を確認する。将来 step が他 deps を参照する
  場合は最小 deps 構築の拡張が要る点を記す。
- [Risk] awaiting-resume 時の worktree に残る partial artifact も `git add -A` で commit される →
  Mitigation: self-consistency は attach 述語（D3）が判定するため、不整合な tree は attach で拒否される
  （producer/consumer 対称）。
- [Risk] descriptor 静的集合に無い動的 resume step（coordinator 等）は reads tree-precheck を skip する（D3-d）
  → Mitigation: 当該 step の file 入力は他の必須成果物 or resume 実行時の filesystem 再検査で覆われる。scope は
  標準 resume step。

## Open Questions

- なし（設計判断は ADR-20260715 と本 design の D1–D6 で確定。`messageLabel` の既定・reason 文字列の最終命名は
  実装時に確定するが、意味論は本 design で固定済み）。
