# minimumAssurance floor を「宣言」でなく「最終 HEAD で達成された provenance」で判定する（P0 fix-forward）

## Meta

- **type**: spec-change
- **slug**: assurance-provenance-floor
- **base-branch**: main
- **adr**: false

<!-- 構造判断は ADR-20260717（assurance floor の権威を達成 provenance に置く、ADR-20260716 D5 補正）で ratify 済み。本 request はその D1〜D4 を、changed-files と最終 HEAD OID が揃う唯一の out-of-loop 点＝archive merge gate（Step 3.6）に載せる。executor（custom verification.commands 下での test 実行、SC 単位の per-test 実行）は Phase 2、profileDigest / offline verify は R5、本 request の射程外。新規 architecture ADR を要さない。 -->

## 背景

archive の `minimumAssurance` floor（`src/core/archive/merge-then-archive.ts` Step 3.6, 337-411）は、protected path を touch する PR に対し `satisfiesFloor(jobAssurance, floor)` で保証下限を強制する。しかし `jobAssurance = getProfile(state).assurance`（同 :196）は job の **宣言** profile であって、pipeline が実際に達成した provenance ではない。この乖離が P0 を生む:

- **宣言と達成の乖離**: profile は `biteEvidence: required` を宣言しつつ evidence を一切生成しないことがある。`getProfile` は profile 欠落を `STANDARD_PROFILE`（最強）に解決する（`src/state/profile.ts:143`）ため、profile 欠落 job は達成の裏付け無く floor を素通りする。floor test はこれを「profile 欠落 → 最強 → protected path が merge」と明示的に凍結している（`tests/unit/core/archive/merge-then-archive-floor.test.ts:250` TC-011、exitCode 0 を期待）。
- **required が実質 optional**: in-loop の bite gate は多くの条件を `strategy-deferred`（= verification へ素通り、`src/core/pipeline/types.ts:247`）にする。とりわけ **このリポジトリの `.specrunner/config.json` は custom `verification.commands`（build/typecheck/test/lint）を持つため、`runTestsAtCommit` が常に `unavailable` を返し（`src/core/runtime/local.ts:902-906`）、forward job でも evidence は生成されない**。それでも archive floor は宣言 `required` だけを信じるので、dogfood 上で歯は一度も噛まない。
- **歯が最終 HEAD に束縛されない**: `BiteEvidenceRecord`（`src/state/schema/types.ts:341-347`）は `{ testId, strategy, baseResult, candidateResult, verified }` のみで baseOid / candidateOid / testHash を持たず、tamper 検査は `test-cases.md` のみ（`src/core/step/bite-evidence/tamper.ts`）。materialize 済み test の blob は凍結されないため、candidate が test を書き換えても base-red→candidate-green を偽造できる。

ADR-20260717 は floor の評価対象を「宣言」から「最終 PR HEAD に対して機械達成された provenance」に補正した（D1）。本 request はそれを archive gate に実装する。

## 現状コードの前提（調査済み・実装はこの前提に沿うこと）

- **floor gate seam**: `merge-then-archive.ts:337-411`。`satisfiesFloor(jobAssurance, floor)` は :384。`floor` は `minimumAssurance` から `protectedPaths` を除いた rest（:383）で、`src/state/profile.ts` の `AssuranceFloor` 形。escalation は `{ exitCode:1, escalation: formatEscalation({ failedStep, detectedState, recommendedAction, resumeCommand }) }`（:388-407）。
- **最終 HEAD OID は seam で入手可能**: `const archiveSha = archiveRecordResult.headSha`（:270-271）。これは Step 3 で push 済みの archive-record commit の `git rev-parse HEAD`（`src/core/archive/orchestrator.ts:368-374`）＝実際に squash-merge される feature branch の tip。型は `string | undefined`。Step 3.6 の時点で in-scope。
- **`state` は 3.6 で参照不可**: full `JobState` は Step 1 の `try`（:164-200）内 const で、外へ escape するのは `jobAssurance`（:162 宣言, :196 代入）のみ。`state.biteEvidence` / `state.steps` を floor gate で読むには `state`（または必要フィールド）を `jobAssurance` と同様に外スコープへ hoist する必要がある。
- **CI green@HEAD は既存 gate が強制**: Step 4（:425 以降の CI-wait）が archive commit の CI green を待ってから merge する。したがって「最終 HEAD で test が green」は既存 pipeline 順序で構造的に保証され、floor gate は green@HEAD を再実行する必要がない。
- **runtime 実行 primitive**（`src/core/port/runtime-strategy.ts`, `src/core/runtime/local.ts`）:
  - `listCommitChangedFiles(oid, cwd): ChangedFilesResult`（`{kind:"success",files}` | `{kind:"unavailable",reason}`）は `git diff --name-only <oid>^ <oid>`（`local.ts:831-850`）。custom commands の影響を受けない。base commit の変更ファイル＝materialize 済み test 群の同定に使える（in-loop gate と同じ、`src/core/step/bite-evidence/gate.ts:117-140`、`isExcludedPath` で `specrunner/changes/` `.specrunner/` を除外）。
  - `runTestsAtCommit(oid, testFiles, cwd, config): IsolatedTestResult`（`{kind:"ran",results:[{file,passed}]}` | `{kind:"unavailable",reason}`）は `git worktree add --detach <tmp> <oid>` → 各 file を `bun test <file>` → cleanup（`local.ts:865-946`）。**`oid` は任意 commit 可**（base でも最終 HEAD でも）。**custom `verification.commands` が非空なら常に `unavailable`**（:902-906、予測子は `config.verification?.commands && length>0`）。managed runtime は常に unavailable（`src/core/runtime/managed.ts:599-614`）。
  - **二 OID 間の path 差分を取る primitive は現状無い**（`listCommitChangedFiles` は単一 commit の `<oid>^ <oid>` のみ）。凍結検査（base→HEAD で test が改変されていない）にはこれが要る。
- **base/candidate OID**: `resolveBaseCandidateOids(state)`（`src/core/step/bite-evidence/oids.ts:27-43`）が `state.steps[test-materialize]` / `[implementer]` の最新 `StepRun.commitOid`（`types.ts:199`、`executor.ts:461-466` で per-node commit 直後に `captureHeadSha`）から base/candidate OID を返す。resume を跨いで journal で保持（`event-journal.ts`）。
- **satisfiesFloor は fail-closed 済み**（`src/state/profile.ts:81-110`）: floor field が constrained で assurance 側の値が absent / 未知 rank → `false`。空 floor → vacuously true。**この関数は変更不要**。floor に渡す assurance object を「宣言」から「達成」に差し替えるだけで、absent 達成フィールドは既存 fail-closed で floor を落とす。
- **config**: `ArchiveConfig.minimumAssurance?: MinimumAssuranceConfig`（`src/config/schema/types.ts:365-377`、validation :372-393）。CLI が `config.archive?.minimumAssurance` を `runMergeThenArchive` に渡す（`src/cli/archive.ts:167,227`）。**このリポジトリの config には現状 `minimumAssurance` 未設定**（floor は現在 inert）。

## 要件

1. **floor は達成 provenance を評価する（宣言でなく）**: Step 3.6 の floor 判定を、`getProfile(state).assurance`（宣言）でなく、job が最終 HEAD に対して達成した provenance から導出した **achieved assurance** で行う。既存 `satisfiesFloor(achieved, floor)` に渡す（satisfiesFloor / getProfile / STANDARD_PROFILE は変更しない）。achieved assurance の各フィールドは以下で導出する:

   - **`biteEvidence`**: 次を **すべて** 満たすとき `"required"` 相当（達成）、いずれか欠ければフィールド absent（＝ `required` floor を fail-closed で落とす）:
     - (a) `resolveBaseCandidateOids(state).baseOid` が resolvable（test-materialize 境界が存在）、かつ最終 HEAD OID（`archiveSha`）が定義済み。
     - (b) **凍結**: materialize 済み test 群（`listCommitChangedFiles(baseOid)` を `isExcludedPath` で filter）が baseOid → 最終 HEAD で **byte 不変**（二 OID path 差分が空）。差分ありは tamper とみなす。
     - (c) **base-red 再測（out-of-loop）**: 上記 test 群を **baseOid で実行**し、**全て red（fail）**。runtime が `unavailable`（custom commands / managed / OID 不正）→ 達成不成立。green の test が一つでも有れば空洞 → 達成不成立。
     - green@HEAD は既存 CI-wait gate（Step 4）が強制するため floor gate では再実行しない。
   - **`testDerivation`**: (a) baseOid が resolvable（test-materialize が走り base 境界が在る）かつ (b) 凍結（上記）を満たせば `"frozen"` 相当、満たさなければ `"coupled"` / absent。
   - **`specReview`**: 当該 job で spec-review step が実行済み（`state.steps[spec-review]` 非空）なら `"required"` 相当、さもなくば `"omitted"` / absent。

2. **fail-closed の徹底（fail-open 禁止）**: 上記いずれかの provenance が **確立不能**（最終 HEAD OID undefined、baseOid 欠落、`listCommitChangedFiles` / 二 OID 差分 / `runTestsAtCommit` が `unavailable`、materialize 済み test 0 件、凍結破れ）な場合、その dimension の achieved フィールドを absent（＝弱）とし、constrained な floor field があれば merge を fail-closed で停止する（既存 escalation 形、`exitCode 1`、`mergePullRequest` を呼ばない）。unavailable を「安全な degradation」として通さない。

3. **二 OID 凍結検査 primitive**: baseOid → 最終 HEAD で指定 path 群が改変されたかを判定する runtime 手段を追加する（例: `git diff --name-only <baseOid> <headOid> -- <paths>` 相当、`ChangedFilesResult` DU を再利用）。managed runtime は `unavailable`（→ fail-closed）。既存の `listCommitChangedFiles` の隣に置き、同じ error/unavailable 規約に従う。

4. **floor gate への state / OID / runtime の供給**: `state`（または `state.steps` と bite 導出に要る部分）と `archiveSha` を floor gate スコープへ hoist する（`jobAssurance` と同じ扱い）。floor gate が base-red 再測と凍結検査を行うため、cwd に対する `RealRuntimeStrategy` を floor gate で利用可能にする（`runMergeThenArchive` へ inject するか、cwd から構築）。base-red 再測は archive cwd の git repo で baseOid / 最終 HEAD が resolvable であることを前提とする（archive は既にこれらを push 済み）。

5. **BiteEvidenceRecord を最終 HEAD に束縛可能にする（記録の完全性）**: `BiteEvidenceRecord` に `baseOid`, `candidateOid`, `testHash`（凍結対象 test の digest）を追加し、in-loop bite gate が生成時に埋める。schema validation（`src/state/schema/operations.ts:264-292`）を対応させ、後方互換（旧形式＝これらフィールド欠落は valid、ただし floor は §1 の再測で達成を判定するため旧形式 record を「達成」の根拠にしない）。per-file の `testId` は維持する（SC 単位の per-test 分解は Phase 2）。

6. **回帰を起こさない**: 既存の protected-paths gate（Step 3.5）、truncated fail-closed、verify-checkpoint の profile digest 検証、`satisfiesFloor` / `getProfile` の単体テストは無変更で green。`getProfile` / `STANDARD_PROFILE` / `satisfiesFloor` のセマンティクスは変えない（floor に渡す入力だけを宣言→達成へ差し替える）。

## スコープ外（理由付きで明示。歯を黙って削らない）

- **executor（custom `verification.commands` 下での test 実行）**: `runTestsAtCommit` を custom commands 下で materialize 済み test に scope して走らせる capability は Phase 2。**本 request では dogfood（custom commands）で base-red 再測が `unavailable` → floor は fail-closed に倒れる**（安全側）。これは「dogfood で歯が緑で噛む」ことは実現せず、「未達を通さない」ことだけを実現する。この境界は要件であって欠陥ではない。
- **per-scenario（SC-XXX）粒度の達成判定**: 単一 test case を id 指定で走らせる per-test 実行が要り、それは Phase 2 の executor capability に依存する。本 request は **per-file 粒度**（materialize 済み test file 単位で base-red / 凍結を判定）。**既知の残余**: 実 test と空洞 test が同一 file に同居する場合、file 粒度では file が base-red を満たせば通り、file 内の空洞 test を隔離できない。この残余は Phase 2 の per-test 実行で閉じる（本 request では閉じない、と明示する）。
- **profileDigest の record 記録 / PR provenance carry / offline 再検算**: R5（provenance/offline verify）。
- **dogfood で evidence を実際に生成させること**: Phase 2。本 request は floor を安全（fail-closed）にするのみ。
- **`getProfile` / `STANDARD_PROFILE` / `satisfiesFloor` の変更**: 不要。floor へ渡す assurance を差し替えるだけ。
- **in-loop bite gate の verdict routing 変更**（strategy-deferred→verification 等）: in-loop は早期シグナル（ADR-20260717 D2 で降格）。権威判定は archive gate に置く。in-loop の挙動は §5 の record enrich 以外変えない。

## 受け入れ基準（歯を名指しする）

- [ ] **T1（核心・anti-regression 歯）**: このリポジトリの実 config 相当（`runTestsAtCommit` が custom `verification.commands` で `unavailable`）で、`biteEvidence: required` を含む floor の protected path を touch する job の archive が **fail-closed で停止**（`exitCode 1`、`mergePullRequest` 未呼び出し）することをテストで固定する。＝ 今回の見逃し（宣言 required を rubber-stamp）を二度と通さない。**破壊確認**: floor 導出を「常に achieved=required」に固定すると T1 が落ちること。
- [ ] **T2（宣言は authorize しない）**: profile 欠落（legacy）job が `biteEvidence: required` floor の protected path を touch する場合、fail-closed（`exitCode 1`）になる。`merge-then-archive-floor.test.ts:250`（TC-011、旧 exitCode 0）を fail-closed 期待へ反転する。
- [ ] **T3（達成は通す・gate は常時 fail でない）**: runtime fake が materialize 済み test を baseOid で全 red、凍結 intact を返す job が protected path を touch する場合、floor を満たし merge が進む（`exitCode 0`、`mergePullRequest` 呼び出し）ことを固定する。
- [ ] **T4（凍結の歯）**: materialize 済み test file が baseOid→最終 HEAD で改変されている（二 OID 差分が非空）場合、base-red が成立しても fail-closed になることを固定する。**破壊確認**: 凍結検査を外すと T4 が落ちること。
- [ ] **T5（空洞の歯）**: materialize 済み test が baseOid で green（実装無しで通る）になる場合、fail-closed になることを固定する。
- [ ] **T6（fail-closed の網羅）**: 最終 HEAD OID undefined / baseOid 欠落 / `listCommitChangedFiles` unavailable / 二 OID 差分 unavailable / `runTestsAtCommit` unavailable / materialize 済み test 0 件 のそれぞれで、constrained floor に対し fail-closed になることを固定する。
- [ ] **T7（record 束縛）**: `BiteEvidenceRecord` が `baseOid` / `candidateOid` / `testHash` を持ち、validation が型を強制し、`state.biteEvidence` を round-trip する。旧形式（当該フィールド欠落）record が valid のまま読めることを固定する（後方互換）。
- [ ] **T8（回帰保存）**: 既存 protected-paths（Step 3.5）/ truncated / verify-checkpoint / `satisfiesFloor`（`tests/unit/state/satisfies-floor.test.ts`）/ `getProfile`（`tests/unit/state/profile.test.ts`）/ in-loop bite gate の各テストが無変更で green（`merge-then-archive-floor.test.ts` の TC-011 反転と、達成/fail-closed の新規ケース追加を除く）。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- **floor は base-red を out-of-loop で再測し、green@HEAD は既存 CI-wait gate に委譲する**。→ 却下: base と HEAD の両方で test を再実行（green@HEAD は CI が既に強制、冗長）。→ 却下: 記録済み evidence の base-red を再測せず信じる（ADR-20260717 D2 の out-of-loop 権威を弱める）。
- **最終 HEAD OID は既存の `archiveSha`（merge-then-archive.ts:271）を使う**。→ 却下: PR head を再 fetch（Step 4 まで無く、archiveSha が push 済み tip で十分）。
- **達成 assurance を既存 `satisfiesFloor` に渡す（satisfiesFloor / getProfile を変えない）**。→ 却下: satisfiesFloor や getProfile のセマンティクスを書き換える（churn 大・波及）。
- **unavailable / 欠落 / 未凍結は fail-closed**。→ 却下: strategy-deferred / pass-through（＝今回の fail-open バグ）。
- **Phase 1 は per-file 粒度、per-scenario は Phase 2、executor も Phase 2**。→ 却下: per-test 実行や custom-commands executor を前倒し（Phase 2 の射程を侵食、P0 肥大）。残余（file 内空洞 test）は scope-out で明示済み。
- **本 request は floor 権威の補正のみ、profileDigest / offline verify は R5**。→ 却下: provenance carry / 再検算を前倒し。
