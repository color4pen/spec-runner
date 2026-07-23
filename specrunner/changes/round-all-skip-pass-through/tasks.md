# Tasks: custom reviewer round の全員 skip を構造的 skip として green で通す

実装は下流の implementer が行う。各タスクは design.md の Decisions（D1〜D5 / D-journal）に対応する。
本 change は `custom-reviewer-canon-binding` の D6（全 skip escalation）のみを反転し、canon 束縛
（D1〜D5 / D7）は触らない。

## T-01: aggregateVerdict の全 skip を approved にする（D1）

- [ ] `src/core/pipeline/reviewer-status.ts` の `aggregateVerdict` から「非空かつ全 skipped → escalation」
      分岐を削除する。全 skip が既定の `hasNeedsFix ? "needs-fix" : "approved"` の `approved` に落ちるようにする。
      escalation 短絡（member に escalation → escalation）と needs-fix 優先は不変。`hasNonSkipped` 追跡は不要に
      なるため整理してよい（挙動が変わらない範囲で）。
- [ ] docstring / コメント（250-288 の Priority 記述、`custom-reviewer-canon-binding` の D5/D6 由来の
      「all-skip → escalation」記述、TC-048 破壊確認コメント）を「非空・全 skipped → approved（構造的
      skip、gate pass-through）／member 0 → approved／混在 approved → approved／escalation・needs-fix 優先は
      不変」へ更新する。

**Acceptance Criteria**:
- `aggregateVerdict(["skipped","skipped"])` → `"approved"`。
- `aggregateVerdict([])` → `"approved"`、`aggregateVerdict(["approved","skipped"])` → `"approved"`。
- `aggregateVerdict(["needs-fix","skipped"])` → `"needs-fix"`。
- `aggregateVerdict(["skipped","escalation"])` → `"escalation"`（要件 3）。
- `aggregateVerdict(["approved","escalation"])` → `"escalation"`（不変）。

## T-02: ParallelReviewRound から ROUND_ALL_MEMBERS_SKIPPED roundError を削除する（D2 / D3）

- [ ] `src/core/pipeline/parallel-review-round.ts:473-483` の `if (allMembersSkipped && !inspectionEscalated)`
      内の `roundError = { code: "ROUND_ALL_MEMBERS_SKIPPED", … }` 設定を削除する。observability のため
      `logPipelineDiag("pipeline:coordinator:all-members-skipped", …)` の診断ログは残す（error ではなく構造的
      skip の痕跡として、条件は `allMembersSkipped && !inspectionEscalated` を維持）。
- [ ] `applyRoundResults` 抑止 guard（468 行 `if (!inspectionEscalated && !allMembersSkipped)`）は**維持**する
      （D3: 全 skip の member を pending に残す＝恒久 free-pass 回避）。`allMembersSkipped` の算出（353-354）も維持。
- [ ] 関連コメント（345-354 の step 7a、454-483 の step 7c、`ROUND_ALL_MEMBERS_SKIPPED` を error として扱う
      旨、TC-047/TC-048 破壊確認記述）を「全 skip は構造的 skip として green で通す。member は pending に残し
      次 round で再評価。roundError は設定しない」旨へ更新する。
- [ ] fulfilled な skip 結果（`{kind:"skipped", skipReason}`）を `members` 配列へ push する経路（317-334）は
      **変更しない**（D-journal: per-member skip 証跡を journal に残すため）。

**Acceptance Criteria**:
- 全 member skip の round で `round.run` の outcome が `"approved"` を返す。
- 返却 state の coordinator StepRun が `outcome.verdict === "approved"` かつ `outcome.error === null`。
- 返却 state の reviewerStatuses で該当 member の status が `"pending"`（`"skipped"` に確定していない）。
- base state に `state.error = { code: "ROUND_ALL_MEMBERS_SKIPPED", … }` を seed して全 skip round を実行すると、
  返却 state の `error` が `null`（sticky error がクリアされる、要件 6 の基盤）。

## T-03: 終端 seam の ROUND_ALL_MEMBERS_SKIPPED 分岐を削除する（D4）

- [ ] `src/core/pipeline/pipeline.ts:395-425` の `if (state.error?.code === "ROUND_ALL_MEMBERS_SKIPPED") { …
      awaiting-resume … } else { … awaiting-archive + commitFinalState }` から if 分岐を削除し、
      `nextStep === "end" && state.status === "running"` を常に awaiting-archive（+ `commitFinalState`）へ進む
      単一経路にする。
- [ ] 関連コメント（384-394 の ROUND_ALL_MEMBERS_SKIPPED 説明・破壊確認）を削除・簡素化する。他の `nextStep ===
      "escalate"` 経路（427-443）は変更しない。

**Acceptance Criteria**:
- pipeline.ts 内に `ROUND_ALL_MEMBERS_SKIPPED` の参照が残らない。
- 全 skip 構成の E2E で job が `awaiting-archive` に到達する（T-06 で固定）。

## T-04: reviewer-chain の all-members-skipped escalation routing を削除する（D5）

- [ ] `src/core/pipeline/reviewer-chain.ts:456-466` の coordinator `on: "escalation"` かつ
      `when: last.outcome.error.code === "ROUND_ALL_MEMBERS_SKIPPED"` → `REGRESSION_GATE_STEP_NAME` の遷移
      push を削除する。関連コメント（445-455、439 の skipped→regression-gate コメント内の all-skip 言及）を
      整理する。
- [ ] coordinator の他遷移（`approved` → regression-gate / `needs-fix` → code-fixer / `skipped` →
      regression-gate）は**変更しない**。

**Acceptance Criteria**:
- reviewer-chain.ts 内に `ROUND_ALL_MEMBERS_SKIPPED` の参照が残らない。
- skip/error 混在 round（coordinator escalation）が default の `escalate` 終端に落ちて停止する（T-06 で固定）。

## T-05: 純粋関数・round レベルの unit テストを更新/追加する

- [ ] `src/core/pipeline/__tests__/reviewer-status.test.ts` の `aggregateVerdict` テストを T-01 の
      Acceptance Criteria に合わせて更新する:
      `["skipped","skipped"]` → `"approved"` へ期待変更、`["skipped","escalation"]` → `"escalation"` を
      追加/維持、`[]` / `["approved","skipped"]` / `["needs-fix","skipped"]` の既存期待を維持。TC-034/TC-048
      系コメントを新挙動へ更新する。
- [ ] `src/core/pipeline/__tests__/parallel-review-round-canon.test.ts` の TC-006/TC-038 を更新する:
      全 skip round の outcome を `"approved"`、coordinator StepRun の `outcome.verdict` を `"approved"`、
      `outcome.error` を `null` に期待変更。単一 member all-skip も `"approved"`。TC-009（member pending 維持）は
      **維持**。TC-008（mixed skip+approved → approved）は不変。describe/コメントの「escalation」語を追随。
- [ ] skip/error 混在の停止を固定する round レベル unit テストを追加する（要件 3）:
      2 member（A: `{kind:"skipped", skipReason}` / B: `{kind:"halt", …}` を produceResult が返す）で
      `round.run` の outcome が `"escalation"` になり、reviewerStatuses が member を skipped 確定させないことを
      assert する。
- [ ] 後方回復の基盤（sticky error クリア）を固定する round レベル unit テストを追加する（要件 6 の下地）:
      base state に `state.error = { code:"ROUND_ALL_MEMBERS_SKIPPED", … }` と member status `pending` を seed し、
      全 skip round 実行後の返却 state の `error` が `null`、outcome が `"approved"`、member が `pending` のまま
      であることを assert する。

**Acceptance Criteria**:
- 「reviewer 構成ありで全 member skipped → approved（構造的 skip）」を unit で固定。
- 「skip+error 混在 → escalation（非 green、停止）」を unit で固定。
- 「全 skip round が sticky ROUND_ALL_MEMBERS_SKIPPED error を null にクリアする」を unit で固定。
- 「全 skip 後も member status が pending」を unit で固定。

## T-06: E2E（mock pipeline）で構造的 skip pass-through と後方回復を固定する

- [ ] `tests/reviewer-activation-e2e.test.ts` の全 skip 構成の `result.status` 期待を `"awaiting-resume"` から
      `"awaiting-archive"` へ更新する: TC-ACT-01（paths 不一致）/ TC-ACT-02「requestTypes 不一致で skip」/
      TC-ACT-04 第 1 テスト（単一 skip）。member verdict `skipped` / skipReason / conformance 実行の assertion は
      維持する。ファイル冒頭 TC-040/TC-041 説明コメントを新挙動（全 skip → awaiting-archive）へ更新する。
- [ ] TC-ACT-04 第 2 テスト（skip+approved 混在）/ TC-ACT-02 一致ケース / TC-ACT-03 / TC-ACT-05 は変更しない
      （従来どおり awaiting-archive）。
- [ ] 要件 2 の journal 証跡を固定するテストを追加する（reviewer-activation-e2e または近傍の store テスト）:
      全 skip 構成で pipeline 実行後、`events.jsonl` を `fold`（`src/store/event-journal.ts`）して該当 member の
      step-attempt record が `outcome.verdict === "skipped"` かつ `outcome.skipReason` に活性化不一致理由を含み、
      `<member>-skipped` の transition record が存在することを assert する。
- [ ] 要件 6 の後方回復経路を pipeline レベルで固定するテストを追加する:
      `state.error.code === "ROUND_ALL_MEMBERS_SKIPPED"` を持ち reviewerStatuses の member が `pending`、
      coordinator round が再走する状態から pipeline を駆動し（seed した stale error 付き jobState を
      `runPipeline` で走らせる、または resume 経路を用いる）、最終 status が `"awaiting-archive"` かつ
      `state.error` が `null`（クリア済み）になることを assert する。実装ハーネスは既存の `runPipelineWith`
      流儀に合わせ、start 経路の選択（full pipeline / resume）は implementer が deterministic な方を採用する。

**Acceptance Criteria**:
- 全 member 担当外 skip の round で、job が停止せず後続 step（regression-gate → conformance）を経て
  `awaiting-archive` まで到達することを E2E で固定。
- per-member の skip 理由が journal event（step-attempt + transition record）として記録されることを E2E で固定。
- 旧 `ROUND_ALL_MEMBERS_SKIPPED` awaiting-resume 状態からの resume/再走が `awaiting-archive` に到達することを固定。

## T-07: 検証ゲートと implementation-notes

- [ ] `custom-reviewer-canon-binding` の canon 束縛テスト群（invalidation / `round-git-scope` /
      `computeCanonHash` / `selectPendingMembers` の canon 分岐 / `applyRoundResults` の canonHash）が
      **無変更で green** であることを確認する（本 change は集約・roundError・routing・terminal seam のみを触る）。
- [ ] `diff 導出不能時に paths 条件付き reviewer が活性化する既存テスト`（`tests/unit/step/executor-activation.test.ts`
      等）が**無変更で green** であることを確認する（要件 4、executor は触らない）。
- [ ] `ROUND_ALL_MEMBERS_SKIPPED` の停止を期待していた既存テストの**更新対象一覧**を implementation-notes に
      列挙する（design.md「テスト影響」節の対象: reviewer-status.test.ts / parallel-review-round-canon.test.ts /
      reviewer-activation-e2e.test.ts の各 TC）。各更新について「旧挙動に戻すと fail する」破壊確認をテスト
      コメントに残す。
- [ ] `bun run typecheck && bun run test`（または project の verification.commands）を green にする。

**Acceptance Criteria**:
- canon 束縛テスト・executor 活性化テストが無変更で green。
- 更新した既存テストが implementation-notes に列挙され、破壊確認がコメントで固定されている。
- `typecheck && test` が green。
