# achieved-assurance の達成判定を完成させる — HEAD-green 実測 / scenario 二層凍結 / type↔strategy / spec-review approved（P0 fix-forward）

## Meta

- **type**: spec-change
- **slug**: achieved-assurance-completeness
- **base-branch**: main
- **adr**: false

<!-- 構造判断は ADR-20260717 D4（base-red・HEAD-green・test 不変の三条件）と ADR-20260716 D2（type が bite strategy を決める）で ratify 済み。本 request はそれらに現 `deriveAchievedAssurance` が反している 3 点（+1 P1）を、同一の archive authority seam（`src/core/archive/achieved-assurance.ts`）で閉じる。per-scenario 実行と dogfood config 有効化は別 request、本 request の射程外。新規 architecture ADR を要さない。 -->

## 背景

`minimumAssurance` floor は達成 provenance を評価するようになった（#848）が、その達成判定（`src/core/archive/achieved-assurance.ts` の `deriveAchievedAssurance`）に、accepted ADR に反する未達が残っている:

- **P0-1: HEAD-green を実測していない**。`biteEvidence:"required"` は base で全 test red なら付与され（L214-241）、`finalHeadOid` は test blob の freeze diff（L190）にしか使われない。HEAD で test を実行しないため、**base:red・test 不変・HEAD:依然 red** でも floor を通る。request #846 の「green@HEAD は CI が構造的に保証」という前提は誤り: `merge-then-archive.ts` の `NONE_CHECK_GRACE_MS=60_000` は CI 無し repo を 60s 後に merge するし、green rollup は「その凍結 test 群が走った」証明でもない。ADR-20260717 D4 の三条件に直接反する。
- **P0-2: `testDerivation:"frozen"` が scenario 凍結を見ていない**。materialized test blob の freeze（base→HEAD）だけで frozen を付与し（L209-212）、`test-cases.md` / test-case-gen lineage hash を参照しない。in-loop の `tamper.ts` は hash 欠落を `inconclusive→proceed` とし、archive はその結果すら見ない。scenario を事後改変しても frozen を名乗れる。
- **P0-3: request.type と bite strategy が結び付いていない**。in-loop `gate.ts` は forward strategy を `bug-fix/new-feature` に限定するが、archive derivation は `state.request.type` を一切見ず、refactoring / spec-change にも base-red→HEAD-green（forward strategy）を適用する。ADR-20260716 D2 に反する。
- **P1: `specReview:"required"` が verdict を見ていない**。spec-review run が1件でも存在すれば成立し（L96-99）、最新 run の verdict が `approved` でなくても通る。

本 request はこの 4 点を同一 seam で閉じ、達成判定を ADR の三条件＋D2 に整合させる。

## 現状コードの前提（調査済み・実装はこの前提に沿うこと）

- **derivation**（`src/core/archive/achieved-assurance.ts:84-248`）: `deriveAchievedAssurance({state, finalHeadOid, cwd, config, floor, runtime})`。specReview は L96-99（run 存在のみ）。materializedTestFiles は `listCommitChangedFiles(baseOid)`＋`isExcludedPath` filter（L166-183）。freeze は `diffPathsBetweenCommits(baseOid, finalHeadOid, materializedTestFiles)`（L190）。base-red は L217-241（全件 `passed===false`、欠落は fail-closed）。`finalHeadOid` は freeze diff にのみ使用。
- **CI との関係**（`src/core/archive/merge-then-archive.ts`）: floor gate（Step 3.6）は CI-wait（Step 4）より前。`NONE_CHECK_GRACE_MS=60_000`＝rollup が none のまま 60s 経つと merge 続行。CI green は provenance の代用にならない → HEAD-green は floor が自ら実測する。
- **archive-record の folder 移動**: Step 3（`runArchiveOrchestrator`→`archiveChangeFolder`、`src/core/finish/archive-change-folder.ts`）が `git mv specrunner/changes/<slug> specrunner/changes/archive/<YYYY-MM-DD>-<slug>` を実行し commit。**floor gate（Step 3.6）到達時には change フォルダは既に archived path に移動済み**。したがって `finalHeadOid`（=archiveSha）では `test-cases.md` / `events.jsonl` は `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/` 配下。日付は archive 実行時のローカル日付で非決定的（`git ls-tree` で `<slug>/test-cases.md` 等の suffix 一致から解決する）。**materialized test file 群は change フォルダ外（src/tests）なので移動しない**（freeze diff は従来どおり成立）。
- **scenario hash の frozen 値**: `tamper.ts`（`src/core/step/bite-evidence/tamper.ts`）は `events.jsonl` を `fold()` した `lineage` から `[...lineage].reverse().find(r=>r.step==="test-case-gen")` の `outputs`（`ArtifactRef[]`、`{path, hash:"sha256:.."|null}`）の `test-cases.md` hash を frozen とする。`fold` は `src/store/event-journal.js`。`LineageRecord` も同 module から export。
- **commit での file 内容取得 primitive は無い**。`digestArtifacts`（`local.ts:1044`）は working-tree のみ。`git show <oid>:<path>` は `checkpoint-ref.ts:152-170` / `verification/runner.ts:224` で ad-hoc に使用済み（新 primitive の雛形）。
- **StepRun の verdict**: `StepRun.outcome.verdict`（`src/state/schema/types.ts:173-200`, `StepOutcome.verdict: Verdict|string|null`）。spec-review 成功時は `deriveJudgeVerdict` が `"approved"` を書く（`judge-verdict.ts:32-40`）。最新 run＝`state.steps["spec-review"].at(-1)?.outcome?.verdict`。
- **FORWARD_TYPES**: `src/core/step/bite-evidence/gate.ts:22-23` の `Set(["bug-fix","new-feature"])`、**未 export**。`state.request.type: string`（`RequestInfo.type`）。全 type: new-feature/spec-change/refactoring/bug-fix/chore（`src/config/type-config.ts`）。
- **runtime**: `runTestsAtCommit(oid, files, cwd, config)` は任意 OID 可（#849 で custom commands 下でも scopedTestCommand 設定時に実行、未設定なら unavailable）。managed は常に unavailable。fail-closed 前例は既存 derivation の全 return。

## 要件

各次元は fail-closed を保つ（不能・欠落・不一致は当該 achieved フィールドを absent とし、constrained floor を satisfiesFloor が落とす）。

1. **P0-1 — HEAD-green を実測する**: base-red 確立後、**同じ materializedTestFiles を `finalHeadOid` でも `runTestsAtCommit` で実行**し、`kind:"ran"` かつ **全 file が `passed===true` かつ結果欠落なし**（base-red と対称の完全性）を要求する。unavailable / red / 欠落 → `biteEvidence` absent。これで `biteEvidence:"required"` は「base:red かつ HEAD:green（同一凍結 test 群）」を機械実測した時のみ成立する。CI-wait（Step 4）は追加防御として残すが、provenance の代用にしない。

2. **P0-2 — scenario の二層凍結**: `testDerivation:"frozen"` および `biteEvidence:"required"` の前提として次を要求する:
   - (a) `finalHeadOid` の `events.jsonl` を `fold` した lineage に test-case-gen record があり、その `test-cases.md` output hash が **non-null**。
   - (b) `finalHeadOid` の `test-cases.md` 内容の hash が (a) の frozen hash と **一致**。
   - (c) materialized test blob が base→finalHeadOid で不変（既存 freeze）。
   欠落 / null / 不一致 / 取得不能 → `testDerivation` と `biteEvidence` を absent（fail-closed）。`test-cases.md` / `events.jsonl` は folder 移動により `finalHeadOid` では archived path 配下なので、`<slug>/test-cases.md` 等の suffix で `git ls-tree` 解決してから `git show <finalHeadOid>:<path>` で読む。**commit での file 内容取得の runtime primitive を新設**（`git show`、unavailable DU、managed は unavailable）。

3. **P0-3 — type↔strategy を検証する**: `biteEvidence`（forward strategy = base-red→HEAD-green）は **`state.request.type ∈ FORWARD_TYPES`（bug-fix / new-feature）のときのみ**成立させる。非 forward type（refactoring / spec-change / chore）は `biteEvidence` absent（専用 strategy が実装されるまで fail-closed）。`FORWARD_TYPES` を `gate.ts` から export して再利用する。`testDerivation:"frozen"`（commit topology + 凍結、strategy 非依存）と `specReview` は type gate の対象外。

4. **P1 — spec-review は approved を要求**: `specReview:"required"` は **最新 spec-review run の `outcome.verdict === "approved"`** のときのみ成立させる（run 存在のみでは不可）。verdict が needs-fix / escalation / null / run 無し → absent（fail-closed）。

5. **P1（低優先）— testHash の provenance を正す**: `BiteEvidenceRecord.testHash` は「baseOid の内容」と記述されるが `gate.ts` は現在の worktree を hash している。authority は record を信頼しないため即 P0 ではないが、provenance 記録として誤り。gate が baseOid 内容で hash する（新 primitive を利用）か、doc を実装に合わせる。どちらでもよいが齟齬を解消する。

## スコープ外（理由付きで明示）

- **per-scenario（単一 test-case）実行**: test 命名規律（TC-ID を title 強制）＋ `-t` 実行が要る別 request。本 request の scenario **hash** 凍結（P0-2）は per-scenario 実行とは独立で、file 粒度の現 floor に必要なので本 request に含む。
- **dogfood の `.specrunner/config.json` 有効化**（`scopedTestCommand` ＋ `minimumAssurance`）: 全 job にコストを課し merge を gate する運用判断＝別途の意図的 config PR。本 request 後の次手。
- **forward 以外の bite strategy**（refactoring の behavior 保存＋mutation / security / config）: 本 request は非 forward を fail-closed にするのみで、専用 strategy は実装しない（別 request）。
- **R5** provenance carry / offline verify、**R6** fast。

## 受け入れ基準（歯を名指しする）

- [ ] **T1（P0-1 の歯）**: base で全 red・test 不変だが **finalHeadOid で依然 red**（HEAD-green 不成立）の job が、`biteEvidence:required` floor に対し fail-closed（`exitCode 1`）になることを固定する。**破壊確認**: HEAD-green 実測を外すと T1 が通ってしまうこと。
- [ ] **T2（P0-1 の正の路）**: base:red・HEAD:green（同一凍結 test 群を実測、runtime fake が base 全 red / HEAD 全 green を返す）＋scenario 凍結＋forward type の job が `biteEvidence` 達成となり floor を満たすことを固定する。
- [ ] **T3（P0-2 の歯）**: (i) lineage の frozen test-cases.md hash が null、(ii) finalHeadOid の test-cases.md hash が frozen と不一致、のそれぞれで `testDerivation` と `biteEvidence` が absent → fail-closed になることを固定する。**破壊確認**: scenario hash 検査を外すと不一致でも通ること。
- [ ] **T4（P0-3 の歯）**: request.type が非 forward（例 refactoring / spec-change）の job は、base:red・HEAD:green が成立しても `biteEvidence` absent → `biteEvidence:required` floor に対し fail-closed になることを固定する。
- [ ] **T5（P1 の歯）**: 最新 spec-review run の verdict が `approved` でない（needs-fix / escalation / run 無し）とき `specReview` absent → `specReview:required` floor に対し fail-closed になることを固定する。approved のとき成立することも固定する。
- [ ] **T6（実 config anti-regression 保持）**: この repo の実 config（`scopedTestCommand` 未設定 → `runTestsAtCommit` unavailable）で、`biteEvidence:required` floor の protected path を touch する job が fail-closed になることを固定する（#848 の歯を退行させない）。
- [ ] **T7（新 primitive）**: 「commit での file 内容 hash（archived path suffix 解決含む）」primitive が正しい hash を返し、非存在 OID / 非存在 path / managed で unavailable を返すことを固定する。
- [ ] **T8（backward-compat）**: 既存 achieved-assurance / floor / bite-evidence / tamper テストが無変更で green（本 request で意味が変わる期待の更新を除く）。`typecheck && test` が green。

## architect 評価済みの設計判断

- **HEAD-green は floor が finalHeadOid で自ら実測、CI は defense-in-depth**。→ 却下: green@HEAD を CI rollup に委譲（60s-none-merge で無検証 merge、rollup≠凍結 test 実行）。
- **scenario 凍結は finalHeadOid の events.jsonl→lineage frozenHash と test-cases.md@finalHeadOid の hash 一致で判定**（folder 移動を ls-tree suffix 解決）。→ 却下: in-loop tamper の inconclusive→proceed を信頼（archive authority は非null＋一致を要求）。→ 却下: baseOid の active path だけ見る（test-materialize 後の改変を見逃す）。
- **biteEvidence は forward type 限定、testDerivation/specReview は type 非依存**。→ 却下: 全 type に base-red→HEAD-green を適用（D2 違反）。→ 却下: testDerivation にも type gate（frozen は commit topology で strategy 非依存）。
- **spec-review は最新 run の approved を要求**。→ 却下: run 存在のみ（needs-fix/escalation でも通る）。
- **commit-file-hash は新 runtime primitive（git show）で追加、fail-closed**。→ 却下: working-tree digestArtifacts を流用（commit 内容でない、folder 移動後は path 不在）。
- **4 点を同一 archive authority seam で一括**。→ 却下: 細切れ request（seam が同一で凝集度・トークン効率が下がる）。per-scenario 実行と dogfood 有効化のみ分離。
