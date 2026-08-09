# Design: 中断 step の書きかけ canon を resume が自動隔離して再走する

## Context

pipeline の step 走行中に process が落ちる（signal / SIGKILL / hard-crash）と、canon
producer step（design）の書きかけ出力（design.md / tasks.md / spec.md — untracked または
tracked-modified）が worktree に残る。

resume の gate 順は次の通り（`src/core/command/resume.ts` prepare 内、worktree あり時のみ）:

1. **apply-canon gate**（:278-332）— `detectCanonDirtyPaths` で dirty な protected canon を
   検出。dirty があると `--apply-canon` の有無で二分岐し、未指定なら fail-closed で throw する。
2. **adopt-commits gate**（:334-379）
3. **reconcile-worktree**（:381-396）— 非 canon の中断残渣を「evidence 退避 → 削除 → clean
   start」で自動復帰させる。

apply-canon gate が最初に fail-closed で throw するため、dirty canon があると reconcile へ到達
しない。結果として canon の書きかけだけが自動復帰経路から外れ、operator は次の二択に落ちる:

- `--apply-canon` — 書きかけ部分出力が `operator-apply: <slug>` commit として正典に入る（意味的
  に誤り。apply-canon の本来の用途は operator が意図した canon 手当ての取り込み）。
- 手動退避 / `git checkout HEAD -- <path>` — CLI 外の手作業。怠ると成果物が消える。

一方 `reconcile-worktree` は中断残渣の隔離機構（evidence-first / fail-closed）を既に実装済み
（`src/core/resume/reconcile-worktree.ts:158-267`）だが、rule 2（:66-69）で protected canon path
を明示除外している。

### 中断の機械的痕跡（state から観測できる事実）

| 経路 | resumePoint | interruption event | stale-running 検出 | 完了 StepRun |
|------|-------------|--------------------|--------------------|--------------|
| signal（SIGINT/SIGTERM, exit-guard / signal handler） | `{step: state.step, reason: "signal"}` | `reason: "signal"` | — | 無し（agent 途中で process 死、halt 未生成） |
| timeout | `reason: "timeout"` | `reason: "timeout"` | — | 失敗 StepRun あり |
| SIGKILL / hard-crash | 無し（beforeExit / signal handler が走らない） | 無し | あり（status="running" + process 死） | 無し |
| escalation | `reason: "escalation"` 等 | 無し | — | あり（`commitSuccess` の `pushStepResult`） |
| operator 編集（前 step 正常完了後） | 前 halt の値 | — | — | 前 step の成功 StepRun あり |

- `state.step` は step 開始前（`commit-orchestrator.ts:344-346` `begin()`）に永続化される。
  step が正常完了すると `commitSuccess` が StepRun を記録し、次 step の `begin()` が `state.step`
  を進める。よって「`state.step === S` かつ `state.steps[S]` が空」は「S の begin は走ったが
  完了 commit に至っていない」を意味する。
- interruption event の reason は `{"timeout","signal","failure","exhaustion"}` に限られる
  （`event-journal.ts:90-98`）。load 時に resumePoint へ materialize される
  （`job-state-projection.ts:75-85`、reason をそのまま採用）。
- escalation は interruption event を追記しない。resumePoint.reason も上記集合に含まれない。

この非対称性（signal / SIGKILL は完了 StepRun を残さない；escalation / 正常完了は残す）が、
「書きかけ部分出力」を「operator の意図的編集」から機械的に切り分ける根拠になる。

### Fact-check（request-review 検証済みの前提に加えて確認した事項）

- `getPipelineDescriptor(getPipelineId(state))` で pipeline descriptor を得て
  `new Map(descriptor.steps).get(name)` で step を name 引きできる
  （`src/core/attach/verify-checkpoint.ts:182,210` と同一パターン）。
- `DesignStep.writes()` は `deps.slug` と `deps.request.type`（`isSpecRequired`）のみ参照する
  （`design.ts:135-144`）。prepare() で得られる `resolvedSlug` / parsed `request` / `config` で
  組んだ最小 `StepDeps` で評価できる。
- exit-guard は `state.step` を resumePoint.step にコピーし interruption(signal) を追記する
  （`exit-guard.ts:63-73, 132-142`）。よって signal 経路は resumePoint.step === state.step。

## Goals / Non-Goals

**Goals**:

- 中断由来であることが state から機械的に裏づけられる場合に限り、canon の書きかけ部分出力に対して
  reconcile と同じ自動復帰（evidence 退避 → 削除 → step 再走）を与える。
- 判定は apply-canon gate 内（reconcile より前段）に置き、「canon は排他的に apply-canon gate が
  扱う」責務分担を維持する。
- 隔離処理は reconcile-worktree の quarantine 規律（evidence-first / fail-closed）を流用する
  （重複実装しない）。
- 誤爆（operator 編集を消す）を避けるため、機械的裏づけが完全に揃った場合のみ発動する。迷ったら
  fail-closed。

**Non-Goals**:

- reconcile-worktree rule 2（canon 除外）の無条件撤廃はしない。operator の意図的 canon 編集の保護
  （fail-closed 原則）を維持する。
- 部分出力の「再利用」（中断地点からの続き書き）はしない。canon producer は request.md からの
  フル再生成契約であり、途中成果を入力とする経路が存在しない。
- job cancel / archive 経路での canon 取り扱いは変更しない。
- `protectedCanonPaths` の定義は変更しない。
- `--apply-canon` の既定意味論は変更しない。operator の明示指定は現行どおり operator-apply commit。

## Decisions

### D1: provenance 判定は apply-canon gate 内・fail-closed halt の手前に挿入する

apply-canon gate の dirty 分岐を三分岐に拡張する:

```
if (dirtyCanonPaths.length > 0) {
  if (options.applyCanon)          → operator-apply commit（現行、D5 の優先）
  else if (中断 step の部分出力と判定) → 自動隔離して続行（新規、D2/D3/D4）
  else                              → fail-closed halt（現行）
}
```

reconcile より前段に置くことで「canon path は apply-canon gate が排他的に処理する」責務分担を保つ。
adopt-commits gate / reconcile-worktree は隔離後の clean-canon worktree に対して現行どおり走る。

**Rationale**: architect 評価で採用済み。canon の扱いを一箇所（apply-canon gate）に閉じることで、
reconcile の rule 2（canon 除外）を触らずに済み、責務境界が明快になる。

**Alternatives considered**:
- reconcile-worktree rule 2 の無条件解除 → 却下。operator の意図的 canon 編集まで削除対象になり、
  fail-closed 原則を壊す（architect 却下事項）。

### D2: 部分出力判定（provenance）を 4 条件の AND で定義する

step `S = state.step`（中断された step。begin で永続化される in-flight step）に対し、次を全て満たす
ときのみ「S の書きかけ部分出力」と判定する:

1. **再走対象の一致**: `startStep === S`。`--from` で別 step へ redirect した resume では発動しない
   （operator が明示的に別経路を選んでいるため、自動隔離しない）。
2. **宣言一致**: `dirtyCanonPaths` の全てが `writes(S) ∩ protectedCanonPaths(slug)` に含まれる。
   1 件でも宣言外の canon が混ざれば不成立（混在は operator 編集の疑い）。
3. **中断の裏づけ**: `staleRunningDetected` である、または `resumePoint !== null` かつ
   `resumePoint.reason ∈ {"signal","timeout","failure","exhaustion"}`。escalation（reason
   "escalation" 等）は除外される。
4. **完了 StepRun 不在**: `state.steps[S]` が空 / 不在（S の attempt が一度も完了 commit に至って
   いない）。escalation / 正常完了は StepRun を残すため不成立。

判定本体は pure 関数として切り出し（`isInterruptedStepPartialCanon` / `isInterruptionBacked` /
`declaredCanonWritesForStep`）、単体テスト可能にする。

**Rationale**: 条件 3 と 4 は独立した歯として二重化する（defense-in-depth）。escalation は 3・4 の
双方で、operator 編集（前 step 完了後）は 4 で、宣言外 canon 混在は 2 で、それぞれ fail-closed へ
落ちる。`writes()` を単一の真実源とするため、S の宣言 canon は step 定義から実測する（design の
canon 集合をハードコードしない）。

**保守的な既知の天井（条件 4 の粒度）**: 「完了 StepRun 不在」を `state.steps[S]` の空判定で近似する。
これは design（job あたり 1 回走る canon producer）の中断初回では正確だが、loop 内で複数回走る canon
producer（例: 再 open された design、spec-fixer）が N 回完了後の N+1 回目で中断された場合は
`state.steps[S].length === N > 0` となり判定不成立（fail-closed）になる。誤爆より安全側であり、
本 request の受け入れ基準（design の中断）は満たす。より精密にするなら begin 回数と完了 StepRun 数の
差分を追う必要があるが、それは別設計問題。

**Alternatives considered**:
- 条件 3 を「resumePoint が存在する」だけにする → 却下。escalation も resumePoint を持つため誤爆
  する。reason gating で interruption を明示的に切り分ける。
- 条件 4 を省き 3 のみにする → 却下。冗長性を捨てると、interruption 由来だが operator が別途 canon を
  編集したケースを取りこぼす。二重化を維持する。

### D3: 隔離処理は reconcile-worktree の quarantine core を流用する

`reconcile-worktree.ts` の「git status → 分類 → evidence 全件退避 → 削除」ロジック（:158-267）を、
対象判定を差し替え可能な内部関数へ切り出す。`reconcileWorktreeArtifacts` は従来どおり
`isReconcilableArtifact`（canon 除外）を対象述語として呼び、新規 `quarantinePartialCanon` は
「渡された canon path 集合」を対象述語として同じ core を呼ぶ。

- evidence 全件退避が成功してからのみ削除する（evidence-first）。
- 退避書き込みが 1 件でも失敗したら throw する（fail-closed。まだ何も削除していない）。
- 退避先は `.specrunner/local/<slug>/<prefix>-<timestamp>/`。reconcile は prefix `reconcile-`、
  canon 隔離は prefix `canon-quarantine-` で識別する。
- canon 隔離の git status は `dirtyCanonPaths` を pathspec に渡す（`detectCanonDirtyPaths` と同様）。
  change folder が完全 untracked でも各 canon file が個別エントリで現れることを保証する。
- 削除は kind 別（untracked → `git clean -f` / staged-new → `git rm --cached` + `git clean -f` /
  tracked → `git checkout HEAD`）。既存 reconcile と同一。

**Rationale**: 「evidence を全件退避してから削除、退避失敗は削除せず halt」という不変を 2 箇所で重複
実装すると片方だけ壊れる。単一 core に集約し、対象判定だけをパラメータ化する（architect 採用の
「quarantine 規律を流用」を最小差分で実現）。`reconcileWorktreeArtifacts` の外部シグネチャと挙動は
不変（既存テスト無改変で通ること＝リファクタの正しさの歯）。

**Alternatives considered**:
- canon 用に別実装を書き下ろす → 却下。fail-closed / evidence-first 不変の重複は退行リスク源。

### D4: 隔離後は halt せず続行し、step を最初から再走させる

部分出力と判定した場合、隔離（D3）後は throw せず gate を抜ける。worktree の canon は除去済みなので、
adopt-commits gate / reconcile-worktree は clean-canon 状態で走り、pipeline は `startStep`（= S）を
最初から再走する。design の buildMessage は request.md からのフル再生成のため、部分出力を捨てても情報
損失なく再走できる（`design.ts:146-160`）。何をどこへ退避したかは `logInfo` で明示する。

**冪等性**: 隔離後の再 resume では `detectCanonDirtyPaths` が空を返し、gate は clean 通過する。

### D5: `--apply-canon` 明示は自動隔離より優先する

`options.applyCanon === true` のときは現行どおり `commitOperatorCanon`（operator-apply commit +
ledger 追記）を行い、自動隔離は発動しない。operator の明示指定の意味論を保つ（architect 却下事項:
`--apply-canon` の既定動作変更）。

## Risks / Trade-offs

- **[Risk] 誤爆で operator 編集を worktree から消す** → 4 条件 AND（D2）で機械的裏づけが完全に揃った
  場合のみ発動。かつ削除前に evidence を全件退避（D3）するため、誤爆しても内容は復元可能。迷ったら
  fail-closed。
- **[Risk] core リファクタ（D3）で reconcile 既存挙動を退行させる** → `reconcileWorktreeArtifacts`
  の外部シグネチャ・戻り値・git コマンド列を不変に保つ。既存 reconcile テスト群を無改変で green に
  保つことを歯とする。
- **[Risk] `state.steps[S]` 空判定が loop 内 canon producer で過剰に fail-closed** → D2 の既知天井
  として明記。安全側であり本 request の範囲（design）は満たす。
- **[Trade-off] timeout 経路は失敗 StepRun を残すため自動隔離されず fail-closed になる場合がある** →
  受け入れ基準の対象は signal（interruption）と stale（SIGKILL）。timeout の保守的 fail-closed は許容。

## Open Questions

なし（architect 評価で主要分岐は確定済み）。
