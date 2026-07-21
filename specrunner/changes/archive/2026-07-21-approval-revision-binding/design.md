# Design: 記録済み承認を revision（commitOid）に束縛し、stale 承認による reviewer 群 skip を封鎖する

## Context

pipeline の再検証チョークポイントは、state に記録された過去の承認 verdict を再利用して分岐する。
代表が `conformanceApprovedLatest`（`src/core/pipeline/reverification.ts:67-72`）で、
`{ step: VERIFICATION, on: "passed", to: ADR_GEN / PR_CREATE, when: conformanceApprovedLatest }`
（`src/core/pipeline/types.ts:250` / `:307`）の guard として使われる。判定は**最新 conformance run の
`outcome.verdict === "approved"` のみ**で、その承認が「どの revision を評価したか」は照合されない。

このため、承認後に revision が動く経路（途中 step からの再走、resume、operator の手動 commit、
verification 失敗後の build-fixer）では、**古い承認が新しい実装に対して有効なまま routing を素通しし、
code-review・custom reviewer・regression-gate・conformance の再実行がスキップされる**（fail-open）。

### 束縛に必要な部品は既に state にある

- `StepRun.commitOid?: string`（`src/state/schema/types.ts:199`）— sequential agent step が per-node
  commit 後に `captureHeadSha` で打刻する（`src/core/step/executor.ts:465-468`、`roundOwnsGitEffects === false`
  かつ `runtimeStrategy` present の agent step のみ）。conformance は agent step なので打刻済み。
- reviewer status の `approvedAtCommit`。**request.md は「宣言だけで常に null」と述べるが、実測では既に実値が
  入っている**: `applyRoundResults`（`reviewer-status.ts:106-136`）が approved member に
  `approvedAtCommit = headSha` を書き、`ParallelReviewRound.run`（`parallel-review-round.ts:199-303`）は
  `captureHeadSha` の結果を渡している。さらに archived change `2026-07-15-round-invalidation-source-scoped`
  の D1 で「`approvedAtCommit` = reviewed source revision（round 自身の findings commit を含まない fan-out
  時点の HEAD）」が contract test で固定されている。よって custom reviewer の欠落は「値の設定」ではなく
  **「`selectPendingMembers` の resume skip 判定に revision 照合が無い」**（`reviewer-status.ts:70-87`）ことである。

### 既存の revision 束縛パターン（踏襲対象）

`src/core/archive/achieved-assurance.ts` は archive floor gate で同型の束縛を既に実装している:
spec-review 承認を `specReviewOid`（spec-review run の commitOid）に束縛し、
`readFileAtCommit(specReviewOid, spec.md)` と `readFileAtCommit(finalHeadOid, spec.md)` の content hash
一致で「承認後に spec.md が変わっていない」を検証する。**missing commitOid / unavailable I/O は当該次元を
absent（fail-closed）**。本変更はこの archive-time gate の **routing-time 版**である。ただし routing guard は
state 純粋（git I/O 不可）でなければならないため、blob content 比較ではなく **state 記録済み commitOid 同士の
等値比較**を使う（architect 評価済み）。

### 実装上の決定的事実（production の HEAD 移動）

verification は CLI step で、`propagateVerificationResult`（`src/core/verification/propagate.ts:50-69`）が
`git add` → `git commit`（"chore: verification result ..."）→ `git push` を **worktree で** 実行する。
`runCliStep`（`executor.ts:524-578`）は agent step と違い commitOid を打刻しないが、**step.run() 内で
worktree HEAD は verification-result commit へ移動している**。

→ したがって「conformance 打刻 HEAD（= conformance-result commit）」と「verification が result を commit した
**後**の HEAD」は常に別 commit になる。**verification の commitOid を step.run() の後で打刻すると、変更が無くても
両者が食い違い、正常な再検証経路（criterion 2）が壊れる**。この事実が D2 の capture 位置を規定する。

## Goals / Non-Goals

**Goals**:

- **不変条件**: 記録済み承認（conformance / code-review / custom reviewer / regression-gate の approved）は、
  **その承認が評価した revision と現在の判定基準点 revision が一致する場合に限り** routing の分岐（skip / 短絡）に
  再利用してよい。不一致・判定不能は「承認なし」として扱い、該当 step を再実行する（fail-closed）。
- **判定の state 純粋性**: 承認の有効性判定は routing guard から呼ばれるため、state のみから決定できること。
  照合は StepRun / reviewer status に記録済みの commitOid 同士の比較で行う（guard 内で git を実行しない）。
- verification（CLI step）の StepRun に commitOid を打刻し、承認の有効性を
  「承認 run の commitOid」対「直近 verification run の commitOid」で判定できるようにする。
- レガシー record（commitOid 欠落）は stale 扱い（再実行）にする。
- 承認後に revision が動いていない場合の skip 挙動は現行どおり維持する。

**Non-Goals**:

- reopen コマンド・awaiting-archive からの復帰（後続 request）。本変更は「再走が起きたときの承認再利用」の封鎖のみ。
- lineage の input hash を用いた成果物単位の細粒度照合（commitOid 一致で十分。細粒度化は将来）。
- 承認 record 自体の削除・書き換え（record は不変。有効性判定関数のみ追加）。
- verification 内部の検証内容の変更（`runVerification` は不変）。
- managed runtime の並列 custom reviewer 対応（既知 Non-Goal。`captureHeadSha` が null を返す runtime では
  revision 照合を無効化し、現行の fail-safe 挙動を保存する。D5 参照）。
- agent step（conformance / implementer 等）の commitOid 打刻の意味変更。既存 consumer
  （bite-evidence の implementer / test-materialize、achieved-assurance の spec-review / test-case-gen）が
  raw HEAD を前提とするため、shared `commitOid` フィールドの意味は変えない。

## Decisions

### D1 — 判定基準点は「直近 verification run の commitOid」、比較は state 記録済み commitOid の等値

承認の有効性は「承認 run の commitOid」と「直近 verification run の commitOid」の等値比較で判定する。
verification は「この revision のコードが green」という事実の打刻点であり、承認と実装の同期を測る自然な基準。
guard は `state.steps` を読むだけの純関数で、git を呼ばない（決定的・テスト容易）。

**Rationale**: 再走・resume・operator commit・build-fixer のいずれで revision が動いても、動いた revision で
verification が再走すればその commitOid が変わり、古い承認 commitOid と食い違うため検出できる。時刻比較
（`codeChangedSinceLastVerification` の endedAt 比較、`reverification.ts:37-53`）は同一プロセス内の順序しか
信頼できず resume 跨ぎ・clock skew に盲目なので、本判定の主軸にはしない（再検証発火の補助としては現行のまま残す）。

**Alternatives considered**:
- *guard 内で git diff / readFileAtCommit して照合*（achieved-assurance 相当）: routing guard が I/O を持つと
  決定性・テスト容易性が壊れる。git の事実は StepRun 打刻時に取り込み、guard は state のみを見る。却下（architect 却下済み）。
- *時刻（endedAt）比較の拡張のみ*: resume 跨ぎ・手動 commit・clock skew に盲目。却下（architect 却下済み）。
- *stale 承認 record の削除*: 証跡は不変に保つ。有効性は判定関数が担う。却下（architect 却下済み）。

### D2 — verification（CLI step）の commitOid は step.run() の **前**（entry HEAD）で打刻する

`runCliStep`（`executor.ts:524-578`）で `step.run()` を呼ぶ**前**に `deps.runtimeStrategy.captureHeadSha(cwd)`
で HEAD を capture し、success result に `commitOid` として載せる。`projectSuccess`（`commit-orchestrator.ts:89-112`）
は既に `commitOid` を StepRun へ透過するので、CommitOrchestrator 側の変更は不要。`runtimeStrategy` 不在時は
未設定（agent step と同じ fail-safe）。

**「entry HEAD」を選ぶ理由**（load-bearing）: verification が certify する revision は step 開始時点の worktree
tree（= entry HEAD）である。`propagateVerificationResult` が step.run() 内で result ファイルを commit して HEAD を
+1 進めるため、**exit HEAD で打刻すると verification-result commit を掴んでしまい、conformance の打刻 HEAD と
常に食い違う**。再検証経路では `conformance approved → verification` の間に他 step は commit しないため、
**verification の entry HEAD == conformance が記録した commitOid** が成立し、変更が無ければ両者が一致する
（criterion 2）。実装が動いていれば（再走で implementer が別 commit を作る／build-fixer が commit する）entry HEAD が
変わり食い違う（criterion 1）。

**Rationale**: agent step の commitOid（exit HEAD、per-node commit 後）とは意味が異なるが、CLI step は
finalizeStepArtifacts を通らず commit が step.run() 内に閉じるため、「この step が評価した revision」を表すには
entry HEAD が正しい。この非対称は field doc（`schema/types.ts:188-198`）に追記して固定する。

**Alternatives considered**:
- *exit HEAD で打刻*: verification-result commit を掴み正常経路が壊れる（上記）。却下。
- *readSourceRevision（change folder 除外の source revision）で打刻*: robust だが conformance 側も source
  revision に変えないと比較が食い違う。conformance の commitOid は bite-evidence / achieved-assurance 非対象
  とはいえ shared field で、意味変更は blast radius が大きい。entry HEAD 打刻で十分。却下。
- *全 CLI step で entry HEAD を打刻する一般化*: 現状 verification の commitOid のみが本 guard で消費される。
  pr-create / bite-evidence の CLI commitOid に消費者は無いが、一般化は挙動差分を広げるため見送り、
  verification に限定して打刻する（他 CLI step の打刻可否は実装判断とせず、明示的に verification のみ）。

### D3 — `conformanceApprovedLatest` を revision 照合込みの guard に置換する

`reverification.ts` の guard を、以下を満たすとき true を返す純関数に置換する（名称は
`conformanceApprovedForVerifiedRevision` へ改名し、`types.ts` の 2 参照を更新）:

1. 最新 conformance run が存在し `outcome.verdict === "approved"`、かつ
2. 最新 conformance run の `commitOid` が非空、かつ
3. 最新 verification run が存在し `commitOid` が非空、かつ
4. **conformance.commitOid === verification.commitOid**。

上記いずれかを満たさないとき false（→ フォールバック行 `verification passed → code-review` で reviewer chain へ
再入）。STANDARD / FAST 両プロファイルの guard 行（`types.ts:250` / `:307`）が同じ関数を参照するため、両方に効く。

**Rationale**: 「最新 verdict のみ」の欠陥をピンポイントで塞ぐ最小変更。フォールバック行は既存のまま残るので、
guard が false のときは自然に code-review → (custom reviewer → regression-gate →) conformance の chain 全体へ
再入する（regression-gate も chain の一部なので req 1 の列挙が一括で回復する）。

**Alternatives considered**:
- *guard を残し新関数を別途追加*: transition 行の差し替えが増え、旧関数が dead code 化。置換が最小。却下。

### D4 — build-fixer が conformance 承認の後に走った場合は reviewer chain へ再入する（意図した帰結）

D3 の帰結として、`conformance(approved) → verification(fail) → build-fixer → verification(pass)` の経路では、
build-fixer が commit で HEAD を動かすため、final verification の entry HEAD ≠ conformance.commitOid となり、
guard が false → **code-review 再入**（その後 conformance が build-fixer revision で再承認 →
`codeChangedSinceLastVerification` false → adr-gen）となる。

これは**古い挙動（stale conformance 承認が build-fixer の変更を素通しして adr-gen へ直行）を封鎖する正しい修正**で
あり、request の不変条件（req 1: 承認後に revision が動けば承認は無効）の直接の帰結である。対照的に、code-fixer が
conformance の **前**に走った経路（`code-fixer → conformance(approved) → verification(pass)`）では conformance が
最終 revision を承認済みなので guard が true のまま adr-gen へ進む（現行維持）。この非対称が「承認は評価した
revision にのみ有効」を体現する。

**Rationale**: build-fixer は `IMPL_CODE_MUTATOR_STEPS`（`reverification.ts:19-23`）に含まれる code mutator で
あり、その commit 後に承認が有効なまま skip するのは request が塞ぐ穴そのもの。再入コストは失敗回復経路
（例外的経路）に限られ、budget（maxIterations）で有界。ループは発生しない（再承認後は codeChanged=false で
conformance → adr-gen へ直行）。

**Alternatives considered**:
- *build-fixer を revision 照合の対象外にする（build-fixer 後は現行どおり adr-gen 直行）*: 「build のみで source
  logic は不変」の暗黙前提に依存するが、build-fixer は src/ を編集できるため fail-open。req 1 に反する。却下。

### D5 — custom reviewer: `selectPendingMembers` に基準 commitOid 照合を追加し、source-scoped invalidation を保存するため保留 member を re-anchor する

- `selectPendingMembers(statuses, members, baselineCommit)` に 3 引数目を追加する。approved member を pending から
  除外する条件を「`status === "approved"`」から **「`status === "approved"` かつ `approvedAtCommit != null` かつ
  `approvedAtCommit === baselineCommit`」** に強める。不一致・null は pending へ戻す（fail-closed）。
  `baselineCommit == null`（下記 managed）のときは照合を無効化し現行挙動（status のみで除外）に退避する。
- `baselineCommit` は coordinator が `captureHeadSha(cwd)` の **raw 結果**（timestamp fallback を使わない nullable 値）
  として算出し `selectPendingMembers` へ渡す。`ParallelReviewRound.run` はこの値を既に取得している
  （`parallel-review-round.ts:108` の fallback を分離して raw 値を得る）。
- **source-scoped invalidation の保存（req 7）**: 現行は `computeInvalidations`
  （path-scoped、`reviewer-status.ts:196-223`）が「fixer が member の activation path を触っていなければ approved を
  保つ」。baselineCommit 照合を素朴に足すと、無関係な source 変更で HEAD が動いたとき保留 member（approvedAtCommit =
  旧 commit）が baselineCommit と食い違い pending へ戻ってしまい、`2026-07-15-round-invalidation-source-scoped` の
  最適化を退行させる。これを防ぐため、coordinator は **`listChangedFiles` が success（positive evidence）で、かつ
  `computeInvalidations` が member を invalidate しなかった** ときに限り、その member の `approvedAtCommit` を
  `baselineCommit` へ **re-anchor** する（「この承認は基準 revision でも有効と確認済み」を記録）。これにより保留 member は
  baselineCommit と一致し `selectPendingMembers` に skip される。evidence が無い（managed / listChangedFiles
  unavailable）ときは re-anchor せず、baselineCommit 照合で fail-closed に倒す。

**managed / evidence 不能時**: `captureHeadSha` が null を返す runtime（local worktree を持たない managed 等）では
`baselineCommit == null` として照合を無効化し、既存の fail-safe 挙動（status のみで resume skip）を保存する。
これは `2026-07-15` / 本 request 双方の「managed 並列 custom reviewer は Non-Goal」の境界に一致する。

**approvedAtCommit の意味の拡張**: `2026-07-15` D1 の contract は「新規 approve 時の approvedAtCommit = reviewed
source revision（round findings commit を含まない fan-out HEAD）」を固定する。re-anchor はこれを
「reviewed **または** 基準 revision で再確認済みの source revision」へ拡張する。新規 approve の capture 位置
（fan-out 後・commit 前）は不変なので当該 contract test 自体は通るが、field の意味を doc とテストで更新する。

**Rationale**: acceptance criterion（`selectPendingMembers` が基準 commitOid 不一致で pending に戻す）を満たしつつ、
req 7（変更なしの skip 保存）と `2026-07-15` の source-scoped 最適化の双方を壊さない唯一の構成。re-anchor は
coordinator ループ（`parallel-review-round.ts:112-140`）内の小さな追加で閉じ、`computeInvalidations` の照合ロジック
自体は変えない（責務分担を保つ）。

**Alternatives considered**:
- *re-anchor しない（不一致で常に pending へ戻す）*: source 変更があれば無関係 member も再走し `2026-07-15` の
  source-scoped invalidation を実質無効化する。req 7 の「no-movement 保存」自体は満たすが、意図的な既存最適化を
  暗黙に退行させるため却下。
- *null（レガシー）のみ pending に戻し、非 null は `computeInvalidations` に委ねる*: acceptance criterion の
  「基準 commitOid **不一致**時に pending へ戻す」を満たせない。却下。

### D6 — レガシー record（commitOid 欠落）は stale として再実行に倒す

D3 の guard は conformance/verification の `commitOid` が欠落していれば false（reviewer chain 再入）。
D5 の `selectPendingMembers` は `approvedAtCommit == null` を skip 除外（pending）にする。commitOid を持たない
過去の承認 record は「判定不能 = 承認なし」として fail-closed に扱い、fail-open にしない。record は削除・書換しない。

**Rationale**: `achieved-assurance.ts` の missing-commitOid → absent と同じ fail-closed 方針。証跡は不変。

## Risks / Trade-offs

- **[Risk] verification の commitOid を exit HEAD で打刻してしまう回帰** → 正常な再検証（criterion 2）が恒常的に
  code-review へ迂回する（無限ではないが毎ジョブ余計な chain 1 周）。→ **Mitigation**: D2 を「entry HEAD 打刻」と
  明示し、`propagateVerificationResult` が HEAD を動かす事実を field doc に注記。専用テスト（TC: verification の
  StepRun.commitOid が entry HEAD と一致し、result commit 後の HEAD ではない）で capture 位置を固定する。
- **[Risk/Trade-off] build-fixer 経路の挙動変更（D4）** → build-fixer 回復後に code-review + conformance が
  1 周追加される。既存 reverification テスト（TC-003 / TC-004 / TC-019）の期待が変わる。→ **Mitigation**: D4 を
  意図した帰結として明記し、対象テストの期待を「build-fixer 後は reviewer chain 再入」へ更新する（下記「既存テストの
  更新」）。ループしないこと（再承認後 codeChanged=false で adr-gen 直行）を e2e テストで固定する。
- **[Risk] custom reviewer subsystem（round-owned-state-commit / source-scoped invalidation / round-git-effects）
  への波及** → re-anchor は intricate な coordinator ループを触る。→ **Mitigation**: 変更を coordinator ループの
  re-anchor 一箇所と `selectPendingMembers` 署名に閉じ、`computeInvalidations` / `applyRoundResults` /
  `aggregateVerdict` のロジックは不変に保つ。`parallel-review-round-invalidation` / `-resume` / `reviewer-status`
  テストで保留 member の re-anchor と不一致時 revert を固定する。
- **[Risk] managed runtime の挙動差** → `captureHeadSha` が real sha を返す managed では baselineCommit 照合が
  効き custom reviewer が resume で再走しうる（現行は skip）。→ **Mitigation**: baselineCommit を nullable の raw
  値とし、null のとき照合無効（現行維持）。managed 並列 custom reviewer は明示 Non-Goal。
- **[Trade-off] guard の等値比較は entry-HEAD == conformance-exit-HEAD の pipeline 不変に依存** → conformance と
  verification の間に commit する step が将来挿入されると偽陰性（false）になりうる。→ **Mitigation**: 再検証
  チョークポイントの直列性（conformance approved → verification は直行）を design/spec に不変として明記し、
  criterion 2 の e2e テストで守る。

### 既存テストの更新（acceptance criterion「対象テストを design で列挙」）

- `tests/unit/core/pipeline/pipeline.reverification.test.ts`
  - **TC-001 / TC-002**: `appendRun` に commitOid 引数を追加し、conformance と reverify verification に**同一**
    commitOid を打刻 → guard true 維持 → adr-gen へ進む（code-fixer が conformance 前に走る経路。期待は不変、
    stamping のみ追加）。
  - **TC-003 / TC-004 / TC-019**: build-fixer が conformance 承認**後**に走る経路。final verification の commitOid ≠
    conformance.commitOid をモデルし、期待を「build-fixer 後は code-review 再入 → conformance 再承認 → adr-gen」へ
    更新（D4）。verification/build-fixer の回数と `awaiting-archive` 収束は保持。
  - **TC-005 / TC-006**: guard が false（conformance 未実行 or 単発 verification）の経路。commitOid 追加不要、期待不変
    を確認。
- `tests/unit/pipeline/transition-when.test.ts`
  - **TC-2**（`code-fixer → conformance(approved) → verification(pass) → adr-gen`）: conformance と verification の
    StepRun に同一 commitOid を打刻して guard true を復元（現状は commitOid 無しで guard が fail-closed し code-review へ
    逸れる）。
  - **TC-016 / TC-017**: guard 行の存在・順序・`when` 関数性の構造検査。関数名を改名する場合も `.when` が function で
    ある検査は通る。改名参照（`types.ts`）に追随する箇所のみ更新。
- `src/core/pipeline/__tests__/reviewer-status.test.ts`
  - **selectPendingMembers** 群: 3 引数化に追随。approved + `approvedAtCommit === baseline` → 除外、不一致/null →
    pending の新規ケースを追加。
  - **computeInvalidations「preserves approved ... unchanged」**（line 293-300）: re-anchor は coordinator 側で行い
    `computeInvalidations` 自体は不変なので、この unit test は無改変で通る（re-anchor の固定は round テストで行う）。
- `src/core/pipeline/__tests__/member-resume-routing.test.ts`
  - resume skip テスト群: `selectPendingMembers` を 3 引数へ更新。approved member を skip させるケースは
    `baselineCommit = approvedAtCommit`（一致）を渡す。
- `src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts` / `parallel-review-round-resume.test.ts`
  - 保留 member（path 未接触）が baselineCommit へ re-anchor され、次 round / resume で skip されることを固定。
    evidence 不能時に re-anchor せず fail-closed に倒れることを固定。
- `tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts`
  - TC-002（custom/parallel 経路）が revision 束縛と衝突しないこと（同一 revision では従来どおり skip）を確認。

## Open Questions

- **D5 の re-anchor 範囲**が本変更の最もレビュー精読を要する点。source-scoped invalidation（`2026-07-15`）を
  保存する re-anchor を採るか、単純化して「source 変更があれば approved custom reviewer を一律再走」させ当該最適化を
  退行させるかは、コスト（余分な reviewer turn）と subsystem 変更リスクのトレードオフ。本 design は前者（re-anchor で
  保存）を推奨とし、code-review / spec-review で最終判断を仰ぐ。
