# Tasks: minimumAssurance floor を「達成 provenance」で判定する

> 実装順序の原則: interface（runtime seam / schema / narrow port）を先に確定し、達成導出 → gate 配線 → CLI → テストの順で進める。テストは interface 確定後に書く。

## T-01: 二 OID 凍結検査 primitive を runtime seam に追加する

- [x] `src/core/port/runtime-strategy.ts` に optional メソッド `diffPathsBetweenCommits(baseOid: string, headOid: string, paths: string[], cwd: string): Promise<ChangedFilesResult>` を宣言する（`listCommitChangedFiles` の隣、L579 付近）。doc に「never throws、`success{files}`＝変更された path 群（空＝凍結 intact） / `unavailable{reason}`、managed は常に unavailable」を記す。
- [x] `RealRuntimeStrategy` intersection（L644-664）に `diffPathsBetweenCommits(...)` を required として追加する。
- [x] `src/core/runtime/local.ts` に実装を追加する（`listCommitChangedFiles` L831-850 の隣）: `git diff --name-only <baseOid> <headOid> -- <paths...>` を cwd で実行。exit 0 → `{kind:"success", files}`（改行分割・trim・空行除去、既存 `listCommitChangedFiles` と同じ整形）。非 0 exit / spawn error → `{kind:"unavailable", reason}`。`paths` 空配列 → `{kind:"success", files:[]}`（git を呼ばずに短絡してよい）。
- [x] `src/core/runtime/managed.ts` に実装を追加する（L599-614 の隣）: 常に `{kind:"unavailable", reason:"managed runtime has no local worktree for diffPathsBetweenCommits"}`。
- [x] coverage exclude 済みの `runtime-strategy.ts` を除き、新規 local/managed 実装の unit test を追加する（`src/core/runtime/__tests__/` の既存 spawn fake パターン `local-round-git.test.ts` / `bite-evidence-isolated-exec.test.ts` を再利用）。

**Acceptance Criteria**:
- local: paths が二 OID 間で不変のとき `{kind:"success", files:[]}`、改変ありのとき `{kind:"success", files:[改変 path]}`、git 非 0 exit / spawn error のとき `{kind:"unavailable"}` を返す。
- local: `paths` 空で `{kind:"success", files:[]}`。
- managed: 常に `{kind:"unavailable"}`。
- `bun run typecheck` が green。

## T-02: BiteEvidenceRecord を最終 HEAD 束縛可能にする（schema + validation）

- [x] `src/state/schema/types.ts` の `BiteEvidenceRecord`（L341-347）に optional フィールドを追加: `baseOid?: string`、`candidateOid?: string`、`testHash?: string`。doc に「最終 HEAD 束縛用（base/candidate commit OID と凍結対象 test の content digest）。旧形式＝これらフィールド欠落は valid（後方互換）」を記す。
- [x] `src/state/schema/operations.ts` の biteEvidence validation（L264-292）を拡張する: `baseOid` / `candidateOid` / `testHash` が present のとき `typeof === "string"` を強制（空文字も許容してよいが非 string はエラー）。absent は valid のまま。既存 5 フィールド（testId / strategy / baseResult / candidateResult / verified）の検証は無変更。
- [x] `tests/unit/state/`（既存 state schema テスト配置に合わせる）に round-trip / backward-compat テストを追加する（T7）。

**Acceptance Criteria**（= T7）:
- `baseOid` / `candidateOid` / `testHash` を持つ record が validation を通り、非 string 値のときエラーになる。
- 旧形式（当該フィールド欠落）record が valid のまま読める。
- `state.biteEvidence` が新フィールド込みで persist → reload の round-trip をする。
- `bun run typecheck` が green。

## T-03: in-loop bite gate が record 生成時に OID / testHash を埋める

- [x] `src/core/step/bite-evidence/gate.ts` の record 構築ループ（L194-217）で、各 record に `baseOid`（resolveBaseCandidateOids の baseOid）と `candidateOid`（同 candidateOid）を埋める（両 OID はこの時点で解決済み）。
- [x] `testHash` は defensive に埋める: `GateDeps.runtimeStrategy` に optional で `digestArtifacts` を含め、関数として提供されるときのみ per-file の content digest（`sha256:...`）を計算して埋める。提供されないとき（既存 fake 等）は `testHash` を absent にする。
- [x] `GateDeps.runtimeStrategy` の Pick 型（gate.ts L47）に `digestArtifacts` を optional として追加する。既存の capability check（L104-115）は無変更（listCommitChangedFiles / runTestsAtCommit のみ必須）。
- [x] in-loop bite gate の既存テスト（`src/core/step/bite-evidence/__tests__/gate.test.ts`）が **無変更で green** であることを確認する（record は field 個別 assert のため optional field 追加で壊れない。digestArtifacts を持たない fake は testHash absent）。

**Acceptance Criteria**:
- forward-strategy gate の生成 record が `baseOid` / `candidateOid` を持つ。
- runtime が `digestArtifacts` を提供するとき record が `testHash` を持ち、提供しないとき absent。
- 既存 gate.test.ts が無変更で green（T8 の一部）。
- `bun run typecheck` が green。

## T-04: achieved assurance 導出モジュールを追加する

- [x] `src/core/archive/achieved-assurance.ts` を新規作成し、`deriveAchievedAssurance(input): Promise<{ achieved: ProfileAssurance; diagnostics: string[] }>` を実装する。入力型 `{ state: JobState; finalHeadOid: string | undefined; cwd: string; config: SpecRunnerConfig | undefined; floor: AssuranceFloor; runtime: AssuranceProvenanceRuntime | null | undefined }`。`AssuranceProvenanceRuntime = Pick<RuntimeStrategy, "listCommitChangedFiles" | "runTestsAtCommit" | "diffPathsBetweenCommits">`。**Never throws**（想定外は当該 dimension absent + diagnostic）。
- [x] `specReview` 導出: `state.steps?.[STEP_NAMES.SPEC_REVIEW]` が非空 → `achieved.specReview = "required"`、さもなくば absent（I/O 無し）。
- [x] `biteEvidence` / `testDerivation` 導出は floor が当該フィールドを constrain するときのみ I/O を実行する（floor.biteEvidence も floor.testDerivation も undefined なら I/O skip）:
  - (a) `resolveBaseCandidateOids(state).baseOid`（`src/core/step/bite-evidence/oids.ts`）を解決。`baseOid === null` または `finalHeadOid === undefined` または `runtime` が必要メソッドを欠く → 両 dimension absent + diagnostic。
  - (b) `runtime.listCommitChangedFiles(baseOid, cwd)` → `unavailable` なら両 dimension absent。`success` を `isExcludedPath` で filter して materializedTestFiles を得る。0 件 → 両 dimension absent + diagnostic。
  - (c) 凍結: `runtime.diffPathsBetweenCommits(baseOid, finalHeadOid, materializedTestFiles, cwd)` → `unavailable` または `success` かつ `files.length > 0` → 両 dimension absent + diagnostic（tamper）。`success` かつ空 → 凍結 intact。
  - `testDerivation`: (a) baseOid resolvable ＋ (c) 凍結 intact → `achieved.testDerivation = "frozen"`。
  - `biteEvidence`: 上記 + base-red 再測 `runtime.runTestsAtCommit(baseOid, materializedTestFiles, cwd, config)` → `unavailable`（config undefined も含む）→ absent。`ran` かつ 1 件でも `passed === true`（空洞）→ absent + diagnostic。全て `passed === false`（red）→ `achieved.biteEvidence = "required"`。
- [x] `resolveBaseCandidateOids` と `isExcludedPath` は in-loop gate と同一実装を再利用する（同定規則の単一 source）。`isExcludedPath` が gate.ts 内 private の場合は export するか、両者が import する中立モジュールへ抽出する（behavior-preserving。DSM 閉包が `core/archive → core/step/bite-evidence` を許さない場合は design D2/Risks に従い両 helper を中立モジュールへ move）。
- [x] `deriveAchievedAssurance` の unit test を追加する（fake runtime で各分岐: 全 red+凍結→required/frozen、空洞→absent、非空 diff→absent、各 unavailable→absent、baseOid 欠落→absent、finalHeadOid undefined→absent、spec-review 有無→required/absent）。

**Acceptance Criteria**:
- 全 materialized test が baseOid で red かつ二 OID 凍結 intact のとき `achieved.biteEvidence = "required"` かつ `achieved.testDerivation = "frozen"`。
- 空洞（base-green）/ 非空凍結差分 / 任意 unavailable / baseOid 欠落 / finalHeadOid undefined / materialized 0 件 のいずれでも当該 achieved フィールドが absent。
- spec-review step 実行済みで `achieved.specReview = "required"`、未実行で absent。
- floor が biteEvidence / testDerivation を constrain しないとき base-red / 凍結 I/O が呼ばれない。
- Never throws。`bun run typecheck` が green。

## T-05: archive floor gate を達成 assurance で判定する（宣言→達成）

- [x] `src/core/archive/merge-then-archive.ts` の `MergeThenArchiveInput` に `assuranceRuntime?: Pick<RuntimeStrategy, "listCommitChangedFiles" | "runTestsAtCommit" | "diffPathsBetweenCommits">` と `config?: SpecRunnerConfig` を追加する（import は `../port/runtime-strategy.js` / `../../config/schema.js`）。
- [x] Step 1（L164-200）で load した `state` を outer スコープの `let jobStateForFloor: JobState` に捕捉する（`jobAssurance` は不要になったため削除）。
- [x] Step 3.5（protected-paths, L276-335）は **一切変更しない**。
- [x] Step 3.6（L340-411）の `reason === "match"` 分岐（L382-408）を次に変える:
  - `const { protectedPaths: _pp, ...floor } = minimumAssurance;`（L383）は維持。
  - `await deriveAchievedAssurance({ state: jobStateForFloor, finalHeadOid: archiveSha, cwd, config, floor, runtime: assuranceRuntime })` を呼び、`achieved` を得る。
  - `satisfiesFloor(jobAssurance, floor)`（L384）を `satisfiesFloor(achieved, floor)` に差し替える。
  - `false` のとき既存の escalation 形（`formatEscalation` + `exitCode 1`、`failedStep: "merge gate (minimumAssurance floor)"`、`mergePullRequest` を呼ばない）を維持する。`detectedState` は matched files に加えて achieved assurance / 要求 floor / diagnostics を記載する（`effectiveAssuranceStr` を achieved 側に更新。matched files と slug 入りの resumeCommand は保持）。
- [x] `deriveAchievedAssurance` を import する。`getProfile` / `jobAssurance` の宣言/代入は不要なため削除。

**Acceptance Criteria**:
- protected path match 時、floor 判定が `getProfile(state).assurance`（宣言）でなく `deriveAchievedAssurance(...)` の結果を `satisfiesFloor` に渡す。
- match 無し / truncated / `minimumAssurance` 不在 の分岐は無変更。
- escalation は `exitCode 1`、`mergePullRequest` 未呼び出し、matched files と slug を含む。
- `bun run typecheck` が green。

## T-06: CLI で runtime / config を floor gate に供給する

- [x] `src/cli/archive.ts` の `--with-merge` 経路で、`new LocalRuntime({ cwd: opts.cwd, githubClient, githubToken, spawnFn: spawnCommand })` を構築し `runMergeThenArchive` の `assuranceRuntime` に渡す（`LocalRuntime` は `../core/runtime/local.js` から import。CLI は composition root）。
- [x] `loadConfig()` で得た `config`（L153）を outer スコープへ hoist し（`mergeConfig` として）、`runMergeThenArchive` の `config` に渡す。config 読込失敗時（catch 分岐）は `config` / `assuranceRuntime` を渡さない（= undefined）— このとき `minimumAssurance` も undefined で gate no-op のため影響なし。
- [x] 既存の `minimumAssurance = config.archive?.minimumAssurance`（L167）と `runMergeThenArchive` 呼び出し（L212-231）はそのまま、`assuranceRuntime` / `config` 引数を足す形にする。

**Acceptance Criteria**:
- `--with-merge` 経路で real `LocalRuntime` と loaded `config` が `runMergeThenArchive` に伝播する。
- config 不在時は両者 undefined で gate no-op（後方互換）。
- `bun run typecheck` が green。

## T-07: floor gate の達成/fail-closed テストと回帰保存

- [x] `tests/unit/core/archive/merge-then-archive-floor-provenance.test.ts` に、fake `assuranceRuntime`（`listCommitChangedFiles` / `runTestsAtCommit` / `diffPathsBetweenCommits` を返す）と fake `config` を注入するヘルパを追加する。base OID を持つ job state（`steps: { "test-materialize": [{...commitOid}], "implementer": [{...commitOid}] }`）を作る。
- [x] **T1（核心・anti-regression）**: `runTestsAtCommit` が `unavailable`（custom `verification.commands` 相当）を返す runtime で、`biteEvidence: required` floor の protected path を touch する job の archive が **fail-closed**（`exitCode 1`、`mergePullRequest` 未呼び出し）になることを固定する。**破壊確認**: 導出を「常に achieved=required」に固定すると T1 が落ちることをコメントで明示（実装は落ちる状態を作らない）。
- [x] **T2（宣言は authorize しない）**: `merge-then-archive-floor.test.ts` の TC-011（profile 欠落 → 旧 `exitCode 0`）を **fail-closed 期待（`exitCode 1`）へ反転**する（runtime/config 未注入 or base-red unavailable のため biteEvidence achieved absent）。
- [x] **T3（達成は通す）**: fake runtime が materialized test を baseOid で全 red・凍結 intact（二 OID diff 空）を返し、`runTestsAtCommit` が全 red を返す job が protected path を touch する場合、floor（`biteEvidence: required`）を満たし merge が進む（`exitCode 0`、`mergePullRequest` 呼び出し）ことを固定する。
- [x] **T4（凍結の歯）**: materialized test file が baseOid→最終 HEAD で改変（`diffPathsBetweenCommits` が非空 files）されている場合、base-red が成立しても fail-closed になることを固定する。**破壊確認**: 凍結検査を外す（diff を無視）と T4 が落ちることをコメントで明示。
- [x] **T5（空洞の歯）**: materialized test が baseOid で green（`runTestsAtCommit` が passed=true）になる場合、fail-closed になることを固定する。
- [x] **T6（fail-closed の網羅）**: 最終 HEAD OID undefined / baseOid 欠落 / `listCommitChangedFiles` unavailable / `diffPathsBetweenCommits` unavailable / `runTestsAtCommit` unavailable / materialized 0 件 のそれぞれで、`biteEvidence: required` floor に対し fail-closed になることを固定する。
- [x] **T8（回帰保存）**: 既存の protected-paths（Step 3.5）/ truncated / verify-checkpoint / `satisfiesFloor`（`tests/unit/state/satisfies-floor.test.ts`）/ `getProfile`（`tests/unit/state/profile.test.ts`）/ in-loop bite gate（`src/core/step/bite-evidence/__tests__/gate.test.ts`）の各テストが **無変更で green**（TC-011 反転と新規追加を除く）であることを確認した（7265 tests passed）。
- [x] floor 非該当（TC-012）/ `minimumAssurance` 不在（TC-013）/ truncated（TC-014）/ escalation メッセージ（TC-021）の既存ケースが無変更 green であることを確認した。

**Acceptance Criteria**:
- T1〜T6 の各テストが green（達成→通す、未達/unavailable/凍結破れ/空洞→fail-closed）。
- TC-011 が fail-closed 期待へ反転済みで green。
- T8 の既存テスト群が無変更で green。
- `bun run typecheck && bun run test` が green。
