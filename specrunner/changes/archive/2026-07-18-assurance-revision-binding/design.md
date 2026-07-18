# Design: scenario / spec の凍結・承認を revision（commit OID）に束縛する — 同一 commit 自己整合を廃す

## Context

`deriveAchievedAssurance`（`src/core/archive/achieved-assurance.ts`）は archive floor authority である。
`minimumAssurance` floor 到達時に、機械 provenance から `achieved` の各次元（`biteEvidence` / `testDerivation` /
`specReview`）を導出し、`satisfiesFloor` が fail-closed で落とす（`merge-then-archive.ts:405-413`）。
#850 はここに「scenario 二層凍結」と「specReview approved 判定」を入れたが、**両方とも凍結・承認を確定した
revision に束縛しておらず、同一 commit の自己整合を確認しているにすぎない**。

- **scenario 凍結が同一 commit 自己整合**（`achieved-assurance.ts:256-320`）: `events.jsonl` の frozen hash と
  `test-cases.md` の内容を **どちらも `finalHeadOid` から** 読み比較する（L267 / L297、両 read が finalHeadOid）。
  同一 commit なので、後続 step が `test-cases.md` を改竄し、同じ commit 内で `events.jsonl` の lineage hash も
  書き換えれば一致したまま通る。workspace は書込可、`commit-push.ts:48` は `git add -A`。これは「凍結」でなく
  自己整合確認。E2E（`bite-evidence-e2e-gate.test.ts:113-136`）も scenario と hash を同一 candidate commit に
  置き、time boundary を試していない。
- **specReview が承認 content に束縛されていない**（`achieved-assurance.ts:126-134`）: 最新 spec-review run の
  `outcome.verdict === "approved"` かしか見ず、**レビュー後に `spec.md` が変わっても `specReview:"required"`**
  が成立する。承認が「承認した content」に束縛されていない。

正しくは、凍結・承認が確定した **revision（commit OID）の content** と final HEAD の content を跨いで比較する。
frozen hash を journal から読むのでなく、確定 commit の blob（不変な git 履歴）を直接読む。構造判断は
ADR-20260717 D4（test 不変を base→HEAD の時間境界で証明する）で ratify 済みであり、新規 architecture ADR を
要さない。本 change は #850 の「同一 commit 自己整合」を「確定 commit 跨ぎ比較」に正す構造修正までを射程とする。

### 構造的前提（調査済み・実装はこれに沿う）

- **derivation seam は 1 ファイルに閉じる**: 本 change の production 変更は `src/core/archive/achieved-assurance.ts`
  のみ。`readFileAtCommit` primitive は #850 で `RuntimeStrategy` / `LocalRuntime`（`local.ts:1051-1109`）/
  managed に実装済みで、`AssuranceProvenanceRuntime` の Pick 型（`achieved-assurance.ts:31-37`）にも含まれる。
  caller（`merge-then-archive.ts:405-412`）は既に `runtime` / `config` / `finalHeadOid` を渡す。**port / runtime /
  caller の変更は不要**。
- **確定 commit OID は state.steps に在る**: `state.steps[<step>].at(-1)?.commitOid`（`StepRun.commitOid?: string`、
  `state/schema/types.ts:199`）に各 sequential step の per-node commit OID が入る。events.jsonl を `fold` した
  normalized state を archive が load するため、`state.steps["test-case-gen"].at(-1)?.commitOid`（= test-case-gen
  確定 commit）と `state.steps["spec-review"].at(-1)?.commitOid`（= spec-review 確定 commit）はいずれも実データで
  非 null（request 調査済み）。`STEP_NAMES.TEST_CASE_GEN = "test-case-gen"` / `STEP_NAMES.SPEC_REVIEW =
  "spec-review"`（`kernel/step-names.ts:41,43`）。
- **`readFileAtCommit(oid, suffix, cwd)` の契約**（`local.ts:1051-1109`）: `git ls-tree -r --name-only <oid>` →
  `endsWith("/"+suffix) || endsWith("-"+suffix)` で一意解決 → `git show <oid>:<path>` → `{kind:"found", path,
  content}` | `{kind:"unavailable", reason}`。active path（`specrunner/changes/<slug>/…`）も archived path
  （`specrunner/changes/archive/<date>-<slug>/…`）も同 suffix で解決する。0 件 / 複数一致（曖昧）/ 非存在 OID /
  非存在 path / managed は `unavailable`。never throws。
- **folder 移動**: archive-record commit が change フォルダを `specrunner/changes/archive/<date>-<slug>/` へ move
  する。したがって test-case-gen 確定 commit（early、active path）と `finalHeadOid`（archived path）では
  `<slug>/test-cases.md` の full path が異なる。**single-path diff は使えず、両 commit で `readFileAtCommit`
  （suffix 解決）して content hash を比較する**。spec.md も同様（spec-review 確定 commit は active path、finalHeadOid
  は archived path）。
- **`computeContentHash`**（`achieved-assurance.ts:71-74`）: `"sha256:" + sha256hex(Buffer.from(content,"utf8"))`。
  `digestArtifacts` と round-trip 一致（#850 で歯化済み）。blob 内容の一致判定はこれを両 revision に適用して比較する。
- **fail-closed 前例**: derivation の全 return（不能・欠落・不一致 → 当該 achieved フィールド absent）。absent 次元は
  `satisfiesFloor`（`state/profile.ts:81-110`）が constrained floor に対し落とす。

## Goals / Non-Goals

**Goals**:

- `achieved-assurance.ts` で凍結・承認を **確定 commit OID の blob 跨ぎ比較** に束縛する（同一 seam・fail-closed）:
  1. **scenario 凍結を commit OID に束縛**（D1）: `test-cases.md`@`testCaseGenOid` と `test-cases.md`@`finalHeadOid` の
     content hash を比較。events.jsonl / `fold` への依存を廃す。
  2. **specReview を reviewed revision に束縛**（D2）: verdict approved に加え、`spec.md`@`specReviewOid` と
     `spec.md`@`finalHeadOid` の content hash 一致を要求する。
- positive と同型の **adversarial negative（time-boundary / 協調改竄）** をテストで必須化する（D3）。
- E2E を **anchor commit と HEAD を別 commit に分ける** 構成に更新する（D4）。
- 各次元の fail-closed 契約を維持し、既存 achieved-assurance / floor / bite-evidence / readFileAtCommit テストを
  （本 change で **意味が変わる** scenario-freeze 系・specReview 束縛系の期待更新を除き）green に保つ。

**Non-Goals**（歯を黙って削らない — 理由を明示）:

- **journal（events.jsonl / state.json）の agent-write 保護**: 記録された `commitOid` / verdict そのものを agent が
  改竄する threat（例: 記録 `commitOid` を改竄後 blob を指す commit に差し替える）は、OID 自体が journal 由来のため
  commit-OID 束縛では完全には塞げない。別 request（epistemic-contract 監査、または専用 journal 保護）で扱う。
  本 change は「同一 commit 自己整合」を「確定 commit 跨ぎ比較」に正す構造修正まで。
- **全 step の epistemic-contract 監査＋prompt 適用マトリクス**: freeze/approve/verify が content＋revision を束縛する
  共通契約を全 step へ展開する監査は別 request（design/prompt 作業）。
- **per-scenario 実行 / dogfood config 有効化**（`scopedTestCommand` ＋ `minimumAssurance`）: 従来どおり別。本 repo の
  実 config では `runTestsAtCommit` が unavailable（scopedTestCommand 未設定）のため floor は fail-closed に倒れる
  （#848 の歯）。これを退行させない（D3 の T6）。
- **HEAD-green 実測 / type gate / blob freeze / base-red の変更**: #850 で確立した既存の歯。本 change は触れない
  （scenario 凍結の **証明構造** のみ差し替える）。materialized test blob の freeze（`diffPathsBetweenCommits`）は
  存置する（`test-cases.md` の scenario 凍結とは別の歯）。
- **runtime primitive / port / caller の変更**: 不要（`readFileAtCommit` は既存、seam は 1 ファイル）。

## Decisions

### D1: scenario 凍結を test-case-gen 確定 commit の blob に束縛する

現行の scenario 二層凍結ブロック（`achieved-assurance.ts:256-320`、events.jsonl frozen hash@finalHeadOid vs
test-cases.md@finalHeadOid）を廃し、次に置き換える:

1. `testCaseGenOid = state.steps[STEP_NAMES.TEST_CASE_GEN]?.at(-1)?.commitOid`。**absent → `testDerivation` /
   `biteEvidence` を absent**（fail-closed）。
2. `state.request.slug` を解決（null / undefined → 両次元 absent）。
3. `readFileAtCommit(testCaseGenOid, "<slug>/test-cases.md", cwd)` と
   `readFileAtCommit(finalHeadOid, "<slug>/test-cases.md", cwd)` をそれぞれ読む。いずれか `unavailable` → 両次元 absent。
4. 両者の `computeContentHash` が **一致 → scenario 凍結成立**。不一致 → 両次元 absent。

`events.jsonl` / `fold` への依存は撤去する（import 除去）。既存の blob freeze（`diffPathsBetweenCommits(baseOid,
finalHeadOid, materializedTestFiles)`、L220-239）は **存置** する（materialized test file の凍結という別の歯）。
`testDerivation = "frozen"` は「blob freeze intact ＋ scenario 凍結成立」のときのみ付与する（従来の合成条件を維持し、
scenario 凍結の判定基準だけを差し替える）。

**Rationale**: frozen 基準が「確定 commit の blob（不変 git 履歴）」になり、同一 commit 内で両者を書き換える攻撃
（#850 の穴）が成立しない。journal 由来の lineage hash に依存しないため、events.jsonl を後続 commit で書き換えても
判定に影響しない。folder 移動で test-case-gen（active path）と finalHeadOid（archived path）で full path が異なるため、
suffix 解決付きの `readFileAtCommit` を両 commit に適用して content 比較する。

**Alternatives considered**:
- journal の frozen hash と finalHeadOid content を比較（現行）→ 同一 commit 自己整合、協調改竄で破れる。却下（architect 評価済）。
- single-path diff（`diffPathsBetweenCommits` を test-cases.md に適用）→ folder 移動で full path が変わり、path 単位 diff は
  常に「変更あり」を返す。suffix 解決した blob content の跨ぎ比較でなければ成立しない。却下。

### D2: specReview を spec-review 確定 commit の blob に束縛する

`specReview:"required"` の成立条件を、「最新 spec-review run verdict === approved」に加えて **承認 content の不変** に拡張する:

1. `state.steps[STEP_NAMES.SPEC_REVIEW]?.at(-1)?.outcome?.verdict === "approved"`（従来）。以外 → absent。
2. `specReviewOid = state.steps[STEP_NAMES.SPEC_REVIEW]?.at(-1)?.commitOid`。absent → absent。
3. `state.request.slug` 解決（absent → absent）。
4. `readFileAtCommit(specReviewOid, "<slug>/spec.md", cwd)` と `readFileAtCommit(finalHeadOid, "<slug>/spec.md", cwd)`
   の `computeContentHash` 一致 → **承認束縛成立 → `specReview:"required"`**。不一致 / いずれか `unavailable`（spec.md を
   解決できない）→ absent（fail-closed）。

この束縛は **`floor.specReview` が constrain するときのみ** 実行し、無関係な job に spec.md I/O を課さない
（既存 bite/derivation が `floorConstrains*` で I/O を skip するのと対称）。実行には `finalHeadOid` 定義・`runtime`（の
`readFileAtCommit`）が要るため、それらが欠落するとき（archive Step 3 失敗・runtime null）は absent（fail-closed）。

**Rationale**: レビュー後に `spec.md` が変われば `specReview` が落ちる。verdict は「レビューを試みて承認した」証明だが、
承認した content が最終 HEAD で不変であることまでは保証しない。承認を「承認した revision の blob」に束縛して初めて、
承認と最終成果物が同一 spec を指すことが機械的に担保される。

**Alternatives considered**:
- verdict のみ（現行）→ レビュー後の spec.md 改変を見逃す（#850 と同型の穴）。却下（architect 評価済）。
- `isSpecRequired`（`type-config.ts:105`）で spec-exempt type は束縛を緩める → fail-open の穴になる。floor が
  `specReview:"required"` を要求している以上、spec.md を解決できない job は fail-closed が正。緩めない。却下。

### D3: positive と同型の adversarial negative（time-boundary / 協調改竄）を必須にする

各束縛について、**anchor commit の後に content を改竄した後続 commit を持つ time-boundary 反例** を positive と同型・
同数で固定する（歯の本体）。

- **scenario time-boundary（T1）**: test-case-gen 確定 commit に scenario S、後続 commit で `test-cases.md` を S' に
  変更して finalHeadOid に S' → 跨ぎ比較で不一致 → fail-closed。positive（S のまま）→ 成立。**破壊確認**: 跨ぎ比較を
  同一 commit（finalHeadOid のみ）に戻すと T1 が通ってしまうことをコメントで固定する。
- **協調改竄（T2、#850 の穴そのもの）**: `test-cases.md`@finalHeadOid を S' に改竄し、`events.jsonl`@finalHeadOid の
  lineage hash も S' に合わせて書き換えた job が、commit-OID 束縛（testCaseGenOid の blob を読む）により fail-closed に
  なることを固定する。同一 commit 自己整合では通っていた反例。
- **spec time-boundary（T4）**: spec-review 確定 commit に spec、後続 commit で `spec.md` 変更 → verdict=approved でも
  fail-closed。positive（spec.md 不変＋approved）→ 成立。
- **fail-closed 網羅（T5）**: `testCaseGenOid` / `specReviewOid` が absent、`readFileAtCommit` が unavailable
  （test-cases.md / spec.md 解決不能）のそれぞれで当該次元 absent。
- **#848 anti-regression（T6）**: 実 config（`scopedTestCommand` 未設定 → `runTestsAtCommit` unavailable）で
  `biteEvidence:required` floor が fail-closed になる歯を退行させない。

**Rationale**: 同一 commit 前提の positive のみでは、time-boundary 反例が素通りする（証明構造の誤りを検出できない）。
「破壊確認」コメントで、束縛を外すと negative が通ってしまうことを明示し、将来の退行を検出可能にする。

**Alternatives considered**: 同一 commit 前提の positive のみ → 反例が素通りする。却下（architect 評価済）。

### D4: E2E は anchor と HEAD を別 commit に分ける

`bite-evidence-e2e-gate.test.ts` の repo 構成を、scenario/spec を **anchor commit** に、impl/HEAD を **後続 commit** に
置く形へ更新する。commit 系列（実 git、fake なし）:

```
init             → README.md
spec-review 確定  → spec.md = SPEC            (specReviewOid)   [state に verdict=approved + commitOid 記録]
test-case-gen 確定 → test-cases.md = S         (testCaseGenOid)
test-materialize  → feature.test.ts (impl 不在 → red)  (baseOid)
implementer 確定   → feature-impl.ts (green)、spec.md / test-cases.md 不変  (finalHeadOid = positive)
tamper-scenario   → test-cases.md = S' に改竄                (finalHeadOid = scenario negative)
tamper-spec       → spec.md 改竄                            (finalHeadOid = spec negative)
```

- **positive（T3）**: `finalHeadOid = implementer 確定`。scenario / spec ともに anchor から不変 → `biteEvidence:required`
  ＋ `specReview:required`（floor それぞれで成立）。
- **scenario negative**: `finalHeadOid = tamper-scenario` → `testDerivation` / `biteEvidence` absent。
- **spec negative**: `finalHeadOid = tamper-spec` → `specReview` absent。

anchor と HEAD を同一 candidate commit に同居させない。events.jsonl fixture は不要になる（D1 で読まない）ため撤去する。
in-loop gate を直接叩く既存 `TC-010 (gate)`（`runBiteEvidenceGate`）は本 change の対象外で無変更 green（test-materialize
/ implementer OID のみ参照する）。

**Rationale**: 実 runtime で time boundary（anchor→HEAD の跨ぎ）を通し、scenario/spec の凍結・承認束縛が git 履歴上の
不変性を根拠にしていることを end-to-end で固定する。同一 commit 同居では時間境界を試さない。

**Alternatives considered**: scenario/impl を同一 candidate commit に同居（現行）→ 時間境界を試さない。却下（architect 評価済）。

### D5: 変更は archive authority seam（`achieved-assurance.ts`）に閉じる

新規 primitive・port 変更・caller 変更を伴わず、`deriveAchievedAssurance` 内の scenario 凍結ブロックと specReview 導出
ブロックのみを差し替える。`satisfiesFloor` / `getProfile` / `STANDARD_PROFILE` / `merge-then-archive.ts` は無変更
（floor gate は `achieved` を受け取り fail-closed で落とす）。

**Rationale**: seam が同一で凝集度・トークン効率が高い。`readFileAtCommit` は既存のため配線追加が不要で、最小依存の方針に
沿う。journal 保護と全 step 監査のみ Non-Goals として分離する。

**Alternatives considered**: 新 primitive や新次元を足す → 不要（既存 primitive で足りる）。却下。

### derivation の新しい制御フロー（`deriveAchievedAssurance` 内、fail-closed 各所）

1. **specReview 束縛（D2）**: `floor.specReview` が constrain するとき: 最新 spec-review verdict approved ＋
   `specReviewOid` present ＋ `finalHeadOid` 定義 ＋ `runtime.readFileAtCommit` 有 ＋ slug 有 ＋
   `spec.md`@specReviewOid と @finalHeadOid の content hash 一致 → `"required"`。いずれか欠落 → absent。
   constrain しないときは I/O せず absent（satisfiesFloor が無視）。この block は関数を early-return せず、
   `achieved.specReview` を設定 / 未設定にするのみ。
2. floor が bite / derivation を constrain しないなら early return（既存 L143-146）。
3. 前提: `finalHeadOid` 定義、`baseOid` 解決、runtime が必要メソッド（`readFileAtCommit` 含む）を備える、config 定義
   （既存 L152-193）。
4. materializedTestFiles 列挙（既存）。0 件 → 両次元 absent。
5. blob freeze（既存 `diffPathsBetweenCommits`）。tamper / unavailable → 両次元 absent。
6. **scenario 凍結（D1、差し替え）**: `testCaseGenOid` 解決 → slug 解決 → `test-cases.md`@testCaseGenOid と
   @finalHeadOid を `readFileAtCommit` → content hash 一致必須。欠落 / unavailable / 不一致 → 両次元 absent。
7. `testDerivation = "frozen"`（blob freeze intact ＋ scenario 凍結成立のとき。type 非依存、既存合成条件を維持）。
8. biteEvidence の I/O（type gate ＋ base-red ＋ HEAD-green）は `floor.biteEvidence` が constrain するときのみ（既存）。

## Risks / Trade-offs

- **[Risk] specReview 束縛が I/O 化して既存 specReview テストの意味が変わる**: 現行 specReview は I/O 無し（verdict のみ）。
  束縛追加後、fake runtime が spec.md を返さず、spec-review run に commitOid が無いと positive（approved）が fail-closed に
  倒れる。→ **Mitigation**: specReview 束縛系テスト（completeness-unit / completeness-integration の TC-006 系）を
  「意味が変わる期待更新」として、spec-review run に commitOid を付与し、fake `readFileAtCommit` を OID 別に spec.md を
  返す形へ更新する。verdict-not-approved の negative は verdict で先に落ちるため assertion 不変。
- **[Risk] scenario 凍結の anchor 差し替えで、shared fixture が anchor（test-case-gen 確定 commit）を持たないと、機械の歯
  （base-red / HEAD-green / hollow / blob-freeze）が scenario 段で先に fail-closed し、別経路の緑で歯が空洞化する**: →
  **Mitigation**: shared helper（`makeJobStateWithSteps` / `makeFakeRuntime`）の **既定** を「test-case-gen anchor 有 ＋
  OID 別 readFileAtCommit で test-cases.md が anchor↔HEAD 一致」に更新し、各 fail-closed テストが **意図した check** に
  到達することを保つ。各テストの assertion は無変更。歯を弱めず・別経路の緑を証拠にしない。
- **[Risk] suffix 解決の曖昧性**: archive/ には過去の全 archived change（各々 test-cases.md / spec.md）が同居する。
  bare suffix は複数一致し得る。→ **Mitigation**: 完全 slug を含む `<slug>/<file>` を境界（`/` または `-`）付きで一致
  させる既存 `readFileAtCommit` 契約に依存。複数一致 / slug 欠落は `unavailable` → fail-closed。
- **[Risk] hash byte 一致**: `computeContentHash` は `git show` の string を utf-8 で再 encode して算出する。両 revision とも
  同経路（readFileAtCommit → computeContentHash）で算出するため、EOL / encoding は対称に扱われ、同一内容なら一致する。
  #850 で digestArtifacts との round-trip 一致は歯化済み。
- **[Risk] DSM**: `core/archive` → `core/step/bite-evidence`（`FORWARD_TYPES` / `isExcludedPath` / `resolveBaseCandidateOids`）
  は既存 import。events.jsonl 依存の撤去で `core/archive` → `store/event-journal`（`fold`）の越境が **減る**（新規越境ゼロ）。

## Open Questions

- なし（構造判断は ADR-20260717 D4 で ratify 済み、seam・primitive とも既存）。journal 記録自体の agent-write 保護と全 step
  epistemic-contract 監査は本 change の射程外（Non-Goals に明示、別 request）。
