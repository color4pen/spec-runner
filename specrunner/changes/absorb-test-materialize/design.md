# Design: test-materialize step の廃止 — テスト実体化を implementer に統合する

## Context

`test-materialize` は「implementer より前に、実装を見ずに test-cases.md をテストコードへ実体化する」独立 agent step である。この分離が歴史的に担った 2 つの保証は既に別機構へ移管済み:

1. **時系列真実性**(テストが実装より先に書かれた) — Evidence Base 上の red→green 機械実行(#997)が担う。テストが「いつ」書かれたかは red→green 証明に寄与しない。
2. **canon 由来性**(テストが test-cases.md だけから書かれる) — test-case-gen の design phase 移動(#996)で test-cases.md は spec-review の照合対象になった。実体化はその機械的翻訳。

分離のコストは実測で明確: 毎 job で最重量級の独立 session を 1 つ消費し(実測 ~18 分/job)、工程境界そのものが escalation 類型(#985 破壊ループ、#989 偽 baseline)の温床になっている。

### 現状の依存構造(調査で確認した事実)

- `src/core/pipeline/types.ts` — `STANDARD_TRANSITIONS` に `SPEC_REVIEW approved → TEST_MATERIALIZE`(unconditional, line 261)、`TEST_MATERIALIZE success → IMPLEMENTER` / `error → escalate`(268-269)、`SPEC_FIXER approved → TEST_MATERIALIZE when specFixerObservationForward`(273)。exempt type は `SPEC_REVIEW approved → IMPLEMENTER when isTestGenExempt`(260)と `SPEC_FIXER approved → IMPLEMENTER when specFixerForwardsToImplementer`(271)で既に test-materialize をバイパス。
- `src/core/step/bite-evidence/oids.ts` — `resolveBaseCandidateOids` の `baseOid` = 最新 test-materialize run の `commitOid`。gate の file-set 同定と archive floor の両方が依存。`candidateOid` は返るが production では未消費(gate/floor とも `baseOid` のみ destructure)。`resolveEvidenceBaseRev`(= `synthesizedCommits[0]^`)は fork point で test-materialize とは無関係。
- `src/core/step/bite-evidence/gate.ts` — file-set は step 6 の `listCommitChangedFiles(baseOid)` → `selectMaterializedTestFiles`。red は `runTestsOnSynthesizedTree(evidenceBaseRev, testFiles, headOid)`、green は `runTestsAtCommit(headOid)`(#997)。baseOid null(step 3)は strategy-deferred。
- `src/core/archive/achieved-assurance.ts` — (P2) baseOid null → 両 dimension absent。(a) `listCommitChangedFiles(baseOid)` で file-set 列挙、(b) `diffPathsBetweenCommits(baseOid, finalHeadOid, files)` で blob freeze、(c) scenario revision binding(test-cases.md@testCaseGenOid == @finalHeadOid)。`testDerivation = "frozen"` は (b)+(c)、`biteEvidence = "required"` は (a)+(b)+(c)+type gate+base-red+HEAD-green。
- `src/core/step/implementer.ts` — `testsMaterialized = Boolean(state.steps?.[TEST_MATERIALIZE]?.length)` で implement-only mode / TDD mode を分岐(`buildImplementerInitialMessage`)。
- `src/state/profile.ts` — `TestDerivationLevel = "coupled" | "frozen"`(coupled < frozen)。`STANDARD_PROFILE.assurance.testDerivation = "frozen"`。`deriveAchievedAssurance` は現状 `"frozen"` しか産出せず、`"coupled"` は profile 宣言専用値(production の achieved には出現しない)。
- `src/core/verification/test-coverage.ts` + `runner.ts` — verification は `runTestCoveragePhase` を独立に実行し、全 must TC が assertion 付きテストファイルに存在するかを検査する。test-materialize の output contract とは別経路。
- `src/core/resume/resolve-step.ts` — `LEGACY_STEP_ALIASES = { "build-fixer": IMPLEMENTER }`。`--from` と `resumePoint.step` の 2 経路で alias を適用。`state.step`(hard-crash fallback, priority 4)は alias 非適用(build-fixer と同じ既存挙動)。
- production 参照 27 ファイル(step-names / agent-definition union / registry / config-effective / write-scope / staging-containment / output-contract / prompts / tc-source-contract / pipeline-map / rules / runtime-strategy)。`kernel/agent-definition.ts` の `AgentStepName` union と `kernel/step-names.ts` の `AGENT_STEP_NAMES` は `state/schema/types.ts` の bidirectional compile guard で同期必須 — 片方だけ変更すると `tsc` が落ちる。

### 制約

- `#996`(test-case-gen の design phase)/ `#997`(Evidence Base 構築・red→green 判定)/ `#987`(exemption)/ spec-review の TC 照合は形を維持する(スコープ外)。
- 過去 job の state/journal に test-materialize 実行歴が残る(`StepName = string` passthrough で保持される)。読み込み・fold・resume を壊さない。

## Goals / Non-Goals

**Goals**:

- `test-materialize` step(定義・prompt・遷移・registry・write-scope・staging・output-contract・step-name・agent union・config-effective・pipeline-map・rules)を廃止する。
- テスト実体化(test-cases.md → テストコード)を implementer の単一責務に統合する(mode 分岐廃止)。
- bite-evidence gate と archive floor の materialized test file 同定を「test-materialize commit の changed files」から「Evidence Base 参照(fork point)↔ candidate の diff にテストパターンを適用」へ置換し、baseOid 依存を除去する。
- `testDerivation` の意味論を工程境界 blob freeze から scenario 凍結へ再定義し、archive floor の期待値と整合させる。
- resume 互換を legacy alias(test-materialize → implementer)で担保する。
- `isTestGenExempt` の制御対象を 2 箇所(test-case-gen バイパス / bite-evidence バイパス)に縮退する。

**Non-Goals**:

- code-fixer の統合(別判断)。
- test-case-gen step・spec-review の TC 照合の変更(#996 の形を維持)。
- Evidence Base の構築方式・red→green 判定ロジック自体の変更(#997 の形を維持)。
- hollow テスト(実装から逆算した鏡写しテスト)の意味的検出。初回走行の「実装を見ずに書く」物理的保証を手放すのは approved batch の設計判断。防御は test-cases.md の質(spec-review 照合)+ EB 上 red→green の機械実行に一本化する。
- `STANDARD_PROFILE` の assurance floor 値の変更(D4 で `"frozen"` を維持する)。
- 汎用 `test-coverage` OutputContractKind そのものの削除(D5 参照 — verification が同等保証を保持するため触らない)。

## Decisions

### D1: 遷移表 — spec-review / spec-fixer approved を全 type で implementer に収束させる

**Rationale**: 全 type が同一の `→ IMPLEMENTER` に収束するため、exempt を区別する guard は spec-review/spec-fixer approved 経路では意味を失う。first-match-wins で guard 付き row を残すと dead な冗長 row になる。両者を単一 unconditional row に畳むのが遷移表の意味と一致する。

`SPEC_REVIEW approved → TEST_MATERIALIZE`(unconditional)を `SPEC_REVIEW approved → IMPLEMENTER`(unconditional, 全 type)へ置換する。これにより exempt 専用の `SPEC_REVIEW approved → IMPLEMENTER when isTestGenExempt`(line 260)は unconditional row に包摂され不要になるので削除する。`TEST_MATERIALIZE` を step とする 2 行(268-269)も削除する。

spec-fixer 観測 forward は現状 exempt(→IMPLEMENTER)と非 exempt(→TEST_MATERIALIZE)に分岐しているが、置換後は両者とも IMPLEMENTER に収束する。よって `SPEC_FIXER approved → TEST_MATERIALIZE when specFixerObservationForward`(273)を `→ IMPLEMENTER` に変更し、包摂される `SPEC_FIXER approved → IMPLEMENTER when specFixerForwardsToImplementer`(271)とその述語 `specFixerForwardsToImplementer`(test-gen-exemption.ts)を削除する。`specFixerObservationForward`(spec-observation.ts)は残し、routing 先とコメントのみ implementer へ更新する。

結果 `isTestGenExempt` の使用は 2 箇所(`DESIGN success → SPEC_REVIEW` = test-case-gen バイパス、`IMPLEMENTER success → VERIFICATION` = bite-evidence バイパス)に縮退する。exempt type の観測挙動(test-case-gen を通らない・bite-evidence を通らない)は不変。`FAST_TRANSITIONS` は test-materialize を含まないため無変更。

**Alternatives considered**:
- `specFixerForwardsToImplementer` の述語と row を残し、`specFixerObservationForward` row だけ implementer に向ける → 述語が dead に残り、`isTestGenExempt` の使用が 3 箇所のまま。要件6「2 箇所に縮退」に反する。却下。

### D2: implementer 単一 mode — 実体化を責務に統合、coverage は verification が保持

**Rationale**: 実体化と実装を同一 session が書くため mode 分岐は不要。coverage の機械歯は verification に既存であり、implementer に `test-coverage` output contract を足すと (i) verification と二重化し (ii) test-cases.md 不在の fast/exempt job で contract 違反になる(local.ts の test-coverage 分岐は「file 不在 → violation」)ため、条件付き contract という追加機構を要する。verification 再利用が最小で正しい。

`implementer.ts` の `testsMaterialized` 分岐(`buildImplementerInitialMessage` の implement-only mode / recovery message / conformance 経路の受け渡し)を廃止し、単一 mode にする。`state.steps?.[TEST_MATERIALIZE]` 参照を削除する。initial message と `implementer-system.ts` の prompt は「test-cases.md の全 must TC をテストコードに実体化し、実装と整合させる」責務を明示する(既存の「test-materialize 済み/未 materialize」二分岐記述を単一化)。TC 変換ルール(Scenario 由来 = spec.md の GWT を読む、非 Scenario 由来 = test-cases.md の GWT、テストに TC ID を記載、manual/gate は自動テスト対象外)は test-materialize-system.ts から implementer prompt へ引き継ぐ。

coverage 保証(全 must TC が assertion 付きテストに存在)は **verification の `test-coverage` phase(`runTestCoveragePhase`)が implementer 出力に対して既に実行しており不変**。よって implementer 側に新規 output contract は追加しない。test-cases.md 不在の fast/exempt job では verification の test-coverage phase が `skipped` になる既存挙動が保たれる。

**Alternatives considered**:
- implementer に `test-coverage` output contract を条件付き(test-cases.md 存在時のみ)で追加 → in-session follow-up 修復が効くが、verification と重複し条件分岐機構を要する。verification 失敗 → implementer 再入で同じ修復ループが既に成立するため却下。

### D3: file-set 同定の Evidence Base ネイティブ化

**Rationale**: architect 評価「file-set 同定は fork point diff が正しい」— 工程 commit ではなく EB↔candidate の diff が resume・再走・複数回 implementer 実行のいずれでも同一の答えを返し、Evidence Base の意味論と一貫する。`diffPathsBetweenCommits` は blob freeze(D4 で廃止)以外の production caller を持たないため、path フィルタを落として rename する方が「空 paths = 全 files」の意味過負荷を避け、3am の読者に正しい(correct-on-edge-cases)。

materialized test files の同定を、工程 commit(test-materialize)ではなく **Evidence Base 参照(`resolveEvidenceBaseRev(state)` = `synthesizedCommits[0]^`)↔ candidate の unfiltered diff にテストパターンを適用**する方式へ置換する。candidate は gate では `captureHeadSha(cwd)` の HEAD、archive floor では `finalHeadOid`。両者とも `selectMaterializedTestFiles` フィルタ(exclusion + test-pattern)を維持する。

runtime primitive: 現行 `diffPathsBetweenCommits(baseOid, headOid, paths, cwd)` を **`listChangedFilesBetweenCommits(baseOid, headOid, cwd)`**(= `git diff --name-only <baseOid> <headOid>`、path フィルタなし)へ置換する。`RuntimeStrategy`(optional)/ `RealRuntimeStrategy`(required)/ `LocalRuntime`(実装)/ `ManagedRuntime`(構造的に unavailable)を更新する。

- gate.ts: `baseOid`(step 3)を削除。順序を「EB ref 解決 → runtime capability(`listChangedFilesBetweenCommits` を含む)→ HEAD 捕捉 → `listChangedFilesBetweenCommits(evidenceBaseRev, headOid)` → `selectMaterializedTestFiles` → 空なら strategy-deferred → red/green」に組み替える。`resolveBaseCandidateOids` import を削除。
- achieved-assurance.ts: (P2) baseOid 前提を削除。file-set は `listChangedFilesBetweenCommits(evidenceBaseRev, finalHeadOid)` → `selectMaterializedTestFiles`。`resolveBaseCandidateOids` は他に production caller が無いため `oids.ts` から削除する(`resolveEvidenceBaseRev` は残す)。

**Alternatives considered**:
- `diffPathsBetweenCommits` の signature を保ち「空 paths = 全 files」に意味変更 → fake の signature は壊れないが名前が誤解を招く。却下。
- 既存 `listChangedFiles(baseBranch,...)`(`<baseBranch>...HEAD` 三点 diff)を再利用 → merge-base(main,HEAD) 依存で main 前進時に fork point と乖離し得る。かつ HEAD 固定で floor の `finalHeadOid` に使えない。Evidence Base の main 非依存設計に反するため却下。

### D4: testDerivation の意味論再定義 — 工程 blob freeze を廃し scenario 凍結へ縮退

**Rationale**: 要件4「縮退させる場合は根拠を design に記録する」に従う。blob freeze は工程分離の産物で、統合後は成立しない(専用 test-materialize commit が消え、implementer が verification 失敗時にテストを複数回書き換え得るため、初回と最終 HEAD で必ず差分が出る)。より根源的な派生不変条件(正典凍結)は scenario revision binding が既にコードに存在(component (c))し、それが `"frozen"` の実質を担い続ける。floor を下げない選択は archive floor・assurance-floor ADR(ADR-20260717 系)の既存期待値(STANDARD は testDerivation frozen を要求)を保存し、blast radius を最小化する。

`testDerivation = "frozen"` の判定を **scenario revision binding のみ**(test-cases.md@testCaseGenOid の content hash == test-cases.md@finalHeadOid)に縮退する。blob freeze(materialized test blob が baseOid→finalHeadOid で不変)は判定から**廃止**する。`STANDARD_PROFILE.assurance.testDerivation = "frozen"` の floor 値は**変更しない**。

- 縮退後の `"frozen"` の意味: 「テストの設計正典(test-cases.md)が test-case-gen 以降 final HEAD まで不変であり、テストはその凍結された正典から派生している」。正典すり替え tamper 防御は scenario revision binding が引き続き提供する。テストが「変更に噛んでいる」ことは `biteEvidence`(red→green)が別途保証する。
- floor 整合: `deriveAchievedAssurance` は従来どおり `"frozen"` を産出する(scenario 凍結が intact のとき)。`STANDARD_PROFILE` の `testDerivation: "frozen"` floor は満たせるまま。`"coupled"` は profile 宣言専用値のままで achieved には出現しない。lattice(`coupled < frozen`)・`satisfiesFloor`・`policyDigest`・`STANDARD_PROFILE` は無変更。
- biteEvidence 側: type gate + base-red + HEAD-green は #997 の形を維持。blob freeze への gating を外し、file-set は D3 の EB↔candidate diff から取る。testDerivation-only floor 制約時に bite 用 I/O(base-red/HEAD-green)を走らせない現行の skip 構造を保つ。

**Alternatives considered**:
- achieved を `"coupled"` に落とし `STANDARD_PROFILE` floor を `"coupled"` に下げる → lattice の "coupled"(実装結合)ラベルは統合後の実態に一見合致するが、`policyDigest`/`STANDARD_PROFILE`/floor 比較の広域変更を要し、archive floor が既存 job で testDerivation を検証する期待を弱める。正典凍結という検証可能な実質が残る以上、floor を下げる必要はない。却下。

### D5: 削除と互換 — step 資産の削除と legacy alias

**Rationale**: 要件5 の削除リストに沿う。alias は absorb-build-fixer が確立したパターンの単純な追加行で、resume の主経路(--from / resumePoint)を覆う。`test-coverage` OutputContractKind と local.ts の分岐は test-materialize が唯一の producer だが、汎用機構であり verification が同等保証を持つため**削除しない**(触れると output-contract.ts + local.ts + 無関係 test 3 本に波及し挙動利得ゼロ)。output-contract.ts は test-materialize を名指す doc comment のみ更新する。

- 削除: `src/core/step/test-materialize.ts`、`src/prompts/test-materialize-system.ts`、registry.ts の import/steps/roles、config-effective.ts の import/stepMap、`write-scope.ts` の `GUARDED_WRITE_STEPS` の `"test-materialize"`、`staging-containment.ts` / `output-contract.ts` / `runtime-strategy.ts` / `templates/step-output-templates.ts` / `tc-source-contract.ts` / `pipeline-map.ts` / `rules.ts` の test-materialize 言及(doc comment・表・consumer 列挙)。
- resume 互換: `resolve-step.ts` の `LEGACY_STEP_ALIASES` に `"test-materialize": STEP_NAMES.IMPLEMENTER` を追加する(absorb-build-fixer と同一の場所・パターン)。`--from test-materialize` と `resumePoint.step = "test-materialize"` の 2 経路で implementer に写る。`state.step = "test-materialize"` の hard-crash fallback(priority 4)は alias 非適用のまま — build-fixer と同一の既存挙動を踏襲しパターンを逸脱しない。
- legacy state: fold は `StepName = string` passthrough で test-materialize 実行歴を保持する。`resolveBaseCandidateOids` 削除後、test-materialize run は gate/floor から参照されず無害に無視される。読み込み・fold は無変更で動く。

**Alternatives considered**:
- `test-coverage` OutputContractKind ごと削除 → dead な producer は消えるが汎用 kind の除去は blast が大きく利得なし。doc scrub に留める。

### D6: step 削除に伴う compile guard の同時更新

**Rationale**: `AGENT_STEP_NAMES`(kernel/step-names.ts)と `AgentStepName` union(kernel/agent-definition.ts)は `state/schema/types.ts` の `_AgentStepExtraInArray` / `_AgentStepExtraInUnion` で双方向に同期強制されている。片側だけ変えると `tsc` が落ちる。

`"test-materialize"` を `AGENT_STEP_NAMES`・`AgentStepName` union の双方から**同一変更**で除去し、`STEP_NAMES.TEST_MATERIALIZE` を削除する。`STEP_NAMES.TEST_MATERIALIZE` を参照する production/test の全箇所を先に潰してから定数を消す(TypeScript が落ちる箇所が回帰の網になる)。

**Alternatives considered**: 片側のみ変更 → compile guard で不可。却下。

## Risks / Trade-offs

- [Risk] 初回走行の「実装を見ずにテストを書く」物理的保証を失う → 実装を見た鏡写しテストが EB 上でも red→green を通り得る(検出限界)。**Mitigation**: approved batch の明示的判断。この限界は分離下でも resume 経路には既に存在し、初回だけ守っても不完全だった。防御は test-cases.md の質(spec-review 照合)+ EB red→green の機械実行に一本化。
- [Risk] testDerivation の意味変更が archive floor の既存期待を静かに弱める → **Mitigation**: floor 値(`"frozen"`)を据え置き、achieved 産出も `"frozen"` を維持。scenario 凍結という検証可能な実質を残し STANDARD job の testDerivation 検証を継続。achieved-assurance/archive-floor test で新意味論を pin。
- [Risk] `listChangedFilesBetweenCommits` への置換で gate/floor の runtime capability check や fake が漏れると deferral/absent になる → **Mitigation**: gate は不備を strategy-deferred(素通し)、floor は dimension absent(fail-closed)で扱う既存 DU を維持。managed runtime は従来どおり unavailable。gate/floor test で「test-materialize run 無し state で red→green / 判定に到達」を pin。
- [Risk] legacy state(test-materialize 実行歴あり)の resume が state.step hard-crash 経路で alias 非適用のまま落ちる → **Mitigation**: build-fixer と同一の既存挙動(主経路は --from/resumePoint、canonical source は resumePoint = ADR-20260607)。resolve-step test で alias 経路を pin。
- [Trade-off] `test-coverage` の in-session follow-up 修復(test-materialize が持っていた)が消え、coverage 不足は verification 失敗 → implementer 再入で解消される。1 往復増える可能性があるが、独立 session 1 つ分(~18 分)の削減が上回る。

## Open Questions

なし。testDerivation の意味論・floor 据え置き・file-set primitive・exemption 縮退・resume alias はすべて design で確定した(D1–D6)。

## Migration Plan

- backward compat のみ(deploy 手順なし)。過去 job state の test-materialize 実行歴は fold で保持され、gate/floor から無害に無視される。resume は legacy alias で implementer に写る。
- rollback: 単一 PR。問題時は revert で step が復活する(state は passthrough で両形式を許容するため revert 後も legacy state は読める)。

## テスト更新対象の全列挙(受け入れ基準「列挙外は無変更で green」)

置換に伴い更新する既存テスト(根拠付き)。列挙外のテストは無変更で green を維持する。

**遷移表 / exemption**:
- `src/core/pipeline/__tests__/test-gen-exemption.test.ts` — TC-007 を `SPEC_REVIEW approved → IMPLEMENTER`(全 type)へ; TC-012 の `→ TEST_MATERIALIZE` row / exempt guard row 前後関係を削除・更新; TC-006/TC-015 の `specFixerForwardsToImplementer` を削除(述語廃止)。TC-004/TC-005(exempt 観測挙動)は無変更で green。
- `src/core/pipeline/__tests__/bite-evidence-pipeline.test.ts` — TC-009 の `STEP_NAMES.TEST_MATERIALIZE` 存在 assert を「非存在」へ。
- `src/core/pipeline/__tests__/standard-transitions.test.ts` — 新規 assert 追加(遷移表に TEST_MATERIALIZE 行が無い / 全 type で spec-review approved → implementer)。

**bite-evidence gate / oids**:
- `src/core/step/bite-evidence/__tests__/gate.test.ts` — file-set 源を EB↔candidate diff に; 「test-materialize run 無し state で red→green に到達(baseOid deferral 無し)」を追加。
- `src/core/step/bite-evidence/__tests__/gate-empty-selection.test.ts` — 空選択の源を EB diff に。
- `src/core/step/bite-evidence/__tests__/evidence-base-gate.test.ts` — gate の EB 経路の file-set 源更新。
- `src/core/step/bite-evidence/__tests__/evidence-base-oids.test.ts` — `resolveBaseCandidateOids` 削除に伴う baseOid テスト削除、`resolveEvidenceBaseRev` は維持。
- `src/core/step/bite-evidence/__tests__/oid-capture.test.ts` — fixture の base commit step を test-materialize から EB-native へ。

**archive floor / achieved-assurance**:
- `src/core/archive/__tests__/achieved-assurance.test.ts` — (P2) baseOid 前提削除; testDerivation を scenario 凍結のみで pin; biteEvidence の file-set 源を EB diff に; blob freeze ケース削除。
- `src/core/archive/__tests__/evidence-base-archive-floor.test.ts` — 「baseOid 無しで判定に到達」を pin; file-set 源更新。

**runtime primitive**:
- `src/core/runtime/__tests__/diff-paths-between-commits.test.ts` — `diffPathsBetweenCommits` → `listChangedFilesBetweenCommits`(paths 引数廃止・unfiltered)へ書換。
- `src/core/runtime/__tests__/evidence-base-e2e.test.ts` / `bite-evidence-e2e-gate.test.ts` — e2e の base commit を test-materialize から implementer-materialized テストへ; primitive 名更新。

**prompt / template / rules**:
- `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts` — `TEST_MATERIALIZE_SYSTEM_PROMPT` の import/配列/カウント除去(`ALL_14_AGENT_PROMPTS` 13→12、`PRODUCER_AND_FIXER_PROMPTS` 7→6、`PIPELINE_MAP` 15→14 行、`EXPECTED_STEPS`/`PREVIOUSLY_MISSING_STEPS` から test-materialize 除去、TC-003 の TEST_MATERIALIZE assert 削除)。
- `src/prompts/__tests__/tc-source-contract.test.ts` — TC Source の consumer 列挙から test-materialize を除去(consumer は implementer のみ)。

**resume**:
- `src/core/resume/__tests__/resolve-step.test.ts` — `--from test-materialize` / `resumePoint.step="test-materialize"` が implementer に写る legacy alias を追加。

**新規テスト(受け入れ基準を直接固定)**:
- implementer prompt に test-cases.md 全 must TC の実体化責務が含まれることを固定(implementer-system の新規/既存 prompt テスト)。
- legacy state(test-materialize 実行歴あり)の読み込み・fold・resume が壊れないことを固定。

<\!-- spec-fixer-deferred: [LOW] TC-015 materializedTestFiles 独立性 test-cases.md への TC-015a 追記 — spec-fixer の write scope が test-cases.md を含まない。代替: spec.md に sub-scenario を追加し T-10 で TC-015a 追記を明示した。implementer が T-10 実施時に test-cases.md へ TC-015a を追記すること。 -->
