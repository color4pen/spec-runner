# Tasks: achieved-assurance の達成判定を完成させる

> 実装順序の原則: interface（runtime primitive / 型 / FORWARD_TYPES export）を先に確定し、
> 導出ロジック（specReview → type gate → scenario 二層凍結 → HEAD-green）→ doc 齟齬解消 →
> テスト（unit → floor integration → backward-compat 監査）の順に進める。テストは interface 確定後に書く。
> 受け入れ基準の「歯」T1〜T8 は各テストタスクで名指しで固定する。

## T-01: commit-scoped file read primitive を runtime seam に追加する（D5）

- [ ] `src/core/port/runtime-strategy.ts` に DU 型 `CommitFileResult = { kind:"found"; path:string; content:string } | { kind:"unavailable"; reason:string }` を追加する（`ChangedFilesResult` L75-77 近傍）。
- [ ] optional メソッド `readFileAtCommit?(oid: string, pathSuffix: string, cwd: string): Promise<CommitFileResult>` を宣言する（`runTestsAtCommit` L628 の隣）。doc に「never throws、trailing-suffix で一意解決した commit 内容を返す。0 件 / 複数一致 / 非存在 OID / 非存在 path / managed は unavailable」を記す。
- [ ] `RealRuntimeStrategy` intersection（L669 付近）に `readFileAtCommit(...)` を required で追加する。
- [ ] `src/core/runtime/local.ts` に実装を追加する（`digestArtifacts` L1044 近傍、`git show` の雛形は `src/git/checkpoint-ref.ts:152-176` / `src/core/verification/runner.ts:224`）:
  - `git ls-tree -r --name-only <oid>` を cwd で実行（非 0 exit → unavailable）。改行分割・trim・空行除去。
  - `entry.endsWith("/" + pathSuffix) || entry.endsWith("-" + pathSuffix)` で候補を絞る。候補 0 件 or ≥2 件 → unavailable（曖昧は fail-closed）。
  - 一意の resolved path で `git show <oid>:<resolvedPath>` を実行。exit 0 → `{kind:"found", path: resolvedPath, content: stdout}`、非 0 → unavailable。spawn 例外は catch して unavailable。
- [ ] `src/core/runtime/managed.ts` に実装を追加する（`runTestsAtCommit` L620-627 の隣）: 常に `{kind:"unavailable", reason:"managed runtime has no local worktree for readFileAtCommit"}`。
- [ ] 純粋 hash helper を用意する（例: `src/core/archive/achieved-assurance.ts` 内 or `src/util/hash.ts`）: `content: string → "sha256:" + createHash("sha256").update(Buffer.from(content,"utf8")).digest("hex")`。digestArtifacts（`local.ts:1050`）と同一アルゴリズムであること。

**Acceptance Criteria**（= T7 の歯）:
- local: archived path（`specrunner/changes/archive/<日付>-<slug>/test-cases.md`）を suffix `<slug>/test-cases.md` で一意解決し内容を返す。active path（`specrunner/changes/<slug>/...`）も同 suffix で解決できる。
- local: 非存在 OID / 非存在 path / 複数一致 で `unavailable` を返し throw しない。
- managed: 常に `unavailable`。
- **round-trip 一致**: 実 commit の utf-8 file について `digestArtifacts`（working-tree）の hash と、`readFileAtCommit` の内容から hash helper で算出した hash が byte 一致する（frozen hash 比較の前提を歯化）。
- `bun run typecheck` が green。

## T-02: FORWARD_TYPES を gate.ts から export する（D3 の単一 source）

- [ ] `src/core/step/bite-evidence/gate.ts:23` の `const FORWARD_TYPES: ReadonlySet<string>` を `export` する。
- [ ] in-loop gate の既存挙動・テスト（`src/core/step/bite-evidence/__tests__/gate.test.ts`）が無変更で green であることを確認する（export のみ、参照側無変更）。

**Acceptance Criteria**:
- `FORWARD_TYPES` が `gate.ts` から import 可能で、値は `Set(["bug-fix","new-feature"])` のまま。
- 既存 gate.test.ts が無変更 green。`bun run typecheck` が green。

## T-03: derivation に specReview approved と type gate を入れる（D3 / D4、pure logic）

- [ ] `src/core/archive/achieved-assurance.ts` の specReview 導出（L95-104）を、run 存在チェックから **最新 run の verdict 判定**に変える: `state.steps?.[STEP_NAMES.SPEC_REVIEW]?.at(-1)?.outcome?.verdict === "approved"` のとき `"required"`、それ以外 absent。try/catch と diagnostic は維持。
- [ ] `FORWARD_TYPES` を `gate.ts` から import する（`isExcludedPath` の import 行 L20 に合わせる）。
- [ ] biteEvidence 評価に **type gate** を追加する: `state.request.type ∈ FORWARD_TYPES` でないとき biteEvidence を absent のままにする（base-red / HEAD-green の I/O へ進まない）。`testDerivation` / `specReview` は type gate の対象外。diagnostic に非 forward 理由を残す。

**Acceptance Criteria**:
- 最新 spec-review verdict が `approved` のとき `achieved.specReview = "required"`、`needs-fix` / `escalation` / `null` / run 無し のとき absent。
- `state.request.type` が非 forward（refactoring / spec-change / chore）のとき `achieved.biteEvidence` は base-red・HEAD-green が成立しても absent。forward（bug-fix / new-feature）では従来どおり評価される。
- `testDerivation` は type 非依存。`bun run typecheck` が green。

## T-04: derivation に scenario 二層凍結を入れる（D2、新規 I/O）

- [ ] `AssuranceProvenanceRuntime`（`achieved-assurance.ts:27-30`）の Pick 型に `readFileAtCommit` を追加する。前提 method check（L144-155）に `typeof runtime.readFileAtCommit === "function"` を追加する。
- [ ] blob freeze（L188-207）の intact 確認後、`testDerivation` を付与する前に **scenario 二層凍結**を評価する:
  - `state.request.slug` を解決。null / undefined → 両次元 absent + diagnostic（archived path を一意解決できない）。
  - `runtime.readFileAtCommit(finalHeadOid, "<slug>/events.jsonl", cwd)` → `unavailable` → 両次元 absent。`found` の content を `fold`（`src/store/event-journal.ts`）→ `lineage` を得る。
  - `tamper.ts` と同一規則で frozen hash を抽出: `[...lineage].reverse().find(r=>r.step==="test-case-gen")` の `outputs` から `path.endsWith("test-cases.md")` の `hash`。record 無し / output 無し / hash が null|undefined → 両次元 absent + diagnostic。
  - `runtime.readFileAtCommit(finalHeadOid, "<slug>/test-cases.md", cwd)` → `unavailable` → 両次元 absent。`found` の content を hash helper（T-01）で `"sha256:.."` 化。
  - frozen hash と不一致 → 両次元 absent + diagnostic。一致 → scenario 二層凍結 intact。
- [ ] `testDerivation = "frozen"` は **blob freeze intact かつ scenario 二層凍結 intact** のときのみ付与する（L209-212 を更新）。frozen hash の抽出規則は `tamper.ts` と単一 source に揃える（重複ロジックを避ける）。

**Acceptance Criteria**（= T3 の歯の導出側）:
- lineage frozen hash が null、または finalHeadOid の test-cases.md hash が frozen と不一致のとき、`achieved.testDerivation` と `achieved.biteEvidence` はいずれも absent。
- events.jsonl / test-cases.md が readFileAtCommit で取得不能、または slug 欠落のとき両次元 absent（fail-closed）。
- scenario 二層凍結 intact ＋ blob freeze intact のとき `testDerivation = "frozen"`（type 非依存）。
- Never throws。`bun run typecheck` が green。

## T-05: derivation に HEAD-green 実測を入れる（D1、新規 I/O）

- [ ] base-red 確立（L217-241）の直後、`biteEvidence` を付与する前に **HEAD-green を実測**する: `runtime.runTestsAtCommit(finalHeadOid, materializedTestFiles, cwd, config)` を実行し、`kind:"unavailable"` → biteEvidence absent + diagnostic。
- [ ] base-red と対称の完全被覆で判定する: `passedByFile = new Map(headResult.results.map(r=>[r.file, r.passed]))`、`notGreen = materializedTestFiles.filter(f => passedByFile.get(f) !== true)`。`materializedTestFiles.length === 0 || notGreen.length > 0` → biteEvidence absent + diagnostic（欠落 / red を fail-closed）。
- [ ] base-red・HEAD-green・scenario 凍結・blob freeze・forward type のすべてを満たすときのみ `achieved.biteEvidence = "required"` を付与する（L241 を更新）。
- [ ] biteEvidence 固有の I/O（base-red / HEAD-green の worktree run と type gate）は `floor.biteEvidence !== undefined` のときのみ実行し、`testDerivation` のみ constrain されるケースで無駄な worktree run を避ける（`floorConstrainsBite` を利用）。

**Acceptance Criteria**（= T1/T2 の歯の導出側）:
- base:red かつ HEAD:green（同一凍結 test 群を実測）＋ scenario 凍結 ＋ forward type のとき `achieved.biteEvidence = "required"`。
- HEAD で 1 file でも red、結果欠落、または `runTestsAtCommit(finalHeadOid,...)` unavailable のとき absent。
- base-red 単独では biteEvidence を付与しない（HEAD-green 未実測では成立しない）。
- `bun run typecheck` が green。

## T-06: testHash の provenance 齟齬を解消する（P1-low、doc 合わせ）

- [ ] `src/state/schema/types.ts` の `BiteEvidenceRecord.testHash` の doc（「baseOid の内容」）を、実装（`gate.ts` が `digestArtifacts(cwd,...)` で hash する = gate 実行時の worktree / candidate tree 内容）に合わせて修正する。
- [ ] `gate.ts` の testHash 算出箇所（L204-220 付近）の comment も同様に「gate 実行時の worktree 内容 digest」と明記する。
- [ ] behavior は変えない（新 primitive を gate に配線しない）。archive authority は testHash を信頼せず独立再測するため、record 消費側に影響が無いことを design D6 / Open Questions に沿って確認する。

**Acceptance Criteria**:
- `testHash` の doc / comment が実装と一致する（baseOid ではなく gate 実行時 worktree 内容と明記）。
- 既存 gate / bite-evidence テストが無変更 green（behavior 不変）。`bun run typecheck` が green。

## T-07: deriveAchievedAssurance の unit テスト（新次元、fine-grained）

- [ ] `deriveAchievedAssurance` 専用の unit テストを追加する（fake `AssuranceProvenanceRuntime`。既存 `merge-then-archive-floor-provenance.test.ts` の fake パターンを流用しつつ `readFileAtCommit` と HEAD-green 差分を追加）。fake は `runTestsAtCommit` を oid 別（base / HEAD）に返し、`readFileAtCommit` で events.jsonl（test-case-gen lineage、frozen hash 指定可）と test-cases.md（内容から hash 一致 / 不一致を作れる）を返す。
- [ ] **specReview（T5 導出側）**: 最新 spec-review run verdict `approved` → `specReview:"required"`、`needs-fix` / `escalation` / `null` / run 無し → absent を固定する。
- [ ] **type gate（T4 導出側）**: 非 forward type で base:red・HEAD:green・凍結 intact でも `biteEvidence` absent、forward type で present を固定する。
- [ ] **scenario 二層凍結（T3 導出側）**: (i) frozen hash null、(ii) finalHeadOid の test-cases.md hash 不一致 のそれぞれで `testDerivation` と `biteEvidence` absent を固定する。**破壊確認**: scenario hash 検査を外すと不一致でも `testDerivation`/`biteEvidence` が付いてしまうことをコメントで明示。
- [ ] **HEAD-green（T1/T2 導出側）**: base:red・HEAD:red で `biteEvidence` absent、base:red・HEAD:green・凍結・forward で present を固定する。**破壊確認**: HEAD-green 実測を外すと base:red・HEAD:red でも present になってしまうことをコメントで明示。
- [ ] fail-closed 網羅: readFileAtCommit unavailable / slug 欠落 / runTestsAtCommit(HEAD) unavailable のそれぞれで当該次元 absent を固定する。

**Acceptance Criteria**:
- 上記各分岐が導出レベルで green。Never throws を確認する。
- `bun run typecheck` が green。

## T-08: floor integration テスト（歯 T1〜T6 を exitCode で固定）

- [ ] `tests/unit/core/archive/merge-then-archive-floor-provenance.test.ts` の `makeFakeRuntime` を拡張する: `runTestsAtCommit` を oid 別（`baseTestResults` / `headTestResults`）に、`readFileAtCommit(oid, pathSuffix, cwd)` を追加（events.jsonl / test-cases.md を frozen hash 一致で返す helper、不一致・null・unavailable も option 化）。job state の `request.type`（forward / 非 forward）と spec-review run verdict を可変にする。
- [ ] **T1（P0-1 の歯）**: base:red・test 不変・**HEAD:依然 red**（`headTestResults` 全 red）の job が `biteEvidence:required` floor に対し fail-closed（`exitCode 1`、`mergePullRequest` 未呼び出し）を固定する。**破壊確認**: HEAD-green 実測を外すと T1 が通ってしまうことをコメントで明示。
- [ ] **T2（P0-1 の正の路）**: base:red・HEAD:green（fake が base 全 red / HEAD 全 green）＋ scenario 凍結（readFileAtCommit が一致 hash）＋ forward type の job が `biteEvidence` 達成となり floor を満たす（`exitCode 0`、`mergePullRequest` 呼び出し）を固定する。
- [ ] **T3（P0-2 の歯）**: (i) lineage frozen hash null、(ii) finalHeadOid test-cases.md hash 不一致 のそれぞれで `testDerivation` / `biteEvidence` absent → fail-closed を固定する。**破壊確認**: scenario hash 検査を外すと不一致でも通ることをコメントで明示。
- [ ] **T4（P0-3 の歯）**: `request.type` が非 forward（refactoring / spec-change）で base:red・HEAD:green が成立しても `biteEvidence` absent → `biteEvidence:required` floor に対し fail-closed を固定する。
- [ ] **T5（P1 の歯）**: 最新 spec-review verdict が approved でない（needs-fix / escalation / run 無し）とき `specReview` absent → `specReview:required` floor に対し fail-closed、approved のとき成立、を固定する（`specReview:required` を含む floor を用いる）。
- [ ] **T6（実 config anti-regression）**: `scopedTestCommand` 未設定 → `runTestsAtCommit` unavailable の runtime で、`biteEvidence:required` floor の protected path を touch する job が fail-closed を固定する（#848 の歯を退行させない）。既存 TC-001 を base に据える。
- [ ] 既存 positive-path（TC-003 / TC-019 / e2e の TC-010(floor)）の期待を、HEAD-green ＋ scenario 凍結 ＋ readFileAtCommit の導入に合わせて **意味が変わる更新**として反映する（fully-achieved fake を base:red・HEAD:green・凍結一致・forward に更新）。

**Acceptance Criteria**:
- T1〜T6 の各テストが green（未達 / HEAD-red / 凍結破れ / 非 forward / 非 approved / 実 config unavailable → fail-closed、完全達成 → 通す）。
- 破壊確認コメント（HEAD-green 除去で T1、scenario hash 除去で T3 が落ちる）が記載されている。
- `bun run typecheck && bun run test` が green。

## T-09: backward-compat 監査と全体 green（T8）

- [ ] `deriveAchievedAssurance` / floor / bite-evidence / tamper / satisfiesFloor の全 caller とテストを洗い出し、method check への `readFileAtCommit` 追加・HEAD-green 追加・scenario 凍結追加で意味が変わるテストのみ更新する（`src/core/runtime/__tests__/bite-evidence-e2e-gate.test.ts` の `TC-010 (floor)` は events.jsonl / test-cases.md fixture 追加 or fake の readFileAtCommit 実装 ＋ 期待更新が必要）。
- [ ] 意味の変わらない既存テスト（fail-closed 系 TC-004〜TC-011、satisfiesFloor、getProfile、in-loop gate.test.ts、tamper テスト）が **無変更で green** であることを確認する。
- [ ] `bun run typecheck && bun run test` 全体を green にする。

**Acceptance Criteria**（= T8）:
- 既存 achieved-assurance / floor / bite-evidence / tamper テストが、意味が変わる期待の更新（明示分）を除き無変更 green。
- `bun run typecheck && bun run test` が green。
