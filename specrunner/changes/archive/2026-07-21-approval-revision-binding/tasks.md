# Tasks: 承認の revision 束縛

実装順は T-01 → T-02（独立、並行可）→ T-03（T-01 に依存: guard を先に）→ T-04（custom reviewer、独立）
→ T-05（既存テスト更新）→ T-06（新規テスト）→ T-07（field doc / 検証）。

## T-01: verification（CLI step）の StepRun に entry-HEAD commitOid を打刻する ✅

- [x] `src/core/step/executor.ts` の `runCliStep`（524-578）で、`step.run(state, deps)` を呼ぶ**前**に
      `deps.runtimeStrategy?.captureHeadSha(cwd)` で HEAD を capture する（`runtimeStrategy` 不在時は undefined）。
- [x] success result（`{ kind: "success", ... }`）に `commitOid`（capture 値、undefined なら未設定）を載せる。
      `projectSuccess`（`commit-orchestrator.ts:89-112`）が既に `commitOid` を StepRun へ透過するため、
      CommitOrchestrator / schema の変更は不要。
- [x] capture 位置が step.run() の**前**であること（`propagateVerificationResult` の result commit で HEAD が
      進む前）を担保する。exit HEAD を掴まないこと。

**Acceptance Criteria**:
- verification 成功時、StepRun.commitOid が step 開始時の HEAD（entry HEAD）と一致し、verification-result commit
  後の HEAD とは一致しない。
- `runtimeStrategy` 不在の CLI step では commitOid が未設定（undefined）。
- agent step の commitOid 打刻（`executor.ts:465-468`）は無改変（既存 `executor-oid-capture.test.ts` が green）。
- 他 CLI step（pr-create / bite-evidence）の commitOid 打刻可否は明示判断（本 task は verification に必要な entry-HEAD
  打刻を追加。CLI step 一般の entry-HEAD 打刻を導入する場合は他 CLI step の commitOid 消費者が無いことを確認する）。

## T-02: conformance guard を revision 照合込みに置換する ✅

- [x] `src/core/pipeline/reverification.ts` の `conformanceApprovedLatest`（67-72）を
      `conformanceApprovedForVerifiedRevision(state)` へ改名・置換する。true 条件:
      (1) 最新 conformance run が存在し `outcome.verdict === "approved"`、(2) その run の `commitOid` が非空、
      (3) 最新 verification run が存在し `commitOid` が非空、(4) conformance.commitOid === verification.commitOid。
      いずれか欠けば false（fail-closed）。純関数（state のみ、git I/O 無し）。
- [x] `src/core/pipeline/types.ts` の 2 箇所（STANDARD `:250` / FAST `:307`）の import と `when` 参照を新関数名へ更新。
- [x] JSDoc を「最新 verdict のみ」から「revision 照合（承認は評価した revision にのみ有効）」へ書き換え、
      D1 / D3 / D4 と `codeChangedSinceLastVerification`（endedAt 補助）との役割分担を明記。

**Acceptance Criteria**:
- guard は state 純粋（`captureHeadSha` / git を呼ばない）。
- conformance / verification の commitOid が等しいとき true、不一致 or いずれか欠落で false。
- conformance 未実行（runs.length === 0）で false（既存 health invariant 維持）。
- STANDARD / FAST 両プロファイルの `verification passed → adr-gen|pr-create` 行が新関数を参照する。

## T-03: build-fixer 後の reverify 再入がループしないことを保証する（挙動確認・追加コードは最小）✅

- [x] D4 の帰結（build-fixer が conformance 承認後に commit → final verification の entry HEAD ≠
      conformance.commitOid → guard false → code-review 再入 → conformance 再承認 → codeChanged=false → adr-gen）が
      既存の transition / episode-reset / budget 機構で成立し、無限ループしないことをコード読解で確認する。
- [x] 収束に新たな transition 行や guard が必要な場合のみ最小追加する（原則は T-02 の guard 置換で完結。追加が要る
      と判明したら design に照らして最小行を足す）。

**Acceptance Criteria**:
- `conformance(approved) → verification(fail) → build-fixer → verification(pass)` 経路が code-review 再入を経て
  `awaiting-archive` へ収束し、ループ / budget 誤爆で escalation にならない（T-06 の e2e で固定）。
- code-fixer が conformance の前に走る経路（TC-001 型）は adr-gen へ短絡し続ける。

## T-04: custom reviewer の resume skip に基準 commitOid 照合と re-anchor を追加する ✅

- [x] `src/core/pipeline/reviewer-status.ts` の `selectPendingMembers(statuses, members)` を
      `selectPendingMembers(statuses, members, baselineCommit)` に拡張。approved member を pending から除外する条件を
      「`status === "approved"` かつ `approvedAtCommit != null` かつ `approvedAtCommit === baselineCommit`」に強める。
      不一致 / null は pending。`baselineCommit == null`（判定不能）のときは照合を無効化し現行挙動へ退避。
      `status === "skipped"` と未知 member の扱いは現行どおり。
- [x] `src/core/pipeline/parallel-review-round.ts` で `baselineCommit` を `captureHeadSha(cwd)` の **raw 結果**
      （line 108 の timestamp fallback を分離した nullable 値）として算出し、`selectPendingMembers` に渡す。
- [x] 同ファイルの invalidation ループ（112-140）で、`listChangedFiles` が `kind === "success"`（positive evidence）
      かつ `computeInvalidations` が member を invalidate しなかったとき、その member の `approvedAtCommit` を
      `baselineCommit` へ **re-anchor** する。evidence 不能（unavailable）時は re-anchor しない。
- [x] `computeInvalidations` / `applyRoundResults` / `aggregateVerdict` のロジックは無改変（re-anchor は coordinator
      側で行う）。`applyRoundResults` が approve 時に `approvedAtCommit = headSha` を書く挙動は現行維持（実値設定は
      既に成立）。

**Acceptance Criteria**:
- `selectPendingMembers`: approved + `approvedAtCommit === baseline` → 除外、不一致 → pending、`approvedAtCommit ==
  null` → pending、`baseline == null` → 現行挙動（status のみ）。
- coordinator: path 未接触の保留 member が positive evidence 下で baselineCommit へ re-anchor され、次 round / resume で
  skip される。evidence 不能時は re-anchor されず fail-closed に倒れる。
- `2026-07-15-round-invalidation-source-scoped` の D1 contract（新規 approve の approvedAtCommit = fan-out HEAD、
  round findings commit を含まない）は維持。
- managed（captureHeadSha=null）の並列 custom reviewer は現行の fail-safe skip を保存（Non-Goal 境界）。

## T-05: 既存テストを revision 照合に追随して更新する ✅

- [x] `tests/unit/core/pipeline/pipeline.reverification.test.ts`:
      `appendRun` に commitOid 引数を追加。
      - TC-001 / TC-002: conformance と reverify verification に**同一** commitOid を打刻し adr-gen 到達を維持。
      - TC-003 / TC-004 / TC-019: build-fixer が conformance 後に走る経路の期待を「code-review 再入 → conformance
        再承認 → adr-gen」へ更新（verification/build-fixer 回数と `awaiting-archive` 収束は保持）。
      - TC-005 / TC-006: guard false 経路。期待不変を確認（commitOid 追加不要）。
- [x] `tests/unit/pipeline/transition-when.test.ts`:
      - TC-2: conformance と verification の StepRun に同一 commitOid を打刻し guard true（adr-gen 到達）を復元。
      - TC-016 / TC-017: guard 行の存在・順序・`when` 関数性検査。改名参照に追随（`.when` が function である検査は不変）。
- [x] `src/core/pipeline/__tests__/member-resume-routing.test.ts`: `selectPendingMembers` 呼び出しを 3 引数化。
      approved member を skip させるケースは `baselineCommit = approvedAtCommit`（一致）を渡す。
- [x] `src/core/pipeline/__tests__/reviewer-status.test.ts`: `selectPendingMembers` 群を 3 引数化。
      `computeInvalidations` の「preserves approved ... unchanged」は無改変で green（re-anchor は coordinator 側）。
- [x] `tests/pipeline-integration.test.ts`: TC-060 / TC-062 に `runtimeStrategy: makeCommitOidStubStrategy()` と
      `gitTransportSpawn: makeFailingGitSpawnFn()` を追加し conformance/verification の commitOid 一致を保証。

**Acceptance Criteria**:
- 上記テストが本変更の意図（revision 照合）に沿って更新され green。
- 更新は期待値の追随に限り、テストの検証意図（再検証チョークポイントの mechanics）を保持する。

## T-06: 新規テスト（acceptance criteria の RED 固定）✅

- [x] **guard 単体**（`reverification` / `transition-when` 系）: conformance.commitOid = C1, verification.commitOid =
      C2 (≠C1) → guard false（→ code-review）。C1 == C1 → true（→ adr-gen/pr-create）。commitOid 欠落 → false。
- [x] **再走事故 e2e**（`pipeline.reverification` 系、criterion 1）: conformance approved（C1）の後に implementer 相当
      run（C2）と verification passed（C2）を積むと、transition が adr-gen / pr-create へ**行かず** code-review へ入る。
- [x] **正常経路 e2e**（criterion 2）: conformance approved と直近 verification の commitOid が一致すると adr-gen /
      pr-create へ進む。
- [x] **レガシー stale**（criterion 3）: conformance / verification のいずれかが commitOid 欠落だと code-review 再入。
- [x] **verification 打刻**（criterion 4）: verification StepRun.commitOid が entry HEAD であり、result commit 後の
      HEAD ではない（stateful fake `captureHeadSha` で entry / post-commit を区別）。
- [x] **custom reviewer 束縛**（criterion 5）: `applyRoundResults` が approve で approvedAtCommit に実値を設定し、
      `selectPendingMembers` が基準 commitOid 不一致で pending に戻す / 一致で skip する。coordinator の re-anchor と
      evidence 不能時 fail-closed を round テストで固定。
- [x] **build-fixer 再入非ループ**（D4）: build-fixer 回復経路が code-review 再入を経て `awaiting-archive` へ収束し
      escalation にならない。

**Acceptance Criteria**:
- criterion 1〜5 が新規テストで固定される。
- 新規テストは interface 確定後の期待（design D1〜D6 準拠）を検証する。

## T-07: field doc 更新と最終検証 ✅

- [x] `src/state/schema/types.ts:188-199` の `commitOid` doc に、CLI step（verification）は entry HEAD（評価 revision）、
      agent step は per-node commit 後 HEAD、という意味の非対称を注記する。
- [x] `reviewer-status.ts` の `approvedAtCommit` 意味（reviewed **または** 基準 revision で再確認済みの source
      revision）と `selectPendingMembers` の baseline 照合 / re-anchor を JSDoc に記す。
- [x] `typecheck && test` を green にする。

**Acceptance Criteria**:
- field doc が CLI/agent の commitOid 意味差と approvedAtCommit の拡張意味を説明する。
- `typecheck && test` が green（criterion 7）。
