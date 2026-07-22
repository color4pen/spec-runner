# Design: pipeline を唯一の committer にする（検査モデル → 合成モデル）

## Context

write-scope の commit 境界強制は「agent の効果を後追いで検査する（inspection）」モデルで実装されてきた。
このモデルは「agent が git の全能力を持つ」前提の上に blocklist を敷く構造で、効果の隠れ場所の列挙が収束しない。
v23 時点で実証済みの残存 2 経路がある:

1. **index residual + 裸 add -A**: 許可外ファイルを事前 stage すると scoped commit（pathspec）には混入しないが
   index に残存し、後続 `commitFinalState` の裸 `git add -A`（`commit-push.ts:561`）が次 commit に取り込む。
2. **round 自己 commit bypass**: parallel custom reviewer が正典を弱化して自己 commit すると、round の未宣言変更
   検査は worktree 変更のみ（`listWorktreeChanges`）を見るため、worktree が clean になった時点で素通りし、
   HEAD が弱化 commit に前進したまま後続 push の祖先として remote に到達する。

現状コードの主要前提（request.md および attestation で検証済み）:

- `commit-push.ts:498` — guarded staging は裸 `git add -A`（pathspec なし）。
- `commit-push.ts:561` — `commitFinalState` の staging も裸 `git add -A`。scoped commit が除外した index 残存を
  ここが回収し次 commit に混入させる。
- `commit-push.ts:242,267` — agent 自己 commit の push-as-is 経路（範囲検査後そのまま push）。
- `parallel-review-round.ts` — fan-out 前後の HEAD 差分検査が無い。未宣言変更検査は worktree のみ対象。
- `commit-orchestrator.ts:464` — 並列 round の commit は `commitRound` に集約。StepRun には `commitOid` が記録される。
- `commit-push.ts:421-425,440-441,492-493` — scoped residual の status 失敗・restore 失敗が黙殺（fail-open）。
- `util/paths.ts:75` — `biteEvidenceResultPath` が存在（#888 の残留回帰の対象）。
- `verification/propagate.ts:50-69` — verification（CLI step）が result を明示 `git add` → commit → push する
  独立した commit / push 発生点。

追加で確認した事実（attestation 対象外を独立検証）:

- push 発生点は 4 箇所: (1) `pushOnly`（sequential = `commitAndPushTail`, round = `commitScopedPaths`）、
  (2) `commitFinalState` の直 push、(3) `propagateVerificationResult` の直 push。
- `pipelineManagedPaths(slug)`（`round-git-scope.ts:99`）は `state.json / events.jsonl / usage.json` を返し、
  scoped staging（`commit-push.ts`）と `partitionRoundChanges` の offending 除外の**単一ソース**。
- `commitRoundArtifacts`（`local.ts:812`）→ `commitScopedPaths` は round commit の OID を返さない。
- `git reset --mixed <ref>` は HEAD と index を `<ref>` に戻し worktree を保持する（作業内容と歴史の分離が可能）。

## Goals / Non-Goals

**Goals**:

- push される歴史を pipeline 合成 commit のみに限定する（agent 著 commit オブジェクトは歴史に残さない）。
- 個別経路の inspection を「合成（construction）」＋「単一 egress での照合」に置換し、敵対的レビューの対象を有限化する。
- v23 の 2 経路（index residual / round 自己 commit）を実 git E2E で封鎖証明する。
- #888（bite-evidence-result.md 残留による round guard 誤発火）を同時解消する。
- 合成・復帰経路の git 操作失敗を fail-open から fail-closed へ倒す。

**Non-Goals**（request のスコープ外を踏襲）:

- SDK permission 層での agent git 実行・書込の遮断（別 request。本変更の多重防御として後続）。
- Git / GitHub credential の権限分離（別 track）。
- managed runtime の commit 層（別 adapter。挙動不変。`listWorktreeChanges` / `commitRoundArtifacts` /
  `finalizeStepArtifacts` の managed no-op 挙動は変えない）。
- #890（保護正典への fixable finding の routing）。
- 既存 remote 履歴の遡及検証。

## Decisions

### D1: sequential step の commit を「mixed reset + 明示パス合成」で構成する（R1）

`commitAndPush` / `commitAndPushTail` を合成モデルに書き換える。

- **起点復帰**: `headBeforeStep` と tail entry の HEAD を比較し、HEAD が前進していれば（agent 自己 commit）
  `git reset --mixed <headBeforeStep>` を実行する。mixed reset は HEAD/index を起点へ戻し worktree を保持する
  ため、agent の作業内容は worktree に unstaged で残り、歴史からは除外される。
- **scoped 合成**: `stagePaths = 宣言 writes（gitState 除く） ∪ 既存 pipelineManagedPaths`。
  `git add -A -- <stagePaths>`（pathspec 付き。deletion も stage）→
  `git commit -m "<step>: <slug>" -- <stagePaths>`。宣言 path に staged 変更が無ければ commit skip。
- **guarded 合成**: `git status --porcelain -z --no-renames` で実変更 path を列挙 →
  `findWriteScopeViolations` で allowlist 検証（違反 → D5 の退避 + halt）→ 違反なしなら列挙した実変更 path を
  明示 pathspec で `git add -A -- <changed>` → `git commit -m "<step>: <slug>" -- <changed>`。
  status 由来の列挙は untracked 新規・削除・rename（`--no-renames` で delete+add に展開）を捕捉する。
- **push-as-is 廃止**: 自己 commit を「検査してそのまま push」する経路（`commit-push.ts:237-247`）を削除する。
  自己 commit は必ず mixed reset で除外され、合成し直される。「自己 commit 範囲検査（tail 冒頭 step-0）」も
  合成後は対象が無いため削除する。
- 合成 commit 直後に HEAD OID を `synthesizedCommits` 台帳へ append する（D4）。

**Rationale**: mixed reset で「作業内容（worktree）」と「歴史（HEAD）」を分離し、歴史を pipeline 所有にする。
検査モデルの「効果の隠れ場所の列挙」を、合成モデルの「構成の正しさ 1 点」に置換する。明示 pathspec commit により
index 残存（事前 stage）は構造的に混入しない。

**Alternatives considered**:
- *hard reset*: agent の正当な作業内容を破壊するため却下（request architect 判断）。mixed reset で内容を保持する。
- *自己 commit の cherry-pick / 選別検査*: 検査モデルの継続であり経路列挙の非収束問題が残るため却下。

### D2: `commitFinalState` を pipeline 管理パスに限定する（R2）

`commitFinalState` の裸 `git add -A` を廃し、`pipelineManagedPaths(slug)` を既存判定で filter した明示 pathspec
staging（`git add -- <managed>`）に置換する。commit も pathspec 付き（`git commit -m "<label>: <slug>" -- <managed>`）。
agent の未 commit 作業内容は checkpoint / finalize に含めない。

**Rationale**: checkpoint の目的は resume 用の pipeline 状態公開であり、agent 未 commit 内容の同梱は過剰。
local resume は worktree 残存で足りる（現行 local-first 運用と整合）。これにより v23 経路 1 の最終混入点
（`commitFinalState` の add -A）が消える（scoped residual restore + halt 自体は D7 のとおり保持される）。

**Alternatives considered**:
- *checkpoint の add -A 維持*: v23 で実証された混入経路そのもの。却下（request architect 判断）。

### D3: parallel round に fan-out 前後の HEAD guard を追加する（R3）

`ParallelReviewRound.run` に HEAD guard を追加する。

- fan-out 前に `headBeforeRound = captureHeadSha(cwd)` を記録する。
- fan-out 後、既存の worktree offending 検査（`listWorktreeChanges` → `partitionRoundChanges`）の**前段**に
  HEAD 照合を挿入する: 現 HEAD が `headBeforeRound` から前進していれば違反。
  - `<headBeforeRound>..HEAD` の diff を退避（quarantine、D5 の退避機構を再利用）。
  - `git reset --mixed <headBeforeRound>` で起点へ復帰（reset 失敗 → fail-closed）。
  - `aggregateVerdictResult = "escalation"`、`inspectionEscalated = true`、
    `roundError = { code: "ROUND_HEAD_ADVANCED", ... }` を設定する。members は pending のまま保持
    （既存 `inspectionEscalated` 経路と同じく resume 時に再 fan-out させる）。
- reviewer round は read-only であり HEAD 前進自体が違反なので、内容検査は不要（前進 = 違反）。
- 既存の worktree offending 検査は残す（未 commit の未宣言変更を捕捉）。HEAD guard は worktree が clean になる
  自己 commit bypass を塞ぐ相補的な歯。
- coordinator の合成 commit（`commitRoundArtifacts`）は HEAD guard の**後**に走るため誤検出しない。
  commit 後の OID を `synthesizedCommits` へ append する（D4）。

**Rationale**: 未宣言変更検査が worktree 変更のみを対象とする構造欠陥（reviewer が自己 commit で worktree を
clean にすると素通り）を、HEAD 前進という observable な事実で塞ぐ。エッジ（複数 round / resume）でも
`headBeforeRound` は fan-out 直前に取り直すため単調。

**Alternatives considered**:
- *round commit の内容検査で選別*: 検査モデルの継続。round は read-only なので前進自体を違反にする方が単純かつ収束的。

### D4: egress = 公開範囲を合成 commit 台帳と照合する単一の壁（R4）

**台帳**: 新 state field `synthesizedCommits?: string[]`（append-only、machine-authoritative、state.json 内で
pipeline のみが書ける領域）。pipeline が commit を作成するたびに、その commit OID を append する。append 点:

- sequential 合成（D1）: 合成 commit OID。executor が finalize 後に `captureHeadSha` で捕捉する既存値
  （StepRun.commitOid と**同一の OID**だが append 先は別 field）を `CommitOrchestrator.commitSuccess` で
  `synthesizedCommits` へ追加する。
- CLI step で commit が発生する場合（verification = `propagateVerificationResult`）: step.run 後の exit-HEAD を
  捕捉し、`CommitOrchestrator` 経由で append する。
- round 合成（D3）: `commitRoundArtifacts` 後の HEAD OID を捕捉し、`commitRound` で append する。
- checkpoint / finalize（D2）: `commitFinalState` の commit 後 OID。terminal のため in-memory union のみで足りる
  （将来の台帳読み取り不要）。

**照合（単一 egress）**: すべての push を「検証付き push」に集約する。push 直前に
`git rev-list HEAD --not --remotes=origin` で公開範囲 OID を列挙し、各 OID が
`ledger = synthesizedCommits(state) ∪ {現操作で作成した OID 群}` に含まれることを検証する。含まれない OID が
あれば `EGRESS_UNKNOWN_COMMIT` で halt し push しない。

- 各 push 発生点（`pushOnly` の 2 系列、`commitFinalState`、`propagateVerificationResult`）は共通の検証付き
  push を経由する。egress context（台帳 + 現操作 OID）を渡す。
- `--not --remotes=origin` は remote-tracking ref を基準に「今回新規公開する commit」を厳密に与える（初回 push
  では base branch commit を除外して feature branch の新規 commit のみ）。baseBranch 引数を必要としない。
- 公開範囲を step の entry HEAD（`headBeforeStep`）で追加縮小してはならない。entry HEAD は step (再)entry ごとに
  live で取り直されるため、crash → resume 後は crash 試行中の agent 自己 commit が entry HEAD になり、
  entry-HEAD 除外はその commit を照合の盲点にする（resume 経路のバイパス）。remote を持たないテスト環境は
  origin remote を用意するか baseline `rev-list HEAD` を台帳に seed して整合させる。

**位置づけ**: agent 偽装への壁ではない（壁は D1 の mixed reset + 合成、D3 の HEAD guard reset）。合成漏れ・harness
欠陥の backstop。operator の手 commit は operator 自身が手 push する現行運用のままとし、pipeline の公開範囲に
混入した未知 commit は fail-closed に倒す。

**Rationale**: 識別の正を state（agent が書けない領域）の OID 集合に置く。commit message / trailer は agent が
偽装可能なため識別根拠にしない（request architect 判断）。台帳を StepRun.commitOid から独立させることで、
revision 束縛 / canonHash 束縛の commitOid 意味論を一切変更しない（受け入れ基準「commitOid の意味論不変」を満たす）。

**Alternatives considered**:
- *StepRun.commitOid を台帳として流用*: CLI step の commitOid は entry-HEAD（評価 revision）であり作成 commit と
  一致しない。かつ意味論変更のリスク。専用 field で分離する。
- *message / trailer による識別*: agent が偽装可能。却下。

### D5: 合成・復帰経路の git 操作を fail-closed 化する（R5）

合成・復帰経路の git 操作（status / clean / checkout / reset / add / commit）失敗を黙殺せず halt に倒す。

- 現行 scoped residual の `getWorktreeChangedPaths` `ok:false` → 黙殺スキップ（`commit-push.ts:421-425`）を廃し、
  status 失敗を `commitEffectFailedError`（または新規 typed error）で halt する。
- scoped / guarded の `git clean` / `git checkout` restore 失敗は黙殺せず、`commitEffectFailedError`
  （operation: "restore"）で halt する。restore は違反 path を tracked 状態で分割し、untracked → `clean -f`、
  tracked → `checkout HEAD` に振り分ける（旧実装の「全 path に両コマンド」は untracked への checkout が
  良性失敗するため exit code 検査を不可能にしていた — 分割により失敗判定が曖昧さなく可能になる）。
  restore 失敗時は改変済み正典が worktree に残るため、復元済みと偽る halt メッセージを出してはならない
  （D7: restore + halt は保持される）。
- `git reset --mixed` 失敗（D1 / D3）は halt に倒す。

**Rationale**: fail-open な検査は「検査面の外」を作る。合成経路の全 git 操作を fail-closed にすることで、
状態を検証できないまま push へ進む経路を消す。

### D6: `pipelineManagedPaths` に bite-evidence-result.md を追加する（#888）

`round-git-scope.ts` の `pipelineManagedPaths(slug)` に `biteEvidenceResultPath(slug)` を追加する。この単一ソースは
(a) scoped 合成の管理パス集合（D1）と (b) `partitionRoundChanges` の offending 除外の両方に効くため、
bite-evidence-result.md は合成 commit に取り込まれ、かつ round guard の offending から除外される。

**Rationale**: bite-evidence は CLI step で自 step の commit を持たず result md を dirty で残す。単一ソースへの追加で
「合成に取り込む」「round 誤発火を防ぐ」の両要件を 1 箇所で満たす。

### D7: 過去必要性が消える inspection 経路の除去とテスト移行

合成モデル成立により存在理由を失う経路を除去する:

- **自己 commit 範囲検査**（`commitAndPushTail` step-0, `listCommitRangeChangedPaths` / `findScopedCommitViolations`
  の tail 呼び出し）: agent 自己 commit は D1 の mixed reset で除外されるため不要。
- **push-as-is**（`commit-push.ts:237-247`）: 廃止（D1）。

除去**しない**もの（合成モデル成立後も存在理由が残る経路）:

- **scoped residual restore + halt**（保護正典パスの残余違反）: 合成が閉じるのは commit/push 層の leak であって、
  「改変された正典を読んだ step の結果を無言で採用しない」という halt の存在理由（spec >
  Requirement: scoped mode の保護正典残余違反は halt する）は消えない。また restore を外すと改変済み正典が
  worktree に残留し、後続の **sequential** step が汚染された正典を読む（round の offending 検査は parallel round が
  走る場合にしか効かない条件付き網であり、restore の代替にならない）。restore + halt を保持する。
- **guarded restore**（clean/checkout）: checkpoint の管理パス限定（D2）で leak 経路は閉じているが、
  restore は resume 後の step が違反内容を読まないための worktree 衛生として保持する（退避 quarantine が
  operator 調査用の証跡）。restore 失敗は D5 に従い halt に倒す。

移行するテスト（inspection モデル前提 → 合成モデル期待へ更新。対象を列挙）:

- `tests/unit/step/write-scope-bypass-closure.test.ts`: TC-004/005（自己 commit 違反 → 現: WRITE_SCOPE halt）→
  「mixed reset で除外 → 合成」期待へ。TC-006（clean 自己 commit → push 保存）→「mixed reset → 合成 push」へ。
  TC-007（範囲列挙失敗 fail-closed）→ D5 の合成経路 fail-closed へ。TC-008/009/011（scoped residual halt / restore /
  quarantine）→ **無改変で維持**（residual restore + halt は D7 のとおり保持される契約）。TC-010/018（自己 commit 範囲
  quarantine）→ D3/D7 の退避経路へ再マップ or 削除。
- `tests/unit/step/write-scope-bypass-closure-integration.test.ts`: TC-023（事前 stage 除外）→ 合成で保持。
  TC-024（自己 commit halt）→「mixed reset で歴史から除外」へ。TC-025（scoped residual restore）→ 維持。
- `tests/unit/step/commit-and-push.test.ts`: push-as-is / whole-index commit を前提とする TC を pathspec 合成へ更新。
- `tests/unit/step/commit-push-write-scope.test.ts`: 裸 add -A / self-commit inspection 前提の TC を更新。
- `tests/unit/core/step/commit-final-state.test.ts`: 裸 add -A → 管理パス限定 pathspec へ更新。
- `tests/unit/core/step/scope-escalation.test.ts` / `fast-scope-checkpoint.test.ts`: checkpoint 対象変更に追随。
- `src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts`: HEAD guard 追加に追随。
- `tests/unit/architecture/write-scope-invariants.test.ts`: 裸 add -A 全廃の静的 assertion を追加/更新。

**不変で green を保つテスト**（commitOid 意味論不変の証明）:

- revision 束縛（`select-pending-revision-binding` / `conformance-revision-binding` /
  `achieved-assurance-revision-binding-*`）・canonHash 束縛（`parallel-review-round-canon` /
  `canon-binding-e2e`）の既存テストは**無改変**で green のまま通過させる。

### D8: 破壊確認（destruction confirmation）

各封鎖の有効性を、修正前挙動へ戻すと該当テストが fail することで記録する:

- 裸 add -A へ戻す → R6-1 / commitFinalState 混入テストが fail。
- push-as-is へ戻す → 「agent 著 commit が歴史に無い」テストが fail。
- HEAD guard 無しへ戻す → R6-2 / round HEAD 前進 halt テストが fail。

## Risks / Trade-offs

- **[Risk] scoped 非宣言 worktree 変更の累積**: 保護正典パスへの残余違反は restore + halt（D7）で即時に
  捕捉されるが、それ以外の非宣言変更は commit も restore もされず worktree に残留し、後続の parallel round の
  offending 検査で halt する（遅延検出）。
  → **Mitigation**: これは fail-closed（contaminated worktree のまま緑進行させない）であり許容。review 承認の正典
  整合は canonHash 束縛が別レイヤで担保する（正典変更は承認を invalidate する）。history には非宣言変更は入らない。

- **[Risk] egress の公開範囲計算が remote-tracking ref に依存**: `--not --remotes=origin` は worktree の
  remote-tracking ref が push ごとに更新される前提。fetch 遅延や shared remote で誤差が出うる。
  → **Mitigation**: 各 push 直後に origin/<branch> が更新される local worktree 前提で厳密。managed は egress no-op
  （worktree なし）。誤検出は fail-closed（過剰 halt）側であり silent leak にはならない。

- **[Risk] verification（CLI）commit の台帳登録漏れ → egress 誤 halt**: propagate の commit を台帳へ登録しないと、
  push 失敗 resume 後に verification commit が後続 push の公開範囲に入り誤 halt する。
  → **Mitigation**: D4 で CLI step の exit-HEAD を台帳へ append する。propagate の push も検証付き push を経由させる。

- **[Risk] mixed reset が index に事前 stage された許可外を worktree へ戻す**: reset 後に許可外が worktree dirty
  として残る。→ **Mitigation**: scoped は pathspec で commit 除外、guarded は allowlist で halt、checkpoint は
  管理パス限定、egress は backstop。いずれの経路でも history には到達しない。

- **[Trade-off] push 経路の集約**: 4 箇所の push を検証付き push に集約するため、既存 push 挙動（retry / event 発火）
  を保存しつつ egress を差し込む必要がある。→ 既存 `pushOnly` の retry/event はそのまま、前段に egress 検証を足す。

## Open Questions

- （なし。設計判断は request の「architect 評価済みの設計判断」に沿って確定。実装粒度の詳細は tasks.md に委譲。）
