# Design: minimumAssurance floor を「達成 provenance」で判定する（P0 fix-forward）

## Context

archive の `minimumAssurance` floor（`src/core/archive/merge-then-archive.ts` Step 3.6, L337-411）は、protected path を touch する PR に対し `satisfiesFloor(jobAssurance, floor)`（L384）で保証下限を強制する。しかし `jobAssurance = getProfile(state).assurance`（L196）は job の **宣言** profile であって、pipeline が最終 PR HEAD に対して実際に達成した provenance ではない。この乖離が P0 を生む:

- **宣言と達成の乖離**: `getProfile` は profile 欠落を `STANDARD_PROFILE`（最強）に解決する（`src/state/profile.ts:143`）。profile 欠落 job は達成の裏付け無く floor を素通りする。既存 floor test はこれを「profile 欠落 → 最強 → protected path が merge」と凍結している（`tests/unit/core/archive/merge-then-archive-floor.test.ts:249-293` TC-011、`exitCode 0` を期待）。
- **required が実質 optional**: in-loop bite gate は多くの条件を `strategy-deferred` にする（`src/core/pipeline/types.ts:247`）。とりわけ**このリポジトリの `.specrunner/config.json` は custom `verification.commands` を持つため `runTestsAtCommit` が常に `unavailable` を返し**（`src/core/runtime/local.ts:902-906`）、forward job でも evidence は生成されない。それでも archive floor は宣言 `required` だけを信じるので歯は一度も噛まない。
- **歯が最終 HEAD に束縛されない**: `BiteEvidenceRecord`（`src/state/schema/types.ts:341-347`）は `{ testId, strategy, baseResult, candidateResult, verified }` のみで OID / testHash を持たない。materialize 済み test の blob が凍結されないため、candidate が test を書き換えても base-red→candidate-green を偽造できる。

ADR-20260717（D1〜D5）は floor の評価対象を「宣言」から「最終 PR HEAD に対して機械達成された provenance」に補正した。本 change はその D1〜D4 を、changed-files と最終 HEAD OID が揃う唯一の out-of-loop 点＝archive merge gate（Step 3.6）に載せる。新規 architecture ADR は要さない。

### 構造的前提（調査済み・実装はこれに沿う）

- **floor gate seam**: `merge-then-archive.ts` Step 3.6（L337-411）。`floor` は `minimumAssurance` から `protectedPaths` を除いた rest（L383, `AssuranceFloor` 形）。escalation は `{ exitCode:1, escalation: formatEscalation({...}) }`（L388-407）。
- **最終 HEAD OID は seam で入手可能**: `const archiveSha = archiveRecordResult.headSha`（L270-271）。Step 3 で push 済みの archive-record commit の `git rev-parse HEAD`（`src/core/archive/orchestrator.ts:368-374`）＝実際に squash-merge される feature branch の tip。型は `string | undefined`。
- **`state` は 3.6 で参照不可**: full `JobState` は Step 1 の try（L164-200）内 const で、外へ escape するのは `jobAssurance`（L162 宣言, L196 代入）のみ。`state.steps` / bite 導出に要る部分を floor gate で読むには `state` を hoist する必要がある。
- **CI green@HEAD は既存 gate が強制**: Step 4（L424 以降の CI-wait）が archive commit の CI green を待ってから merge する。「最終 HEAD で test が green」は既存 pipeline 順序で構造的に保証され、floor gate は green@HEAD を再実行しない。
- **runtime 実行 primitive**:
  - `listCommitChangedFiles(oid, cwd)`（`local.ts:831-850`）＝ `git diff --name-only <oid>^ <oid>`。custom commands の影響を受けない。base commit の変更ファイル＝materialize 済み test 群の同定に使える（in-loop gate と同じ、`gate.ts:117-140`、`isExcludedPath` で `specrunner/changes/` `.specrunner/` を除外）。
  - `runTestsAtCommit(oid, testFiles, cwd, config)`（`local.ts:865-946`）＝ `git worktree add --detach <tmp> <oid>` → 各 file を `bun test <file>`。`oid` は任意 commit 可。**custom `verification.commands` が非空なら常に `unavailable`**（L902-906）。managed は常に unavailable（`managed.ts:607-614`）。
  - **二 OID 間の path 差分を取る primitive は現状無い**（`listCommitChangedFiles` は単一 commit の `<oid>^ <oid>` のみ、`runtime-strategy.ts` に無い）。凍結検査にはこれが要る。
- **base/candidate OID**: `resolveBaseCandidateOids(state)`（`src/core/step/bite-evidence/oids.ts:27-43`）が `state.steps[test-materialize]` / `[implementer]` の最新 `StepRun.commitOid`（`schema/types.ts:199`）から base/candidate OID を返す。resume を跨いで journal で保持。
- **satisfiesFloor は fail-closed 済み**（`src/state/profile.ts:81-110`）: floor field が constrained で assurance 側の値が absent / 未知 rank → `false`。空 floor → vacuously true。**変更不要**。floor に渡す assurance object を「宣言」から「達成」に差し替えるだけで、absent 達成フィールドは既存 fail-closed で floor を落とす。
- **config**: `ArchiveConfig.minimumAssurance?: MinimumAssuranceConfig`（`src/config/schema/types.ts:365-377`）。CLI が `config.archive?.minimumAssurance` を `runMergeThenArchive` に渡す（`src/cli/archive.ts:167,227`）。**このリポジトリの config には現状 `minimumAssurance` 未設定**（floor は現在 inert）。
- **OID の到達可能性**: base / candidate / archive commit は job worktree で作られるが、git worktree は main repo と object DB を共有し、かつ archive が origin へ push 済み。したがって archive cwd（main repo root）の git object store から `git diff` / `git worktree add --detach` で resolvable。

## Goals / Non-Goals

**Goals**:

- Step 3.6 の floor 判定を、`getProfile(state).assurance`（宣言）でなく、job が最終 HEAD（`archiveSha`）に対して達成した provenance から導出した **achieved assurance** で行い、既存 `satisfiesFloor(achieved, floor)` に渡す（`satisfiesFloor` / `getProfile` / `STANDARD_PROFILE` は無変更）。
- achieved の各フィールドを、最終 HEAD に束縛された機械観測（凍結検査 + base-red 再測 + spec-review 実行有無）から導出する。確立不能な dimension は achieved を absent（弱）とし、constrained floor を fail-closed で落とす（fail-open 禁止）。
- 二 OID 間の path 凍結を判定する runtime primitive を追加する（既存 `listCommitChangedFiles` の隣、同じ DU / unavailable 規約）。
- `BiteEvidenceRecord` を `baseOid` / `candidateOid` / `testHash` で最終 HEAD に束縛可能にし、in-loop gate が生成時に埋める（記録の完全性）。旧形式は valid のまま（後方互換）。
- 既存の protected-paths gate / truncated fail-closed / verify-checkpoint / `satisfiesFloor` / `getProfile` / in-loop bite gate の挙動とテストを（TC-011 反転と新規追加を除き）無変更 green に保つ。

**Non-Goals**（歯を黙って削らない — 理由を明示）:

- **executor（custom `verification.commands` 下での test 実行）**: `runTestsAtCommit` を custom commands 下で materialize 済み test に scope して走らせる capability は **Phase 2**。本 change では dogfood（custom commands）で base-red 再測が `unavailable` → floor は fail-closed に倒れる（安全側）。「dogfood で歯が緑で噛む」ことは実現せず、「未達を通さない」ことだけを実現する。境界であって欠陥ではない。
- **per-scenario（SC-XXX）粒度の達成判定**: 単一 test case を id 指定で走らせる per-test 実行が要り、Phase 2 の executor capability に依存する。本 change は **per-file 粒度**。**既知の残余**: 実 test と空洞 test が同一 file に同居すると、file 粒度では file が base-red を満たせば通り file 内の空洞 test を隔離できない。この残余は Phase 2 で閉じる（本 change では閉じない）。
- **profileDigest の record 記録 / PR provenance carry / offline 再検算**: R5。`testHash` フィールドは記録の器を用意するのみで、offline 再検算はしない。
- **dogfood で evidence を実際に生成させること**: Phase 2。本 change は floor を安全（fail-closed）にするのみ。
- **`.specrunner/config.json` への `minimumAssurance` 設定**: floor の「有効化」は運用判断であり本 change の射程外。config は inert のまま（かつ `.specrunner/config.json` は fast pipeline の guard-config forbidden surface）。本 change は floor が設定されたときの正しさを実装する。
- **`getProfile` / `STANDARD_PROFILE` / `satisfiesFloor` の変更**: 不要。floor へ渡す入力だけを宣言→達成へ差し替える。
- **in-loop bite gate の verdict routing 変更**（strategy-deferred→verification 等）: in-loop は早期シグナル（ADR-20260717 D2 で降格）。権威判定は archive gate。in-loop は D3 の record enrich 以外変えない。

## Decisions

### D1: floor は宣言でなく最終 HEAD に対する達成 provenance を評価する

Step 3.6 の `satisfiesFloor(jobAssurance, floor)`（L384）を `satisfiesFloor(achievedAssurance, floor)` に差し替える。`achievedAssurance: ProfileAssurance` は job が最終 HEAD に対して達成した provenance から導出し、各フィールドは達成できたときのみ present（できなければ absent）とする。`satisfiesFloor` / `getProfile` / `STANDARD_PROFILE` は無変更。absent 達成フィールドは既存 fail-closed（`profile.ts:81-110`）で constrained floor を落とす。

導出は achieved-provenance が意味を持つ場面＝**floor protected path が実際に touch されたとき**（`evaluateProtectedPaths` の `reason === "match"`）だけ行う。match 無し / truncated / `minimumAssurance` 不在の既存分岐は無変更。

**Rationale**: 権威判定を「機械が最終 HEAD で観測した事実」に置く（ADR-20260717 D1）。`satisfiesFloor` の fail-closed 契約が既に「証明できない＝落とす」を実装しているので、達成を「present=証明済み / absent=未証明」で表現すれば、判定関数を触らず宣言→達成へ移行できる。

**Alternatives considered**:
- `satisfiesFloor` / `getProfile` のセマンティクスを書き換える → churn 大・波及大。却下（architect 評価済）。
- 記録済み `state.biteEvidence` の base-red を再測せず信じる → out-of-loop 権威を弱める（ADR-20260717 D2）。却下。

### D2: achieved assurance の各フィールド導出（fail-closed）

新規 async モジュール `src/core/archive/achieved-assurance.ts` に `deriveAchievedAssurance(input): Promise<AchievedAssuranceResult>` を置く。入力は `{ state, finalHeadOid, cwd, config, floor, runtime }`（`runtime` は D4 の narrow port）。返り値は `{ achieved: ProfileAssurance, diagnostics: string[] }`（diagnostics は escalation メッセージ用）。Never throws。

導出規則:

- **`specReview`**: `state.steps["spec-review"]`（`STEP_NAMES.SPEC_REVIEW`）が非空 → `achieved.specReview = "required"`。さもなくば absent。純 state 読み（I/O 無し）。
- **`biteEvidence` / `testDerivation` 共通前提**:
  - (a) `resolveBaseCandidateOids(state).baseOid` が resolvable、かつ `finalHeadOid`（`archiveSha`）が定義済み。いずれか欠ければ両 achieved は absent。
  - (b) **凍結**: materialize 済み test 群（`listCommitChangedFiles(baseOid, cwd)` を `isExcludedPath` で filter）が baseOid → `finalHeadOid` で **byte 不変**（二 OID path 差分が空）。差分あり / 差分取得 unavailable / `listCommitChangedFiles` unavailable / materialize 済み test 0 件 → 両 achieved は absent。
- **`testDerivation`**: (a) baseOid resolvable ＋ (b) 凍結 intact を満たせば `achieved.testDerivation = "frozen"`。満たさなければ absent。
- **`biteEvidence`**: 上記 (a)(b) に加えて **base-red 再測（out-of-loop）**: materialize 済み test 群を `runTestsAtCommit(baseOid, testFiles, cwd, config)` で **baseOid で実行**し、**全て red（fail）**。runtime unavailable（custom commands / managed / OID 不正）→ absent。green の test が一つでも有れば空洞 → absent。全て red のときのみ `achieved.biteEvidence = "required"`。
  - green@HEAD は既存 CI-wait gate（Step 4）が強制するため floor gate では再実行しない。
- **cost bound**: 上記 I/O は floor が biteEvidence / testDerivation を constrain するときのみ実行する（floor がどちらも constrain しなければ skip）。specReview のみ constrain する floor では I/O ゼロ。

**Rationale**: base-red を out-of-loop で再測し green@HEAD を既存 CI-wait に委譲する（architect 評価済）。凍結を二 OID 差分で機械判定することで、記録された `verified` を信じずに tamper を最終 HEAD で塞ぐ。materialize 済み test の同定は in-loop gate と**同一の** `resolveBaseCandidateOids` + `isExcludedPath` を再利用し、二経路の乖離を作らない。

**Alternatives considered**:
- base と HEAD の両方で test 再実行 → green@HEAD は CI が既に強制、冗長。却下（architect 評価済）。
- 凍結検査を省き base-red のみで達成 → candidate が test を書き換える偽造を通す。却下（T4 の歯）。

### D3: BiteEvidenceRecord を最終 HEAD に束縛可能にする（記録の完全性）

`BiteEvidenceRecord`（`schema/types.ts:341-347`）に optional フィールドを追加: `baseOid?: string`、`candidateOid?: string`、`testHash?: string`。schema validation（`schema/operations.ts:264-292`）を対応させ、present なら型（string）を強制、absent は valid（後方互換）。in-loop gate（`gate.ts:194-217`）が record 生成時に `baseOid` / `candidateOid`（既に `resolveBaseCandidateOids` で解決済み）を埋める。`testHash` は runtime が `digestArtifacts` を提供するときのみ per-file の content digest（`sha256:...`）を埋め、提供しないとき（旧 fake 等）は absent。

**floor は旧形式 record を「達成」の根拠にしない**: D1/D2 のとおり floor は record を信じず base-red を再測する。よって旧形式（OID/testHash 欠落）record が残っても floor は誤って通さない。per-file の `testId` は維持（per-test 分解は Phase 2）。

**Rationale**: 記録の完全性（record が最終 HEAD の base/candidate と test blob digest を持つ）を R5 の provenance carry / offline 再検算のために先行して用意する。`digestArtifacts` は両 runtime に既存（local=sha256, managed=null）で、gate は managed では record 構築前に unavailable 短絡するため `testHash` は local 経路でのみ埋まる。`testHash` を optional・defensive にすることで、`digestArtifacts` を持たない既存 gate test fake が無変更 green を保つ（in-loop gate test は field 個別 assert で record を検証しており、追加 optional field で壊れない）。

**Alternatives considered**:
- OID/testHash を required にする → 旧形式 state / 既存 fake が invalid になり後方互換と「in-loop test 無変更」を破る。却下。
- `testHash` を必ず gate で計算（`digestArtifacts` を gate の runtime 必須依存に昇格）→ 既存 gate test fake が壊れる。却下。

### D4: 二 OID 凍結検査 primitive を runtime seam に追加する

`RuntimeStrategy`（`src/core/port/runtime-strategy.ts`）に optional メソッド `diffPathsBetweenCommits(baseOid, headOid, paths, cwd): Promise<ChangedFilesResult>` を追加し、`RealRuntimeStrategy` intersection（L644-664）で required にする。契約は `listCommitChangedFiles` と同型（never throws、`success{files}` | `unavailable{reason}`）。

- **local**（`local.ts`）: `git diff --name-only <baseOid> <headOid> -- <paths...>` を cwd で実行。exit 0 → `success`（`files` は変更された path 群、空＝凍結 intact）。非 0 / spawn error → `unavailable`。`paths` 空なら `success{files:[]}`。
- **managed**（`managed.ts`）: 常に `unavailable`（no local worktree、構造的制約）→ floor は fail-closed。

achieved 導出（D2 (b)）はこれを materialize 済み test 群 path で呼び、`success` かつ `files.length === 0` を凍結 intact、それ以外（`files` 非空 = 改変 / `unavailable`）を fail-closed に倒す。

**Rationale**: 既存の単一 commit `listCommitChangedFiles` では二 OID 差分が取れない（調査で確認、`runtime-strategy.ts` に primitive 無し）。同じ error/unavailable 規約に揃えることで、achieved 導出は他の runtime 呼び出しと同一の fail-closed ハンドリングで扱える。

**Alternatives considered**:
- `listCommitChangedFiles` を二 OID 対応に一般化 → 既存 caller（in-loop gate）の呼び出し規約 `<oid>^ <oid>` を変える波及。新規メソッドで隔離する方が安全。却下。

### D5: floor gate への state / OID / runtime / config の供給

- `merge-then-archive.ts` Step 1（L164-200）の try で load した `state` を、`jobAssurance` と同様に outer スコープの `let jobStateForFloor: JobState` に捕捉する（`jobAssurance` は escalation の宣言 vs 達成 diagnostic 用に残す）。
- `archiveSha`（L270-271）は既に outer const。Step 3.6 で `finalHeadOid` として渡す。
- `MergeThenArchiveInput` に narrow runtime capability `assuranceRuntime?: Pick<RuntimeStrategy, "listCommitChangedFiles" | "runTestsAtCommit" | "diffPathsBetweenCommits">` と `config?: SpecRunnerConfig` を追加する。floor gate は D2 の I/O をこの runtime + config で行う。runtime / config が absent かつ floor が biteEvidence/testDerivation を constrain するときは、当該 achieved を absent（fail-closed）とする。
- CLI（`src/cli/archive.ts`）: `--with-merge` 経路で `new LocalRuntime({ cwd, githubClient, githubToken, spawnFn: spawnCommand })`（`RealRuntimeStrategy`、テストでも軽量構築される既知パターン）を構築して `assuranceRuntime` に渡し、`loadConfig()` の `config` を `config` に渡す。config 読込失敗時は `minimumAssurance` が undefined → gate no-op なので runtime/config は未使用でよい。

**Rationale**: base-red 再測と凍結検査は cwd の git repo で行うため、archive の composition root（CLI）で real runtime を注入するのが自然。narrow Pick にすることで unit test が fake runtime を注入でき、既存 floor test（runtime 未注入）は「biteEvidence achieved absent → fail-closed」で従来の `exitCode 1` 期待を保つ。

**Alternatives considered**:
- PR head を再 fetch して最終 HEAD を得る → Step 4 まで PR head は無く、`archiveSha`（push 済み tip）で十分。却下（architect 評価済）。
- full `RuntimeStrategy` を必須 inject → test fake の表面積が広がる。narrow Pick が最小。却下。

## Risks / Trade-offs

- **[Risk] dogfood（custom `verification.commands`）で floor が常に fail-closed に倒れ、protected path 変更が自動 merge されない** → Mitigation: これは意図した安全側の挙動（Non-Goal に明示）。floor は opt-in（`minimumAssurance` 未設定なら影響ゼロ）で、本 change は `.specrunner/config.json` に floor を設定しない。dogfood で歯を緑で噛ませるのは Phase 2 の executor capability。
- **[Risk] file 粒度のため、同一 file 内に実 test と空洞 test が同居すると空洞を隔離できない** → Mitigation: 既知の残余として scope-out に明示。file が base-red を満たさなければ fail-closed になるので「未達を通す」方向の危険は無い。Phase 2 の per-test 実行で閉じる。
- **[Risk] OID が archive cwd から resolvable でない（object 未共有 / push 前）と base-red 再測が unavailable → fail-closed で誤ブロック** → Mitigation: archive は Step 3 で archive commit を push 済みで、worktree は object DB を共有するため通常 resolvable。resolvable でない稀な状況は「証明できない」ので fail-closed が正しい（安全側）。
- **[Risk] achieved 導出の I/O（worktree add/remove, per-file test）で archive が遅くなる** → Mitigation: floor が biteEvidence/testDerivation を constrain し、かつ protected path が touch されたときのみ実行。custom commands 環境では `runTestsAtCommit` が worktree add 直後に unavailable 短絡するため軽量。
- **[Risk] `BiteEvidenceRecord` に field を足すと既存 state / test が壊れる** → Mitigation: optional 追加 + validation は present 時のみ型強制。旧形式は valid。in-loop gate test は record を field 個別に assert しており deep-equal しないため無変更 green（調査で確認）。
- **[Risk] `core/archive → core/step/bite-evidence` の import（`resolveBaseCandidateOids` / `isExcludedPath` 再利用）が DSM 閉包に抵触** → Mitigation: 両者は pure・依存無しの sibling 内 import。conformance / cross-boundary-invariants が抵触を指摘した場合のみ、両 helper を中立モジュール（例: `src/state/` 配下）へ behavior-preserving に move し in-loop gate の import を追随させる（move であって削除ではない）。単一 source of truth（materialize 済み test 同定規則）を保つことを優先する。

## Open Questions

なし（設計分岐は ADR-20260717 D1〜D5 と request の architect 評価済み判断で ratify 済み）。
