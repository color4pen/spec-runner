# Design: achieved-assurance の達成判定を完成させる（HEAD-green 実測 / scenario 二層凍結 / type↔strategy / spec-review approved）

## Context

`minimumAssurance` floor は達成 provenance を評価するようになった（assurance-provenance-floor / #848）が、
その達成判定＝`deriveAchievedAssurance`（`src/core/archive/achieved-assurance.ts:84-249`）に、accepted ADR に
反する未達が 4 点残る。本 change はこの 4 点を、同一の archive authority seam（`achieved-assurance.ts`）で閉じ、
達成判定を ADR-20260717 D4（base-red・HEAD-green・test 不変の三条件）と ADR-20260716 D2（type が bite
strategy を決める）に整合させる。新規 architecture ADR は要さない（既存 ratify 済み決定への実装追随）。

- **P0-1: HEAD-green を実測していない**。`biteEvidence:"required"` は base で全 test red なら付与され
  （`achieved-assurance.ts:217-241`）、`finalHeadOid` は freeze diff（L190）にしか使われない。HEAD で test を
  実行しないため、**base:red・test 不変・HEAD:依然 red** でも floor を通る。「green@HEAD は CI が構造的に保証」
  という前提は誤り: `merge-then-archive.ts:52` の `NONE_CHECK_GRACE_MS=60_000` は CI 無し repo を 60s 後に
  merge するし、rollup green は「その凍結 test 群が走った」証明でもない。ADR-20260717 D4 に直接反する。
- **P0-2: `testDerivation:"frozen"` が scenario 凍結を見ていない**。materialized test blob の freeze（L190→209-212）
  だけで frozen を付与し、`test-cases.md` / test-case-gen lineage hash を参照しない。in-loop `tamper.ts`（L46-67）は
  hash 欠落を `inconclusive → proceed` とし、archive はその結果すら見ない。scenario を事後改変しても frozen を
  名乗れる。
- **P0-3: request.type と bite strategy が結び付いていない**。in-loop `gate.ts:78-84` は forward strategy を
  `bug-fix`/`new-feature` に限定するが、archive derivation は `state.request.type` を一切見ず、refactoring /
  spec-change にも base-red→HEAD-green を適用する。ADR-20260716 D2 に反する。
- **P1: `specReview:"required"` が verdict を見ていない**。spec-review run が 1 件でも存在すれば成立し
  （`achieved-assurance.ts:96-99`、`Array.isArray + length > 0`）、最新 run の verdict が `approved` でなくても通る。

### 構造的前提（調査済み・実装はこれに沿う）

- **derivation seam**: `deriveAchievedAssurance({state, finalHeadOid, cwd, config, floor, runtime})`。specReview は
  L96-99。materializedTestFiles は `runtime.listCommitChangedFiles(baseOid)` ＋ `isExcludedPath` filter（L166-183）。
  freeze は `runtime.diffPathsBetweenCommits(baseOid, finalHeadOid, materializedTestFiles)`（L190）。base-red は
  L217-241（全件 `passed === false`、欠落は fail-closed）。全 return は fail-closed（絶対に throw しない）。
- **floor gate との関係**: `merge-then-archive.ts` Step 3.6（L357-411）が floor gate。`reason === "match"` 分岐で
  `deriveAchievedAssurance(...)` を呼び `satisfiesFloor(achieved, floor)`（L413）で判定。gate は CI-wait（Step 4）より
  前。CI green は provenance の代用にならない → HEAD-green は floor が自ら実測する。
- **archive-record の folder 移動**: Step 3（`archive-change-folder.ts:52`）が `git mv specrunner/changes/<slug>
  specrunner/changes/archive/<YYYY-MM-DD>-<slug>` を実行し commit。**floor gate 到達時には change フォルダは既に
  archived path に移動済み**。したがって `finalHeadOid`（=archiveSha）では `test-cases.md` / `events.jsonl` は
  `specrunner/changes/archive/<日付>-<slug>/` 配下。日付は archive 実行時のローカル日付で非決定的（trailing suffix
  一致で解決する）。**materialized test file 群は change フォルダ外（src/tests）なので移動しない**（freeze diff は従来
  どおり成立し、HEAD-green 実行時も原 path に存在する）。
- **scenario hash の frozen 値**: `tamper.ts:42-67` は lineage を `[...lineage].reverse().find(r=>r.step==="test-case-gen")`
  し、その `outputs`（`ArtifactRef[]`、`{path, hash:"sha256:.."|null}`）から `path.endsWith("test-cases.md")` の
  hash を frozen とする。`fold` / `LineageRecord` は `src/store/event-journal.ts`（`fold` L193、`LineageRecord`
  L100-110）から export。lineage は journal-only で `state`（NormalizedJobState）に materialize されない → **archive は
  `finalHeadOid` の `events.jsonl` を読んで自前で fold する必要がある**。
- **commit での file 内容取得 primitive は無い**。`digestArtifacts`（`local.ts:1044`）は working-tree のみ
  （`path.join(cwd, ref.path)`）で、commit 内容でなく、folder 移動後は active path 不在。`git show <oid>:<path>` は
  `checkpoint-ref.ts:152-176`（ls-tree + show）/ `verification/runner.ts:224` で ad-hoc に使用済み（新 primitive の雛形）。
  `SpawnResult.stdout` は string（`src/util/spawn.ts:12`）。
- **StepRun の verdict**: `StepRun.outcome.verdict: Verdict|string|null`（`schema/types.ts:173-200`）。spec-review 成功時は
  `deriveJudgeVerdict` が `"approved"` を書く（`judge-verdict.ts:32-40`）。最新 run＝
  `state.steps["spec-review"].at(-1)?.outcome?.verdict`。
- **FORWARD_TYPES**: `gate.ts:23` の `Set(["bug-fix","new-feature"])`、**未 export**。`isExcludedPath` は `gate.ts:30` で
  export 済み（archive が既に import）。`state.request.type: string`、`state.request.slug: string|null|undefined`
  （`RequestInfo`、`schema/types.ts:84,88`）。全 type: new-feature/spec-change/refactoring/bug-fix/chore。
- **runtime**: `runTestsAtCommit(oid, files, cwd, config)`（`local.ts:909`、`runtime-strategy.ts:628`）は任意 OID 可
  （`git worktree add --detach <tmp> <oid>`）。custom `verification.commands` 下では `scopedTestCommand` 設定時のみ実行、
  未設定なら unavailable。managed は常に unavailable（`managed.ts:620-627`）。fail-closed 前例は既存 derivation の全 return。
- **CLI 供給点**: `src/cli/archive.ts:222-244` が `LocalRuntime` を `assuranceRuntime` として、`mergeConfig` を `config`
  として `runMergeThenArchive` に渡す。新 primitive を LocalRuntime に実装すれば追加配線なしで seam に届く。

## Goals / Non-Goals

**Goals**:

- `deriveAchievedAssurance` を 4 点で ADR 整合させる（同一 seam・一括）:
  1. `biteEvidence` に **HEAD-green 実測**（`finalHeadOid` で同一凍結 test 群を再実行、base-red と対称の完全性）を追加。
  2. `testDerivation` / `biteEvidence` の前提に **scenario 二層凍結**（events.jsonl lineage frozen hash non-null ＋
     finalHeadOid の test-cases.md hash 一致 ＋ 既存 blob freeze）を追加。
  3. `biteEvidence` を **forward type 限定**（`FORWARD_TYPES` 共有）。`testDerivation` / `specReview` は type 非依存のまま。
  4. `specReview` を **最新 run approved 限定**。
- 任意 commit OID の file 内容を trailing-suffix 解決付きで返す **runtime primitive を新設**（`git show`、DU、
  managed unavailable、never throws）。
- 各次元の fail-closed 契約を維持し、既存 achieved-assurance / floor / bite-evidence / tamper / satisfiesFloor テストを
  （本 change で意味が変わる期待の更新を除き）無変更 green に保つ。

**Non-Goals**（歯を黙って削らない — 理由を明示）:

- **per-scenario（単一 test-case）実行**: TC-ID を title 強制する test 命名規律 ＋ `-t` 実行が要る別 request。本 change の
  scenario **hash** 凍結（P0-2）は per-scenario 実行と独立で、file 粒度の現 floor に必要なので本 change に含む。
- **dogfood の `.specrunner/config.json` 有効化**（`scopedTestCommand` ＋ `minimumAssurance`）: 全 job にコストを課し
  merge を gate する運用判断＝別途の意図的 config PR。本 change 後の次手。本 repo の実 config では `runTestsAtCommit` が
  `unavailable`（scopedTestCommand 未設定）のため floor は fail-closed へ倒れる（安全側、#848 の歯を退行させない）。
- **forward 以外の bite strategy**（refactoring の behavior 保存 ＋ mutation / security / config）: 本 change は非 forward を
  fail-closed にするのみで、専用 strategy は実装しない（別 request）。
- **R5** provenance carry / offline verify、**R6** fast。
- **`satisfiesFloor` / `getProfile` / `STANDARD_PROFILE` の変更**: 不要。floor へ渡す `achieved` の各次元の
  present/absent 判定を厳しくするだけ。absent 次元は既存 fail-closed（`profile.ts:81-110`）が落とす。
- **in-loop `gate.ts` / `tamper.ts` の verdict routing 変更**: in-loop は早期シグナル、権威は archive。P0-2 は in-loop の
  inconclusive→proceed を信頼せず archive が独立に非 null ＋ 一致を要求する（P1-low の doc 齟齬解消のみ gate.ts に触れる）。

## Decisions

### D1: HEAD-green は floor が `finalHeadOid` で自ら実測する（CI は defense-in-depth）

base-red 確立後、**同じ `materializedTestFiles` を `finalHeadOid` でも `runtime.runTestsAtCommit` で実行**し、
`kind:"ran"` かつ **全 file が `passed === true` かつ結果欠落なし**を要求する。unavailable / red / 欠落 → `biteEvidence`
absent。base-red の完全被覆ロジック（`passedByFile` map ＋ `notX` filter）と対称に実装する。

**Rationale**: 「base:red かつ HEAD:green（同一凍結 test 群）」を機械実測した時のみ `biteEvidence` を成立させ、
ADR-20260717 D4 に整合させる。CI-wait（Step 4）は floor gate より後段の追加防御として残すが、rollup は凍結 test 群の
実行証明でも 60s-none-merge を塞ぐものでもないため provenance の代用にしない。

**Alternatives considered**:
- green@HEAD を CI rollup に委譲 → 60s-none-merge で無検証 merge、rollup ≠ 凍結 test 実行。却下（architect 評価済）。

### D2: scenario は二層で凍結する（events.jsonl lineage frozen hash ＋ finalHeadOid の test-cases.md hash 一致）

`testDerivation:"frozen"` および `biteEvidence:"required"` の前提として、既存 blob freeze（(c)）に加え次を要求する:
(a) `finalHeadOid` の `events.jsonl` を `fold` した lineage の最新 `test-case-gen` record の `test-cases.md` output
hash が non-null。(b) `finalHeadOid` の `test-cases.md` 内容 hash が (a) の frozen hash と一致。欠落 / null / 不一致 /
取得不能 → `testDerivation` と `biteEvidence` を absent。folder 移動により `finalHeadOid` では archived path 配下なので、
`<slug>/events.jsonl`・`<slug>/test-cases.md` の trailing suffix で解決してから読む。frozen hash の抽出規則は
`tamper.ts` と同一（最新 test-case-gen、`endsWith("test-cases.md")`）に揃え、単一 source とする。

**Rationale**: in-loop tamper は inconclusive→proceed で欠落を素通りさせる。archive authority は独立に「非 null ＋ 一致」を
要求することで、test-materialize 後の scenario 改変（file 粒度で materialized blob が凍結されていても、生成元 test-cases.md を
書き換える）を検出する。

**Alternatives considered**:
- in-loop tamper の inconclusive→proceed を信頼 → authority が非 null ＋ 一致を要求すべき。却下。
- baseOid の active path だけ見る → test-materialize 後の改変を見逃す。却下。

### D3: `biteEvidence` は forward type 限定、`testDerivation` / `specReview` は type 非依存

`biteEvidence`（forward strategy）は **`state.request.type ∈ FORWARD_TYPES`** のときのみ成立させる。非 forward
（refactoring / spec-change / chore）は `biteEvidence` absent（専用 strategy 実装まで fail-closed）。`FORWARD_TYPES` を
`gate.ts` から export して archive と共有する。`testDerivation`（commit topology ＋ 凍結、strategy 非依存）と `specReview`
は type gate の対象外。

**Rationale**: ADR-20260716 D2「type が bite strategy を決める」に整合。forward strategy（base-red→HEAD-green）は
bug-fix / new-feature の意味論であり、refactoring 等に適用するのは誤り。`FORWARD_TYPES` の二重定義は同定規則の drift を生むため
export 再利用で単一 source にする。

**Alternatives considered**:
- 全 type に base-red→HEAD-green を適用 → D2 違反。却下。
- `testDerivation` にも type gate → frozen は commit topology で strategy 非依存。却下。

### D4: `specReview` は最新 run の `approved` を要求

`specReview:"required"` は **`state.steps["spec-review"].at(-1)?.outcome?.verdict === "approved"`** のときのみ成立させる
（run 存在のみでは不可）。verdict が needs-fix / escalation / null / run 無し → absent。

**Rationale**: run 存在は「レビューを試みた」証明にすぎず「承認された」証明ではない。needs-fix / escalation を通すのは floor の
意味を空洞化する。`deriveJudgeVerdict` が成功時に `"approved"` を書く（`judge-verdict.ts:32-40`）ので、最新 run の verdict
一致で判定できる。

**Alternatives considered**:
- run 存在のみ → needs-fix / escalation でも通る。却下（現状の P1）。

### D5: commit-file-content を新 runtime primitive（`git show` ＋ ls-tree suffix 解決）で追加、fail-closed

`RuntimeStrategy` に optional メソッド `readFileAtCommit(oid, pathSuffix, cwd): Promise<CommitFileResult>` を追加する。
`CommitFileResult = { kind:"found"; path; content } | { kind:"unavailable"; reason }`。local 実装は
`git ls-tree -r --name-only <oid>` で tree を列挙し、`entry.endsWith("/"+pathSuffix) || entry.endsWith("-"+pathSuffix)`
（active path は `/<slug>/...`、archived path は `-<日付>-<slug>/...` の境界を両方許容）で一意解決し、`git show <oid>:<path>`
で内容を返す。0 件 / 複数一致（曖昧）/ 非存在 OID / 非存在 path / git 非 0 exit → `unavailable`。managed は常に unavailable。
never throws。`RealRuntimeStrategy` に required 追加、`AssuranceProvenanceRuntime` の Pick 型に追加。

内容は string（`SpawnResult.stdout`）で返し、derivation 側で `"sha256:" + sha256hex(Buffer.from(content,"utf8"))` を計算して
frozen hash（digestArtifacts 形式）と比較する。test-cases.md / events.jsonl は utf-8 のため byte 一致する（T7 で
digestArtifacts との round-trip 一致を固定して invariant を歯化する）。

**Rationale**: working-tree `digestArtifacts` は commit 内容でなく、folder 移動後は active path 不在。archived path を
安定に解決するには trailing-suffix 解決 ＋ commit-scoped read が要る。既存 `git show` 使用点（checkpoint-ref / verification）が
DU / fail-closed の雛形。曖昧一致を unavailable に倒すことで、slug 衝突時も fail-open しない。

**Alternatives considered**:
- working-tree `digestArtifacts` を流用 → commit 内容でない、folder 移動後は path 不在。却下。
- 内容でなく hash を直接返す primitive → events.jsonl は fold のため内容が要る。1 primitive で両用途を賄えないため内容返しに統一。

### D6: 4 点を同一 archive authority seam で一括する

新規次元・厳格化はすべて `achieved-assurance.ts` の `deriveAchievedAssurance` 内に閉じ、Step 3.6 呼び出し
（`merge-then-archive.ts:405-413`）と `satisfiesFloor` は無変更（floor gate は `achieved` を受け取り fail-closed で落とす）。

**Rationale**: seam が同一で凝集度・トークン効率が高い。細切れ request は seam 重複で劣る。per-scenario 実行と dogfood 有効化
のみ Non-Goals として分離。

**Alternatives considered**: 細切れ request → seam 同一で凝集度・トークン効率低下。却下。

### derivation の新しい制御フロー（`deriveAchievedAssurance` 内、fail-closed 各所）

1. **specReview**: 最新 spec-review run の `outcome.verdict === "approved"` → `"required"`、それ以外 absent（I/O 無し、D4）。
2. floor が bite / derivation を constrain しないなら early return（既存）。
3. 前提: `finalHeadOid` 定義、`baseOid` 解決（`resolveBaseCandidateOids`）、runtime が必要メソッド（既存 3 ＋ `readFileAtCommit`）
   を備える、config 定義。いずれか欠落 → 両次元 absent（既存 ＋ readFileAtCommit を method check に追加）。
4. materializedTestFiles 列挙（既存、L166-183）。0 件 → 両次元 absent。
5. blob freeze（既存 diff、L190）。tamper（非空）/ unavailable → 両次元 absent。＝ D2 の (c)。
6. **scenario 二層凍結（D2 の (a)(b)、新規）**: `state.request.slug` から suffix を作り、`readFileAtCommit(finalHeadOid,
   "<slug>/events.jsonl")` → `fold` → 最新 test-case-gen の test-cases.md frozen hash（non-null 必須）。
   `readFileAtCommit(finalHeadOid, "<slug>/test-cases.md")` → hash 計算 → frozen と一致必須。slug 欠落 / 取得不能 / null /
   不一致 → 両次元 absent。
7. `testDerivation = "frozen"`（blob freeze intact ＋ scenario 二層凍結 intact のとき。type 非依存）。
8. **biteEvidence の I/O は `floor.biteEvidence` が constrain するときのみ実行**（HEAD-green worktree run を無駄に走らせない）。
   - **type gate（D3）**: `state.request.type ∈ FORWARD_TYPES` でなければ biteEvidence 評価を skip（absent）。
   - base-red 再測（既存、L217-241）: 全件 `passed === false`、欠落 fail-closed。不成立 → absent。
   - **HEAD-green 実測（D1、新規）**: `runTestsAtCommit(finalHeadOid, materializedTestFiles, cwd, config)` → `kind:"ran"`
     かつ全件 `passed === true` かつ欠落なし。不成立 / unavailable → absent。
   - すべて満たす → `biteEvidence = "required"`。

## Risks / Trade-offs

- **[Risk] HEAD-green 追加で既存 positive-path テストの意味が変わる**: `merge-then-archive-floor-provenance.test.ts` の
  fake `runTestsAtCommit` は oid 非依存で同一結果を返す。HEAD-green 追加後、base:red の fake は HEAD でも red を返し positive
  path（TC-003 等）が fail-closed に倒れる。→ **Mitigation**: fake を oid 別（base / HEAD）に拡張し、positive path テストを
  base:red・HEAD:green ＋ scenario 凍結 ＋ forward type の完全達成に更新する（T8 が許す「意味が変わる期待の更新」）。
- **[Risk] scenario 凍結 I/O 追加で runtime method check が厳しくなり、readFileAtCommit を持たない fake が全て fail-closed に
  倒れる**: fail-closed 期待のテストは exitCode 1 のまま通る（別理由）が、positive path / e2e（`bite-evidence-e2e-gate.test.ts`
  の `TC-010 (floor)`）は readFileAtCommit ＋ events.jsonl / test-cases.md fixture が要る。→ **Mitigation**: e2e fixture に
  events.jsonl（test-case-gen lineage）と test-cases.md を追加するか、fake runtime に readFileAtCommit を実装して期待を更新する。
  backward-compat 監査タスク（T-09）で全 caller を洗い出す。
- **[Risk] hash byte 一致**: frozen hash は digestArtifacts が working-tree の raw Buffer から算出、archive 側は git show の
  string を utf-8 で再 encode して算出する。非 utf-8 / EOL 変換があると不一致。→ **Mitigation**: test-cases.md / events.jsonl は
  utf-8 text、`git show <oid>:<path>` は smudge / EOL 変換をしない。T7 で digestArtifacts と primitive-based hash の
  round-trip 一致（実 commit の utf-8 file）を固定して歯化する。
- **[Risk] suffix 解決の曖昧性**: archive/ には過去の全 archived change（各々 test-cases.md）が同居する。bare suffix は複数一致
  し得る。→ **Mitigation**: 完全 slug を含む `<slug>/<file>` を境界（`/` または `-`）付きで一致させ、複数一致は unavailable
  （fail-closed）。slug 欠落（`request.slug` null）も unavailable。
- **[Risk] DSM: `core/archive` → `core/step/bite-evidence`**: `FORWARD_TYPES` を gate.ts から import する。archive は既に
  `isExcludedPath` / `resolveBaseCandidateOids` を同方向で import 済み（`achieved-assurance.ts:19-20`）なので新規越境は増えない。

## Open Questions

- **P1-low（testHash provenance）の解消方法**: `BiteEvidenceRecord.testHash` は doc 上「baseOid の内容」だが `gate.ts` は
  worktree（candidate tree）を hash する。authority は record を信頼しないため即 P0 ではない。→ 低リスクの **doc / comment
  を実装に合わせる**（gate 実行時の worktree 内容 hash と明記）を採る。gate を新 primitive で baseOid 内容 hash に変える案は
  behavior 変更・追加 I/O のため見送る（Non-Goal 近傍）。実装者は doc 齟齬の解消のみ行い、record 消費側（archive）の判定は
  独立再測のため無影響であることを確認する。
