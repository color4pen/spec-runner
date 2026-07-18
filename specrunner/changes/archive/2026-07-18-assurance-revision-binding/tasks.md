# Tasks: scenario / spec の凍結・承認を revision（commit OID）に束縛する

> 実装順序の原則: 判定ロジック（`achieved-assurance.ts` の scenario 凍結差し替え → specReview 束縛）を先に確定し、
> その後にテスト（unit → floor integration → 実 runtime E2E → backward-compat 監査）を書く。production 変更は
> `src/core/archive/achieved-assurance.ts` の 1 ファイルに閉じる（port / runtime / caller は無変更）。
> 受け入れ基準の「歯」T1〜T7 は各テストタスクで名指しで固定し、破壊確認コメントを添える。

## T-01: scenario 凍結を test-case-gen 確定 commit の blob 束縛に差し替える（D1）

- [x] `src/core/archive/achieved-assurance.ts` の scenario 二層凍結ブロック（L241-320、events.jsonl → `fold` →
      frozen hash vs test-cases.md@finalHeadOid）を撤去し、次に置き換える:
  - `testCaseGenOid = state.steps?.[STEP_NAMES.TEST_CASE_GEN]?.at(-1)?.commitOid` を解決。`undefined` → 両次元 absent
    ＋ diagnostic（fail-closed）。
  - `state.request?.slug` を解決。null / undefined → 両次元 absent ＋ diagnostic（archived path を一意解決できない）。
  - `runtime.readFileAtCommit(testCaseGenOid, "<slug>/test-cases.md", cwd)` と
    `runtime.readFileAtCommit(finalHeadOid, "<slug>/test-cases.md", cwd)` を読む。いずれか `kind:"unavailable"` →
    両次元 absent ＋ diagnostic。
  - 両 `found` の content を `computeContentHash`（L71-74）で hash 化し、**一致 → scenario 凍結成立**、不一致 →
    両次元 absent ＋ diagnostic。
- [x] `events.jsonl` 読取・`fold` 呼び出し・lineage frozen hash 抽出を撤去し、`import { fold } from
      "../../store/event-journal.js";`（L23）を削除する。
- [x] 既存 blob freeze（`diffPathsBetweenCommits(baseOid, finalHeadOid, materializedTestFiles)`、L220-239）は **存置** する
      （materialized test file 凍結の別の歯）。`testDerivation = "frozen"` は「blob freeze intact ＋ scenario 凍結成立」の
      ときのみ付与する（L322-326 の合成条件を維持し、scenario 凍結の判定基準のみ差し替え）。
- [x] 関数が never throws を維持する（try/catch ＋ diagnostic、全 return で当該次元 absent）。

**Acceptance Criteria**（= T1/T2/T3/T5 の導出側）:
- `test-cases.md`@testCaseGenOid と @finalHeadOid の content hash が不一致のとき `achieved.testDerivation` と
  `achieved.biteEvidence` はいずれも absent。一致（＋ blob freeze intact）のとき `testDerivation = "frozen"`（type 非依存）。
- `testCaseGenOid` 欠落 / slug 欠落 / いずれかの `readFileAtCommit` unavailable のとき両次元 absent。
- scenario 凍結の判定に `events.jsonl` / `fold` を用いない（events.jsonl 読取が code から消える）。
- `bun run typecheck` が green。

## T-02: specReview を spec-review 確定 commit の blob に束縛する（D2）

- [x] `src/core/archive/achieved-assurance.ts` の specReview 導出（L122-135）を、`floor.specReview !== undefined` の
      ときにのみ実行する block に変更する（constrain しないとき I/O せず absent のまま。satisfiesFloor が無視）。
- [x] block 内で次を fail-closed に検証する（いずれか不成立 → `achieved.specReview` を設定しない）:
  - `state.steps?.[STEP_NAMES.SPEC_REVIEW]?.at(-1)` の `outcome?.verdict === "approved"`。
  - `specReviewOid = 同 run の commitOid` が present。
  - `finalHeadOid` 定義、`runtime` が有り `typeof runtime.readFileAtCommit === "function"`、`state.request?.slug` 解決。
  - `readFileAtCommit(specReviewOid, "<slug>/spec.md", cwd)` と `readFileAtCommit(finalHeadOid, "<slug>/spec.md", cwd)`
    がいずれも `found` で、`computeContentHash` が一致。
  - すべて成立 → `achieved["specReview"] = "required"`。
- [x] この block は関数を early-return せず、`achieved.specReview` の設定 / 未設定のみを行う（後続の bite / derivation
      評価に影響しない）。try/catch ＋ diagnostic で never throws を維持する。
- [x] `isSpecRequired`（`type-config.ts:105`）で束縛を緩めない（spec-exempt type でも spec.md 解決不能なら fail-closed）。

**Acceptance Criteria**（= T4 の導出側）:
- 最新 spec-review verdict が `approved` ＋ `spec.md`@specReviewOid と @finalHeadOid の content hash 一致のとき
  `achieved.specReview = "required"`。
- verdict 非 approved / `specReviewOid` 欠落 / slug 欠落 / `finalHeadOid` 未定義 / runtime に `readFileAtCommit` 無 /
  spec.md いずれか unavailable / content hash 不一致 のとき absent。
- `floor.specReview` が constrain しないとき spec.md I/O は走らない。
- `bun run typecheck` が green。

## T-03: deriveAchievedAssurance の unit テスト（新束縛、fine-grained）

- [x] `tests/unit/core/archive/achieved-assurance-completeness-unit.test.ts` を更新する。`makeJobState` に
      `test-case-gen` step（commitOid = 固定値、例 `TEST_CASE_GEN_OID`）を既定で追加し、specReview テスト用に
      `spec-review` run へ commitOid を付与できるようにする。`makeFakeRuntime` の `readFileAtCommit` を **oid 別**
      （＋ suffix 別）に返す形へ拡張する（`test-cases.md`@testCaseGenOid vs @finalHeadOid、`spec.md`@specReviewOid vs
      @finalHeadOid を別内容で作れる）。events.jsonl fixture は撤去する。
- [x] **scenario time-boundary（T1 導出側）**: `test-cases.md`@testCaseGenOid = S、@finalHeadOid = S'（不一致）で
      `testDerivation` / `biteEvidence` absent を固定する。**破壊確認コメント**: 両 read を finalHeadOid（同一 commit）に
      戻すと不一致が消えて present になってしまう旨を明示する。
- [x] **協調改竄（T2 導出側、#850 の穴）**: `test-cases.md`@finalHeadOid = S'、（撤去済みだが説明として）events.jsonl を
      書き換えても、`test-cases.md`@testCaseGenOid = S との比較で不一致 → 両次元 absent を固定する。**破壊確認コメント**:
      events.jsonl frozen hash と finalHeadOid content を比較する旧構造に戻すと通ってしまう旨を明示する。
- [x] **scenario fail-closed 網羅（T5 導出側）**: (i) `testCaseGenOid` 欠落、(ii) `test-cases.md`@testCaseGenOid
      unavailable、(iii) `test-cases.md`@finalHeadOid unavailable、(iv) slug 欠落 のそれぞれで両次元 absent を固定する
      （旧 events.jsonl 依存の TC-003 frozen-null / TC-022 events-unavailable を上記へ置き換える）。
- [x] **specReview time-boundary（T4 導出側）**: 最新 verdict approved ＋ commitOid 有で、`spec.md`@specReviewOid = SPEC、
      @finalHeadOid = SPEC'（不一致）→ `specReview` absent。positive（SPEC 不変）→ `"required"`。verdict 非 approved は
      verdict で先に落ちる（従来の needs-fix / escalation / null / run 無しの assertion を維持）。
- [x] **specReview fail-closed 網羅（T5 導出側）**: `specReviewOid` 欠落、`spec.md`@specReviewOid unavailable、
      `spec.md`@finalHeadOid unavailable のそれぞれで `specReview` absent を固定する。
- [x] positive 総合: base:red・HEAD:green・blob freeze intact・scenario 凍結成立（S 不変）・forward type で
      `biteEvidence = "required"` ＋ `testDerivation = "frozen"`、spec.md 不変＋approved で `specReview = "required"`。
- [x] Never throws（null runtime / undefined finalHeadOid）を維持する。

**Acceptance Criteria**:
- 上記各分岐が導出レベルで green。破壊確認コメント（同一 commit 復帰で T1/T2 が通る）が記載されている。
- `bun run typecheck` が green。

## T-04: floor integration テスト（歯 T1/T2/T4/T5/T6 を exitCode で固定）

- [x] `tests/unit/core/archive/achieved-assurance-completeness-integration.test.ts` と
      `tests/unit/core/archive/merge-then-archive-floor-provenance.test.ts` の shared helper を更新する:
  - `makeJobStateWithSteps` に `test-case-gen` step（commitOid）を **既定で** 追加し、specReview 系は `spec-review` run に
    commitOid を付与する。
  - `makeFakeRuntime` の `readFileAtCommit` を **oid 別** に拡張する（`test-cases.md` / `spec.md` を anchor OID と HEAD OID で
    別内容にでき、既定は anchor↔HEAD 一致 = fully-achieved）。events.jsonl fixture は撤去する。
  - これにより機械の歯（base-red / HEAD-green / hollow / blob-freeze / type gate）の各 fail-closed テストが scenario 段で
    先に落ちず、**意図した check に到達** する（assertion は無変更）。
- [x] **T1（scenario time-boundary の歯）**: test-case-gen 確定 commit に S、finalHeadOid（archiveSha）に S'（fake の
      `readFileAtCommit` が anchor OID = S、HEAD OID = S' を返す）→ `biteEvidence:required` / `testDerivation:frozen` floor に
      対し `exitCode 1`・`mergePullRequest` 未呼び出し。**破壊確認コメント**: 跨ぎ比較を同一 commit に戻すと T1 が通る旨を明示。
- [x] **T2（協調改竄の歯）**: `test-cases.md`@finalHeadOid = S'（改竄）＋ events.jsonl@finalHeadOid の frozen hash も S' に
      書換え済みでも、`test-cases.md`@testCaseGenOid = S との比較で `exitCode 1` を固定する。**破壊確認コメント**を添える。
- [x] **T4（specReview time-boundary の歯）**: verdict=approved ＋ `spec.md`@specReviewOid = SPEC、@finalHeadOid = SPEC'
      （不一致）で `specReview:required` floor に対し `exitCode 1`。positive（spec.md 不変＋approved）で `exitCode 0`・
      `mergePullRequest` 呼び出しを固定する。
- [x] **T5（fail-closed 網羅 exitCode）**: `testCaseGenOid` 欠落 / `specReviewOid` 欠落 / `readFileAtCommit` unavailable の
      それぞれで当該 floor 次元が `exitCode 1` を固定する。
- [x] **T6（実 config anti-regression）**: `scopedTestCommand` 未設定 → `runTestsAtCommit` unavailable の runtime で
      `biteEvidence:required` floor の protected path を touch する job が `exitCode 1`（#848 の歯）。既存 TC-026 / TC-001 を
      base に据え、退行させない。
- [x] 既存 positive-path（completeness-integration TC-002 / TC-006-positive、floor-provenance TC-003 / TC-019）の期待を、
      commit-OID 束縛（anchor commit ＋ OID 別 readFileAtCommit）に合わせた **意味が変わる更新** として反映する。

**Acceptance Criteria**:
- T1 / T2 / T4 / T5 / T6 の各テストが green（改竄・欠落・unavailable → fail-closed、完全成立 → 通す）。
- 破壊確認コメント（同一 commit 復帰で T1・T2 が落ちる）が記載されている。
- 機械の歯（base-red / HEAD-green / hollow / blob-freeze / type gate）の fail-closed テストが意図した check に到達し続ける
  （assertion 無変更）。
- `bun run typecheck && bun run test` が green。

## T-05: 実 runtime E2E を時間境界化する（D4 / T3）

- [x] `src/core/runtime/__tests__/bite-evidence-e2e-gate.test.ts` の repo 構成を anchor / HEAD 別 commit へ更新する
      （実 git・実 `LocalRuntime`、fake なし）:
  - `init` → `spec-review 確定`（`specrunner/changes/example/spec.md` = SPEC、specReviewOid）→ `test-case-gen 確定`
    （`specrunner/changes/example/test-cases.md` = S、testCaseGenOid）→ `test-materialize`（`feature.test.ts`、baseOid）→
    `implementer 確定`（`feature-impl.ts` green、spec.md / test-cases.md 不変、positive finalHeadOid）→
    `tamper-scenario`（test-cases.md = S'）→ `tamper-spec`（spec.md 改竄）。
  - `makeState` に `test-case-gen`（commitOid = testCaseGenOid）と `spec-review`（commitOid = specReviewOid、
    verdict = approved）step を追加する。events.jsonl fixture は撤去する（D1 で読まない）。
- [x] **T3（scenario positive、実 runtime）**: `finalHeadOid = implementer 確定` で `biteEvidence:required` floor に対し
      `deriveAchievedAssurance` の `achieved.biteEvidence === "required"`（base:red・HEAD:green・blob 不変・scenario 凍結
      成立・forward）を固定する。同 commit で `specReview:required` floor に対し `specReview === "required"` も固定する。
- [x] **scenario time-boundary negative（実 runtime）**: `finalHeadOid = tamper-scenario` で `testDerivation` /
      `biteEvidence` absent を固定する（anchor S ≠ HEAD S'）。
- [x] **spec time-boundary negative（実 runtime）**: `finalHeadOid = tamper-spec` で `specReview` absent を固定する。
- [x] in-loop gate を直接叩く既存 `TC-010 (gate)`（`runBiteEvidenceGate`）が無変更 green であることを確認する
      （test-materialize / implementer OID のみ参照、本 change の対象外）。

**Acceptance Criteria**（= T3 ＋ scenario/spec negative の実 runtime 固定）:
- anchor commit と HEAD を別 commit に分けた構成で、positive（不変）成立・negative（anchor 後に改竄）fail-closed を実 runtime で通す。
- 同一 commit に anchor と HEAD を同居させていない。
- `bun run test src/core/runtime/__tests__/bite-evidence-e2e-gate.test.ts` が green。

## T-06: backward-compat 監査と全体 green（T7）

- [x] `deriveAchievedAssurance` / floor / bite-evidence / `readFileAtCommit` の全 caller とテストを洗い出し、commit-OID 束縛で
      **意味が変わる** テストのみ更新する（scenario-freeze 系: completeness-unit の frozen-hash / events 依存分、
      floor-provenance / completeness-integration の positive；specReview 束縛系: completeness-* の spec-review 系）。
- [x] 意味の変わらない既存テスト（`readFileAtCommit` の local/managed テスト、`diff-paths-between-commits`、in-loop
      `gate.test.ts` / tamper テスト、`satisfiesFloor` / `getProfile`、floor-provenance の fail-closed 系 TC-004〜TC-011）が
      **無変更で green** であることを確認する。fail-closed 系は shared helper 既定更新により意図した check に到達し続け、
      assertion は無変更であることを確認する。
- [x] `bun run typecheck && bun run test` 全体を green にする。

**Acceptance Criteria**（= T7）:
- 既存 achieved-assurance / floor / bite-evidence / readFileAtCommit テストが、意味が変わる期待更新（明示分）を除き無変更 green。
- production 変更が `src/core/archive/achieved-assurance.ts` の 1 ファイルに閉じている（port / runtime / caller 無変更）。
- `bun run typecheck && bun run test` が green。
